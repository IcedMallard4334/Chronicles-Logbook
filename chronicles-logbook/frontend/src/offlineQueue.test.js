import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  PENDING,
  REJECTED,
  createMemoryAdapter,
  createOfflineQueue,
  newEntryId,
} from "./offlineQueue"

const capture = {
  userId: "user-1",
  projectId: "proj-1",
  data: { note: "Wiring the sensor rig" },
  timeSpent: 45,
}

let queue

beforeEach(() => {
  queue = createOfflineQueue(createMemoryAdapter())
})

describe("newEntryId", () => {
  it("produces distinct ids", () => {
    const ids = new Set(Array.from({ length: 50 }, newEntryId))
    expect(ids.size).toBe(50)
  })
})

describe("offline queue", () => {
  it("stores a captured entry with an id the server can be given", async () => {
    // The id is minted client-side so that a replayed request is idempotent
    // rather than creating a second entry.
    const record = await queue.enqueue(capture)

    expect(record.id).toBeTruthy()
    expect(record.status).toBe(PENDING)
    expect(record.attempts).toBe(0)
    expect(await queue.pending("user-1")).toHaveLength(1)
  })

  it("records when the entry was captured, not when it is sent", async () => {
    const record = await queue.enqueue(capture)
    expect(Date.parse(record.capturedAt)).not.toBeNaN()
  })

  it("keeps the queue in capture order", async () => {
    const first = await queue.enqueue({ ...capture, data: { note: "first" } })
    const second = await queue.enqueue({ ...capture, data: { note: "second" } })

    const ids = (await queue.pending("user-1")).map((record) => record.id)
    expect(ids).toEqual([first.id, second.id])
  })

  it("does not return another user's queued entries", async () => {
    // Signing in as someone else must not expose, or sync, work that is not
    // theirs.
    await queue.enqueue(capture)
    await queue.enqueue({ ...capture, userId: "user-2" })

    expect(await queue.pending("user-1")).toHaveLength(1)
    expect(await queue.pending("user-2")).toHaveLength(1)
  })

  it("survives being read back after the record is stored", async () => {
    const record = await queue.enqueue(capture)
    const found = await queue.get(record.id)

    expect(found.data).toEqual({ note: "Wiring the sensor rig" })
    expect(found.timeSpent).toBe(45)
  })

  it("removes an entry once it has been accepted", async () => {
    const record = await queue.enqueue(capture)
    await queue.remove(record.id)

    expect(await queue.all("user-1")).toHaveLength(0)
  })

  it("keeps a rejected entry rather than discarding it", async () => {
    // AC3: conflicts are surfaced, not silently dropped. The queued copy is
    // the only record of what the user typed.
    const record = await queue.enqueue(capture)
    await queue.markRejected(record.id, "Unknown field: notes")

    expect(await queue.pending("user-1")).toHaveLength(0)

    const needsAttention = await queue.rejected("user-1")
    expect(needsAttention).toHaveLength(1)
    expect(needsAttention[0].error).toBe("Unknown field: notes")
    expect(needsAttention[0].data).toEqual({ note: "Wiring the sensor rig" })
  })

  it("returns a rejected entry to the queue when retried", async () => {
    const record = await queue.enqueue(capture)
    await queue.markRejected(record.id, "Project was archived")

    await queue.retry(record.id)

    const [retried] = await queue.pending("user-1")
    expect(retried.status).toBe(PENDING)
    expect(retried.error).toBeNull()
  })

  it("carries edits through a retry", async () => {
    // The user fixes what the server objected to, then sends it again.
    const record = await queue.enqueue(capture)
    await queue.markRejected(record.id, "Missing required field: Status")

    await queue.retry(record.id, { data: { note: "fixed", status: "Open" } })

    const [retried] = await queue.pending("user-1")
    expect(retried.data).toEqual({ note: "fixed", status: "Open" })
    expect(retried.id).toBe(record.id)
  })

  it("counts attempts so a failing entry can be backed off", async () => {
    const record = await queue.enqueue(capture)

    await queue.recordAttempt(record.id)
    await queue.recordAttempt(record.id)

    expect((await queue.get(record.id)).attempts).toBe(2)
  })

  it("ignores updates to an entry that is no longer queued", async () => {
    expect(await queue.update("missing", { status: REJECTED })).toBeNull()
    expect(await queue.recordAttempt("missing")).toBeNull()
  })

  it("shares storage between queue instances", async () => {
    // Two components may each hold a queue handle; they must see one queue.
    const adapter = createMemoryAdapter()
    const writer = createOfflineQueue(adapter)
    const reader = createOfflineQueue(adapter)

    await writer.enqueue(capture)

    expect(await reader.pending("user-1")).toHaveLength(1)
  })
})

describe("newEntryId on a browser without crypto.randomUUID", () => {
  // The whole point of capturing offline is that it works on whatever device
  // is to hand, which includes older browsers. That fallback only runs where
  // randomUUID is missing, so it never executes in the test environment — and
  // an id generator that is never exercised is exactly the kind of thing that
  // is discovered to be broken in the field.
  beforeEach(() => {
    // Replacing the whole global rather than deleting the property: crypto's
    // own properties are not configurable, so deleting randomUUID silently
    // does nothing and the test passes against the real implementation.
    vi.stubGlobal("crypto", {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("falls back rather than throwing when randomUUID is absent", () => {
    expect(globalThis.crypto.randomUUID).toBeUndefined()
    expect(() => newEntryId()).not.toThrow()
  })

  it("still produces a syntactically valid version 4 uuid", () => {
    const id = newEntryId()

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })

  it("still produces distinct ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newEntryId()))

    expect(ids.size).toBe(200)
  })
})
