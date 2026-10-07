// How much time one entry can record. The server enforces the same ceiling.
export const MAX_HOURS = 10000
export const MAX_MINUTES = 59

/** What is wrong with the hours and minutes someone typed, as a sentence, or null when they are fine. */
export function timeSpentProblem(hoursText, minutesText) {
  const hoursBlank = hoursText === "" || hoursText === null || hoursText === undefined
  const minutesBlank = minutesText === "" || minutesText === null || minutesText === undefined
  const hours = hoursBlank ? 0 : Number(hoursText)
  const minutes = minutesBlank ? 0 : Number(minutesText)
  if (!Number.isInteger(hours) || hours < 0) return "Hours must be a whole number, 0 or more."
  if (!Number.isInteger(minutes) || minutes < 0) return "Minutes must be a whole number, 0 or more."
  if (minutes > MAX_MINUTES) return `Minutes can be at most ${MAX_MINUTES}. Put whole hours in the Hours box.`
  if (hours > MAX_HOURS || (hours === MAX_HOURS && minutes > 0)) {
    return `An entry can record at most ${MAX_HOURS.toLocaleString("en")} hours.`
  }
  return null
}
