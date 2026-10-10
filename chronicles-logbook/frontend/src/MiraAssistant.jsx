import { Fragment, useEffect, useRef, useState } from "react"
import MiraMarkdown from "./MiraMarkdown"
import { TipBubble } from "./Tip"
import { appendDictation, dictationSupported, startDictation } from "./speech"
import { TrashButton } from "./TrashIcon"
import "./MiraAssistant.css"

const ACTION_PROMPTS = [
  { title: "Set up a project", detail: "Name, fields and statuses in one go.", prompt: "Create a project called Weekly Planning with fields for Focus (text) and Hours (number), and add a task to review it on Friday." },
  { title: "Add a task with a due date", detail: "Tasks, reminders and deadlines.", prompt: "Add a task called Send the report to my newest project, due next Monday." },
  { title: "Schedule something", detail: "Put it on your calendar.", prompt: "Schedule a planning session tomorrow from 09:00 to 10:00." },
]

const PROMPTS = [
  { title: "Write a clearer update", detail: "Turn rough notes into a useful log entry.", prompt: "Help me write a clear project update. Ask me what I worked on, what I learned, and what comes next." },
  { title: "Plan a focused session", detail: "Give your next work session a direction.", prompt: "Help me plan a focused work session." },
  { title: "Start a project", detail: "Shape an idea into a project proposal.", prompt: "Help me create a project. Ask me for its name and description before proposing it." },
]

function MiraMark() {
  return <span className="mira-mark" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17V7l8 8 8-8v10" /><path d="M12 3v3M10.5 4.5h3" /></svg></span>
}

const STATE_WORDS = { pending: "Waiting", running: "Working on it", done: "Done", failed: "Didn't work", skipped: "Not run" }

function StepIcon({ state }) {
  if (state === "running") return <span className="mira-step-icon is-running" aria-hidden="true" />
  return <span className={`mira-step-icon is-${state}`} aria-hidden="true">{{ done: "✓", failed: "✗", skipped: "–", pending: "○" }[state]}</span>
}

/**
 * What Mira is doing, as steps in the chat: each one waiting, in progress, done, or not working, with the
 * reason. Changes that only add or edit run by themselves; anything that deletes (or every change, if the
 * person asked to be asked first) waits here for a click.
 */
function ActionBatch({ batch, onRun, onCancel }) {
  const count = batch.items.length
  const awaiting = batch.status === "awaiting"
  const destructive = batch.items.some((item) => item.action.destructive)
  const heading = {
    awaiting: destructive ? "Mira needs your OK" : count === 1 ? "Mira would like to" : `Mira would like to do ${count} things`,
    running: "Working on it…",
    finished: batch.failed ? "Part of that didn’t work" : count === 1 ? "Done" : "All done",
    cancelled: "Cancelled",
  }[batch.status]
  return <section className={`mira-project-proposal mira-actions mira-batch is-${batch.status}`} aria-label="Proposed actions" aria-busy={batch.status === "running"}>
    <span className="mira-message-label">{heading}</span>
    <ol className="mira-action-list">
      {batch.items.map((item, index) => <li key={index} className={`is-${item.state}${item.action.destructive ? " is-destructive" : ""}`}>
        <StepIcon state={batch.status === "cancelled" ? "skipped" : item.state} />
        <span className="mira-step-text">
          <span className="sr-only">{STATE_WORDS[batch.status === "cancelled" ? "skipped" : item.state]}: </span>
          {item.state === "done" && item.detail ? item.detail : item.action.summary}
          {item.action.destructive && item.state === "pending" && <em> — this can’t be undone</em>}
          {item.state === "failed" && item.detail && <small className="mira-step-reason">{item.detail}</small>}
        </span>
      </li>)}
    </ol>
    {awaiting && <>
      <p className="mira-proposal-note">Nothing has changed yet. Review this before confirming.</p>
      <div className="mira-proposal-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn-primary" onClick={onRun}>{count === 1 ? "Do it" : `Do all ${count}`}</button>
      </div>
    </>}
  </section>
}

