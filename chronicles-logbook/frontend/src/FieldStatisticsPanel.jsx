import { useEffect, useMemo, useState } from "react"

import { fetchFieldStatistics } from "./api"
import { humaniseValue } from "./fieldTypes"

import "./FieldStatisticsPanel.css"

const NUMERIC_TYPES = new Set(["number", "computed"])

const formatNumber = (value) => new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
}).format(value)

export default function FieldStatisticsPanel({ projectId, schemaVersion }) {
  const [statistics, setStatistics] = useState(null)
  const [fieldId, setFieldId] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
    setStatistics(null)

    fetchFieldStatistics(projectId)
      .then((data) => {
        if (!active) return
        setStatistics(data)
        setFieldId((current) => data.fields.some((field) => field.field_id === current)
          ? current
          : data.fields[0]?.field_id || "")
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load field statistics.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [projectId, schemaVersion, retry])

  const selected = useMemo(
    () => statistics?.fields.find((field) => field.field_id === fieldId) || null,
    [statistics, fieldId],
  )

  return (
    <section className="field-statistics" aria-label="Field statistics">
      <header className="panel-head">
        <h3>Field statistics</h3>
        <p>Totals and groupings use the schema each entry was recorded with.</p>
      </header>

      {error ? (
        <div className="workspace-error" role="alert">
          {error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button>
        </div>
      ) : loading ? (
        <p className="hint" role="status">Loading field statistics…</p>
      ) : !statistics?.fields.length ? (
        <div className="workspace-empty">
          <h3>No fields to analyse</h3>
          <p>Add fields in the Schema tab, then record entries to see patterns here.</p>
        </div>
      ) : (
        <>
          <label className="field-label stats-field-select">
            Field
            <select value={fieldId} onChange={(event) => setFieldId(event.target.value)}>
              {statistics.fields.map((field) => (
                <option key={field.field_id} value={field.field_id}>
                  {field.name} ({field.type})
                </option>
              ))}
            </select>
          </label>

          {selected && (NUMERIC_TYPES.has(selected.type) ? (
            <div className="stats-metrics" aria-label={`${selected.name} metrics`}>
              <Metric label="Recorded values" value={selected.count} />
              <Metric label="Total" value={selected.total == null ? "—" : formatNumber(selected.total)} />
              <Metric label="Average" value={selected.average == null ? "—" : formatNumber(selected.average)} />
              {selected.count === 0 && <p className="hint">No numeric values have been recorded for this field yet.</p>}
            </div>
          ) : (
            <div className="stats-groups">
              <p className="hint">{selected.count} recorded value{selected.count === 1 ? "" : "s"}</p>
              {selected.groups.length === 0 ? (
                <p className="hint">No values have been recorded for this field yet.</p>
              ) : (
                <ul>
                  {selected.groups.map((group, index) => (
                    <li key={`${JSON.stringify(group.value)}-${index}`}>
                      <span>{humaniseValue(group.value)}</span>
                      <strong>{group.count}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  )
}

function Metric({ label, value }) {
  return <div><span>{label}</span><strong>{value}</strong></div>
}
