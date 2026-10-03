/**
 * Content for Learning Chronicles — the app's built-in learning centre.
 *
 * Deliberately just data: a page and a card grid read this array and render
 * whatever is here, so adding chronicle #11 later is "add an object to this
 * array," not "touch the Home page or the reader." `blocks` reuses the same
 * small vocabulary `helpContent.js` uses (`p`, `ul`, `ol`), plus a few more
 * suited to teaching a concept rather than looking something up: `example`
 * (a small mock of a real UI element, e.g. an entry card), `flow` (a labelled
 * step sequence, e.g. Record → Organise → Track → Look back), and `callout`
 * (one sentence worth pulling out of the paragraph around it).
 *
 * `art`/`wash` pick the card's illustration (LearningCardArt.jsx) and its
 * colour wash — both purely decorative, and both drawn from the same small
 * palette on purpose, so ten cards read as one collection rather than ten
 * unrelated graphics.
 */

export const PLANNED_CHRONICLE_COUNT = 10

export const CHRONICLES = [
  {
    id: "understanding-logbooks",
    icon: "book",
    art: "pages",
    wash: "blue",
    title: "Understanding Digital Logbooks",
    description: "What is a digital logbook? Learn the core concept before you build one.",
    meta: { level: "Beginner", duration: "2 min", tag: "Getting started" },
    lessons: [
      {
        title: "What is a logbook?",
        blocks: [
          {
            type: "p",
            text: "A logbook is a structured record of activities, events, observations, or information that is maintained over time. People have kept them for as long as there's been work worth remembering accurately — a ship's course, a lab result, a day's repairs.",
          },
          {
            type: "p",
            text: "A digital logbook is an electronic version of this idea. It lets you record information digitally and build a history you can return to later, searched, filtered, and never lost to a notebook left somewhere.",
          },
        ],
      },
      {
        title: "The core idea",
        blocks: [
          { type: "flow", steps: ["Record", "Organise", "Track", "Look back"] },
          {
            type: "dl",
            items: [
              { term: "Record", detail: "Capture what happened, while it's fresh." },
              { term: "Organise", detail: "Keep information structured and easy to find." },
              { term: "Track", detail: "Build a continuous record over time." },
              { term: "Look back", detail: "Review your history whenever you need it." },
            ],
          },
        ],
      },
      {
        title: "One entry, or a logbook",
        blocks: [
          { type: "callout", text: "A single entry is useful. A collection of entries over time becomes a logbook." },
          {
            type: "p",
            text: "That's the shift Chronicles is built around: not a form you fill in once, but a habit of recording that pays off more the longer you keep it up. The next chronicle, Understanding Entries, looks at what actually goes into one.",
          },
        ],
      },
    ],
  },
  {
    id: "understanding-entries",
    icon: "pencil",
    art: "pages",
    wash: "mauve",
    title: "Understanding Entries",
    description: "Learn how entries work and what they're for before you start logging.",
    meta: { level: "Beginner", duration: "1 min", tag: "Getting started" },
    lessons: [
      {
        title: "What is an entry?",
        blocks: [
          { type: "p", text: "An entry is a single recorded event, activity, observation, or piece of information — one dated moment in your logbook." },
          {
            type: "example",
            heading: "3 October 2026",
            fields: [
              { label: "Activity", value: "Equipment inspection" },
              { label: "Status", value: "Completed" },
              { label: "Notes", value: "Checked all equipment and identified one item requiring maintenance." },
            ],
          },
        ],
      },
      {
        title: "Different logbooks, different entries",
        blocks: [
          { type: "p", text: "What an entry records depends entirely on what you're keeping track of. Chronicles doesn't assume a shape for you — you decide what each entry in a given project should capture." },
          {
            type: "ul",
            items: [
              "A fitness log might capture exercise, sets, repetitions, and weight.",
              "A research log might capture an experiment, a measurement, an observation, and a result.",
              "A maintenance log might capture equipment, an inspection, a condition, and the action taken.",
            ],
          },
          { type: "callout", text: "The entry structure depends on what you want to record — that's the whole point of being able to design it yourself." },
        ],
      },
    ],
  },
  {
    id: "creating-your-first-logbook",
    icon: "flag",
    art: "launch",
    wash: "blue",
    title: "Creating Your First Logbook",
    description: "A hands-on walkthrough of starting a project, defining fields, and logging your first entry.",
    meta: { level: "Beginner", duration: "2 min", tag: "Tutorial" },
    lessons: [
      {
        title: "Starting a new logbook",
        blocks: [
          { type: "p", text: "In Chronicles, a logbook is called a project — one project per thing you're keeping track of. You can start one from two places:" },
          {
            type: "ul",
            items: [
              "“+ New project” on the Home page, if you already have other projects.",
              "“Create your first project” on the welcome screen, if this is your very first one.",
            ],
          },
          { type: "p", text: "Either one opens the same small form: a name, and an optional description." },
        ],
      },
      {
        title: "Deciding what to record",
        blocks: [
          { type: "p", text: "A brand-new project has no fields yet — nothing to fill in on an entry until you decide what belongs there. Open the project's Schema tab and add a field for each piece of information you want every entry to capture, such as a status, a duration, or a note." },
          { type: "callout", text: "This step is what makes the logbook yours. The next chronicle, Designing Your Logbook, goes deeper into choosing good fields." },
        ],
      },
      {
        title: "Logging your first entry",
        blocks: [
          { type: "p", text: "Once your project has at least one field, switch to its Entries tab. Fill in the fields you defined, optionally record time spent and a due date, and save. That's your first entry — and the start of your history." },
        ],
      },
    ],
  },
  {
    id: "designing-your-logbook",
    icon: "puzzle",
    art: "build",
    wash: "mauve",
    title: "Designing Your Logbook",
    description: "Learn how to decide what information is worth capturing in every entry.",
    meta: { level: "Beginner", duration: "2 min", tag: "Core concept" },
    lessons: [
      {
        title: "You choose what to capture",
        blocks: [
          { type: "p", text: "Chronicles doesn't come with a fixed form for you to fill in. Instead, you decide what information each entry in a project should contain — a short list of fields, defined once, then asked for on every entry after that." },
          { type: "callout", text: "Decide what information you want to capture each time you make an entry. That decision is the whole design." },
        ],
      },
      {
        title: "Thinking in examples",
        blocks: [
          { type: "p", text: "It helps to picture a real entry before deciding on fields. Someone keeping a vehicle maintenance log might decide that every entry should contain:" },
          { type: "ul", items: ["Date", "Vehicle", "Mileage", "Maintenance performed", "Notes"] },
          { type: "p", text: "Someone keeping a training log might choose a different set entirely:" },
          { type: "ul", items: ["Date", "Exercise", "Sets", "Repetitions", "Weight", "Notes"] },
        ],
      },
      {
        title: "The question to keep asking",
        blocks: [
          { type: "callout", text: "What information will help me understand this activity when I look back later?" },
          { type: "p", text: "A field that doesn't help you understand something later is just extra typing. Keep a field if it would answer a question your future self might ask — drop it if it wouldn't." },
        ],
      },
    ],
  },
  {
    id: "adding-and-managing-entries",
    icon: "checklist",
    art: "pages",
    wash: "blue",
    title: "Adding and Managing Entries",
    description: "A practical tutorial: add, view, edit, and move through the entries you've recorded.",
    meta: { level: "Beginner", duration: "2 min", tag: "Tutorial" },
    lessons: [
      {
        title: "Adding an entry",
        blocks: [
          { type: "p", text: "Open a project and switch to its Entries tab. Fill in the fields it asks for, optionally add how long the activity took and a due date if it's something still to do, then save." },
        ],
      },
      {
        title: "Viewing what you've recorded",
        blocks: [
          { type: "p", text: "Entries don't just sit in one list. Chronicles gives you several ways to look at the same information, depending on what you're trying to see:" },
          {
            type: "dl",
            items: [
              { term: "Entries", detail: "The straightforward list, newest first." },
              { term: "Board", detail: "Entries grouped into columns — by status, or by any field you choose." },
              { term: "Calendar", detail: "Entries placed on the day they were recorded." },
              { term: "Timeline", detail: "Every entry across every project, in order." },
            ],
          },
        ],
      },
      {
        title: "Editing and navigating",
        blocks: [
          { type: "p", text: "Click any entry to open it. From there you can change its fields and save, or delete it if it was a mistake. Earlier versions of an edited entry are kept, so a correction never quietly erases what the entry used to say." },
        ],
      },
    ],
  },
  {
    id: "building-a-history",
    icon: "history",
    art: "timeline",
    wash: "mauve",
    title: "Building a History",
    description: "A single entry tells you about one event. See how entries together become a history.",
    meta: { level: "Beginner", duration: "1 min", tag: "Core concept" },
    lessons: [
      {
        title: "One entry vs. many",
        blocks: [
          { type: "p", text: "A single entry tells you about one event. On its own, that's useful — but it's not yet a history. A history is what you get once entries start to accumulate." },
          {
            type: "flow",
            steps: ["1 October — Equipment inspected", "3 October — Maintenance performed", "10 October — Follow-up inspection"],
          },
        ],
      },
      {
        title: "Why the timeline matters",
        blocks: [
          { type: "p", text: "Taken together, those three entries create a timeline of what happened — not just that maintenance occurred, but when, in what order, and how it followed from the inspection before it. No single entry could tell you that." },
          { type: "callout", text: "Information becomes more valuable when it builds a history over time." },
        ],
      },
    ],
  },
  {
    id: "logbook-use-cases",
    icon: "compass",
    art: "compass",
    wash: "blue",
    title: "What Can You Use a Digital Logbook For?",
    description: "Explore different ways people use Chronicles — and how you might adapt it to yours.",
    meta: { level: "Beginner", duration: "1 min", tag: "Inspiration" },
    lessons: [
      {
        title: "A few examples",
        blocks: [
          {
            type: "dl",
            items: [
              { term: "🧪 Research & experiments", detail: "Record experiments, observations, measurements, and results." },
              { term: "🚗 Vehicle & equipment maintenance", detail: "Record inspections, servicing, repairs, and maintenance history." },
              { term: "💻 Software development", detail: "Record development activity, testing, issues, and technical work." },
              { term: "🏋️ Training & fitness", detail: "Record workouts, exercises, performance, and progress." },
              { term: "🏗️ Fieldwork & projects", detail: "Record activities, observations, events, and work completed." },
            ],
          },
        ],
      },
      {
        title: "Adapt it to yours",
        blocks: [
          { type: "callout", text: "These examples are illustrative, not restrictive." },
          { type: "p", text: "Chronicles doesn't lock you into any one of these — the fields you choose in Designing Your Logbook are what turn a general-purpose logbook into exactly the tool whatever you're tracking needs." },
        ],
      },
    ],
  },
  {
    id: "logbook-vs-other-tools",
    icon: "layers",
    art: "build",
    wash: "mauve",
    title: "Logbook vs Other Tools",
    description: "What makes a logbook different from a task manager, a diary, or a database?",
    meta: { level: "Beginner", duration: "1 min", tag: "Core concept" },
    lessons: [
      {
        title: "What makes a logbook different?",
        blocks: [
          { type: "p", text: "Chronicles can feel a little like several other tools at once — and it borrows ideas from all of them. It helps to know what each one is really answering:" },
          {
            type: "dl",
            items: [
              { term: "Logbook", detail: "Primarily answers: what happened?" },
              { term: "Project management", detail: "Primarily answers: what needs to happen?" },
              { term: "Task manager", detail: "Primarily answers: what do I need to do?" },
              { term: "Diary", detail: "Primarily answers: how did I experience it?" },
              { term: "Database", detail: "Primarily answers: how do I store and retrieve information?" },
            ],
          },
        ],
      },
      {
        title: "Where Chronicles sits",
        blocks: [
          { type: "p", text: "These ideas overlap, and that's fine — a logbook entry can carry a due date, and reading back through old entries can feel a little like a diary. None of that is off-limits." },
          { type: "callout", text: "The core identity of the application is recording and maintaining a history of information over time." },
        ],
      },
    ],
  },
  {
    id: "getting-more-value",
    icon: "trending-up",
    art: "spark",
    wash: "blue",
    title: "Getting More Value From Your Logbook",
    description: "A logbook gets more useful the longer you keep it up. Here's how to make that count.",
    meta: { level: "Intermediate", duration: "1 min", tag: "Advanced" },
    lessons: [
      {
        title: "Habits that make a logbook pay off",
        blocks: [
          {
            type: "dl",
            items: [
              { term: "Be consistent", detail: "Try to capture similar information each time." },
              { term: "Record while it's fresh", detail: "Don't rely entirely on memory." },
              { term: "Capture useful details", detail: "Ask: will this help me understand what happened later?" },
              { term: "Build a habit", detail: "A logbook becomes increasingly useful as entries accumulate." },
              { term: "Review your history", detail: "Don't only record information — return to it." },
            ],
          },
        ],
      },
      {
        title: "The habit is the feature",
        blocks: [
          { type: "p", text: "None of this requires anything clever from the tool — it's about how you use it. A logbook kept consistently for a month tells you more than a perfectly detailed one kept for a single day." },
        ],
      },
    ],
  },
  {
    id: "tips-and-best-practices",
    icon: "spark",
    art: "spark",
    wash: "mauve",
    title: "Tips & Best Practices",
    description: "A short collection of practical tips for keeping a logbook worth coming back to.",
    meta: { level: "Beginner", duration: "1 min", tag: "Tips" },
    lessons: [
      {
        title: "Keep these in mind",
        blocks: [
          {
            type: "dl",
            items: [
              { term: "Keep your logbook focused", detail: "Create a logbook around a clear activity or purpose." },
              { term: "Choose useful information", detail: "Only capture information that helps you understand or track what matters." },
              { term: "Be consistent", detail: "Use similar information across entries where appropriate." },
              { term: "Use notes for context", detail: "Add extra information that may be useful when reviewing an entry later." },
              { term: "Review your history", detail: "A logbook becomes valuable when you actually use the history you've built." },
            ],
          },
        ],
      },
      {
        title: "You're ready",
        blocks: [
          { type: "callout", text: "A digital logbook is a history built from entries." },
          { type: "p", text: "That's the whole idea this learning centre has been building toward. From here, the best next step is simply to keep logging." },
        ],
      },
    ],
  },
]

export function getChronicle(id) {
  return CHRONICLES.find((chronicle) => chronicle.id === id) || null
}
