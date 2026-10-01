import { humaniseValue } from "./fieldTypes"

// An entry's name, in one place, so the same entry reads the same on every page.
// The title somebody chose comes first. Entries from before titles were required
// are named from the first words they hold: a stored id (a link, a uuid pasted
// into a field) is never words and is skipped. With nothing readable at all the
// entry is named for the day it was written, never for its id.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_NAME = 80

const clip = (text, length = MAX_NAME) => (text.length > length ? `${text.slice(0, length - 1)}…` : text)

/** The readable words an entry holds, in order, with ids and empties left out. */
export function readableValues(entry) {
  const types = new Map((entry?.schema_snapshot || []).map((field) => [field.id, field.type]))
  return Object.entries(entry?.data || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0))
    .map(([id, value]) => (types.get(id) === "link" ? "↳ linked entry" : value))
    .filter((value) => !(typeof value === "string" && UUID_PATTERN.test(value.trim())))
    .map((value) => humaniseValue(value))
    .filter((text) => typeof text === "string" && text.trim() && !UUID_PATTERN.test(text.trim()))
}

/** What the entry would be called if it had no title: its first readable words, or "" if none. */
export function suggestedTitle(entry) {
  const values = readableValues(entry)
  return values.length ? clip(String(values[0]).replace(/\s+/g, " ").trim()) : ""
}

/** The name to show for an entry. */
export function entryName(entry) {
  if (!entry) return "An entry that is no longer there"
  const title = typeof entry.title === "string" ? entry.title.trim() : ""
  if (title) return clip(title)
  const readable = readableValues(entry).join(" · ")
  if (readable) return clip(readable)
  const day = entry.created_at ? new Date(entry.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""
  return day ? `Untitled entry · ${day}` : "Untitled entry"
}
