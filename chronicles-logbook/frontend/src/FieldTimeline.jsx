import { useEffect, useMemo, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { fetchFieldTimeline } from "./api"
import { fieldTypeLabel, isNumericField } from "./fieldTypes"

function formatError(error) {
  return error instanceof Error ? error.message : "Something went wrong."
}

/**
 * One field's recorded values over time: pick a project, a field and an
 * optional date range, and it draws the series plus a table of every point.
 *
 * Originally a private part of App.jsx; shared with the Statistics page
 * (US-3.7), which reuses it as its "A field over time" panel. There it is
 * rendered `embedded`, so the header below is omitted and the panel's own
 * heading stands in for it.
 *
 * The `timeline-*` styles live in App.css, which the app loads globally.
 */
export default function FieldTimeline({ projects, embedded = false }) {
  const [projectId, setProjectId] = useState("")
  const [fieldId, setFieldId] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [timeline, setTimeline] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) || null,
    [projects, projectId],
  )

  // Removed fields remain chartable history. Their definitions are retained
  // by the project precisely so older entry values still have a meaning.
  const fields = useMemo(() => {
    const seen = new Set()
    return [...(selectedProject?.entry_schema || []), ...(selectedProject?.retired_schema || [])]
      .filter((field) => {
        if (seen.has(field.id)) return false
        seen.add(field.id)
        return true
      })
  }, [selectedProject])

  const rangeError = start && end && start > end
    ? "Start date must be on or before end date."
    : null

  useEffect(() => {
    setFieldId("")
    setTimeline(null)
    setError(null)
  }, [projectId])

  const handleLoadTimeline = async (event) => {
    event.preventDefault()

    if (!projectId || !fieldId) {
      setError("Please select a project and field.")
      return
    }

    if (rangeError) {
      setError(rangeError)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const data = await fetchFieldTimeline(
        projectId,
        fieldId,
        start ? `${start}T00:00:00` : null,
        end ? `${end}T23:59:59` : null,
      )
      setTimeline(data)
    } catch (err) {
      setTimeline(null)
      setError(formatError(err))
    } finally {
      setLoading(false)
    }
  }

  const selectedField = fields.find((field) => field.id === fieldId)

  return (
    <section className="timeline" aria-label="Field timeline">
      {!embedded && (
        <header className="timeline-header">
          <h2>Field Timeline</h2>
          <p>Choose a field and date range to visualise how its values change over time.</p>
        </header>
      )}

      <form className="timeline-filters" onSubmit={handleLoadTimeline}>
        <label className="field-label">
          Project
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            aria-label="Select project"
          >
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label">
          Field
          <select
            value={fieldId}
            onChange={(event) => setFieldId(event.target.value)}
            disabled={!projectId}
            aria-label="Select field"
          >
            <option value="">Select a field</option>
            {fields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label">
          Start date
          <input
            type="date"
            value={start}
            max={end || undefined}
            onChange={(event) => setStart(event.target.value)}
            aria-label="Start date"
          />
        </label>

        <label className="field-label">
          End date
          <input
            type="date"
            value={end}
            min={start || undefined}
            onChange={(event) => setEnd(event.target.value)}
            aria-label="End date"
          />
        </label>

        <button
          type="submit"
          className="btn-primary timeline-submit"
          disabled={loading || !projectId || !fieldId || Boolean(rangeError)}
        >
          {loading ? "Loading…" : "Generate timeline"}
        </button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && !timeline && (
        <p className="hint">
          Select a project, field, and optional date range, then generate the timeline.
        </p>
      )}

      {timeline && (
        <div className="timeline-results">
          <div className="timeline-summary">
            <h3>{timeline.field_name}</h3>
            <p>
              {timeline.points.length} data point
              {timeline.points.length === 1 ? "" : "s"}
              {selectedField?.type && (
                <span className="timeline-field-type"> • {selectedField.type}</span>
              )}
            </p>
          </div>

          {timeline.points.length === 0 ? (
            <p className="hint">No values found for this field in the selected range.</p>
          ) : (
            <>
              {isNumericField({ type: timeline.field_type }) ? (
                <div className="timeline-chart" aria-label={`${timeline.field_name} over time`}>
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart
                      data={timeline.points.map((point) => ({
                        ...point,
                        date: new Date(point.created_at).toLocaleDateString(),
                        numericValue: Number(point.value),
                      }))}
                      margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                    >
                      {/* Recharts' own defaults are hardcoded greys/blues that
                          don't follow the app's theme or chosen accent — every
                          colour here is read from the same custom properties
                          the rest of the page uses, so the chart matches
                          whichever theme and accent are active, light or dark. */}
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                      <XAxis dataKey="date" stroke="var(--line)" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                      <YAxis stroke="var(--line)" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--surface)",
                          border: "1px solid var(--line)",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--text)",
                        }}
                        labelStyle={{ color: "var(--muted)" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="numericValue"
                        name={timeline.field_name}
                        stroke="var(--blue)"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "var(--blue)" }}
                        activeDot={{ r: 6, fill: "var(--blue)" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                // A line chart needs a number to plot on its Y-axis — a
                // text/date/choice/etc. value has nowhere honest to go on
                // one, which is what used to render as an empty, confusing
                // box. The table below already shows every value in order,
                // so that's the real answer for a field like this.
                <p className="hint timeline-not-chartable">
                  {fieldTypeLabel(timeline.field_type)} fields aren&rsquo;t shown as a
                  line chart — there&rsquo;s no number to plot. Every value is listed
                  in order below instead.
                </p>
              )}

              <div className="timeline-table-wrapper">
                <table className="timeline-table">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Value</th>
                      <th scope="col">Schema version</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeline.points.map((point) => (
                      <tr key={point.entry_id}>
                        <td>{new Date(point.created_at).toLocaleString()}</td>
                        <td>{String(point.value)}</td>
                        <td>{point.schema_version}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}
