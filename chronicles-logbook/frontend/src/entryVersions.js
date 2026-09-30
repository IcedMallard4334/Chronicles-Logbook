// Pure helpers for EntryHistory.jsx (US-3.10), kept apart so that file only exports a component.

// "12 Mar 2024", the form the acceptance criteria use for the banner.
export function formatVersionDate(value) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/**
 * The version in force at the end of the chosen day: the latest one whose
 * changed_at falls on or before it. ``history`` is newest first.
 */
export function versionAsOf(history, isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number)
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999)
  return history.find((version) => new Date(version.changed_at) <= endOfDay) || null
}
