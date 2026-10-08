import { useId, useLayoutEffect, useRef } from "react"

import "./FormField.css"

/** "12 / 255", turning amber as the limit nears and red when a value is over it. */
export function CharacterCount({ length, max, id }) {
  const state = length > max ? " is-over" : length >= max * 0.9 ? " is-near" : ""
  return (
    <span id={id} className={`form-field-count${state}`}>
      {length.toLocaleString("en")} / {max.toLocaleString("en")}
    </span>
  )
}

/**
 * A short answer that grows downwards instead of scrolling sideways.
 *
 * It reads like a single line (no line breaks can be typed or pasted, and Enter submits the
 * form as it would in a one-line box) but when the text is longer than the box, the box
 * gets taller, so all of it stays in view and nobody has to scroll left and right.
 * `onValueChange` is handed the text itself.
 */
export function ShortTextBox({ value, onValueChange, ...props }) {
  const box = useRef(null)

  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    element.style.height = "auto"
    element.style.height = `${element.scrollHeight}px`
  }, [value])

  return (
    <textarea
      {...props}
      ref={box}
      rows={1}
      className="short-text-box"
      value={value}
      onChange={(event) => onValueChange(event.target.value.replace(/[\r\n]+/g, " "))}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return
        event.preventDefault()
        event.currentTarget.form?.requestSubmit?.()
      }}
    />
  )
}

/**
 * One question in a form, laid out the way a form builder lays one out: the name
 * on top with its type beside it, then a hint, then the answer box underneath, so
 * a long name or a long answer simply wraps instead of fighting for a line.
 *
 * `children` is either the control itself or, for the common case of a single
 * input, a function that is handed the props to spread on it (`id`, the
 * description and the required and invalid flags) so the name is a real label for
 * the box. A field made of several controls (tags, a checklist) passes `group`.
 *
 * `size` says how big an answer box should be, because the box is a hint about the
 * answer: "narrow" for a number or a date, "short" for a line of text, "long" for
 * a paragraph.
 */
export default function FormField({
  label,
  typeLabel,
  required = false,
  hint,
  error,
  count,
  group = false,
  size,
  className = "",
  children,
}) {
  const base = useId()
  const controlId = `${base}-control`
  const nameId = `${base}-name`
  const typeId = `${base}-type`
  const hintId = `${base}-hint`
  const errorId = `${base}-error`
  const countId = `${base}-count`
  const describedBy = [typeLabel && typeId, hint && hintId, error && errorId, count && countId].filter(Boolean).join(" ")

  const controlProps = {
    id: controlId,
    "aria-describedby": describedBy || undefined,
    "aria-required": required || undefined,
    "aria-invalid": error ? "true" : undefined,
  }

  return (
    <div
      className={`form-field${size ? ` is-${size}` : ""}${error ? " has-error" : ""}${className ? ` ${className}` : ""}`}
      role={group ? "group" : undefined}
      aria-labelledby={group ? nameId : undefined}
      aria-describedby={group ? describedBy || undefined : undefined}
    >
      <div className="form-field-head">
        {group ? (
          <span id={nameId} className="form-field-name">{label}</span>
        ) : (
          <label htmlFor={controlId} className="form-field-name">{label}</label>
        )}
        {required && <span className="form-field-required" aria-hidden="true" title="Required">*</span>}
        {typeLabel && <span id={typeId} className="form-field-type">{typeLabel}</span>}
      </div>
      {hint && <p id={hintId} className="form-field-hint">{hint}</p>}
      {typeof children === "function" ? children(controlProps) : children}
      {(error || count) && (
        <div className="form-field-foot">
          {error ? <span id={errorId} className="form-field-error">{error}</span> : <span />}
          {count && <CharacterCount id={countId} length={count.length} max={count.max} />}
        </div>
      )}
    </div>
  )
}
