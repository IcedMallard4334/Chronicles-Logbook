import "./TrashIcon.css"

/** A trash can whose lid lifts when its button is hovered or focused. */
export function TrashIcon({ size = 18 }) {
  return (
    <svg className="trash-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <g className="trash-lid">
        <path d="M4 7h16" />
        <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      </g>
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

/**
 * The delete control used across the app. `label` is what a screen reader
 * announces and what the tooltip says; `text` optionally shows it beside the icon.
 */
export function TrashButton({ label, text, onClick, disabled, className = "", type = "button", ...rest }) {
  return (
    <button type={type} className={`btn-trash ${text ? "btn-trash-labelled" : ""} ${className}`.trim()} aria-label={text ? undefined : label} title={label} onClick={onClick} disabled={disabled} {...rest}>
      <TrashIcon />
      {text && <span>{text}</span>}
    </button>
  )
}
