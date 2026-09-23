/**
 * Choosing what kind of thing a field holds.
 *
 * This was a `<select>` of nine words, and the words were the problem. "Tags",
 * "Choice" and "Checklist" all sound like "a list of things"; "Entry link" and
 * "Project link" sound like the same feature; and nothing in a dropdown says
 * what filling the field in will actually be like. People picked Choice when
 * they wanted Tags, then found they could only ever record one value, and
 * concluded the field types were broken rather than misread.
 *
 * So: a grid of cards, each carrying the question the type answers, a real
 * example, and what capture looks like. It is more pixels than a dropdown, and
 * it is a decision somebody makes a handful of times per project and then lives
 * with for a term, which is exactly where the pixels are worth spending.
 *
 * The content lives in `FIELD_TYPE_META` beside the label and the badge, so
 * there is one description of a type and every screen reads the same one.
 */

import { useEffect, useRef, useState } from "react"
import { FIELD_TYPES, FIELD_TYPE_META } from "./fieldTypes"
import "./FieldTypePicker.css"

/**
 * The full guide, as a panel.
 *
 * `disabledTypes` covers the cases where a type cannot be chosen yet — a
 * calculation with no numbers to read, a project link with nowhere to point.
 * Shown greyed with the reason rather than hidden, so the answer to "where is
 * the calculation option?" is on screen instead of nowhere.
 */
export function FieldTypeGrid({ value, onChoose, disabledTypes = {} }) {
  return (
    <ul className="ftp-grid" role="radiogroup" aria-label="Field type">
      {FIELD_TYPES.map((type) => {
        const blocked = disabledTypes[type.value]
        const selected = value === type.value
        return (
          <li key={type.value}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              // Named by the type alone. The card's own text is four lines of
              // guidance, which is the right amount to read and the wrong
              // amount to have announced as a control's name.
              aria-label={type.label}
              className={`ftp-card ${selected ? "is-selected" : ""} ${blocked ? "is-blocked" : ""}`}
              onClick={() => !blocked && onChoose(type.value)}
              disabled={Boolean(blocked)}
              title={blocked || undefined}
            >
              <span className="ftp-card-head">
                <span className="ftp-icon" aria-hidden="true">
                  {type.icon}
                </span>
                <span className="ftp-name">{type.label}</span>
                {type.badge && (
                  <span className={`ftp-badge is-${type.color}`}>{type.badge}</span>
                )}
              </span>

              <span className="ftp-use">{blocked || type.useWhen}</span>

              <span className="ftp-example">
                <span className="ftp-example-field">{type.example.field}</span>
                <span className="ftp-example-value">{type.example.value}</span>
              </span>

              <span className="ftp-capture">{type.capture}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The compact control: what is chosen, and a way to change it.
 *
 * Opens the grid in a popover rather than inline, because a schema with six
 * fields would otherwise be six copies of a nine-card guide stacked down the
 * page.
 */
export default function FieldTypePicker({ value, onChoose, disabledTypes = {} }) {
  const [open, setOpen] = useState(false)
  const holder = useRef(null)
  const meta = FIELD_TYPE_META[value] || FIELD_TYPE_META.text

  useEffect(() => {
    if (!open) return undefined
    const onClickOutside = (event) => {
      if (holder.current && !holder.current.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClickOutside)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div className="ftp" ref={holder}>
      <span className="field-label-text">Type</span>
      <button
        type="button"
        className="ftp-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Type"
      >
        <span className="ftp-icon" aria-hidden="true">
          {meta.icon}
        </span>
        <span className="ftp-trigger-copy">
          <strong>{meta.label}</strong>
          <small>{meta.hint}</small>
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="ftp-popover" role="dialog" aria-label="Choose a field type">
          <header className="ftp-popover-head">
            <h4>What does this field hold?</h4>
            <p>Every other screen adapts to whatever you choose.</p>
          </header>
          <FieldTypeGrid
            value={value}
            disabledTypes={disabledTypes}
            onChoose={(type) => {
              onChoose(type)
              setOpen(false)
            }}
          />
        </div>
      )}
    </div>
  )
}
