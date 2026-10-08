/**
 * Walkthroughs: short, silent, scripted videos that show how something is done in Chronicles.
 *
 * A walkthrough is data: a list of timed steps. Each step can say what the narration caption is,
 * where the cursor goes (`target` names an element in the scene), whether it clicks, what changes on
 * screen (`set`), and text being typed (`type`). The scene is redrawn from the steps up to the current
 * time, so playing, pausing, scrubbing and replaying are all the same thing: ask for the state at a
 * time. Nothing is recorded, so a walkthrough is a few kilobytes, follows the person's theme, and is
 * updated by editing the script when the app changes.
 */

// How long the cursor takes to arrive before it clicks.
export const TRAVEL_SECONDS = 1.1
const CLICK_SECONDS = 0.5

export const WALKTHROUGHS = {
  "first-logbook": {
    title: "Making your first logbook",
    duration: 68,
    steps: [
      { at: 0, caption: "A logbook starts as a project. Let’s make one, and log your first entry.", set: { screen: "home" } },
      { at: 4, caption: "On an empty workspace, start from the big button.", target: "create-first", click: true },
      { at: 7, caption: "A panel slides in from the side, and the page stays usable behind it. Name your logbook.", set: { drawer: true }, target: "name" },
      { at: 8.5, type: { key: "name", text: "Gym log", over: 1.8 } },
      { at: 11.5, caption: "Say what it’s for, if you like. This part is optional.", target: "description" },
      { at: 12.5, type: { key: "description", text: "Sessions, weights and how I felt.", over: 2.4 } },
      { at: 17, caption: "Scroll down to the entry form: what every entry in this project will ask for.", target: "entry-form-heading" },
      { at: 22, caption: "A title and the time it took are built in, so they are greyed out.", target: "builtin", set: { highlight: "builtin" } },
      { at: 29, caption: "A description and a date come to start you off. Change them or take them out.", target: "starter", set: { highlight: "starter" } },
      { at: 37, caption: "For something of your own to track, press Add field.", target: "add-field", set: { highlight: null }, click: true },
      { at: 40, caption: "Name the field.", set: { extraField: true }, target: ".wt-new-field input[type=\"text\"]" },
      { at: 41, type: { key: "extraName", text: "Weight (kg)", over: 1.6 } },
      { at: 44.5, caption: "Choose its type: short text, long text, number, date, choice and more. This one is a number.", target: ".wt-new-field select", set: { extraType: "Number" } },
      { at: 50, caption: "Press Create project.", target: "create", click: true },
      { at: 53, caption: "Your logbook is ready, and the form for a first entry is already open.", set: { drawer: false, screen: "project", highlight: null }, target: ".entry-form textarea.short-text-box" },
      { at: 54.5, type: { key: "entryTitle", text: "Leg day", over: 1.2 } },
      { at: 57, caption: "Add the time it took, and your own field.", target: ".entry-form input[type=\"number\"]" },
      { at: 58, type: { key: "entryHours", text: "1", over: 0.3 } },
      { at: 59.5, target: ".entry-form .form-fields > .form-field:last-of-type input" },
      { at: 60.2, type: { key: "entryWeight", text: "80", over: 0.5 } },
      { at: 62, caption: "Save the entry.", target: "save", click: true },
      { at: 64.5, caption: "There it is, in your history. Every entry you add builds the record.", set: { saved: true }, target: "entry-row" },
      { at: 67, caption: "That is all it takes." },
    ],
  },
}


const IN_THE_FORM = ".entry-form"
const WEIGHT_BOX = `${IN_THE_FORM} .form-fields > .form-field:last-of-type input`

