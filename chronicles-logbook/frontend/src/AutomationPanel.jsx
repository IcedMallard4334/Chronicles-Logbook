/**
 * A project's "Automation" tab (US-3.12): the rules that run on new entries,
 * and the entries that repeat.
 *
 * Rules reshape what gets recorded in a project, so — like the schema — only
 * the owner changes them. Members still see them here, so an entry of theirs
 * that picked up a tag it wasn't given has an explanation one tab away.
 */

import { useCallback, useEffect, useId, useState } from "react"
import { createRule, deleteRule, fetchRecurrences, fetchRules, updateRule } from "./api"
import {
  availableActionTypes,
  defaultValueForField,
  describeRecurrence,
  describeRule,
  emptyRule,
  newAction,
  ruleForRequest,
  ruleProblem,
  settableFields,
  tagFields,
} from "./automationRules"
import { entryPreview } from "./EntryShared"
import { StructuredSearch } from "./StructuredSearch"
import "./AutomationPanel.css"

function formatError(error) {
  return error instanceof Error ? error.message : "Something went wrong."
}

function formatDay(value) {
  if (!value) return null
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

// ── One action in the rule editor ───────────────────────────────────────────

function ActionEditor({ action, schema, index, onChange, onRemove, canRemove }) {
  const id = useId()
  // Tags are typed as one comma-separated line; the raw text is kept while
  // typing so a trailing comma doesn't vanish mid-word.
  const [tagsText, setTagsText] = useState((action.tags || []).join(", "))
  const types = availableActionTypes(schema)

  const changeType = (type) => {
    setTagsText("")
    onChange(newAction(type, schema))
  }

  let detail = null
  if (action.type === "add_tags") {
    detail = (
      <>
        <label className="field-label">
          Tags field
          <select value={action.field_id} onChange={(event) => onChange({ ...action, field_id: event.target.value })}>
            {tagFields(schema).map((field) => (
              <option key={field.id} value={field.id}>{field.name}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Tags to add
          <input
            type="text"
            value={tagsText}
            placeholder="e.g. triage, backend"
            onChange={(event) => {
              setTagsText(event.target.value)
              const tags = event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean)
              onChange({ ...action, tags })
            }}
          />
        </label>
      </>
    )
  } else if (action.type === "set_field") {
    const fields = settableFields(schema)
    const field = fields.find((candidate) => candidate.id === action.field_id) || fields[0]
    detail = (
      <>
        <label className="field-label">
          Field
          <select
            value={field?.id ?? ""}
            onChange={(event) => {
              const next = fields.find((candidate) => candidate.id === event.target.value)
              onChange({ ...action, field_id: next.id, value: defaultValueForField(next) })
            }}
          >
            {fields.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Value
          {field?.type === "dropdown" ? (
            <select value={action.value ?? ""} onChange={(event) => onChange({ ...action, value: event.target.value })}>
              {(field.options || []).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          ) : (
            <input
              type={field?.type === "number" ? "number" : field?.type === "date" ? "date" : "text"}
              value={action.value ?? ""}
              onChange={(event) => onChange({ ...action, value: event.target.value })}
            />
          )}
        </label>
        <label className="automation-check">
          <input
            type="checkbox"
            checked={Boolean(action.overwrite)}
            onChange={(event) => onChange({ ...action, overwrite: event.target.checked })}
          />
          Replace a value the author entered (otherwise only fills a blank field)
        </label>
      </>
    )
  } else {
    detail = (
      <label className="field-label">
        Due in (days, optional)
        <input
          type="number"
          min="0"
          max="365"
          value={action.due_in_days ?? ""}
          placeholder="No due date"
          onChange={(event) =>
            onChange({ ...action, due_in_days: event.target.value === "" ? null : Number(event.target.value) })
          }
        />
      </label>
    )
  }

  return (
    <div className="automation-action" role="group" aria-label={`Action ${index + 1}`}>
      <label className="field-label">
        <span>Then</span>
        <select id={`${id}-type`} value={action.type} onChange={(event) => changeType(event.target.value)}>
          {types.map((type) => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
      </label>
      {detail}
      {canRemove && (
        <button type="button" className="btn-text-danger" onClick={onRemove} aria-label={`Remove action ${index + 1}`}>
          Remove
        </button>
      )}
    </div>
  )
}

// ── Creating or editing a rule ──────────────────────────────────────────────

export function RuleEditor({ schema, initial, onSave, onCancel }) {
  const [rule, setRule] = useState(() => initial ?? emptyRule(schema))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const setActions = (actions) => setRule((current) => ({ ...current, actions }))

  const submit = async (event) => {
    event.preventDefault()
    const problem = ruleProblem(rule, schema)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(ruleForRequest(rule, schema))
    } catch (caught) {
      setError(formatError(caught))
      setSaving(false)
    }
  }

  return (
    <form className="automation-editor" onSubmit={submit} aria-label={initial ? "Edit rule" : "New rule"}>
      <label className="field-label">
        Rule name
        <input
          type="text"
          maxLength={100}
          value={rule.name}
          placeholder="e.g. Triage new bugs"
          onChange={(event) => setRule({ ...rule, name: event.target.value })}
        />
      </label>

      <StructuredSearch
        schema={schema}
        conditions={rule.conditions}
        match={rule.match}
        onChange={(conditions, match) => setRule({ ...rule, conditions, match })}
        legend="When a new entry matches (leave empty to apply to every entry)"
        addLabel="+ Add condition"
      />

      <fieldset className="automation-actions">
        <legend>Do this</legend>
        {rule.actions.map((action, index) => (
          <ActionEditor
            // Keyed on type as well, so switching type resets the editor's local text.
            key={`${index}-${action.type}`}
            index={index}
            action={action}
            schema={schema}
            canRemove={rule.actions.length > 1}
            onChange={(next) => setActions(rule.actions.map((item, i) => (i === index ? next : item)))}
            onRemove={() => setActions(rule.actions.filter((_, i) => i !== index))}
          />
        ))}
        {rule.actions.length < 5 && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setActions([...rule.actions, newAction(availableActionTypes(schema)[0].value, schema)])}
          >
            + Add action
          </button>
        )}
      </fieldset>

      <label className="automation-check">
        <input
          type="checkbox"
          checked={rule.enabled}
          onChange={(event) => setRule({ ...rule, enabled: event.target.checked })}
        />
        Rule is on
      </label>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save rule"}
        </button>
      </div>
    </form>
  )
}

// ── The tab ─────────────────────────────────────────────────────────────────

export default function AutomationPanel({ project }) {
  const schema = project.entry_schema || []
  const canManage = !project.shared && !project.archived
  const [rules, setRules] = useState(null)
  const [recurrences, setRecurrences] = useState(null)
  const [error, setError] = useState(null)
  // null: not editing; "new": the new-rule form; otherwise the rule being edited.
  const [editing, setEditing] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [loadedRules, loadedRecurrences] = await Promise.all([
        fetchRules(project.id),
        fetchRecurrences(project.id),
      ])
      setRules(loadedRules)
      setRecurrences(loadedRecurrences)
    } catch (caught) {
      setError(formatError(caught))
      setRules((current) => current ?? [])
      setRecurrences((current) => current ?? [])
    }
  }, [project.id])

  useEffect(() => {
    load()
  }, [load])

  const saveRule = async (payload) => {
    if (editing === "new") {
      const created = await createRule(project.id, payload)
      setRules((current) => [...current, created])
    } else {
      const saved = await updateRule(project.id, editing.id, payload)
      setRules((current) => current.map((rule) => (rule.id === saved.id ? saved : rule)))
    }
    setEditing(null)
  }

  const toggleRule = async (rule) => {
    setBusyId(rule.id)
    setError(null)
    try {
      const { name, match, conditions, actions } = rule
      const saved = await updateRule(project.id, rule.id, { name, match, conditions, actions, enabled: !rule.enabled })
      setRules((current) => current.map((item) => (item.id === saved.id ? saved : item)))
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setBusyId(null)
    }
  }

  const removeRule = async (rule) => {
    setBusyId(rule.id)
    setError(null)
    try {
      await deleteRule(project.id, rule.id)
      setRules((current) => current.filter((item) => item.id !== rule.id))
      setConfirmDeleteId(null)
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setBusyId(null)
    }
  }

  const entryById = Object.fromEntries((project.entries || []).map((entry) => [entry.id, entry]))

  return (
    <section className="automation-panel">
      <div className="panel-head">
        <h3>Rules</h3>
        {canManage && editing === null && schema.length > 0 && (
          <button type="button" className="btn-primary" onClick={() => setEditing("new")}>
            + New rule
          </button>
        )}
      </div>
      <p className="hint">
        Rules run by themselves each time a new entry is saved: they can add tags, fill in a field
        left blank, or mark the entry as something to do. They don&rsquo;t change entries that already exist.
      </p>
      {project.shared && (
        <p className="hint">Only the project&rsquo;s owner can change its rules.</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {editing !== null && (
        <RuleEditor
          schema={schema}
          initial={editing === "new" ? null : editing}
          onSave={saveRule}
          onCancel={() => setEditing(null)}
        />
      )}

      {rules === null ? (
        <p className="hint" role="status">Loading rules…</p>
      ) : schema.length === 0 ? (
        <div className="hint-card"><p>Add some fields in the Schema tab first — rules act on them.</p></div>
      ) : rules.length === 0 ? (
        <div className="hint-card"><p>No rules yet.</p></div>
      ) : (
        <ul className="automation-list" role="list">
          {rules.map((rule) => (
            <li key={rule.id} className={`automation-item ${rule.enabled ? "" : "is-off"}`}>
              <div className="automation-copy">
                <strong>{rule.name}</strong>
                <span className={`status-badge ${rule.enabled ? "is-on" : "is-off"}`}>{rule.enabled ? "On" : "Off"}</span>
                <p>{describeRule(rule, schema)}</p>
              </div>
              {canManage && (
                <div className="automation-item-actions">
                  {confirmDeleteId === rule.id ? (
                    <>
                      <span>Delete this rule?</span>
                      <button type="button" className="btn-text" onClick={() => setConfirmDeleteId(null)}>Keep</button>
                      <button type="button" className="btn-danger" disabled={busyId === rule.id} onClick={() => removeRule(rule)}>
                        Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn-text" disabled={busyId === rule.id} onClick={() => toggleRule(rule)}>
                        {rule.enabled ? "Turn off" : "Turn on"}
                      </button>
                      <button type="button" className="btn-text" onClick={() => setEditing(rule)}>Edit</button>
                      <button type="button" className="btn-text-danger" onClick={() => setConfirmDeleteId(rule.id)}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="panel-head automation-subhead">
        <h3>Repeating entries</h3>
      </div>
      <p className="hint">
        To make an entry repeat, open it and choose <strong>Repeat</strong>. New copies appear on their
        day, the next time the app is opened.
      </p>
      {recurrences === null ? (
        <p className="hint" role="status">Loading…</p>
      ) : recurrences.length === 0 ? (
        <div className="hint-card"><p>No entries repeat yet.</p></div>
      ) : (
        <ul className="automation-list" role="list">
          {recurrences.map((recurrence) => (
            <li key={recurrence.id} className={`automation-item ${recurrence.active ? "" : "is-off"}`}>
              <div className="automation-copy">
                <strong>{entryPreview(entryById[recurrence.entry_id])}</strong>
                <p>
                  {describeRecurrence(recurrence)}
                  {recurrence.ends_on ? ` until ${formatDay(recurrence.ends_on)}` : ""}
                  {" · "}
                  {recurrence.active && recurrence.next_on ? `next on ${formatDay(recurrence.next_on)}` : "finished"}
                  {" · "}
                  {recurrence.occurrences_created} {recurrence.occurrences_created === 1 ? "copy" : "copies"} so far
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
