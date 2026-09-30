import { useEffect, useRef, useState } from "react"
import MiraMarkdown from "./MiraMarkdown"
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

function ActionProposals({ actions, running, onRun, onCancel }) {
  if (!actions?.length) return null
  const count = actions.length
  return <section className="mira-project-proposal mira-actions" aria-label="Proposed actions">
    <span className="mira-message-label">{count === 1 ? "Mira would like to" : `Mira would like to do ${count} things`}</span>
    <ol className="mira-action-list">
      {actions.map((action, index) => <li key={index} className={action.destructive ? "is-destructive" : undefined}>
        {action.summary}{action.destructive && <em> — this can’t be undone</em>}
      </li>)}
    </ol>
    <p className="mira-proposal-note">Nothing has changed yet. Review this before confirming.</p>
    <div className="mira-proposal-actions">
      <button type="button" className="btn-secondary" onClick={onCancel} disabled={running}>Cancel</button>
      <button type="button" className="btn-primary" onClick={onRun} disabled={running}>{running ? "Working…" : count === 1 ? "Do it" : `Do all ${count}`}</button>
    </div>
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

function Conversation({ messages, sending, error, onSend, onClear, pendingActions, actionsRunning, onRunActions, onCancelActions, autoRun, onToggleAutoRun, onOpenProject, conversations, activeConversationId, onSelectConversation, onNewConversation, onDeleteConversation, compact = false }) {
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
        <div className="mira-prompts" aria-label="Suggested prompts">
          {[...ACTION_PROMPTS, ...PROMPTS].map(({ title, detail, prompt }, index) => <button type="button" key={title} onClick={() => { setDraft(prompt); document.getElementById(compact ? "mira-compact-input" : "mira-full-input")?.focus() }}><span className="mira-prompt-number" aria-hidden="true">0{index + 1}</span><strong>{title}</strong><span>{detail}</span><span className="mira-prompt-arrow" aria-hidden="true">↗</span></button>)}
        </div>
      </div>}
      {messages.map(message => <article className={`mira-message mira-message-${message.role}`} key={message.id}>
        <span className="mira-message-label">{message.role === "user" ? "You" : "Mira"}</span>
        {message.role === "user" ? <p>{message.content}</p> : <>
          {message.thinking && <details className="mira-thinking" open={Boolean(message.streaming)}><summary>{message.streaming && !message.content ? "Mira is thinking…" : "How Mira approached this"}</summary><p>{message.thinking}</p></details>}
          {message.content && <MiraMarkdown text={message.content} />}
          {message.streaming && <span className="mira-caret" aria-hidden="true" />}
        </>}
        {message.projectId && <button type="button" className="mira-open-project" onClick={() => onOpenProject(message.projectId)}>Open project →</button>}
      </article>)}
      <ActionProposals actions={pendingActions} running={actionsRunning} onRun={onRunActions} onCancel={onCancelActions} />
      {waiting && !streaming?.thinking && <div className="mira-typing" role="status"><MiraMark /> <span>Mira is thinking<span className="mira-dots">…</span></span></div>}
      {error && <div className="mira-error" role="alert"><span>{error.message}</span>{error.retryMessage && <button type="button" onClick={() => onSend(error.retryMessage)}>Retry</button>}</div>}
    </div>
    <form className="mira-composer" onSubmit={(event) => { event.preventDefault(); send() }}>
      <label className="sr-only" htmlFor={compact ? "mira-compact-input" : "mira-full-input"}>Message Mira</label>
      <textarea id={compact ? "mira-compact-input" : "mira-full-input"} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} maxLength={2000} rows={compact ? 2 : 3} placeholder="What are you working on?" />
      {listening && <p className="mira-dictation-status" role="status">Listening… {interim && <em>{interim}</em>}</p>}
      {voiceError && <p className="mira-error" role="alert">{voiceError}</p>}
      <div className="mira-composer-actions">
        {canDictate && <button type="button" className={`mira-mic${listening ? " is-listening" : ""}`} aria-pressed={listening} aria-label={listening ? "Stop dictating" : "Dictate your message"} title={listening ? "Stop dictating" : "Dictate your message"} onClick={toggleDictation}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg></button>}
        <span className="mira-composer-hint"><span className="mira-keyboard-hint">Enter to send · Shift + Enter for a new line</span><span>{draft.length}/2000</span></span>
        <button className="btn-primary" type="submit" disabled={!draft.trim() || sending}>Send</button></div>
      {onToggleAutoRun && <label className="mira-autorun"><input type="checkbox" checked={Boolean(autoRun)} onChange={(event) => onToggleAutoRun(event.target.checked)} />Run simple changes straight away (deleting always asks)</label>}
      <p className="mira-footnote">Review Mira’s suggestions. Project creation always needs your confirmation. Conversations are saved to your account; delete any from History.</p>
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