WALKTHROUGHS["design-fields"] = {
  title: "Choosing what your logbook records",
  duration: 62,
  steps: [
    { at: 0, caption: "A logbook decides once what every entry records. That is done in the project’s Schema tab.", set: { tab: "Entries" } },
    { at: 4, caption: "Open the project’s Schema tab.", target: "tab-schema", click: true },
    { at: 7, caption: "These are the fields this logbook asks for. The first three are built in; the rest are yours.", set: { tab: "Schema" }, target: ".schema-builder .built-in-fields" },
    { at: 15, caption: "To change them, press Edit schema.", target: "edit-schema", click: true },
    { at: 18, caption: "Each field has a name and a type. Nothing changes until you save.", set: { editing: true }, target: ".wt-weight-field input[type=\"text\"]" },
    { at: 24, caption: "To track something new, press Add field.", target: "add-field", click: true },
    { at: 27, caption: "Name it.", set: { exerciseAdded: true }, target: ".wt-new-field input[type=\"text\"]" },
    { at: 28, type: { key: "exerciseName", text: "Exercise", over: 1.2 } },
    { at: 31, caption: "Give it a type. A Choice offers a list to pick from, so entries stay consistent.", target: ".wt-new-field select", set: { exerciseType: "Choice" } },
    { at: 36, caption: "List the choices, separated by commas.", target: ".wt-new-field .field-label.full input" },
    { at: 37, type: { key: "exerciseOptions", text: "Squat, Bench press, Deadlift", over: 2.8 } },
    { at: 43, caption: "A field you will not always have can be made optional: untick Required.", target: ".wt-weight-field .field-required-toggle input" },
    { at: 45, set: { weightRequired: false } },
    { at: 49, caption: "Then press Save schema.", target: "save-schema", click: true },
    { at: 52, caption: "Saved. Entries already recorded are brought along, and every new entry now asks for Exercise.", set: { editing: false, schemaSaved: true }, target: "edit-schema" },
    { at: 58, caption: "That is the whole design: choose what will help you understand an entry later." },
  ],
}

WALKTHROUGHS["add-entry"] = {
  title: "Adding an entry",
  duration: 50,
  steps: [
    { at: 0, caption: "Open a project and look at its Entries tab. Past entries are listed here.", set: { formOpen: false } },
    { at: 4, caption: "To log a new one, press Log entry.", target: "log-entry", click: true },
    { at: 7, caption: "The form asks for exactly the fields the project’s schema chose.", set: { formOpen: true }, target: `${IN_THE_FORM} textarea.short-text-box` },
    { at: 8, type: { key: "entryTitle", text: "Back and biceps", over: 1.8 } },
    { at: 11, caption: "Add how long it took.", target: `${IN_THE_FORM} input[type="number"]` },
    { at: 12, type: { key: "entryHours", text: "1", over: 0.3 } },
    { at: 13.5, target: `${IN_THE_FORM} .form-fields > .form-field:nth-of-type(3) input` },
    { at: 14.5, type: { key: "entryMinutes", text: "20", over: 0.5 } },
    { at: 16.5, caption: "And your own field.", target: WEIGHT_BOX },
    { at: 17.5, type: { key: "entryWeight", text: "62", over: 0.5 } },
    { at: 21, caption: "Not done yet? Tick “This is still to do”. Nothing else is needed until it is finished.", target: "todo-box", click: true },
    { at: 23.5, set: { todo: true, due: "2026-10-15" }, caption: "Give it a due date, and it will wait on your Outstanding list." },
    { at: 28, caption: "This one is already finished, so untick it.", target: "todo-box", click: true },
    { at: 30.5, set: { todo: false } },
    { at: 33, caption: "Press Save entry.", target: "save", click: true },
    { at: 36, caption: "It appears at the top of Recent entries.", set: { saved: true }, target: "entry-row" },
    { at: 43, caption: "Fields marked * are needed to save a finished entry; planned work needs none." },
  ],
}

WALKTHROUGHS["edit-entry"] = {
  title: "Opening and editing an entry",
  duration: 62,
  steps: [
    { at: 0, caption: "Every entry in the list can be opened. Click one.", set: { open: false } },
    { at: 4, target: "entry-row", click: true },
    { at: 7, caption: "It opens in a panel beside the page, so you can keep using the page while it is open.", set: { open: true }, target: ".drawer-heading h2" },
    { at: 13, caption: "Everything it recorded is here. To correct something, press Edit.", target: "edit-entry", click: true },
    { at: 17, caption: "Change what is wrong. Here the weight was 65, not 60.", set: { editing: true }, target: `.entry-drawer .form-fields > .form-field:last-of-type input` },
    { at: 19.5, set: { weight: "" } },
    { at: 20, type: { key: "weight", text: "65", over: 0.5 } },
    { at: 24, caption: "Say why, if you like. The reason is kept with the change.", target: "reason" },
    { at: 25, type: { key: "reason", text: "Corrected the weight", over: 2 } },
    { at: 31, caption: "Press Save changes.", target: "save-changes", click: true },
    { at: 34, caption: "Saved. The page behind has already updated.", set: { editing: false, weightSaved: "65" }, target: "entry-row" },
    { at: 40, caption: "Earlier versions are never lost. Open the history to see them.", target: "view-history", click: true },
    { at: 43, caption: "Every version is listed, and an older one can be viewed or put back.", set: { history: true }, target: ".entry-history-list" },
    { at: 52, caption: "Close the panel when you are done.", target: "drawer-close", click: true },
    { at: 55, set: { open: false } },
    { at: 59, caption: "That is all: open it, edit it, and the history keeps the rest." },
  ],
}

