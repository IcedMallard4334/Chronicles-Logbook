/**
 * What the guided tour says, and where.
 *
 * Two kinds of guidance, because they answer different questions.
 *
 * `WELCOME_TOUR` runs once, on the first sign-in, and answers "what is this
 * for?". It is the only interruption the app ever makes on its own, so it is
 * four steps and it points at things rather than describing them.
 *
 * `PAGE_TOURS` answer "what is this page for?", and fire the first time
 * somebody opens each page — at the moment they are actually looking at it,
 * which is the only moment the answer is useful. One card each, dismissible,
 * never repeated.
 *
 * Steps anchor to a CSS selector. A step whose anchor is not on screen is
 * skipped rather than shown floating in the middle: an arrow pointing at
 * nothing is worse than no arrow. `anchor: null` is a deliberate centred card,
 * used where the subject is the whole page.
 */

export const TOUR_VERSION = 1

export const WELCOME_TOUR = {
  id: "welcome",
  steps: [
    {
      anchor: null,
      title: "This is your logbook",
      body: "Chronicles keeps a record of what you actually did — what you worked on, for how long, and what is still outstanding. Four things worth knowing before you start.",
      cta: "Show me",
    },
    {
      anchor: ".workspace-sidebar-nav, .sidebar-head",
      title: "Projects hold the work",
      body: "A project is one thing you are working on — a course, a thesis, a side project. Everything you record belongs to one.",
    },
    {
      anchor: ".nav-pill-center",
      title: "Every view, across every project",
      body: "Activity is your record end to end. Entries is the searchable table. Statistics turns it into numbers. Your own fields work in all of them.",
    },
    {
      anchor: ".nav-pill-right",
      title: "It follows you",
      body: "Capture works offline and syncs when you reconnect. Your profile is where the theme, the colours and this tour live if you want them again.",
      cta: "Start writing",
    },
  ],
}

/**
 * Keyed by the view name `App` uses, so adding a page means adding a key here
 * and nothing else — there is no second list of page names to keep in step.
 */
export const PAGE_TOURS = {
  home: {
    id: "page-home",
    title: "Your workspace",
    body: "Projects live in the sidebar. Open one to define what an entry looks like and start capturing. The panels here show what is waiting for you across all of them.",
  },
  today: {
    id: "page-today",
    title: "Today",
    body: "What is due, what is late, and what you have already logged today. Made for opening first thing rather than for browsing.",
  },
  timeline: {
    id: "page-timeline",
    title: "Your record, end to end",
    body: "Every entry across every project, newest first, grouped by the day it was written. Filter by project or search it — this is the view for remembering what you did in March.",
  },
  entries: {
    id: "page-entries",
    title: "Every entry, searchable",
    body: "The table view: search across your own fields, filter by project or status, save a filter you use often, and open any row to read, correct or remove it.",
  },
  tasks: {
    id: "page-tasks",
    title: "What still needs doing",
    body: "Tasks are work you have not done yet. Entries are work you have. Keeping them apart is what lets the statistics mean something.",
  },
  board: {
    id: "page-board",
    title: "Entries as columns",
    body: "Group your entries by any Choice field you have defined and drag between columns. The columns are your options, not ours.",
  },
  outstanding: {
    id: "page-outstanding",
    title: "Still open",
    body: "Entries you logged as unfinished, with the nearest deadline first. Tick one off here when it is done.",
  },
  calendar: {
    id: "page-calendar",
    title: "The month at a glance",
    body: "Entries and deadlines on a calendar, alongside your Google Calendar if you connect one. Click a day to see everything that happened on it.",
  },
  statistics: {
    id: "page-statistics",
    title: "Numbers from your own fields",
    body: "Time per project, entries over a week or a term, and any field you have defined totalled, grouped and plotted. Export the lot as a spreadsheet.",
  },
  assistant: {
    id: "page-assistant",
    title: "Mira",
    body: "Ask for help thinking through what to record, or have her set up a project for you. She only sees what you tell her.",
  },
}

/** Guidance shown inside a project, keyed by its tab. */
export const PROJECT_TOURS = {
  schema: {
    id: "project-schema",
    title: "You decide what an entry holds",
    body: "Add the fields that suit this project — hours, a status, tags, a checklist. Every other screen adapts to whatever you choose here. Changing it later never rewrites what you have already written.",
  },
  entries: {
    id: "project-entries",
    title: "Capture, then read back",
    body: "The form above follows the fields you defined. Below it is everything recorded so far — hover an entry to correct or remove it.",
  },
  tasks: {
    id: "project-tasks",
    title: "Tasks for this project",
    body: "Things still to do, with due dates and checklists. Finished work belongs in an entry instead, so the time gets counted.",
  },
  statistics: {
    id: "project-statistics",
    title: "This project's fields, totalled",
    body: "Whatever fields you defined for this project, charted over time — hours logged, a number field's trend, how often a Choice value comes up.",
  },
  automation: {
    id: "project-automation",
    title: "Rules that run when you save an entry",
    body: "Set a field automatically, tag an entry, or flag it for follow-up based on what was entered. Entries can also repeat on a schedule, with reminders — set that up here too.",
  },
}

const SEEN_KEY = "chronicles-tours-seen"

function userScope() {
  try {
    return JSON.parse(window.localStorage.getItem("chronicles_user"))?.id || "anon"
  } catch {
    return "anon"
  }
}

/**
 * Which tours this person has already been shown.
 *
 * Scoped per user and per tour version: a second account on the same browser
 * gets its own first run, and bumping `TOUR_VERSION` re-offers the tour after
 * a release that changes what it says. Every read is guarded, because private
 * windows and blocked site data both make `localStorage` throw rather than
 * return nothing.
 */
export function seenTours() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SEEN_KEY) || "{}")
    return stored[`${userScope()}:${TOUR_VERSION}`] || []
  } catch {
    return []
  }
}

export function markTourSeen(id) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SEEN_KEY) || "{}")
    const key = `${userScope()}:${TOUR_VERSION}`
    const seen = new Set(stored[key] || [])
    seen.add(id)
    window.localStorage.setItem(
      SEEN_KEY,
      JSON.stringify({ ...stored, [key]: [...seen] })
    )
  } catch {
    // No storage: the tour shows again next time, which is a far smaller
    // problem than failing to render the page it is pointing at.
  }
}

/** Forget every tour for this account, so the profile page can offer a replay. */
export function resetTours() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SEEN_KEY) || "{}")
    delete stored[`${userScope()}:${TOUR_VERSION}`]
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(stored))
  } catch {
    // Nothing stored means nothing to forget.
  }
}