function ConversationHistory({ conversations = [], activeId, onSelect, onNew, onDelete }) {
  const [open, setOpen] = useState(false)
  return <div className="mira-history">
    <div className="mira-history-bar">
      <button type="button" className="mira-history-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>History{conversations.length > 0 && <span> ({conversations.length})</span>}</button>
      <button type="button" className="mira-history-new" onClick={() => { onNew(); setOpen(false) }}>New chat</button>
    </div>
    {open && <ul className="mira-history-list" aria-label="Previous conversations">
      {conversations.length === 0 && <li className="mira-history-empty">No saved conversations yet.</li>}
      {conversations.map(conversation => <li key={conversation.id} className={conversation.id === activeId ? "is-active" : ""}>
        <button type="button" className="mira-history-item" aria-current={conversation.id === activeId ? "true" : undefined} onClick={() => { onSelect(conversation.id); setOpen(false) }}><strong>{conversation.title}</strong><small>{new Date(conversation.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</small></button>
        <TrashButton label={`Delete conversation: ${conversation.title}`} onClick={() => onDelete(conversation.id)} />
      </li>)}
    </ul>}
  </div>
}

function Conversation({ messages, batches = [], sending, error, onSend, onStop, onClear, onRunBatch, onCancelBatch, autoRun, onToggleAutoRun, onOpenProject, conversations, activeConversationId, onSelectConversation, onNewConversation, onDeleteConversation, compact = false }) {
  // The suggestions are a convenience; on a phone they would push the message box
  // off the screen, so they start folded there and open from a button.
  const [promptsOpen, setPromptsOpen] = useState(() => !(typeof window !== "undefined" && window.matchMedia?.("(max-width: 720px)").matches))
  const [draft, setDraft] = useState("")
  const feedRef = useRef(null)
  const dictation = useRef(null)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState("")
  const [voiceError, setVoiceError] = useState("")
  const canDictate = dictationSupported()

  useEffect(() => () => dictation.current?.stop(), [])

  const toggleDictation = () => {
    if (listening) { dictation.current?.stop(); return }
    setVoiceError("")
    try {
      dictation.current = startDictation({
        initialText: draft,
        onFinal: (chunk) => chunk && setDraft((current) => appendDictation(current, chunk, 2000)),
        onInterim: setInterim,
        onError: setVoiceError,
        onEnd: () => { setListening(false); dictation.current = null },
      })
      setListening(true)
    } catch {
      setVoiceError("Dictation could not start in this browser.")
    }
  }

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [messages, sending, error])

  const send = async (value = draft) => {
    const message = value.trim()
    if (!message || sending) return
    dictation.current?.stop()
    setDraft("")
    await onSend(message)
  }

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  const streaming = messages.find(message => message.streaming)
  const waiting = sending && !streaming?.content

  return <>
    {onSelectConversation && <ConversationHistory conversations={conversations} activeId={activeConversationId} onSelect={onSelectConversation} onNew={onNewConversation} onDelete={onDeleteConversation} />}
    <div className="mira-feed" ref={feedRef} aria-live="polite" aria-busy={sending} aria-label="Mira conversation">
      {!messages.length && !sending && <div className="mira-welcome">
        <div><h2>Make room for your next idea.</h2><p>Bring a rough idea, a work update, or a plan. Let’s give it a clear next step.</p></div>
        <button type="button" className="mira-prompts-toggle" aria-expanded={promptsOpen} aria-controls="mira-prompts-list" onClick={() => setPromptsOpen((open) => !open)}>
          {promptsOpen ? "Hide suggestions" : "Show suggestions"}
        </button>
        {promptsOpen && <div className="mira-prompts" id="mira-prompts-list" aria-label="Suggested prompts">
          {[...ACTION_PROMPTS, ...PROMPTS].map(({ title, detail, prompt }, index) => <button type="button" key={title} onClick={() => { setDraft(prompt); document.getElementById(compact ? "mira-compact-input" : "mira-full-input")?.focus() }}><span className="mira-prompt-number" aria-hidden="true">0{index + 1}</span><strong>{title}</strong><span>{detail}</span><span className="mira-prompt-arrow" aria-hidden="true">↗</span></button>)}
        </div>}
      </div>}
      {messages.filter(message => message.role !== "tool").map(message => <Fragment key={message.id}><article className={`mira-message mira-message-${message.role}`}>
        <span className="mira-message-label">{message.role === "user" ? "You" : "Mira"}</span>
        {message.role === "user" ? <p>{message.content}</p> : <>
          {message.thinking && <details className="mira-thinking" open={Boolean(message.streaming)}><summary>{message.streaming && !message.content ? "Mira is thinking…" : "How Mira approached this"}</summary><p>{message.thinking}</p></details>}
          {message.content && <MiraMarkdown text={message.content} />}
          {message.streaming && <span className="mira-caret" aria-hidden="true" />}
        </>}
        {message.projectId && <button type="button" className="mira-open-project" onClick={() => onOpenProject(message.projectId)}>Open project →</button>}
      </article>
      {message.batchId && batches.filter(batch => batch.id === message.batchId).map(batch => <ActionBatch key={batch.id} batch={batch} onRun={() => onRunBatch(batch.id)} onCancel={() => onCancelBatch(batch.id)} />)}
      </Fragment>)}
      {waiting && !streaming?.thinking && <div className="mira-typing" role="status"><MiraMark /> <span>Mira is thinking<span className="mira-dots">…</span></span></div>}
      {error && <div className="mira-error" role="alert"><span>{error.message}</span>{error.retryMessage && <button type="button" onClick={() => onSend(error.retryMessage)}>Retry</button>}</div>}
    </div>
    <form className="mira-composer" onSubmit={(event) => { event.preventDefault(); send() }}>
      <label className="sr-only" htmlFor={compact ? "mira-compact-input" : "mira-full-input"}>Message Mira</label>
      <textarea id={compact ? "mira-compact-input" : "mira-full-input"} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} maxLength={2000} rows={compact ? 2 : 3} placeholder="What are you working on?" />
      {listening && <p className="mira-dictation-status" role="status">Listening… {interim && <em>{interim}</em>}</p>}
      {voiceError && <p className="mira-error" role="alert">{voiceError}</p>}
      <div className="mira-composer-actions">
        {canDictate && <button type="button" className={`mira-mic has-tip${listening ? " is-listening" : ""}`} aria-pressed={listening} aria-label={listening ? "Stop dictating" : "Dictate your message"} onClick={toggleDictation}><TipBubble above text={listening ? "Stop dictating" : "Dictate your message"} /><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg></button>}
        <span className="mira-composer-hint"><span className="mira-keyboard-hint">Enter to send · Shift + Enter for a new line</span><span>{draft.length}/2000</span></span>
        {sending
          ? <button className="btn-secondary mira-stop" type="button" onClick={() => onStop?.()}>Stop</button>
          : <button className="btn-primary" type="submit" disabled={!draft.trim()}>Send</button>}</div>
      {onToggleAutoRun && <label className="mira-autorun"><input type="checkbox" checked={!autoRun} onChange={(event) => onToggleAutoRun(!event.target.checked)} />Ask me before Mira changes anything (deleting always asks)</label>}
      <p className="mira-footnote">Mira acts as soon as you ask, and shows each step. Check what she does; she can only change what you could change yourself. Conversations are saved to your account; delete any from History.</p>
    </form>
    {messages.length > 0 && <button type="button" className="mira-clear" onClick={onClear}>New conversation</button>}
  </>
}

