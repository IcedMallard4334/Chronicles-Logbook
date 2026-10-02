/**
 * A project's "Automation" tab (US-3.12): the rules that run on new entries,
 * and the entries that repeat.
 *
 * Rules reshape what gets recorded in a project, so — like the schema — only
 * the owner changes them. Members still see them here, so an entry of theirs
 * that picked up a tag it wasn't given has an explanation one tab away.
 */

import { useCallback, useEffect, useId, useState } from "react"
import { createRule, deleteRule, fetchRecurrences, fetchRules, localDateString, setRecurrence, stopRecurrence, updateRule } from "./api"
import {
  FREQUENCIES,
  TRIGGERS,
  availableActionTypes,
  defaultValueForField,
  describeRecurrence,
  describeRule,
  emptyRule,
  newAction,
  ruleForRequest,
  ruleProblem,
  ruleRecipes,
  settableFields,
  tagFields,
} from "./automationRules"
import { entryName } from "./entryNames"
import { projectStatuses } from "./statuses"
import { StructuredSearch } from "./StructuredSearch"
import "./AutomationPanel.css"
import { TrashButton } from "./TrashIcon"
import { EditButton } from "./EditIcon"

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

function ActionEditor({ action, schema, statuses, trigger, index, onChange, onRemove, canRemove }) {
  const id = useId()
  // Tags are typed as one comma-separated line; the raw text is kept while
  // typing so a trailing comma doesn't vanish mid-word.
  const [tagsText, setTagsText] = useState((action.tags || []).join(", "))
  const types = availableActionTypes(schema, trigger)

  const changeType = (type) => {
    setTagsText("")
    onChange(newAction(type, schema, statuses))
  }

  let detail = null
  if (action.type === "set_status") {
    detail = (
      <label className="field-label">
        Status
        <select value={action.status ?? ""} onChange={(event) => onChange({ ...action, status: event.target.value })}>
          {statuses.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
    )
  } else if (action.type === "create_task") {
    detail = (
      <>
        <label className="field-label">
          Task
          <input
            type="text"
            maxLength={200}
            value={action.title ?? ""}
            placeholder="e.g. Write up: {title}"
            onChange={(event) => onChange({ ...action, title: event.target.value })}
          />
        </label>
        <label className="field-label">
          Due in (days, optional)
          <input
            type="number"
            min="0"
            max="365"
            value={action.due_in_days ?? ""}
            placeholder="No due date"
            onChange={(event) => onChange({ ...action, due_in_days: event.target.value === "" ? null : Number(event.target.value) })}
          />
        </label>
        <p className="hint automation-wide">{"{title}"} becomes the entry&rsquo;s title.</p>
      </>
    )
  } else if (action.type === "repeat") {
    detail = (
      <>
        <label className="field-label">
          Every
          <input type="number" min="1" max="365" value={action.interval ?? 1} onChange={(event) => onChange({ ...action, interval: event.target.value })} />
        </label>
        <label className="field-label">
          Period
          <select value={action.frequency} onChange={(event) => onChange({ ...action, frequency: event.target.value })}>
            {FREQUENCIES.map((item) => (
              <option key={item.value} value={item.value}>{Number(action.interval) === 1 ? item.label : item.plural}</option>
            ))}
          </select>
        </label>
      </>
    )
  } else if (action.type === "add_tags") {
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
  } else if (action.type === "mark_todo") {
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
        <TrashButton label={`Remove action ${index + 1}`} onClick={onRemove} />
      )}
    </div>
  )
}

// ── Creating or editing a rule ──────────────────────────────────────────────

