import { useId } from "react"
import { fieldTypeLabel, searchOperatorsFor } from "./fieldTypes"

/**
 * The condition builder behind "Filter by custom field" (US-3.11).
 *
 * Scoped to one project at a time: a field id only means something within
 * the schema it belongs to, so this asks for a project (via `schema`) rather
 * than trying to offer every field across every project at once. When no
 * project is selected, it explains why instead of rendering an empty form.
 */
export function StructuredSearch({ schema, conditions, match, onChange }) {
  const listId = useId()

  if (!schema) {
    return (
      <p className="structured-search-hint">
        Pick a project above to filter by its own fields — a custom field only
        makes sense within the project that defines it.
      </p>
    )
  }

  const queryableFields = schema.filter((field) => searchOperatorsFor(field.type).length > 0)

  if (queryableFields.length === 0) {
    return (
      <p className="structured-search-hint">
        This project's schema has no fields that support structured filters
        yet.
      </p>
    )
  }

  const updateCondition = (index, patch) => {
    const next = conditions.map((condition, i) =>
      i === index ? { ...condition, ...patch } : condition
    )
    onChange(next, match)
  }

  const addCondition = () => {
    const first = queryableFields[0]
    const operator = searchOperatorsFor(first.type)[0].value
    onChange([...conditions, { field_id: first.id, operator, value: defaultValueFor(first, operator) }], match)
  }

  const removeCondition = (index) => {
    onChange(conditions.filter((_, i) => i !== index), match)
  }

  const changeField = (index, fieldId) => {
    const field = queryableFields.find((candidate) => candidate.id === fieldId)
    const operator = searchOperatorsFor(field.type)[0].value
    updateCondition(index, { field_id: fieldId, operator, value: defaultValueFor(field, operator), value2: undefined })
  }

  const changeOperator = (index, field, operator) => {
    updateCondition(index, { operator, value: defaultValueFor(field, operator), value2: undefined })
  }

  return (
    <fieldset className="structured-search" aria-labelledby={listId}>
      <legend id={listId}>Filter by custom field</legend>

      {conditions.map((condition, index) => {
        const field = queryableFields.find((candidate) => candidate.id === condition.field_id) || queryableFields[0]
        const operators = searchOperatorsFor(field.type)

        return (
          <div className="structured-search-row" key={index}>
            <label className="sr-only" htmlFor={`${listId}-field-${index}`}>
              Field
            </label>
            <select
              id={`${listId}-field-${index}`}
              value={field.id}
              onChange={(event) => changeField(index, event.target.value)}
            >
              {queryableFields.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} ({fieldTypeLabel(candidate.type)})
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor={`${listId}-operator-${index}`}>
              Comparison
            </label>
            <select
              id={`${listId}-operator-${index}`}
              value={condition.operator}
              onChange={(event) => changeOperator(index, field, event.target.value)}
            >
              {operators.map((operator) => (
                <option key={operator.value} value={operator.value}>
                  {operator.label}
                </option>
              ))}
            </select>

            <ConditionValue
              field={field}
              condition={condition}
              onChange={(patch) => updateCondition(index, patch)}
              inputId={`${listId}-value-${index}`}
            />

            <button
              type="button"
              className="structured-search-remove"
              aria-label={`Remove this filter on ${field.name}`}
              onClick={() => removeCondition(index)}
            >
              ×
            </button>
          </div>
        )
      })}

      <div className="structured-search-actions">
        <button type="button" className="btn-secondary" onClick={addCondition}>
          + Add filter
        </button>

        {conditions.length > 1 && (
          <label className="structured-search-match">
            Match
            <select value={match} onChange={(event) => onChange(conditions, event.target.value)}>
              <option value="all">all of these (AND)</option>
              <option value="any">any of these (OR)</option>
            </select>
          </label>
        )}
      </div>
    </fieldset>
  )
}

function defaultValueFor(field, operator) {
  if (operator === "in" || operator === "has_any" || operator === "has_all") return []
  if (operator === "complete") return true
  if (operator === "is_set" || operator === "is_empty") return null
  if (field.type === "number" || field.type === "computed") return 0
  if (field.type === "date") return ""
  if (field.type === "dropdown") return field.options?.[0] ?? ""
  return ""
}

/** The value input(s) for one condition, shaped by the field's type and the chosen operator. */
function ConditionValue({ field, condition, onChange, inputId }) {
  const { operator } = condition

  if (operator === "is_set" || operator === "is_empty") {
    // Nothing to type: the operator alone is the whole question.
    return null
  }

  if (operator === "between") {
    const inputType = field.type === "date" ? "date" : "number"
    return (
      <span className="structured-search-between">
        <label className="sr-only" htmlFor={inputId}>
          From
        </label>
        <input
          id={inputId}
          type={inputType}
          value={condition.value ?? ""}
          onChange={(event) => onChange({ value: parseForType(event.target.value, inputType) })}
        />
        <span aria-hidden="true">and</span>
        <label className="sr-only" htmlFor={`${inputId}-to`}>
          To
        </label>
        <input
          id={`${inputId}-to`}
          type={inputType}
          value={condition.value2 ?? ""}
          onChange={(event) => onChange({ value2: parseForType(event.target.value, inputType) })}
        />
      </span>
    )
  }

  if (operator === "complete") {
    return (
      <select
        id={inputId}
        value={condition.value ? "true" : "false"}
        onChange={(event) => onChange({ value: event.target.value === "true" })}
      >
        <option value="true">yes</option>
        <option value="false">no</option>
      </select>
    )
  }

  if (field.type === "dropdown" && operator === "equals") {
    return (
      <select id={inputId} value={condition.value ?? ""} onChange={(event) => onChange({ value: event.target.value })}>
        {(field.options || []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  }

  if (operator === "in" || operator === "has_any" || operator === "has_all") {
    const text = Array.isArray(condition.value) ? condition.value.join(", ") : ""
    return (
      <span className="structured-search-list-input">
        <label className="sr-only" htmlFor={inputId}>
          Comma-separated values
        </label>
        <input
          id={inputId}
          type="text"
          placeholder="e.g. Open, Blocked"
          value={text}
          onChange={(event) =>
            onChange({
              value: event.target.value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
        />
      </span>
    )
  }

  const inputType = field.type === "number" || field.type === "computed" ? "number" : field.type === "date" ? "date" : "text"
  return (
    <>
      <label className="sr-only" htmlFor={inputId}>
        Value
      </label>
      <input
        id={inputId}
        type={inputType}
        value={condition.value ?? ""}
        onChange={(event) => onChange({ value: parseForType(event.target.value, inputType) })}
      />
    </>
  )
}

function parseForType(raw, inputType) {
  if (inputType !== "number") return raw
  if (raw === "") return ""
  const parsed = Number(raw)
  return Number.isNaN(parsed) ? raw : parsed
}

export default StructuredSearch
