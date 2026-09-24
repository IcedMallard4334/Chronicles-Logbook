/**
 * Invitations to other people's projects, as a notification in the top bar.
 *
 * Sharing used to be a grant: an owner typed your email and their project
 * appeared in your sidebar, unasked, with no way to give it back. It is an
 * offer now, and this is where the offer arrives — a bell that only exists
 * when there is something waiting, because a permanently empty notification
 * icon teaches people to stop looking at it.
 *
 * Polled rather than pushed. There is no socket here, and an invitation is not
 * urgent: a minute late is fine, and the check is one small request. It also
 * re-checks when the tab regains focus, which covers the common case of being
 * told "I have shared it with you" and switching back to look.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { acceptInvitation, declineInvitation, fetchInvitations } from "./api"
import { useDialogFocus } from "./useDialogFocus"
import "./Invitations.css"

const POLL_MS = 60_000

export default function Invitations({ onChanged }) {
  const [invitations, setInvitations] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState("")
  // The whole widget (bell + panel), for click-outside detection — has to
  // include the bell itself, or clicking it to close would also count as
  // "outside" and immediately reopen it.
  const panel = useRef(null)
  // Just the panel's contents, for initial focus and Escape: scoping it to
  // `panel` instead would find the bell button first, not the panel's own
  // items. Not a blocking modal — no backdrop, no aria-modal — so no Tab
  // trap: the rest of the page should stay reachable while this is open.
  const dialogRef = useDialogFocus(open, () => setOpen(false), { trap: false })

  const refresh = useCallback(async () => {
    try {
      setInvitations(await fetchInvitations())
    } catch {
      // Supplementary: a workspace with an unreachable invitations endpoint is
      // still a working workspace, so this fails quietly.
      setInvitations([])
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

  // Escape-to-close and initial focus live in useDialogFocus above; this
  // effect only owns click-outside-to-close.
  useEffect(() => {
    if (!open) return undefined
    const onClickOutside = (event) => {
      if (panel.current && !panel.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => {
      document.removeEventListener("mousedown", onClickOutside)
    }
  }, [open])

  const answer = async (invitation, accepted) => {
    setBusy(invitation.project_id)
    setError("")
    try {
      if (accepted) await acceptInvitation(invitation.project_id)
      else await declineInvitation(invitation.project_id)

      const remaining = invitations.filter(
        (other) => other.project_id !== invitation.project_id
      )
      setInvitations(remaining)
      if (remaining.length === 0) setOpen(false)
      // Accepting adds a project to the workspace; declining does not, but
      // refreshing either way keeps this one code path.
      onChanged?.()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not go through.")
      refresh()
    } finally {
      setBusy(null)
    }
  }

  if (invitations.length === 0) return null

  return (
    <div className="invites" ref={panel}>
      <button
        type="button"
        className="invites-bell"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`${invitations.length} project ${invitations.length === 1 ? "invitation" : "invitations"}`}
        title={`${invitations.length} waiting for an answer`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        <span className="invites-count">{invitations.length}</span>
      </button>

      {open && (
        <div ref={dialogRef} className="invites-panel" role="dialog" aria-label="Project invitations" tabIndex={-1}>
          <header className="invites-head">
            <h3>Invitations</h3>
            <p>Nothing is added to your workspace until you accept.</p>
          </header>

          {error && (
            <p className="invites-error" role="alert">
              {error}
            </p>
          )}

          <ul className="invites-list" role="list">
            {invitations.map((invitation) => (
              <li key={invitation.project_id} className="invites-item">
                <div className="invites-copy">
                  <strong>{invitation.project_name}</strong>
                  <span className="invites-from">
                    {invitation.invited_by_name
                      ? `${invitation.invited_by_name} invited you`
                      : "You have been invited"}
                    {" · "}
                    {invitation.entry_count}{" "}
                    {invitation.entry_count === 1 ? "entry" : "entries"} so far
                  </span>
                  {invitation.project_description && (
                    <span className="invites-desc">{invitation.project_description}</span>
                  )}
                </div>
                <div className="invites-actions">
                  <button
                    type="button"
                    className="invites-decline"
                    onClick={() => answer(invitation, false)}
                    disabled={busy === invitation.project_id}
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    className="invites-accept"
                    onClick={() => answer(invitation, true)}
                    disabled={busy === invitation.project_id}
                  >
                    {busy === invitation.project_id ? "…" : "Join"}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <footer className="invites-foot">
            Joining lets you read the project and add entries to it. Its owner keeps
            everything else, and you can leave whenever you like.
          </footer>
        </div>
      )}
    </div>
  )
}
