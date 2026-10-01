import "./EditIcon.css"

/** A pencil that wiggles as if writing when its button is hovered or focused. */
export function PencilIcon({ size = 15 }) {
  return (
    <svg className="pencil-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path className="pencil-body" d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      <path className="pencil-line" d="M3 23h18" />
    </svg>
  )
}

/** The edit control used across the app: a pencil beside the label. */
export function EditButton({ children = "Edit", className = "", type = "button", ...rest }) {
  return (
    <button type={type} className={`btn-text btn-edit ${className}`.trim()} {...rest}>
      <PencilIcon />
      <span>{children}</span>
    </button>
  )
}