export function MiraAssistantPage({ conversation }) {
  return <section className="mira-page workspace-page" aria-labelledby="mira-title">
    <header className="mira-page-header"><div className="mira-heading-identity"><MiraMark /><div><h1 id="mira-title">Mira <span>by Chronicles</span></h1><p>A thinking partner for your project work.</p></div></div><span className="mira-page-badge">Ideas → plans → progress</span></header>
    <p className="mira-permissions-link"><a href="/mira-permissions">Mira permissions · review or change access</a></p>
    <Conversation {...conversation} />
  </section>
}

export function MiraLauncher({ conversation, open, onToggle, onOpenFull }) {
  return <div className="mira-launcher">
    {open && <section className="mira-panel" aria-label="Mira assistant">
      <header><div><MiraMark /><span><strong>Mira</strong><small>Chronicles assistant</small></span></div><div><button type="button" className="mira-panel-link" onClick={onOpenFull}>Open full assistant</button><button type="button" aria-label="Close Mira" className="mira-close" onClick={onToggle}>×</button></div></header>
      <Conversation {...conversation} compact />
    </section>}
    <button type="button" className="mira-launch-button" aria-label={open ? "Close Mira assistant" : "Open Mira assistant"} aria-expanded={open} onClick={onToggle}><MiraMark /><span>Mira</span></button>
  </div>
}
