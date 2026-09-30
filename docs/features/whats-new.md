# Post-review improvements

After the Sprint 3 review the team and its users asked for a further round of
improvements. This page records each one: what it does, where it lives, and how it
is tested. They were delivered in four stages of five, then two larger pieces
(Mira acting on the app, and achievements). Longer write-ups are linked where they
exist.

Current test totals after this work: **696 backend tests at 95% coverage**, **684
frontend tests at 81% statement coverage**, Lighthouse on the landing page **98
performance, 100 accessibility, 96 best practices, 100 SEO**. See
[Testing](../development/testing.md).

## Stage 1

| # | Change | Where | How it is checked |
|---|---|---|---|
| 1 | **Entry history keeps the original, and any version can be restored.** The first state of an entry is version 1 (including entries saved before history existed); every version records which values changed and what they were; *Revert to this version* adds a new version matching the old one, so nothing is lost; deleted entries keep a final "deleted" version and can be restored from **Deleted entries**. | `routers/projects.py`, `EntryHistory.jsx`, `DeletedEntries.jsx`, migration `014` | `test_entry_history.py`, `EntryHistory.test.jsx` |
| 2 | **Voice dictation for Mira and a page reader.** A microphone button dictates into Mira's message box; Profile has an opt-in *Read this page* control that speaks the page, or only the selected text. Both use the browser's own speech features. | `speech.js`, `PageReader.jsx`, `MiraAssistant.jsx` | `speech.test.js`, `PageReader.test.jsx` |
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
| 12 | **An Activities page** lists everything scheduled (upcoming and earlier) to add, edit and delete, sharing data with the Calendar. `PUT /calendar/activities/{id}` is new. | `ActivitiesPage.jsx`, `routers/activities.py` | `test_activities_edit.py`, `ActivitiesPage.test.jsx`; [API](../api/dashboard-and-activities.md) |
| 13 | **Pick your own colours.** Profile has a colour picker for buttons and another for the background; a custom background derives readable surfaces and text, and *Reset* returns to the theme. | `preferences.js`, `ProfilePage.jsx` | `preferences.test.js` |
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

## Two fixes found while verifying

- Error text on the sign-in page had a contrast ratio of 4.2:1 in dark mode (below the
  4.5:1 AA minimum); it now mixes towards the text colour on both themes.
- A saved Mira reply could sort in front of the question it answered when both got the
  same timestamp on a coarse clock; the reply is now stamped strictly after it.

## Migrations

`014` entry history · `015` due time · `016` Mira conversations · `017` activity streaks ·
`018` dashboard grid · `019` entry statuses · `020` achievements. All are additive;
`main.py` applies the same statements on startup, so nothing needs running by hand.
