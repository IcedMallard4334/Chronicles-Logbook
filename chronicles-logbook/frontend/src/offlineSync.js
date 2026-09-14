/**
 * Sends queued entries once the network comes back (US-2.16).
 *
 * The queue holds what was captured; this decides what to do with each
 * record when the send is attempted, and what a failure means.
 */

import { createEntry as defaultCreateEntry } from "./api"
import { offlineQueue as defaultQueue } from "./offlineQueue"

export const ACCEPTED = "accepted"
export const REJECTED = "rejected"
export const RETRY = "retry"
export const PAUSED = "paused"

/**
 * Decide what a failed send means.
 *
 *   RETRY    the send might work later — the network is down, or the server
 *            is having a moment. The entry stays queued.
 *   REJECTED the server understood and refused: the project was archived or
 *            deleted while we were offline, or its schema changed and the
 *            entry no longer fits. Only the user can resolve this.
 *   PAUSED   the session expired. Nothing is wrong with the entry, so
 *            rejecting the queue over it would be destructive.
 */
export function classifyFailure(error) {
  if (!error) return RETRY
  if (error.offline) return RETRY

  const status = error.status
  if (status === 401 || status === 403) return PAUSED
  if (status >= 400 && status < 500) return REJECTED
  return RETRY
}

export function createSyncEngine({
  queue = defaultQueue,
  createEntry = defaultCreateEntry,
} = {}) {
  let draining = false
  const listeners = new Set()

  function subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  async function snapshot(userId) {
    return {
      pending: (await queue.pending(userId)).length,
      rejected: (await queue.rejected(userId)).length,
      isSyncing: draining,
    }
  }

  async function notify(userId) {
    const state = await snapshot(userId)
    for (const listener of listeners) listener(state)
  }

  /**
   * Try to send everything queued for a user, oldest capture first.
   *
   * Only one drain runs at a time: the reconnect event and the periodic
   * timer can fire together, and sending the same entry twice concurrently
   * would race even though the server would deduplicate it.
   */
  async function drain(userId) {
    if (draining) return { accepted: 0, rejected: 0, stopped: "already-running" }

    draining = true
    // Let subscribers see the "still pending, now syncing" state before the
    // send is attempted. Without this, a drain that succeeds on its first
    // pass only ever notifies once, in the finally block below, with
    // pending already back at 0 — so a listener trying to detect the
    // pending>0 -> pending==0 transition (App.jsx does, to know when to
    // reload from the server) never observes the "before" half of it.
    await notify(userId)
    let accepted = 0
    let rejected = 0
    let stopped = null

    try {
      const records = await queue.pending(userId)

      for (const record of records) {
        await queue.recordAttempt(record.id)

        try {
          await createEntry(record.projectId, {
            id: record.id,
            data: record.data,
            time_spent: record.timeSpent,
            created_at: record.capturedAt,
          })

          // Accepted, or already stored from an earlier attempt whose
          // response never arrived — the server returns the existing entry
          // either way, so both mean "done".
          await queue.remove(record.id)
          accepted += 1
        } catch (error) {
          const outcome = classifyFailure(error)

          if (outcome === PAUSED) {
            // Stop without touching the queue. A dead session is not the
            // entries' fault, and marking them all rejected would bury real
            // work behind a sign-in prompt.
            stopped = PAUSED
            break
          }

          if (outcome === REJECTED) {
            await queue.markRejected(record.id, error.message)
            rejected += 1
            // One unacceptable entry should not hold up the rest.
            continue
          }

          // Still offline, or the server is failing. Leave this entry queued
          // and stop — the following entries would fail the same way.
          stopped = RETRY
          break
        }
      }
    } finally {
      draining = false
      await notify(userId)
    }

    return { accepted, rejected, stopped }
  }

  /**
   * Drain now, whenever the browser reports the network is back, and
   * periodically in case it never fires the event.
   *
   * Returns a function that detaches the listeners.
   */
  function start(userId, { intervalMs = 30000 } = {}) {
    const run = () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return
      drain(userId)
    }

    window.addEventListener("online", run)
    const timer = setInterval(run, intervalMs)
    run()

    return () => {
      window.removeEventListener("online", run)
      clearInterval(timer)
    }
  }

  return { drain, start, subscribe, snapshot }
}

export const syncEngine = createSyncEngine()
