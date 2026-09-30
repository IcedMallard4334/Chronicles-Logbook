/**
 * Durable queue of entries captured while offline (US-2.16).
 *
 * Entries are held in IndexedDB rather than localStorage: the queue must
 * survive a reload or a closed tab, holds structured data, and is not bound
 * by localStorage's small synchronous quota.
 *
 * Each queued record carries the id the entry will be created with. The
 * backend treats entry creation as idempotent on that id, so replaying a
 * request whose response was lost returns the existing entry instead of
 * creating a duplicate.
 *
 * Records are scoped by user id. Signing out must not hand one person's
 * unsent work to whoever signs in next, and must not silently destroy it
 * either.
 */

const DB_NAME = "chronicles-offline"
const STORE_NAME = "pending-entries"
const DB_VERSION = 1

export const PENDING = "pending"
export const REJECTED = "rejected"

/** A unique id for a not-yet-created entry. */
export function newEntryId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  // Older browsers: good enough for an identifier the server only needs to
  // recognise as distinct.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0
    const value = char === "x" ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function runTransaction(mode, operation) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode)
        const store = transaction.objectStore(STORE_NAME)
        const request = operation(store)

        transaction.oncomplete = () => {
          db.close()
          resolve(request ? request.result : undefined)
        }
        transaction.onerror = () => {
          db.close()
          reject(transaction.error)
        }
      })
  )
}

/**
 * IndexedDB-backed storage. Kept behind this small interface so the queue can
 * be exercised in tests with a plain in-memory object instead of pulling in a
 * fake IndexedDB implementation.
 */
export const indexedDbAdapter = {
  getAll: () => runTransaction("readonly", (store) => store.getAll()),
  put: (record) => runTransaction("readwrite", (store) => store.put(record)),
  remove: (id) => runTransaction("readwrite", (store) => store.delete(id)),
}

/** An in-memory adapter with the same interface. Used by tests. */
export function createMemoryAdapter(initial = []) {
  let records = [...initial]
  return {
    getAll: async () => records.map((record) => ({ ...record })),
    put: async (record) => {
      records = [
        ...records.filter((existing) => existing.id !== record.id),
        { ...record },
      ]
    },
    remove: async (id) => {
      records = records.filter((record) => record.id !== id)
    },
  }
}

export function createOfflineQueue(adapter = indexedDbAdapter) {
  /**
   * Add a captured entry to the queue.
   *
   * `capturedAt` is recorded here rather than at sync time so a delayed sync
   * still lands the entry on the day the work actually happened.
   */
  async function enqueue({ userId, projectId, data, timeSpent = null, todo = false, dueDate = null, dueTime = null, id }) {
    const record = {
      id: id || newEntryId(),
      userId,
      projectId,
      data,
      timeSpent,
      // Carried through the queue so an entry captured offline still turns up
      // in the outstanding-work view once it syncs.
      todo,
      dueDate,
      dueTime,
      capturedAt: new Date().toISOString(),
      queuedAt: Date.now(),
      status: PENDING,
      attempts: 0,
      error: null,
    }

    await adapter.put(record)
    return record
  }

  /** Every record belonging to a user, oldest capture first. */
  async function all(userId) {
    const records = await adapter.getAll()
    return records
      .filter((record) => !userId || record.userId === userId)
      .sort((a, b) => a.queuedAt - b.queuedAt)
  }

  /** Records still waiting to be sent. */
  async function pending(userId) {
    return (await all(userId)).filter((record) => record.status === PENDING)
  }

  /** Records the server refused, which need the user to decide what to do. */
  async function rejected(userId) {
    return (await all(userId)).filter((record) => record.status === REJECTED)
  }

  async function get(id) {
    const records = await adapter.getAll()
    return records.find((record) => record.id === id) || null
  }

  async function update(id, patch) {
    const record = await get(id)
    if (!record) return null

    const next = { ...record, ...patch }
    await adapter.put(next)
    return next
  }

  /**
   * Move a record out of the send queue and into the list needing attention.
   *
   * Deliberately does not delete it: AC3 requires that a rejected entry is
   * surfaced rather than silently dropped, and the text the user typed is the
   * only copy that exists.
   */
  async function markRejected(id, reason) {
    return update(id, { status: REJECTED, error: reason })
  }

  /** Put a rejected record back in line, e.g. after the user edits it. */
  async function retry(id, patch = {}) {
    return update(id, { ...patch, status: PENDING, error: null })
  }

  async function recordAttempt(id) {
    const record = await get(id)
    if (!record) return null
    return update(id, { attempts: (record.attempts || 0) + 1 })
  }

  async function remove(id) {
    await adapter.remove(id)
  }

  return {
    enqueue,
    all,
    pending,
    rejected,
    get,
    update,
    markRejected,
    retry,
    recordAttempt,
    remove,
  }
}

export const offlineQueue = createOfflineQueue()
