import { beforeEach, describe, expect, it, vi } from "vitest"
import { createMemoryAdapter, createOfflineQueue } from "./offlineQueue"
import {
  PAUSED,
  REJECTED,
  RETRY,
  classifyFailure,
  createSyncEngine,
} from "./offlineSync"

const USER = "user-1"

function httpError(message, status) {
  const error = new Error(message)
  error.status = status
  return error
}

function offlineError() {
  const error = new Error("Cannot reach the Chronicles API.")
  error.offline = true
  return error
}

let queue
let createEntry
let engine

beforeEach(() => {
  queue = createOfflineQueue(createMemoryAdapter())
  createEntry = vi.fn().mockResolvedValue({ id: "server-id" })
  engine = createSyncEngine({ queue, createEntry })
})

async function capture(overrides = {}) {
  return queue.enqueue({
    userId: USER,
    projectId: "proj-1",
    data: { note: "captured offline" },
    timeSpent: 30,
    ...overrides,
  })
}

describe("classifyFailure", () => {
  it("treats a network failure as retryable", () => {
    expect(classifyFailure(offlineError())).toBe(RETRY)
  })

  it("treats a server error as retryable", () => {
    expect(classifyFailure(httpError("Boom", 500))).toBe(RETRY)
  })

  it("treats a refusal as a rejection needing the user", () => {
    expect(classifyFailure(httpError("Unknown field", 422))).toBe(REJECTED)
    expect(classifyFailure(httpError("Project not found", 404))).toBe(REJECTED)
    expect(classifyFailure(httpError("Archived", 409))).toBe(REJECTED)
  })

  it("treats an expired session as a pause, not a rejection", () => {
    expect(classifyFailure(httpError("Authentication required.", 401))).toBe(PAUSED)
  })
})

describe("draining the queue", () => {
  it("sends a queued entry with its own id and capture time", async () => {
    const record = await capture()

    const result = await engine.drain(USER)

    expect(createEntry).toHaveBeenCalledWith("proj-1", {
      id: record.id,
      data: { note: "captured offline" },
      time_spent: 30,
      todo: false,
      due_date: null,
      due_time: null,
      created_at: record.capturedAt,
    })
    expect(result.accepted).toBe(1)
    expect(await queue.pending(USER)).toHaveLength(0)
  })

  it("carries a to-do's time of day through the queue", async () => {
    await capture({ todo: true, dueDate: "2026-10-01", dueTime: "14:30" })

    await engine.drain(USER)

    expect(createEntry).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({ due_date: "2026-10-01", due_time: "14:30" }),
    )
  })

  it("keeps outstanding work outstanding across the queue", async () => {
    await capture({ todo: true, dueDate: "2026-10-01" })

    await engine.drain(USER)

    // Something planned while offline must still be waiting in the outstanding
    // view once it reaches the server, deadline intact.
    expect(createEntry).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({ todo: true, due_date: "2026-10-01" }),
    )
  })

  it("sends oldest captures first", async () => {
    const first = await capture({ data: { note: "first" } })
    const second = await capture({ data: { note: "second" } })

    await engine.drain(USER)

    expect(createEntry.mock.calls[0][1].id).toBe(first.id)
    expect(createEntry.mock.calls[1][1].id).toBe(second.id)
  })

  it("leaves entries queued while the network is still down", async () => {
    await capture()
    createEntry.mockRejectedValue(offlineError())

    const result = await engine.drain(USER)

    expect(result.stopped).toBe(RETRY)
    expect(await queue.pending(USER)).toHaveLength(1)
    expect(await queue.rejected(USER)).toHaveLength(0)
  })

  it("stops after a retryable failure rather than hammering the server", async () => {
    await capture({ data: { note: "a" } })
    await capture({ data: { note: "b" } })
    await capture({ data: { note: "c" } })
    createEntry.mockRejectedValue(offlineError())

    await engine.drain(USER)

    expect(createEntry).toHaveBeenCalledTimes(1)
  })

  it("surfaces a refused entry instead of dropping it", async () => {
    // AC3. The project's schema changed while we were offline, so the entry
    // no longer fits it.
    await capture()
    createEntry.mockRejectedValue(httpError("Unknown field: notes", 422))

    const result = await engine.drain(USER)

    expect(result.rejected).toBe(1)
    const needsAttention = await queue.rejected(USER)
    expect(needsAttention).toHaveLength(1)
    expect(needsAttention[0].error).toBe("Unknown field: notes")
    expect(needsAttention[0].data).toEqual({ note: "captured offline" })
  })

  it("keeps going past a refused entry", async () => {
    // One entry the server will never accept must not strand the others.
    await capture({ data: { note: "bad" } })
    await capture({ data: { note: "good" } })

    createEntry
      .mockRejectedValueOnce(httpError("Unknown field", 422))
      .mockResolvedValueOnce({ id: "server-id" })

    const result = await engine.drain(USER)

    expect(result).toMatchObject({ accepted: 1, rejected: 1 })
    expect(await queue.pending(USER)).toHaveLength(0)
    expect(await queue.rejected(USER)).toHaveLength(1)
  })

  it("pauses without rejecting anything when the session has expired", async () => {
    // A dead session says nothing about the entries. Marking them rejected
    // would bury real work behind a sign-in prompt.
    await capture({ data: { note: "a" } })
    await capture({ data: { note: "b" } })
    createEntry.mockRejectedValue(httpError("Authentication required.", 401))

    const result = await engine.drain(USER)

    expect(result.stopped).toBe(PAUSED)
    expect(result.rejected).toBe(0)
    expect(await queue.pending(USER)).toHaveLength(2)
    expect(await queue.rejected(USER)).toHaveLength(0)
  })

  it("treats an already-stored entry as done", async () => {
    // The server returns the existing entry with 200 when the id is known,
    // which is how a replay after a lost response resolves.
    await capture()
    createEntry.mockResolvedValue({ id: "existing" })

    await engine.drain(USER)

    expect(await queue.all(USER)).toHaveLength(0)
  })

  it("counts an attempt even when the send fails", async () => {
    const record = await capture()
    createEntry.mockRejectedValue(offlineError())

    await engine.drain(USER)

    expect((await queue.get(record.id)).attempts).toBe(1)
  })

  it("does not run two drains at once", async () => {
    await capture()
    let release
    createEntry.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve({ id: "x" }) })
    )

    const first = engine.drain(USER)
    const second = await engine.drain(USER)

    expect(second.stopped).toBe("already-running")

    // Wait for the first drain to actually reach the send before releasing
    // it — it has several awaits to get through first.
    await vi.waitFor(() => expect(createEntry).toHaveBeenCalledTimes(1))
    release()
    await first

    // The second call returned without sending anything of its own.
    expect(createEntry).toHaveBeenCalledTimes(1)
  })

  it("ignores another user's queued entries", async () => {
    await capture({ userId: "someone-else" })

    const result = await engine.drain(USER)

    expect(result.accepted).toBe(0)
    expect(createEntry).not.toHaveBeenCalled()
  })
})

