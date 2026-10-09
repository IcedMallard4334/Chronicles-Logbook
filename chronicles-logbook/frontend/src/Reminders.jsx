/**
 * Reminders in the top bar (US-3.12): what's overdue, due today, or coming up
 * in the next week, across every project — to-do entries and tasks together,
 * because to the person being reminded they are the same thing.
 *
 * Built like the invitations bell beside it: polled, re-checked when the tab
 * regains focus, and absent entirely when there's nothing to say. The same
 * poll is what creates recurring entries once they come due, so when it
 * reports new ones the workspace is told to reload.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { fetchReminders } from "./api"
import { dueLabel, remindersLabel } from "./automationRules"
import { TipBubble } from "./Tip"
import { useDialogFocus } from "./useDialogFocus"
import "./Invitations.css"
import "./Reminders.css"

const POLL_MS = 5 * 60_000
const WINDOW_DAYS = 7

const GROUPS = [
  { status: "overdue", heading: "Overdue" },
  { status: "due_today", heading: "Due today" },
  { status: "upcoming", heading: "Coming up" },
]

export default function Reminders({ onOpenProject, onOccurrencesCreated }) {
  const [summary, setSummary] = useState(null)
  const [open, setOpen] = useState(false)
  const panel = useRef(null)
  const dialogRef = useDialogFocus(open, () => setOpen(false), { trap: false })
  // Held in a ref so a parent passing a fresh function each render doesn't
  // restart the poll (and refetch) every time it re-renders.
  const onCreatedRef = useRef(onOccurrencesCreated)
  useEffect(() => {
    onCreatedRef.current = onOccurrencesCreated
  }, [onOccurrencesCreated])

  const refresh = useCallback(async () => {
    try {
      const result = await fetchReminders(WINDOW_DAYS)
      setSummary(result)
      if (result.occurrences_created > 0) onCreatedRef.current?.()
    } catch {
      // Supplementary, like invitations: the workspace still works without it.
      setSummary(null)
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    const onFocus = () => refresh()
    window.addEventListener("focus", onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener("focus", onFocus)
    }
  }, [refresh])

  useEffect(() => {
    if (!open) return undefined
    const onClickOutside = (event) => {
      if (panel.current && !panel.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [open])

  const items = summary?.items || []
  if (items.length === 0) return null

  // The badge counts what needs attention now; "coming up" alone still shows
  // the bell, but in the quieter colour.
  const urgent = summary.overdue_count + summary.due_today_count
  const badge = urgent || items.length

  return (
    <div className="invites reminders" ref={panel}>
      <button
        type="button"
        className="invites-bell has-tip"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={remindersLabel(summary)}
      >
        <TipBubble text={remindersLabel(summary)} align="end" />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2" />
          <path d="M5 3 2 6M19 3l3 3" />
        </svg>
        <span
          className={`invites-count reminders-count reminders-count--${
            summary.overdue_count ? "overdue" : urgent ? "today" : "upcoming"
          }`}
        >
          {badge}
        </span>
      </button>

      {open && (
        <div ref={dialogRef} className="invites-panel" role="dialog" aria-label="Reminders" tabIndex={-1}>
          <header className="invites-head">
            <h3>Reminders</h3>
            <p>To-do entries and tasks due in the next {WINDOW_DAYS} days, or already late.</p>
          </header>
          <div className="reminders-body">
            {GROUPS.map((group) => {
              const inGroup = items.filter((item) => item.status === group.status)
              if (inGroup.length === 0) return null
              return (
                <section key={group.status} className={`reminders-group reminders-group--${group.status}`}>
                  <h4>{group.heading}</h4>
                  <ul className="invites-list" role="list">
                    {inGroup.map((item) => (
                      <li key={`${item.kind}-${item.id}`} className="invites-item reminders-item">
                        <button
                          type="button"
                          className="reminders-open"
                          onClick={() => {
                            setOpen(false)
                            onOpenProject?.(item.project_id)
                          }}
                        >
                          <span className="invites-copy">
                            <strong>{item.title || (item.kind === "task" ? "Untitled task" : "Untitled entry")}</strong>
                            <span className="invites-from">
                              {item.kind === "task" ? "Task" : "Entry"} · {item.project_name}
                            </span>
                          </span>
                          <span className={`reminders-due reminders-due--${item.status}`}>{dueLabel(item)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
