import { createPortal } from "react-dom"

import { useDialogFocus } from "./useDialogFocus"

/**
 * Our own "are you sure?", in place of the browser's `window.confirm`.
 *
 * The browser's box is drawn by the browser: unthemed, titled with the page's address, impossible to style, and
 * on some phones it is blocked or skipped. This one is a normal modal dialog in the app's own style, with
 * focus moved into it, Tab kept inside it, Escape to cancel and focus returned afterwards (`useDialogFocus`).
 * Focus starts on the first button, which is Cancel, so pressing Enter by reflex does not delete anything.
 *
 * It is drawn into `document.body` rather than where it is used. A control inside a card or panel that has its
 * own stacking or overflow rules would otherwise place a fixed backdrop relative to that box, not the screen, and
 * the dialog came up off-centre and cut off.
 *
 * It is controlled: render it while a question is open, and it calls `onConfirm` or `onCancel` and nothing else.
 */
export default function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, busy = false, onConfirm, onCancel }) {
  const dialogRef = useDialogFocus(true, onCancel)
  return createPortal(
    <div className="modal-backdrop" onClick={onCancel} role="presentation">
      <div
        ref={dialogRef}
        className="modal-card confirm-dialog"
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        tabIndex={-1}
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-message">{message}</p>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
