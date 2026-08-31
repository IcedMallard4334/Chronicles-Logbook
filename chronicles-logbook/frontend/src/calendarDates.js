export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function monthDays(year, month) {
  const offset = new Date(year, month, 1).getDay()
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - offset + i))
}

export function groupGoogleEvents(events, days) {
  const map = new Map()
  events.forEach(event => {
    days.forEach(day => {
      const key = dateKey(day)
      const next = new Date(day); next.setDate(next.getDate() + 1)
      // Google all-day end dates are exclusive and have no time zone.
      const overlaps = event.all_day
        ? key >= event.start && key < event.end
        : new Date(event.start) < next && new Date(event.end) > day
      if (overlaps) {
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(event)
      }
    })
  })
  return map
}