describe("reacting to the network returning", () => {
  it("drains on start and again when the browser reconnects", async () => {
    await capture()

    const stop = engine.start(USER, { intervalMs: 1000000 })
    await vi.waitFor(() => expect(createEntry).toHaveBeenCalledTimes(1))

    await capture({ data: { note: "second" } })
    window.dispatchEvent(new Event("online"))
    await vi.waitFor(() => expect(createEntry).toHaveBeenCalledTimes(2))

    stop()
  })

  it("stops listening once detached", async () => {
    const stop = engine.start(USER, { intervalMs: 1000000 })
    await vi.waitFor(() => expect(createEntry).toHaveBeenCalledTimes(0))
    stop()

    await capture()
    window.dispatchEvent(new Event("online"))

    expect(createEntry).not.toHaveBeenCalled()
  })

  it("notifies subscribers with the current counts", async () => {
    await capture()
    createEntry.mockRejectedValue(httpError("Unknown field", 422))

    const listener = vi.fn()
    engine.subscribe(listener)

    await engine.drain(USER)

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ pending: 0, rejected: 1 })
    )
  })

  it("notifies subscribers that work is still pending before the send resolves", async () => {
    // Regression: App.jsx only reloads from the server when it observes a
    // pending>0 state followed by pending==0. A drain that only notified
    // once, after finishing, could report pending==0 without that
    // transition ever being seen — leaving a just-synced entry invisible
    // until the next full reload.
    await capture()
    let release
    createEntry.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve({ id: "server-id" }) })
    )

    const seen = []
    engine.subscribe((state) => seen.push(state.pending))

    const drainPromise = engine.drain(USER)
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0))
    expect(seen[0]).toBe(1)

    release()
    await drainPromise

    expect(seen[seen.length - 1]).toBe(0)
  })
})
