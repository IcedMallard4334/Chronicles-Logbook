import { useState } from "react"

import { useDialogFocus } from "./useDialogFocus"
import "./EntryTaskGuide.css"

export const ENTRY_DEFINITION = "A record of work you have already done: what happened, how long it took."
export const TASK_DEFINITION = "Something you still need to do, with an optional due date and checklist."

function GuideDialog({ onClose }) {
  const dialogRef = useDialogFocus(true, onClose)
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="modal-card entry-task-guide"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-task-guide-title"
        tabIndex={-1}
      >
        <h2 id="entry-task-guide-title">Entry or task?</h2>
        <p className="entry-task-test">
          Ask one question: <strong>has it already happened?</strong>
        </p>

        <div className="entry-task-compare">
          <section aria-labelledby="guide-entry-heading">
            <h3 id="guide-entry-heading">Entry <span>already happened</span></h3>
            <p>{ENTRY_DEFINITION}</p>
            <p className="entry-task-example">“Fixed the login bug — 2 hours.”</p>
            <p className="hint">Found under <strong>All Entries</strong> and each project&rsquo;s <strong>Entries</strong> tab.</p>
          </section>
          <section aria-labelledby="guide-task-heading">
            <h3 id="guide-task-heading">Task <span>still to do</span></h3>
            <p>{TASK_DEFINITION}</p>
            <p className="entry-task-example">“Fix the login bug by Friday.”</p>
            <p className="hint">Found under <strong>All Tasks</strong> and each project&rsquo;s <strong>Tasks</strong> tab.</p>
          </section>
        </div>

        <h3 className="entry-task-heading">How they work together</h3>
        <ul className="entry-task-together">
          <li>Plan it as a <strong>task</strong>. When you finish, tick it off and log an <strong>entry</strong> to keep a record of what you did.</li>
          <li>Need to note details about something upcoming? Add an <strong>entry</strong> and mark it <em>still to do</em>: it shows up on Outstanding until you finish it.</li>
        </ul>

        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  )
}

/** A small button that explains the difference between an entry and a task. */
export default function EntryTaskGuide({ className = "" }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={`entry-task-guide-button ${className}`.trim()} onClick={() => setOpen(true)}>
        <span aria-hidden="true">?</span> Entry or task?
      </button>
      {open && <GuideDialog onClose={() => setOpen(false)} />}
    </>
  )
}