export function RuleEditor({ schema, statuses = [], initial, onSave, onCancel }) {
  const [rule, setRule] = useState(() => initial ?? emptyRule(schema, statuses))
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
    <form className="automation-editor" onSubmit={submit} aria-label={initial?.id ? "Edit rule" : "New rule"}>
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

      <div className="automation-trigger">
        <label className="field-label">
          Run when
          <select
            value={rule.trigger ?? "created"}
            onChange={(event) => {
              const trigger = event.target.value
              // A status rule only follows up, so anything else is dropped.
              const kept = rule.actions.filter((action) => availableActionTypes(schema, trigger).some((type) => type.value === action.type))
              setRule({
                ...rule,
                trigger,
                trigger_status: trigger === "status" ? rule.trigger_status || statuses[0] || "" : null,
                actions: kept.length ? kept : [newAction(trigger === "status" ? "create_task" : "mark_todo", schema, statuses)],
              })
            }}
          >
            {TRIGGERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        {rule.trigger === "status" && (
          <label className="field-label">
            Status
            <select value={rule.trigger_status ?? ""} onChange={(event) => setRule({ ...rule, trigger_status: event.target.value })}>
              {statuses.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
      </div>

      <StructuredSearch
        schema={schema}
        conditions={rule.conditions}
        match={rule.match}
        onChange={(conditions, match) => setRule({ ...rule, conditions, match })}
        legend={rule.trigger === "status" ? "Only if the entry matches (leave empty for every entry)" : "When a new entry matches (leave empty to apply to every entry)"}
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
            statuses={statuses}
            trigger={rule.trigger ?? "created"}
            canRemove={rule.actions.length > 1}
            onChange={(next) => setActions(rule.actions.map((item, i) => (i === index ? next : item)))}
            onRemove={() => setActions(rule.actions.filter((_, i) => i !== index))}
          />
        ))}
        {rule.actions.length < 5 && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setActions([...rule.actions, newAction(availableActionTypes(schema, rule.trigger ?? "created")[0].value, schema, statuses)])}
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

// ── Adding a repeat from here: pick an entry, then say how often ────────────

function AddRepeat({ project, repeatingIds, onSaved, onCancel }) {
  const [query, setQuery] = useState("")
  const [picked, setPicked] = useState(null)
  const [form, setForm] = useState({ frequency: "weekly", interval: 1, starts_on: localDateString(), ends_on: "" })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const candidates = (project.entries || [])
    .filter((entry) => !repeatingIds.has(entry.id))
    .filter((entry) => entryName(entry).toLowerCase().includes(query.trim().toLowerCase()))
  const unit = FREQUENCIES.find((item) => item.value === form.frequency)

  const choose = (entry) => {
    setPicked(entry)
    setForm((current) => ({ ...current, starts_on: entry.due_date || localDateString() }))
  }

  const save = async (event) => {
    event.preventDefault()
    if (form.ends_on && form.ends_on < form.starts_on) {
      setError("The end date can't be before the start date.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await setRecurrence(project.id, picked.id, {
        frequency: form.frequency,
        interval: Number(form.interval) || 1,
        starts_on: form.starts_on,
        ends_on: form.ends_on || null,
      })
      await onSaved()
    } catch (caught) {
      setError(formatError(caught))
      setSaving(false)
    }
  }

  return (
    <div className="automation-editor automation-add-repeat" role="group" aria-label="Add a repeat">
      {!picked ? (
        <>
          <label className="field-label">
            Which entry should repeat?
            <input type="search" value={query} placeholder="Search this project's entries…" onChange={(event) => setQuery(event.target.value)} />
          </label>
          {candidates.length === 0 ? (
            <p className="hint">
              {(project.entries || []).length === 0 ? "This project has no entries yet." : "Nothing matches, or every entry already repeats."}
            </p>
          ) : (
            <ul className="automation-pick-list" role="list">
              {candidates.slice(0, 50).map((entry) => (
                <li key={entry.id}>
                  <button type="button" onClick={() => choose(entry)}>
                    <strong>{entryName(entry)}</strong>
                    <span>{new Date(entry.created_at).toLocaleDateString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          </div>
        </>
      ) : (
        <form onSubmit={save} aria-label="Repeat this entry" className="entry-recurrence-form">
          <p className="automation-picked"><span>Repeating</span> <strong>{entryName(picked)}</strong></p>
          <label className="field-label">
            Every
            <input type="number" min="1" max="365" value={form.interval} onChange={(event) => setForm({ ...form, interval: event.target.value })} />
          </label>
          <label className="field-label">
            Period
            <select value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })}>
              {FREQUENCIES.map((item) => (
                <option key={item.value} value={item.value}>{Number(form.interval) === 1 ? item.label : item.plural}</option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Starting from
            <input type="date" required value={form.starts_on} onChange={(event) => setForm({ ...form, starts_on: event.target.value })} />
          </label>
          <label className="field-label">
            Until (optional)
            <input type="date" min={form.starts_on} value={form.ends_on} onChange={(event) => setForm({ ...form, ends_on: event.target.value })} />
          </label>
          <p className="hint">
            The first copy is made one {unit?.label ?? "period"} after the start date, then every{" "}
            {Number(form.interval) === 1 ? unit?.label : `${form.interval} ${unit?.plural}`} after that.
          </p>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button type="button" className="btn-secondary" onClick={() => { setPicked(null); setError(null) }} disabled={saving}>Back</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Add repeat"}</button>
          </div>
        </form>
      )}
    </div>
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
  const [addingRepeat, setAddingRepeat] = useState(false)
  const statusNames = projectStatuses(project).map((status) => status.name)
  const recipes = canManage && schema.length > 0 ? ruleRecipes(project) : []

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
    if (editing === "new" || editing.draft) {
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
      const { name, match, conditions, actions, trigger, trigger_status } = rule
      const saved = await updateRule(project.id, rule.id, { name, match, conditions, actions, trigger, trigger_status, enabled: !rule.enabled })
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
  const repeatingIds = new Set((recurrences || []).map((recurrence) => recurrence.entry_id))

  const stopRepeat = async (recurrence) => {
    setBusyId(recurrence.id)
    setError(null)
    try {
      await stopRecurrence(project.id, recurrence.entry_id)
      await load()
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="automation-panel">
      <div className="panel-head">
        <h3>Automations</h3>
        {canManage && editing === null && schema.length > 0 && (
          <button type="button" className="btn-primary" onClick={() => setEditing("new")}>
            + New automation
          </button>
        )}
      </div>
      <p className="hint">
        Let the logbook do the routine work. An automation waits for a moment, a new entry or an entry
        reaching a status, and then moves the entry to a status, adds a follow-up task, makes it repeat,
        or fills in what you would have typed. It never changes entries that already exist.
      </p>
      {project.shared && (
        <p className="hint">Only the project&rsquo;s owner can change its automations.</p>
      )}
      {recipes.length > 0 && editing === null && (
        <div className="automation-recipes" role="group" aria-label="Ready-made automations">
          <h4>Start from an idea</h4>
          <ul role="list">
            {recipes.map((recipe) => (
              <li key={recipe.id}>
                <button type="button" onClick={() => setEditing({ draft: recipe.rule })}>
                  <strong>{recipe.title}</strong>
                  <span>{recipe.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {editing !== null && (
        <RuleEditor
          // A fresh editor each time, so a recipe's values replace the last form's.
          key={editing === "new" ? "new" : editing.draft ? editing.draft.name : editing.id}
          schema={schema}
          statuses={statusNames}
          initial={editing === "new" ? null : editing.draft ?? editing}
          onSave={saveRule}
          onCancel={() => setEditing(null)}
        />
      )}

      {rules === null ? (
        <p className="hint" role="status">Loading rules…</p>
      ) : schema.length === 0 ? (
        <div className="hint-card"><p>Add some fields in the Schema tab first — rules act on them.</p></div>
      ) : rules.length === 0 ? (
        <div className="hint-card"><p>No automations yet. Pick an idea above, or start your own.</p></div>
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
                      <TrashButton label="Delete" text="Delete" className="btn-trash-solid" disabled={busyId === rule.id} onClick={() => removeRule(rule)} />
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn-text" disabled={busyId === rule.id} onClick={() => toggleRule(rule)}>
                        {rule.enabled ? "Turn off" : "Turn on"}
                      </button>
                      <EditButton onClick={() => setEditing(rule)} />
                      <TrashButton label="Delete" onClick={() => setConfirmDeleteId(rule.id)} />
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
        {canManage && !addingRepeat && (
          <button type="button" className="btn-primary" onClick={() => setAddingRepeat(true)}>
            + Add repeat
          </button>
        )}
      </div>
      <p className="hint">
        Choose an entry and how often it should come back. New copies appear on their day, the next
        time the app is opened. You can also repeat an entry from its own page.
      </p>
      {addingRepeat && (
        <AddRepeat
          project={project}
          repeatingIds={repeatingIds}
          onCancel={() => setAddingRepeat(false)}
          onSaved={async () => { setAddingRepeat(false); await load() }}
        />
      )}
      {recurrences === null ? (
        <p className="hint" role="status">Loading…</p>
      ) : recurrences.length === 0 ? (
        <div className="hint-card"><p>No entries repeat yet.</p></div>
      ) : (
        <ul className="automation-list" role="list">
          {recurrences.map((recurrence) => (
            <li key={recurrence.id} className={`automation-item ${recurrence.active ? "" : "is-off"}`}>
              <div className="automation-copy">
                <strong>{entryName(entryById[recurrence.entry_id])}</strong>
                <p>
                  {describeRecurrence(recurrence)}
                  {recurrence.ends_on ? ` until ${formatDay(recurrence.ends_on)}` : ""}
                  {" · "}
                  {recurrence.active && recurrence.next_on ? `next on ${formatDay(recurrence.next_on)}` : "finished"}
                  {" · "}
                  {recurrence.occurrences_created} {recurrence.occurrences_created === 1 ? "copy" : "copies"} so far
                </p>
              </div>
              {canManage && recurrence.active && (
                <div className="automation-item-actions">
                  <button type="button" className="btn-text-danger" disabled={busyId === recurrence.id} onClick={() => stopRepeat(recurrence)}>
                    Stop repeating
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