WALKTHROUGHS["build-history"] = {
  title: "How entries become a history",
  duration: 48,
  steps: [
    { at: 0, caption: "One entry tells you about one event. This is the Activity page, with a single entry on it.", set: { count: 1, query: "" } },
    { at: 6, caption: "Each entry you log joins the timeline.", set: { count: 2 } },
    { at: 10, set: { count: 3 } },
    { at: 14, caption: "Together they are a history: what happened, when, and in what order. No single entry could tell you that.", target: "first-row" },
    { at: 22, caption: "Read back through it whenever you need to. Search for something, such as the seal.", target: "search" },
    { at: 24, type: { key: "query", text: "seal", over: 1 } },
    { at: 30, caption: "Only the entries that mention it are left, still in order.", target: "first-row" },
    { at: 36, caption: "You can also narrow it by project, status or dates.", set: { query: "" }, target: "project-filter" },
    { at: 43, caption: "Come back to it often. A logbook is only as useful as the history you actually use." },
  ],
}

WALKTHROUGHS["views"] = {
  title: "Four ways to look at your entries",
  duration: 56,
  steps: [
    { at: 0, caption: "The same entries can be looked at in several ways. This is a project’s Entries tab: a list, newest first.", set: { view: "entries" } },
    { at: 6, caption: "Activity is the timeline: every entry from every project, in order.", target: "[data-nav=\"Activity\"]", click: true },
    { at: 9, set: { view: "timeline" }, target: "first-row" },
    { at: 18, caption: "Board groups entries into columns, by status or by any field you choose.", target: "[data-nav=\"Board\"]", click: true },
    { at: 21, set: { view: "board" }, target: "board-columns" },
    { at: 31, caption: "Change what the columns are made from.", target: ".workspace-filters label:nth-of-type(2) select" },
    { at: 36, caption: "Calendar puts each entry on the day it was recorded.", target: "[data-nav=\"Calendar\"]", click: true },
    { at: 39, set: { view: "calendar" }, target: ".ic-day.has-entry" },
    { at: 48, caption: "Click a day to see everything that happened on it." },
    { at: 53, caption: "Same entries, four views. Pick the one that answers your question." },
  ],
}

/**
 * Everything on screen at a moment: the values the scene shows, the caption, where the cursor is
 * heading and whether it is clicking. Pure, so any time can be asked for in any order.
 */
export function stateAt(script, time) {
  const values = {}
  let caption = ""
  let target = null
  let clickAt = null
  let step = -1
  script.steps.forEach((entry, index) => {
    if (entry.at > time) return
    step = index
    if (entry.caption !== undefined) caption = entry.caption
    if (entry.set) Object.assign(values, entry.set)
    if (entry.target !== undefined) {
      target = entry.target
      clickAt = entry.click ? entry.at + TRAVEL_SECONDS : null
    }
    if (entry.type) {
      const { key, text, over } = entry.type
      const progress = over ? Math.min(1, Math.max(0, (time - entry.at) / over)) : 1
      values[key] = text.slice(0, Math.floor(text.length * progress))
    }
  })
  const clicking = clickAt !== null && time >= clickAt && time < clickAt + CLICK_SECONDS
  return { values, caption, target, clicking, step }
}

/** 75 seconds as 1:15. */
export function clock(seconds) {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

/** The captions in order, for reading instead of watching. */
export function transcript(script) {
  return script.steps.filter((entry) => entry.caption).map((entry) => ({ at: entry.at, text: entry.caption }))
}
