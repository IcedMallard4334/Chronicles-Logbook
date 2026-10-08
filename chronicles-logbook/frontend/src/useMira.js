import { useCallback, useEffect, useRef, useState } from "react"

import {
  createMiraConversation, deleteMiraConversation, fetchMiraConversation, fetchMiraConversations, streamMiraReply,
} from "./api"
import { outcomeNote, runActions } from "./miraActions"

/**
 * Mira's conversation, in one place.
 *
 * The way it works is meant to feel like talking to Claude: you say what you want, Mira replies as she
 * writes, and what she does appears as it happens, each step in the chat with its own status. Changes
 * that only add or edit run straight away (deleting always asks first); she is then told how each step
 * went, so when one fails she can put it right or ask for exactly what is missing instead of leaving the
 * person with an error. A reply can be stopped part-way.
 */

const AUTO_RUN_KEY = "chronicles-mira-auto-run"
// How many times in a row Mira may answer her own results before she waits for the person.
const MAX_FOLLOW_UPS = 2

/** On unless the person has asked to be asked first. */
function readAutoRun() {
  try {
    return window.localStorage.getItem(AUTO_RUN_KEY) !== "off"
  } catch {
    return true
  }
}

export default function useMira({ active = false, onProjectsChanged, navigate, openProject } = {}) {
  const [messages, setMessages] = useState([])
  const [batches, setBatches] = useState([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [conversationId, setConversationId] = useState(null)
  const [conversations, setConversations] = useState([])
  const [autoRun, setAutoRun] = useState(readAutoRun)

  const sequence = useRef(0)
  const controller = useRef(null)
  const currentConversation = useRef(null)
  const autoRunRef = useRef(autoRun)
  const running = useRef(false)
  const batchList = useRef([])
  const engine = useRef({})
  const latest = useRef({ onProjectsChanged, navigate })
  latest.current = { onProjectsChanged, navigate }

  const refreshConversations = useCallback(async () => {
    try {
      setConversations(await fetchMiraConversations())
    } catch {
      // History is a convenience; a failed refresh must not interrupt the chat.
    }
  }, [])

  // The batch list is read by async code that must see the latest, so it lives in a ref too.
  const changeBatches = useCallback((change) => {
    batchList.current = change(batchList.current)
    setBatches(batchList.current)
  }, [])
  const changeBatch = useCallback(
    (id, change) => changeBatches((all) => all.map((batch) => (batch.id === id ? change(batch) : batch))),
    [changeBatches]
  )

  /** Runs one batch of Mira's actions, shows each step as it goes, then tells her how it went. */
  const runBatch = useCallback(async (batchId, depth = 0) => {
    const batch = batchList.current.find((candidate) => candidate.id === batchId)
    if (!batch || batch.status !== "awaiting" || running.current) return
    running.current = true
    changeBatch(batchId, (current) => ({ ...current, status: "running" }))
    let outcome
    try {
      outcome = await runActions(batch.items.map((item) => item.action), {
        navigate: latest.current.navigate,
        onProgress: (index, state, detail) =>
          changeBatch(batchId, (current) => ({
            ...current,
            items: current.items.map((item, position) => (position === index ? { ...item, state, detail } : item)),
          })),
      })
      changeBatch(batchId, (current) => ({ ...current, status: "finished", failed: Boolean(outcome.failed) }))
      try {
        await latest.current.onProjectsChanged?.()
      } catch {
        // The chat already says what happened; the lists catch up on the next load.
      }
    } finally {
      running.current = false
    }
    // Something went wrong: Mira is told, so she can fix it or ask for what she needs.
    if (outcome.failed && depth < MAX_FOLLOW_UPS && currentConversation.current) {
      await engine.current.streamTurn({ text: outcomeNote(outcome), kind: "results", depth: depth + 1 })
    }
  }, [changeBatch])

  /** One exchange: what was said (or how her actions went), and Mira's reply as it is written. */
  const streamTurn = useCallback(async ({ text, kind = "message", depth = 0 }) => {
    const id = ++sequence.current
    const replyId = `mira-${id}`
    const batchId = `batch-${id}`
    const upsertReply = (change) =>
      setMessages((previous) =>
        previous.some((item) => item.id === replyId)
          ? previous.map((item) => (item.id === replyId ? change(item) : item))
          : [...previous, change({ id: replyId, role: "assistant", content: "", thinking: "", streaming: true })]
      )
    if (kind === "message") setMessages((previous) => [...previous, { id: `user-${id}`, role: "user", content: text }])
    setSending(true)
    setError(null)
    const abort = new AbortController()
    controller.current = abort
    const proposed = []
    let failure = null
    let runNow = false
    try {
      let conversation = currentConversation.current
      if (!conversation) {
        conversation = (await createMiraConversation()).id
        currentConversation.current = conversation
        setConversationId(conversation)
      }
      await streamMiraReply(
        conversation,
        text,
        (event) => {
          if (event.type === "thought") upsertReply((item) => ({ ...item, thinking: `${item.thinking}${event.text}` }))
          else if (event.type === "delta") upsertReply((item) => ({ ...item, content: `${item.content}${event.text}` }))
          else if (event.type === "action") proposed.push(event.action)
          else if (event.type === "error") failure = event.detail || "Mira could not reply just now. Please try again."
        },
        { kind, signal: abort.signal }
      )
      if (failure) throw new Error(failure)
      // Stopped by the person: what was written stays, and nothing she proposed is run.
      if (proposed.length && !abort.signal.aborted) {
        changeBatches((all) => [
          ...all,
          { id: batchId, status: "awaiting", items: proposed.map((action) => ({ action, state: "pending" })) },
        ])
        upsertReply((item) => ({ ...item, batchId }))
        runNow = autoRunRef.current && !proposed.some((action) => action.destructive)
      }
    } catch (caught) {
      // The failed exchange leaves nothing behind (the question goes with the reply it never got), so a
      // retry cannot duplicate it, and whatever the backend said about the failure is what is read.
      setMessages((previous) => previous.filter((item) => item.id !== replyId && item.id !== `user-${id}`))
      setError({
        message: caught?.message || "Mira could not reply just now. Please try again.",
        retryMessage: kind === "message" ? text : null,
      })
    } finally {
      controller.current = null
      setMessages((previous) => previous.map((item) => (item.id === replyId ? { ...item, streaming: false } : item)))
      setSending(false)
      refreshConversations()
    }
    if (runNow) await engine.current.runBatch(batchId, depth)
  }, [changeBatches, refreshConversations])

  useEffect(() => {
    engine.current = { streamTurn, runBatch }
  }, [streamTurn, runBatch])

  const send = useCallback(
    (message) => {
      const text = String(message ?? "").trim()
      if (!text || sending) return Promise.resolve()
      return streamTurn({ text })
    },
    [sending, streamTurn]
  )

  const stop = useCallback(() => controller.current?.abort(), [])

  const cancelBatch = useCallback(
    (batchId) => changeBatch(batchId, (batch) => (batch.status === "awaiting" ? { ...batch, status: "cancelled" } : batch)),
    [changeBatch]
  )

  const startNew = useCallback(() => {
    controller.current?.abort()
    currentConversation.current = null
    setConversationId(null)
    setMessages([])
    changeBatches(() => [])
    setError(null)
  }, [changeBatches])

  const open = useCallback(async (id) => {
    if (sending) return
    try {
      const conversation = await fetchMiraConversation(id)
      currentConversation.current = conversation.id
      setConversationId(conversation.id)
      // How her actions went is for her, not a chat bubble: it is kept in the conversation, not shown.
      setMessages(
        conversation.messages
          .filter((item) => item.role !== "tool")
          .map((item) => ({ id: item.id, role: item.role, content: item.content, thinking: item.thinking || "" }))
      )
      changeBatches(() => [])
      setError(null)
    } catch {
      setError({ message: "That conversation could not be opened.", retryMessage: null })
    }
  }, [sending, changeBatches])

  const remove = useCallback(async (id) => {
    try {
      await deleteMiraConversation(id)
      if (id === currentConversation.current) startNew()
      await refreshConversations()
    } catch {
      setError({ message: "That conversation could not be deleted.", retryMessage: null })
    }
  }, [refreshConversations, startNew])

  const toggleAutoRun = useCallback((on) => {
    autoRunRef.current = on
    setAutoRun(on)
    try {
      window.localStorage.setItem(AUTO_RUN_KEY, on ? "on" : "off")
    } catch {
      // The choice just won't be remembered.
    }
  }, [])

  useEffect(() => {
    if (active) refreshConversations()
  }, [active, refreshConversations])

  useEffect(() => () => controller.current?.abort(), [])

  return {
    messages,
    batches,
    sending,
    error,
    autoRun,
    onToggleAutoRun: toggleAutoRun,
    onSend: send,
    onStop: stop,
    onRunBatch: runBatch,
    onCancelBatch: cancelBatch,
    onOpenProject: openProject,
    onClear: startNew,
    conversations,
    activeConversationId: conversationId,
    onSelectConversation: open,
    onNewConversation: startNew,
    onDeleteConversation: remove,
  }
}
