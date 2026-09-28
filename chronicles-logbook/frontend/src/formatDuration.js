/** Render a duration held in minutes as a compact "3h 20m". */
export function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m"
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours === 0) return `${remainder}m`
  if (remainder === 0) return `${hours}h`
  return `${hours}h ${remainder}m`
}
