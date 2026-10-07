# Post-review improvements

After the Sprint 3 review the team and its users asked for a further round of
improvements. This page records each one: what it does, where it lives, and how it
is tested. They were delivered in four stages of five, then two larger pieces
(Mira acting on the app, and achievements). Longer write-ups are linked where they
exist.

Current test totals after this work: **696 backend tests at 95% coverage**, **770
frontend tests at 83% statement coverage**, Lighthouse on the landing page **98
performance, 100 accessibility, 96 best practices, 100 SEO**. See
[Testing](../development/testing.md).

## Stage 1

| # | Change | Where | How it is checked |
|---|---|---|---|
| 1 | **Entry history keeps the original, and any version can be restored.** The first state of an entry is version 1 (including entries saved before history existed); every version records which values changed and what they were; *Revert to this version* adds a new version matching the old one, so nothing is lost; deleted entries keep a final "deleted" version and can be restored from **Deleted entries**. | `routers/projects.py`, `EntryHistory.jsx`, `DeletedEntries.jsx`, migration `014` | `test_entry_history.py`, `EntryHistory.test.jsx` |
| 2 | **Voice dictation for Mira, and a screen reader.** A microphone button dictates into Mira's message box, with punctuation and Mira's name handled (see [Dictation](#dictation-and-the-screen-reader) below). Profile has an opt-in **screen reader** that speaks what you land on and lets you move around by keyboard. Both use the browser's own speech features. | `speech.js`, `ScreenReader.jsx`, `readerDescribe.js` | `speech.test.js`, `ScreenReader.test.jsx`, `readerDescribe.test.js` |
| 3 | **Google Calendar no longer falls back to localhost.** The Calendar redirect is derived from the sign-in redirect when not set, and the backend warns at startup if a live deployment still points any URL at localhost. | `config.py` | [Deployment](../development/deployment.md) |
| 4 | **A "Get started" tour on the landing page.** Four plain steps explaining projects, entries, tasks and insight, for people who haven't signed in yet. | `AuthPage.jsx` | `AuthPage.test.jsx` |
| 5 | **A time of day for to-do entries.** Optional, alongside the due date, in the new-entry and edit forms, through offline capture and sync, in history and revert, and on Outstanding. | `Entry.due_time`, migration `015` | `test_entries.py`, `offlineSync.test.js` |

## Stage 2

| # | Change | Where | How it is checked |
|---|---|---|---|
| 6 | **Offline safeguards.** A notice tells people not to refresh while offline, and the browser asks before leaving while entries wait to sync. In the review panel for entries the server refused, the **field that needs attention is highlighted and its message shown under it** (including a required field never filled in), and dates use the browser's date picker. | `OfflineStatus.jsx` | `OfflineStatus.test.jsx` |
| 7 | **Two daily streaks**: a login streak and an activity streak (any save). | `routers/streaks.py`, `Streaks.jsx`, migration `017` | `test_streaks.py`, `Streaks.test.jsx`; [API](../api/progress.md) |
| 8 | **Mira renders Markdown and streams.** Bold, lists and code render correctly (never as HTML); replies arrive as they are written; Mira's reasoning summary is shown while she works. | `MiraMarkdown.jsx`, `services/gemini_service.py` | `MiraMarkdown.test.jsx`, `test_mira_conversations.py` |
| 9 | **Mira conversations are saved** and can be reopened or deleted from History; earlier messages are sent to Mira as context. | `routers/ai.py`, migration `016` | `test_mira_conversations.py` |
| 10 | **A trash can for every delete**, whose lid lifts on hover and focus (reduced motion respected). | `TrashIcon.jsx` | `TrashIcon.test.jsx` |

## Stage 3

| # | Change | Where | How it is checked |
|---|---|---|---|
| 11 | **Edit and delete from the Calendar.** The day view edits and deletes activities; opens any entry to edit or delete it; offers *Edit project* and *Delete project* for projects you own. | `DayActivityDialog.jsx`, `CalendarView.jsx` | `DayActivityDialog.test.jsx` |
| 12 | **Scheduled activities live in Activity.** The sidebar's single **Activity** entry has two tabs: *Logged* (your entries, as before) and *Scheduled* (everything planned, upcoming and earlier, to add, edit and delete, shared with the Calendar). There is no separate Activities item. `PUT /calendar/activities/{id}` is new. | `ActivityHub.jsx`, `ActivitiesPage.jsx`, `routers/activities.py` | `test_activities_edit.py`, `ActivityHub.test.jsx`, `ActivitiesPage.test.jsx`; [API](../api/dashboard-and-activities.md) |
| 13 | **Pick your own colours**, *Basic* or *Advanced* (see [Colours](#colours) below). | `preferences.js`, `ProfilePage.jsx`, `AmbientBackground.jsx` | `preferences.test.js`, `ProfilePage.test.jsx`, `AmbientBackground.test.jsx` |
| 14 | **Past entries first.** A project opens on its entries, with a small **+** that opens the form (open by default in an empty project); saving collapses it with a confirmation line. | `App.jsx` | `SchemaEditor.test.jsx` |
| 15 | **A grid dashboard.** Choose how many blocks across (2 to 6); each panel spans a chosen width and height; drag the grip with a mouse, finger or pen (up/down buttons remain). | `DashboardPage.jsx`, `Dashboard.columns`, migration `018` | `test_dashboard.py`, `DashboardPage.test.jsx` |

## Stage 4

| # | Change | Where | How it is checked |
|---|---|---|---|
| 16 | **More statuses.** Each project has an ordered list of 2 to 8 statuses, each marked finished or not; the Board gets a column per status; All Entries can filter by any; forms and history understand them. "Still to do" is derived from the status so Outstanding and reminders are unchanged. | `statuses.py`, `StatusEditor.jsx`, migration `019` | `test_statuses.py`, `BoardView.test.jsx`, `StatusEditor.test.jsx` |
| 17 | **Dashboard merged into Home.** The welcome stays; the dashboard is underneath; the sidebar's *Projects* is now *Dashboard* and the top bar loses its Dashboard tab (7 tabs). | `HomeWorkspace.jsx` | `App.test.jsx`, `HomeWorkspace.test.jsx` |
| 18 | **New icons** for Activity, Today, Outstanding and Board. | `NavIcons.jsx` | `NavIcons.test.jsx` |
| 19 | **Project actions at the top.** *Share this project*, *Archive* and *Delete* sit above the entries; sharing opens a dialog; the old footer is gone for owners. | `App.jsx` | `SchemaEditor.test.jsx` |
| 20 | **Entries versus tasks, clarified.** An *Entry or task?* guide built around "has it already happened?", tab hints, and a nudge after finishing a task to log an entry. | `EntryTaskGuide.jsx` | `EntryTaskGuide.test.jsx`, `TaskPanel.test.jsx` |

## Mira acts on the app, and achievements

- **[Mira: actions, context and consent](mira-actions.md)**: 26 functions covering
  projects, schemas, entries, tasks, calendar, reminders, rules, sharing, statistics
  and navigation; several actions per reply; one-click confirmation with an opt-in
  fast path; a minimal workspace snapshot; re-consent.
- **[Achievements](achievements.md)**: 34 badges in seven areas, confetti
  celebrations, and a profile showcase with rings, bars and a detail card per badge.

## Refinements after first use

Using the result turned up seven things to improve; each is now done.

### Dictation and the screen reader

**Dictation** ("Mira" was typed as "mirror", and nothing was punctuated). The browser turns
speech into words but not into writing, so `speech.js` adds what a person would:

- It asks the recogniser for up to five readings of each phrase and prefers the one
  containing a word we expect (**Mira**, **Chronicles**).
- It corrects the ways Mira is misheard (*meera*, *myra*, *mirah*...). *Mirror* is also a real
  word, so it is read as Mira only when she is plainly being spoken to ("hey mirror", "mirror,
  add a task").
- **Spoken punctuation** works: *comma*, *full stop*, *question mark*, *exclamation mark*,
  *colon*, *semicolon*, *new line*, *new paragraph* (and *period* at the very end of a phrase).
- **Punctuation from pauses.** Each phrase waits for the next to decide its ending: a short
  pause gives a comma (and a lower-case next word), a long one a full stop and a capital, a
  phrase that opens like a question gets a question mark, and stopping dictation closes the
  last sentence. "I" and proper names keep their capitals.

**Screen reader** (replaces the earlier "page reader", which only read the page out). It is for
people who can't see the screen, and works like one:

- Every control is read as you reach it: its name, what it is and its state and value
  (*"Hours, edit text, 3"*, *"Bold, button, pressed"*, *"Entries, tab, selected, 1 of 4"*).
  Passwords are never read.
- Dialogs are announced when you enter them; alerts interrupt and status messages wait their
  turn; a change of page is announced; typing is echoed.
- It is usable from the keyboard: **Alt+Shift+↓/↑** next and previous item, **Alt+Shift+H/J**
  next and previous heading, **Alt+Shift+R** read on, **Alt+Shift+T** page title,
  **Alt+Shift+plus/minus** speed, **Esc** or **Ctrl** stop, **Alt+Shift+?** help. A visible
  outline follows the reading position for sighted helpers.
- Turn it on and set the speaking speed under **Profile > Screen reader**. It uses the
  browser's voice, so nothing is installed and nothing leaves the device. A full screen reader
  (NVDA, JAWS, VoiceOver) does more for someone who depends on one daily, and the page's own
  markup is left alone so those keep working.

### Colours

A preset accent such as Rose is a whole look: the colour of buttons and highlights, a second
colour they blend into, and a soft glow in the background scene. A custom colour now
**replaces all three together** instead of being laid over the preset (which had left the
preset's second colour showing through).

| Mode | What you set | What follows |
|---|---|---|
| **Basic** | One accent colour | Buttons and highlights, a second colour derived from it (a neighbour on the colour wheel), and the background glow. |
| **Advanced** | Buttons and highlights, a second colour, the page glow, and the page background, each separately | Anything left alone is derived from what you did set. A custom page background replaces Light and Dark until reset. |

Choosing a preset accent (here or in first-time setup) clears the accent customisations, so what
you click is what you see; a custom page background is kept. The background scene for a custom
glow is drawn from three neighbouring hues of your colour (`AmbientBackground.jsx`).

### Phones and small screens

Below 720px wide the app is laid out for a thumb rather than shrunk from a desktop:

- **The side panel becomes a bottom panel**: Dashboard, Activity, Today, Outstanding and **Projects**
  along the bottom. *Projects* opens the project list upwards from the bar, with its search and the
  **+** to create a project; choosing a project closes it. The workspace statistics are hidden.
- **The top bar is one row**: the seven destinations share a single line, and the streak chips, bell
  and avatar are smaller.
- **Notifications** open as a sheet under the bar, always within the screen, instead of hanging off
  the bell and being cut off on the left.
- The **search shortcut** (Ctrl K) is hidden, since a phone has no keyboard for it; the Mira button
  rides above the bottom panel; headings, buttons and spacing are a size down.

Wide screens are unchanged. The rules live in `MobileLayout.css`, loaded last so they win over the rest.

Also in this round: **Accent colour** now sits directly under Workspace density on the Profile, and
Mira's microphone comes before the hint text, in the accent colour.

### Smaller fixes

- **Setup:** the "Chronicles" swatch used the live accent instead of its own blue and purple, so it
  changed colour with whatever you clicked. It now has fixed colours like the other swatches.
- **Tour:** on the last step the buttons wrapped their labels ("Got / it"). Labels no longer break
  and the footer wraps as a whole.
- **Badges:** the Profile keeps the summary (ring and bars) near the top with a **View all
  badges** button; the badges themselves, filters and detail cards are on their own page at
  `/achievements`.

## Two fixes found while verifying

- Error text on the sign-in page had a contrast ratio of 4.2:1 in dark mode (below the
  4.5:1 AA minimum); it now mixes towards the text colour on both themes.
- A saved Mira reply could sort in front of the question it answered when both got the
  same timestamp on a coarse clock; the reply is now stamped strictly after it.

## Migrations

`014` entry history · `015` due time · `016` Mira conversations · `017` activity streaks ·
`018` dashboard grid · `019` entry statuses · `020` achievements. All are additive;
`main.py` applies the same statements on startup, so nothing needs running by hand.

## Task times, a folding top bar and open tasks

- **Time of day on tasks.** The task form has an optional *Time of day* beside the due date
  (enabled once a date is set). It is stored as `tasks.due_time` (migration `021`, mirrored in
  `main.py`), shown beside the date in the list, and Mira can set it when creating or
  updating a task or setting a reminder.
- **Folding top bar on phones.** Below 720px the word *Chronicles* gives way to a button next to
  the logo that hides or shows the seven tabs. The choice is remembered in the browser.
- **Open tasks stat.** The sidebar's *active days* figure is replaced by *open tasks*
  (`totals.open_tasks` in `GET /statistics`). Active days still appears on the Statistics page.

## Projects and badges on the dashboard

Two new panel types can be added from **Add panel**:

- **Projects**: every active project with its entry count and hours, or a single project's card.
  Config: `{}` or `{"project_id": "…"}`.
- **Badges**: every badge you have unlocked, drawn as on the badges page, updating as you earn more.
  Config: `{}`.

Both are validated like the other panel types (`type` is one of `saved_filter`, `board`,
`statistic`, `projects`, `badges`); see [Dashboard and activities](../api/dashboard-and-activities.md).

Mira can add these too: *"put my badges on my dashboard"* becomes an `add_dashboard_panel` proposal.

## Entry names and required titles

- **Titles are required** when logging or editing an entry in the app, and when Mira logs one. The
  API still accepts an entry without a title, so imports, offline captures and older entries keep working.
- **No more ids as names.** Entries without a title are named from their first readable words
  (`frontend/src/entryNames.js`); stored ids and uuids are skipped, links read as "↳ linked entry",
  and an entry with nothing readable is "Untitled entry · 29 Sep". The same helper names entries on the
  Entries, Outstanding and Calendar pages and in dashboard panels; Mira's workspace snapshot follows the same rule.
- Editing an older untitled entry pre-fills the title with that suggested name, so it can be saved as is.

## Smoother pages, tidier fields and a smaller phone layout

- **Entrances.** Pages, sections, lists, cards, forms and dialogs now fade and rise into place, one after
  another (`Motion.css`). Nothing is left transformed afterwards, and it is switched off for people who ask
  for reduced motion.
- **Fields.** Search boxes, tags and date pickers that had no styling now share the dropdown look
  (`Dropdowns.css`), and the Activity page has proper spacing.
- **Phones.** Below 720px the whole interface scales down together (root size 14px), project actions sit in a
  compact row, and buttons, tabs, inputs and cards are smaller.
- **Mira and the calendar.** "Log an event at 2pm" used to fail with *End time must be after start time*,
  because an unspecified end defaulted to 10:00. A start alone now runs for an hour, an end that isn't after the
  start is corrected, and no time at all makes an all-day activity.

## A phone layout of its own

Below 720px the app is arranged for one hand rather than squeezed from the desktop:

- **One bottom bar everywhere.** Home pages keep Dashboard, Activity, Today, Outstanding and Projects; every other
  page gets Home, Entries, Tasks, Calendar and a **More** sheet (Mira, Board, Statistics). The seven top tabs start
  folded on a phone (the button beside the logo opens them as a dropdown); a saved choice is respected.
- **Folding.** A project's long description shows two lines with *Show more*; Mira's suggested prompts start folded
  (*Show suggestions*) so the message box is always in view; the project tabs scroll sideways instead of wrapping.
- **Compact pages.** Filters sit two to a row, the timeline is a thin rail of small cards, the home welcome is a
  single line, and the Profile's colour controls line up on the left.
- **Board statuses.** The Board now says where columns come from: each is one of the project's statuses, edited from
  the pencil beside the project's name (*Edit project*, then *Statuses*).

- **Every page, not just the app shell.** Profile, Badges and Help are separate pages, so they now load the same
  phone, dropdown and entrance styles. The Activity filters fold behind a **Filters** button, the Board shows
  one swipeable column at a time, and the three project actions share a row.
- **Fixed top bar, one-line schema fields, tidy past entries.** On a phone the top bar stays fixed so its toggle never
  scrolls away; a schema field's name, type and remove button share one line; each past entry is a small card with
  its fields two to a row and the time underneath; and the frames-inside-frames shrink so content gets the width.

## A front door, folding panels, automations that fit the flow, and very small phones

- **A real landing page.** `/` now tells the story at length for visitors who are not signed in: what Chronicles is, six
  headline features, four showcases (your format, planning, automations, Mira), three steps, who it suits, streaks and
  badges, and an FAQ. It is drawn entirely in CSS. Sign-in moved to `/signin` (the old form, unchanged), and anything
  redirected back with a reason (an expired session) goes straight to it.
- **Fold the project panel.** The panel beside Home has a **Hide the project panel** button; a **Projects** button
  brings it back, and the choice is remembered. The dashboard then has the whole width.
- **Automations rebuilt around the flow.** Rules can now move an entry to a status, add a follow-up task and make it
  repeat, and they can wait for an entry to *reach a status* as well as for a new entry. The tab starts from ready-made
  ideas, and **+ Add repeat** picks an entry from the project and sets how often. See
  [Entry automation](entry-automation.md).
- **Very small phones.** The page no longer forces a 320px minimum width (which pushed a 70mm-wide phone sideways); below
  340px everything steps down once more: smaller type, a one-column filter bar, one-column dashboard panels. The sign-in
  page shows its form first.

## A round of fixes and a platinum trophy

- **The top bar owns the top edge.** It sits at the very top of the screen with a solid strip behind it, so nothing
  scrolling past shows above or around it.
- **Getting started.** The first paragraph has its breathing room back (a reset rule was overriding it), the ticks are
  centred in their circles, the *Recommended* tag keeps its own colour when you try other accents, and the last step has a
  **Back** button. The steps are numbered "Step 2 of 3" and "Step 3 of 3".
- **Learning Chronicles is a button.** It sits under Mira on the home views instead of a section at the bottom of the
  dashboard, and the Profile has a row for it.
- **Project dialogs.** The edit window is wider with room between its fields. Pressing *Create* or *Save* shows what is
  wrong on the dialog itself: a missing name, a name over 255 characters or a description over 4000, with a running count
  under each field.
- **Time on an entry.** Minutes can be at most 59 and an entry at most 10,000 hours, checked in the form and by the server.
- **A loader on Scheduled activities**, and no more grey slab when you hover a bar in the statistics.
- **Export in six formats.** *Export* now asks for JSON (the restorable backup), CSV, PDF, Markdown, a web page or plain text.
  The reports name every project, its fields and statuses, each entry (title, status, deadline, time, every value) and each
  task with its checklist. The JSON now carries titles, statuses, deadlines and tasks too, and importing restores them.
- **Chronicle Master**, a platinum trophy for earning every other badge. See [Achievements](achievements.md).

## Importing from a CSV file

**Import** now takes a `.csv` as well as a Chronicles `.json` backup. The file is read in the browser into the same document
the JSON import takes, and the person sees what it will do before anything is added: how many entries and tasks, which
projects are new, and what will be skipped. *Cancel* imports nothing.

- **Columns with a meaning:** `Kind` (Entry or Task), `Project`, `Title`, `Status`, `Due` (date, optionally with a time),
  `Time spent (minutes)` or `Time spent` (such as `2h 15m`), `Captured`, `Notes` (a task's description and `[x] item` checklist).
  Chronicles' own CSV export uses exactly these, so it reads straight back in.
- **Every other column is a field.** In a new project each becomes a number, date or text field according to what it holds.
- **Projects.** Rows go to the project in their `Project` column, or to one named after the file. A project you own with that
  name is *added to* using the fields it already has (never reshaped; columns it doesn't have are left out and listed); anything
  else becomes a new project. Projects shared with you are never added to.
- **Honest about gaps.** A date or time that can't be read, or more than 10,000 hours, is left blank and counted. A project
  you already have asks for a value in almost every field, so rows lacking one are named in the preview and listed after the
  import rather than quietly dropped.
- Each import adds new entries, so importing the same CSV twice makes two copies. (The JSON backup does not: it matches by id.)

Local development databases from older releases are also brought up to date at startup now: missing columns are added to an
existing SQLite file instead of failing the first query that names them.

## Time caps for old entries, and planned work

- **The 10,000-hour ceiling is for new figures.** An entry that already recorded more keeps its time exactly as it was:
  editing its title or anything else is fine, and so is lowering the time. Only a new entry, or a change that raises an
  over-the-ceiling time, is refused. (Importing a backup restores times as they were.)
- **Fields are required once an entry is done, not while it is still to do.** Planned work (an entry marked *still to do*, or in
  a status that is not finished) may leave fields empty; the form says so in each field and the server accepts it. What is
  filled in is still checked, and finishing the entry through the form asks for the rest. Moving an entry to a finished
  status from the Board or Outstanding, which sends no field values, does not re-check them. A CSV import applies the same
  rule: only rows that are finished are warned about missing values.
