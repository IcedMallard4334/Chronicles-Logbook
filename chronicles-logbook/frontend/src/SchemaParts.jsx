import { BUILT_IN_FIELDS } from "./formFields"
import {
  FIELD_TYPES,
  describeExpression,
  expressionError,
  fieldTypeLabel,
  isNumericField,
  previewExpressionValue,
  referencedFieldIds,
} from "./fieldTypes"
import { TrashButton } from "./TrashIcon"

// The pieces a project's schema is edited with. They live here, apart from the page that uses them,
// so the new-project panel, the Schema tab and the walkthrough videos all draw the same thing.

/** The fields every entry has, greyed out: shown so it is clear they are there, but not editable. */
export function BuiltInFieldCards({ editing = false }) {
  return (
    <div className="field-list built-in-fields" role="group" aria-label="Built-in fields">
      {BUILT_IN_FIELDS.map((field) => (
        <div key={field.key} className="field-card is-locked">
          {editing ? (
            <div className="field-row">
              <div className="field-label">
                <span>Name</span>
                <input type="text" value={field.name} disabled readOnly aria-label={`${field.name} (built-in field name)`} />
              </div>
              <div className="field-label">
                <span>Type</span>
                <select value={field.type} disabled aria-label={`${field.name} (built-in field type)`}>
                  <option value={field.type}>{field.typeLabel}</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="field-summary">
              <span className="field-summary-name">{field.name}</span>
              <span className="field-summary-type">{field.typeLabel}</span>
            </div>
          )}
          <p className="field-lock-note">
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
              <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
              <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            Built in. {field.note}
          </p>
        </div>
      ))}
    </div>
  )
}

/** One field while the schema is being edited. */
export function SchemaFieldEditor({ field, index, schema, latestData, linkable, onChange, onRemove }) {
  // A calculation can only read figures, and only from fields other than
  // itself, so those are the only ones offered as sources.
  const sources = schema.filter((other) => isNumericField(other) && other.id !== field.id)
  const problem =
    field.type === "computed" ? expressionError(field.expression, field, schema) : null

  // A formula is easier to trust once it has produced a number. The project's
  // latest entry answers it when it can, so what gets checked is a figure the
  // owner recognises rather than an abstract example.
  const preview =
    field.type === "computed" && !problem
      ? previewExpressionValue(field.expression, latestData, schema)
      : null

  return (
    <div className="field-card">
      <div className="field-row">
        <label className="field-label">
          Name
          <input
            type="text"
            value={field.name}
            onChange={(event) => onChange(index, { name: event.target.value })}
            placeholder="Field name"
          />
        </label>
        <label className="field-label">
          Type
          <select
            value={field.type}
            onChange={(event) =>
              onChange(index, {
                type: event.target.value,
                options: event.target.value === "dropdown" ? field.options || [""] : field.options,
                expression:
                  event.target.value === "computed" ? field.expression || "" : field.expression,
              })
            }
          >
            {FIELD_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="field-type-hint">
        {FIELD_TYPES.find((type) => type.value === field.type)?.hint}
      </p>
      {field.type !== "computed" && field.type !== "project_reference" && (
        <label className="field-required-toggle">
          <input
            type="checkbox"
            checked={field.required !== false}
            onChange={(event) => onChange(index, { required: event.target.checked })}
          />
          <span>Required</span>
          <small>A finished entry must fill this in. Planned work never has to.</small>
        </label>
      )}
      {field.type === "dropdown" && (
        <label className="field-label full">
          Options (comma-separated)
          <input
            type="text"
            value={(field.options || []).join(", ")}
            onChange={(event) =>
              onChange(index, {
                options: event.target.value
                  .split(",")
                  .map((option) => option.trim())
                  .filter(Boolean),
              })
            }
            placeholder="Option 1, Option 2, Option 3"
          />
        </label>
      )}
      {field.type === "computed" && (
        <>
          <label className="field-label full">
            Calculation
            <input
              type="text"
              value={field.expression || ""}
              onChange={(event) => onChange(index, { expression: event.target.value })}
              placeholder="e.g. {Hours} * 60 — or click a field below"
            />
          </label>
          {sources.length > 0 ? (
            <div className="expression-sources">
              <span className="hint">Add a field:</span>
              {sources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  className="btn-chip"
                  onClick={() =>
                    onChange(index, {
                      expression: `${field.expression || ""}${
                        field.expression ? " " : ""
                      }{${source.name}}`,
                    })
                  }
                >
                  {source.name || "Unnamed field"}
                </button>
              ))}
            </div>
          ) : (
            <p className="hint">
              Add a number field first — a calculation needs figures to work from.
            </p>
          )}
          {field.expression && !problem && (
            <p className="field-summary-detail">
              = {describeExpression(field.expression, schema)}
            </p>
          )}
          {preview && (
            <p className="expression-preview">
              Preview: {preview.value}
              {preview.fromEntry
                ? " — from your latest entry"
                : referencedFieldIds(field.expression).length > 0
                  ? " — with every field as 2"
                  : ""}
            </p>
          )}
          {problem && <p className="error">{problem}</p>}
        </>
      )}
      {field.type === "project_reference" &&
        (linkable.length > 0 ? (
          <label className="field-label full">
            Links to
            <select
              value={field.linked_project_id || ""}
              onChange={(event) =>
                onChange(index, { linked_project_id: event.target.value || null })
              }
            >
              <option value="">Choose a project…</option>
              {linkable.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="hint">
            A link needs somewhere to point — create another project first.
          </p>
        ))}
      <TrashButton label="Remove field" onClick={() => onRemove(index)} />
    </div>
  )
}

export function SchemaFieldSummary({ field, schema, projects }) {
  const target = projects.find((project) => project.id === field.linked_project_id)

  return (
    <div className="field-card is-readonly">
      <div className="field-summary">
        <span className="field-summary-name">{field.name}</span>
        <span className="field-summary-type">{fieldTypeLabel(field.type)}</span>
        {field.required === false && field.type !== "computed" && field.type !== "project_reference" && (
          <span className="field-summary-flag">Optional</span>
        )}
      </div>
      {field.type === "dropdown" && (
        <p className="field-summary-detail">{(field.options || []).join(" · ")}</p>
      )}
      {field.type === "computed" && (
        <p className="field-summary-detail">
          = {describeExpression(field.expression, schema)}
        </p>
      )}
      {field.type === "project_reference" && (
        // Three different states, which all used to read as the middle one:
        // a link that was never pointed anywhere is not the same as one whose
        // target has since been deleted, and saying so sends the owner to the
        // wrong place to fix it.
        <p className="field-summary-detail">
          {!field.linked_project_id
            ? "Not pointed at a project yet — choose one in Edit schema."
            : target
              ? `Links to ${target.name}`
              : "Links to a project you no longer have"}
        </p>
      )}
    </div>
  )
}
