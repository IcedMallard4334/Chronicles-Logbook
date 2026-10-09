import { useEffect, useState } from "react"

import { fetchProjectActivity, fetchProjectTeam } from "./api"
import Drawer from "./Drawer"
import { formatDuration } from "./formatDuration"
import "./ProjectTeam.css"

/**
 * Who is working on a project, and what each of them has done in it.
 *
 * Every figure comes from the server, which counts it from the work that is stored (entries, their
 * versions, tasks and the schema-change record), so it never disagrees with the project itself.
 * It is a drawer, like the other places a project opens something, so the page stays in use.
 */

const STATS = [
  ["entries_logged", "Entries logged"],
  ["entries_completed", "Entries completed"],
  ["entries_edited", "Entries edited"],
  ["tasks_created", "Tasks added"],
  ["tasks_completed", "Tasks completed"],
  ["schema_changes", "Schema changes"],
]

const ROLE_LABELS = {
  owner: "Owner",
  member: "Member",
  former: "No longer on the project",
  unknown: "Author not recorded",
}

function roleLabel(person) {
  if (person.role === "member" && person.status === "pending") return "Invited"
  if (person.role === "member" && person.status === "declined") return "Declined"
  return ROLE_LABELS[person.role] || person.role
}

/** "just now", "3 hours ago", "5 days ago", or the date once it is a while back. */
export function lastActiveText(value, now = new Date()) {
  if (!value) return "No activity yet"
  const then = new Date(value)
  const minutes = Math.round((now - then) / 60000)
  if (minutes < 1) return "Active just now"
  if (minutes < 60) return `Active ${minutes} minute${minutes === 1 ? "" : "s"} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `Active ${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `Active ${days} day${days === 1 ? "" : "s"} ago`
  return `Last active ${then.toLocaleDateString()}`
}

/** One line of the activity feed, in words: "Sam finished "Plan the lab"". */
export function activityText(item) {
  const who = item.actor_name
  const what = item.subject
  const quoted = what ? `\u201c${what}\u201d` : "an entry"
  switch (item.kind) {
    case "entry_logged":
      return `${who} logged ${quoted}`
    case "entry_edited":
      return `${who} edited ${quoted}`
    case "entry_completed":
      return `${who} finished ${quoted}`
    case "entry_reverted":
      return `${who} put ${quoted} back to an earlier version`
    case "entry_deleted":
      return `${who} deleted ${quoted}`
    case "task_added":
      return `${who} added the task ${quoted}`
    case "task_completed":
      return `${who} completed the task ${quoted}`
    case "schema_changed":
      return what ? `${who} changed the schema (${what})` : `${who} changed the schema`
    case "member_joined":
      return `${who} joined the project`
    case "member_declined":
      return `${who} declined the invitation`
    default:
      return `${who} did something`
  }
}

function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("")
}

function Person({ person }) {
  const quiet = person.role === "member" && person.status !== "accepted"
  return (
    <li className={`team-person${quiet ? " is-quiet" : ""}`}>
      <div className="team-person-head">
        {person.avatar_url ? (
          <img className="team-avatar" src={person.avatar_url} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="team-avatar team-avatar-initials" aria-hidden="true">
            {initials(person.full_name)}
          </span>
        )}
        <div className="team-person-name">
          <strong>{person.full_name}</strong>
          {person.email && <span className="team-person-email">{person.email}</span>}
        </div>
        <span className={`team-role is-${person.role}${quiet ? " is-pending" : ""}`}>{roleLabel(person)}</span>
      </div>
      {quiet ? (
        <p className="team-quiet-note">
          {person.status === "declined"
            ? "Turned the invitation down. They have not done anything here."
            : "Has not answered the invitation yet, so cannot see or add anything."}
        </p>
      ) : (
        <>
          <dl className="team-stats">
            {STATS.map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{person.stats[key]}</dd>
              </div>
            ))}
            <div>
              <dt>Time logged</dt>
              <dd>{person.stats.time_logged_minutes ? formatDuration(person.stats.time_logged_minutes) : "0m"}</dd>
            </div>
          </dl>
          <p className="team-active">{lastActiveText(person.stats.last_active)}</p>
        </>
      )}
    </li>
  )
}

export default function ProjectTeam({ projectId, projectName, onClose }) {
  const [team, setTeam] = useState(null)
  const [error, setError] = useState("")
  // The feed is supplementary: if it cannot load, the people and their figures still show.
  const [activity, setActivity] = useState(null)

  useEffect(() => {
    let live = true
    fetchProjectTeam(projectId)
      .then((result) => live && setTeam(result))
      .catch((failure) => live && setError(failure.message || "The team could not be loaded."))
    fetchProjectActivity(projectId)
      .then((result) => live && setActivity(result.items))
      .catch(() => live && setActivity([]))
    return () => {
      live = false
    }
  }, [projectId])

  const subtitle = team
    ? `${team.people_working} ${team.people_working === 1 ? "person" : "people"} working` +
      (team.people_invited ? `, ${team.people_invited} invited` : "")
    : undefined

  return (
    <Drawer
      title={`Who is working on ${projectName}`}
      subtitle={subtitle}
      onClose={onClose}
      closeLabel="Close the team"
      busy={!team && !error}
      className="team-drawer"
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!team && !error && <p className="hint">Counting what everyone has done…</p>}
      {team && (
        <>
          <section aria-label="Everyone together" className="team-totals">
            <h3>Together</h3>
            <dl className="team-stats">
              {STATS.map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{team.totals[key]}</dd>
                </div>
              ))}
              <div>
                <dt>Time logged</dt>
                <dd>{team.totals.time_logged_minutes ? formatDuration(team.totals.time_logged_minutes) : "0m"}</dd>
              </div>
            </dl>
          </section>

          <section aria-label="People">
            <h3>People</h3>
            <ul className="team-people" role="list">
              {team.contributors.map((person) => (
                <Person key={person.user_id || person.role} person={person} />
              ))}
            </ul>
          </section>

          <section aria-label="Recent activity" className="team-activity">
            <h3>Recent activity</h3>
            {activity === null ? (
              <p className="hint">Loading…</p>
            ) : activity.length === 0 ? (
              <p className="hint">Nothing has happened here yet.</p>
            ) : (
              <ol className="team-feed" role="list">
                {activity.map((item, index) => (
                  <li key={`${item.kind}-${item.at}-${index}`}>
                    <span>{activityText(item)}</span>
                    <time dateTime={item.at}>{lastActiveText(item.at).replace(/^(Last active|Active) /, "")}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section aria-label="How these are counted" className="team-notes">
            <h3>How these are counted</h3>
            <ul>
              <li>Everything is counted from the work stored in this project, so it always matches it.</li>
              <li>
                <strong>Entries completed</strong> are entries someone moved from still to do to done. One logged as
                already finished counts as logged only.
              </li>
              <li>
                <strong>Entries edited</strong> counts each correction or revert a person made, to any entry, including
                other people&rsquo;s.
              </li>
              <li>Deleted entries are not counted.</li>
              <li>
                {team.schema_changes_recorded_since
                  ? `Schema changes are recorded from ${new Date(team.schema_changes_recorded_since).toLocaleDateString()}; earlier ones were not tracked.`
                  : "Schema changes are recorded from now on; none have been made since tracking began."}
              </li>
            </ul>
          </section>
        </>
      )}
    </Drawer>
  )
}
