import { useEffect, useRef, useState } from "react"
import "./MiraAssistant.css"

const PROMPTS = [
  "How can I keep a better project log?",
  "What should I capture in a daily update?",
  "Help me plan a focused work session.",
]

function MiraMark() {
  return <span className="mira-mark" aria-hidden="true"><b>C</b><sup>M</sup></span>
}

function ProjectProposal({ action, saving, onConfirm, onCancel }) {
  if (!action || action.type !== "create_project") return null
  const { name, description } = action.payload
  return <section className="mira-project-proposal" aria-label="Proposed project">
    <span className="mira-message-label">Project proposal</span>
    <strong>{name}</strong>
    {description && <p>{description}</p>}
    <p className="mira-proposal-note">Mira has not created anything yet. Review this project before confirming.</p>
    <div className="mira-proposal-actions">
      <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
      <button type="button" className="btn-primary" onClick={onConfirm} disabled={saving}>{saving ? "Creating…" : "Create project"}</button>
    </div>
  </section>
}

function Conversation({ messages, sending, error, onSend, onClear, pendingAction, actionSaving, onConfirmAction, onCancelAction, onOpenProject, compact = false }) {
  const [draft, setDraft] = useState("")
  const feedRef = useRef(null)

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [messages, sending, error])

  const send = async (value = draft) => {
    const message = value.trim()
    if (!message || sending) return
    setDraft("")
    await onSend(message)
  }

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  return <>
    <div className="mira-feed" ref={feedRef} aria-live="polite" aria-label="Mira conversation">
      {!messages.length && !sending && <div className="mira-welcome">
        <MiraMark />
        <div><h2>Meet Mira</h2><p>Your Chronicles assistant for ideas, clearer updates, and useful work habits.</p></div>
        <div className="mira-prompts" aria-label="Suggested prompts">
          {PROMPTS.map(prompt => <button type="button" key={prompt} onClick={() => send(prompt)}>{prompt}</button>)}
        </div>
      </div>}
      {messages.map(message => <article className={`mira-message mira-message-${message.role}`} key={message.id}>
        <span className="mira-message-label">{message.role === "user" ? "You" : "Mira"}</span>
        <p>{message.content}</p>
        {message.projectId && <button type="button" className="mira-open-project" onClick={() => onOpenProject(message.projectId)}>Open project →</button>}
      </article>)}
      <ProjectProposal action={pendingAction} saving={actionSaving} onConfirm={onConfirmAction} onCancel={onCancelAction} />
      {sending && <div className="mira-typing" role="status"><MiraMark /> <span>Mira is thinking<span className="mira-dots">…</span></span></div>}
      {error && <div className="mira-error" role="alert"><span>{error.message}</span>{error.retryMessage && <button type="button" onClick={() => onSend(error.retryMessage)}>Retry</button>}</div>}
    </div>
    <form className="mira-composer" onSubmit={(event) => { event.preventDefault(); send() }}>
      <label className="sr-only" htmlFor={compact ? "mira-compact-input" : "mira-full-input"}>Message Mira</label>
      <textarea id={compact ? "mira-compact-input" : "mira-full-input"} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} maxLength={2000} rows={compact ? 2 : 3} placeholder="Ask Mira anything about keeping a log…" />
      <div className="mira-composer-actions"><span>{draft.length}/2000</span><button className="btn-primary" type="submit" disabled={!draft.trim() || sending}>Send</button></div>
    </form>
    {messages.length > 0 && <button type="button" className="mira-clear" onClick={onClear}>Clear conversation</button>}
  </>
}

export function MiraAssistantPage({ conversation }) {
  return <section className="mira-page workspace-page" aria-labelledby="mira-title">
    <header className="mira-page-header"><div><p className="workspace-kicker">CHRONICLES ASSISTANT</p><h1 id="mira-title">Mira</h1><p>Think through your work, then capture it in Chronicles when you are ready.</p></div><MiraMark /></header>
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
