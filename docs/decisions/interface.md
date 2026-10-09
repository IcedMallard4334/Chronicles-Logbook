# Decisions: interface and frontend

The same format as [Data and backend](data-and-backend.md): what was decided, why, the cost, and where
it lives. Where the repository does not record a reason, the entry says so.

## Forms and fields

### UI-01. A form is one question per row, with the type beside the name

- **Decided:** each field is laid out the way a form builder lays one out: the name on top with its type
  beside it, then a hint, then the answer box underneath.
- **Why:** the lecturer asked for it, like Google Forms. It also means a long name or a long answer
  wraps instead of fighting for one line. The component is `FormField`; it passes the control the props
  it needs (`id`, description, required, invalid) so the name is a real `<label>`.
- **Where:** `FormField.jsx`, `FormField.css`.

### UI-02. The answer box is sized for the answer

- **Decided:** `size` is `narrow` (a number or date), `short` (a line of text) or `long` (a paragraph).
- **Why:** "the box is a hint about the answer". A paragraph gets a tall box and a number a small one, so a
  person knows what is expected before reading anything.
- **Where:** `FormField.jsx`, `fieldTypes.js`.

### UI-03. Short text grows **downwards**; it never scrolls sideways

- **Decided:** short text is a one-line-looking `textarea` that gets taller when the text is longer. Line
  breaks cannot be typed or pasted, and Enter submits the form as it would in a one-line box.
- **Why:** a user reported having to scroll left and right to read what they had typed. A real
  one-line input cannot wrap, so the box grows instead.
- **Where:** `FormField.jsx` (`ShortTextBox`).

### UI-04. A live character count that warns before the limit

- **Decided:** "12 / 255", amber as the limit nears, red when over.
- **Why:** the limit is enforced by the server, and the form quotes the same numbers while you type so the
  message shown while typing is the one that would come back after saving ("a message that disagreed with
  the check it came from is worse than no message at all", comment in `fieldTypes.js`).
- **Where:** `FormField.jsx` (`CharacterCount`), `fieldTypes.js` (`TEXT_LIMITS`).

### UI-05. Title, hours and minutes are always first, and greyed out in the schema editor

- **Decided:** every form leads with the built-in fields, and the schema editor shows them disabled.
- **Why:** it is clear they are there without making them editable. See DB-04 in
  [Data and backend](data-and-backend.md#db-04-title-and-time-spent-are-columns-not-schema-fields).
- **Where:** `formFields.js`, `SchemaParts.jsx` (`BuiltInFieldCards`).

### UI-06. A new project starts with an editable Description and Date

- **Decided:** a long-text Description and a Date, both optional, shown in the new-project form and
  editable there.
- **Why:** the lecturer asked for an "opinionated default" so a new person is not facing a blank form.
  Neither is required so a default form never blocks saving an entry.
- **Where:** `formFields.js` (`DEFAULT_PROJECT_FIELDS`).

### UI-07. The schema is read-only until **Edit schema** is pressed

- **Decided:** reading a schema and editing it are separate modes.
- **Why:** "a schema is a decision about the shape of everything already recorded, so it should not be
  possible to alter one by clicking into a form while reading it."
- **Where:** `App.jsx` (`SchemaBuilder`).

### UI-08. Field-type labels come from one registry

- **Decided:** `FIELD_TYPE_META` holds each type's label, hint and badge colour, and the builder, the entry
  form, the table and the schema view all read it.
- **Why:** so they can never disagree about what a type is called; renaming a badge or adding a type is
  one edit. The API's `project_reference` is a fine wire name and a poor label.
- **Where:** `fieldTypes.js`.

### UI-09. A calculated field is shown, not asked for

- **Decided:** a calculation is a read-only read-out with a "calculated" mark, and a project link is a
  chip, not a box.
- **Why:** an input would invite someone to type a value the server would overwrite; a boxed read-out of a
  link "would read as a text box awaiting input". The mark has a real accessible name so a screen reader
  user can tell a figure was derived, not typed.
- **Where:** `EntryShared.jsx`.

### UI-10. Tags and checklists autocomplete from what the project already uses

- **Decided:** tags already used in the project are offered as you type.
- **Why:** a filter only works when the same label is written the same way twice, so the second time is
  offered rather than remembered.
- **Where:** `EntryShared.jsx`.

### UI-11. A formula is previewed against the project's latest entry

- **Decided:** while a calculation is being written, the schema editor shows what it would give for the
  newest entry, found by date (not by list order), falling back to a fixed sample.
- **Why:** a formula is easier to trust once it has produced a number, and checking against a figure the
  owner recognises beats an abstract example. The newest is found by date because entries captured offline
  are folded in ahead of what the server returned.
- **Where:** `fieldTypes.js` (`previewValues`), `SchemaParts.jsx`.

## Drawers instead of dialogs

### UI-12. Forms open in resizable, non-modal side drawers

- **Decided:** the entry detail, new project and edit project open in a drawer docked to the right edge,
  like a side panel in a code editor, instead of a window over the app.
- **Why:** the lecturer asked for it. A drawer keeps the page usable: "so another entry can be chosen while
  one is open". There is no backdrop and no focus trap.
- **Details:**
  - *Width:* between 360 and 960 px, 520 by default, remembered in `localStorage`
    (`chronicles-drawer-width`). The page beside it always keeps at least 320 px.
  - *Resizing:* by dragging the left edge, or with the arrow keys (24 px a step; Home and End jump to the
    widest and narrowest); a double click resets the width.
  - *Escape* closes it only while focus is inside it, because the page is still in use.
  - *Focus* moves in when it opens and returns to whatever opened it.
  - *Rendered into `<body>` with a portal.* An ancestor with a `transform` becomes the containing block for
    `position: fixed`; a view-transition wrapper left an identity transform behind and a modal was found
    centring itself inside that wrapper's full height instead of the window (fixed 2026-09-24).
  - *Sticky actions:* the Save and Cancel row stays visible.
- **Where:** `Drawer.jsx`, `Drawer.css`.

### UI-13. How the drawer shares the screen depends on how much room there is

- **Decided:**
  - above **760 px** of room beside it, the page is pushed over;
  - below that, the drawer **lies over** the page instead of squeezing it;
  - below **1100 px** of room the top bar drops its labels to icons so it still fits;
  - under **720 px** of screen width the drawer takes the whole screen and the drag handle is hidden.
- **Why:** the first version always reserved 320 px beside the drawer, but the app's own layout is
  decided by media queries on the **window** width, not the space left. At 800 px of window the page was
  squeezed into 280 px with a desktop layout, and a project name wrapped one letter per line. Found while
  demonstrating the app on 2026-10-09 and fixed then.
- **Where:** `Drawer.jsx` (`OVERLAY_PAGE_WIDTH`, `COMPACT_PAGE_WIDTH`), `Drawer.css`.
- **Not covered by a test:** how it *looks* at each width; only that the classes are set.

### UI-14. The calendar day view is still a native `<dialog>`

- **Decided:** `DayActivityDialog` remains a modal.
- **Why:** it is an agenda to glance at and add to, not an edit screen, and the native dialog gives a
  focus trap and Escape for free. A native `<dialog>` is also why it was missing from the shared
  `useDialogFocus` hook (see [what we do not test](not-tested.md)).
- **Where:** `DayActivityDialog.jsx`.

### UI-15. Dialogs share one focus hook; popovers do not trap Tab

- **Decided:** `useDialogFocus` moves focus in, closes on Escape, returns focus, and traps Tab by default.
  A non-modal popover (the notification bell) passes `trap: false`.
- **Why:** every dialog had correct ARIA but most had no keyboard focus management: no initial focus,
  inconsistent Escape, no Tab trap (so Tab could reach elements behind a backdrop that claims to hide
  them), no focus return. `onClose` is read from a ref **on purpose**: call sites pass a fresh inline
  function each render, and depending on it would re-run the effect and steal focus back to the first
  field on every keystroke.
- **Where:** `useDialogFocus.js` (Lighthouse and keyboard work of 2026-09-24).

## Accessibility

### UI-16. The in-app screen reader was removed

- **Decided:** removed on 2026-10-08 (it had been built on 2026-10-01 to replace an earlier page reader).
- **Why:** the lecturer's feedback was that browsers and devices already have good screen readers (NVDA,
  JAWS, VoiceOver, TalkBack), and a second one competes with the one a person actually relies on. It was
  loaded only when switched on, so removing it changed no load times. Voice **dictation** for Mira stays,
  because dictation is a different job (input, not output).
- **Where:** [What's new](../features/whats-new.md#lecturer-feedback-phase-1).

### UI-17. Where we stand on accessibility, and what a scan cannot judge

- **Decided:** the signed-in app is audited with axe-core by hand, because Lighthouse cannot sign in.
- **Result and method:** [Testing: accessibility checks](../development/testing.md#accessibility-checks).
- **Not automated:** the axe pass is **not in CI**. It was a one-off manual audit, and a regression would
  not fail a build. See [N-07](not-tested.md#n-07).

### UI-18. A list item is not a button

- **Decided:** an entry row is a plain `<li>`. Its title is a real `<button>` named for the entry,
  stretched over the whole row with CSS (`::after`), so a click anywhere opens it.
- **Why:** the first version made the `<li>` itself `role="button"` with the name "Open entry detail" on
  every row. axe rated that critical: a screen reader announced a broken list and the same name for every
  entry. Links and chips inside a row are lifted above the stretched button with `z-index`. The focus ring
  is drawn around the row with `:has()`.
- **Where:** `App.jsx`, `App.css` (`.log-open`).

### UI-19. Headings step down without skipping

- **Decided:** a project's name is its page's `<h1>`; a hidden `<h2>` names the open tab; the calendar has a
  hidden `<h1>`; the task panel's heading is raised one level on the All Tasks page; the tour card and
  badge-summary headings were raised one level.
- **Why:** people who move by heading need somewhere to start, and a skipped level (an `<h3>` straight under
  an `<h1>`) misleads. A first attempt, a hidden `<h1>` on every page, was **wrong**: nearly every view
  already has its own `<h1>`, so it duplicated them. It was removed in favour of fixing only the pages that
  lacked one.
- **Where:** `App.jsx`, `CalendarView.jsx`, `TaskPanel.jsx`, `GuidedTour.jsx`, `AchievementParts.jsx`.

### UI-20. Chart and tour-dot labels need a role

- **Decided:** `role="img"` on the statistics charts and the tour's step dots.
- **Why:** an `aria-label` on a bare `<div>` or `<span>` is ignored by assistive technology. The same
  figures are in a visually hidden table for screen readers.
- **Where:** `StatisticsPage.jsx`, `GuidedTour.jsx`.

### UI-21. The sidebar project list is a plain list

- **Decided:** `<ul role="list">` with buttons; the open project is marked `aria-current`.
- **Why:** it had been a `listbox` of `option`s, but each item also held a pin button, which a listbox may
  not contain (critical). A listbox also promises arrow-key behaviour that was never built.
- **Where:** `App.jsx`.

### UI-22. The brand blue is `#4f50d4`

- **Decided:** `--blue` and `--focus` were darkened from `#5b5ce2`.
- **Why:** text in the brand blue on its tinted background (`--blue-bg`, `#e2e5ff`) was 4.14:1, below the
  4.5:1 minimum; the new value gives 4.9:1 there and 6.1:1 on white. One shared token was changed so every
  such pairing improved at once, rather than patching individual rules.
- **Where:** `index.css`.

### UI-23. Icons, not emoji

- **Decided:** every decorative emoji was replaced by a drawn line icon (the examples under "What a logbook
  is for", the streak chips, and so on).
- **Why:** emoji draw in the operating system's own colours and style, so they ignore the chosen theme and
  accent and look different on each device; a drawn icon follows `currentColor`. A test fails if a guide
  contains an emoji. The glyphs ✓ ✗ ★ are still text characters.
- **Where:** `LearningIcons.jsx`, `Streaks.jsx`, `ChronicleReader.test.jsx`.

### UI-24. Reduced motion is honoured in CSS and in components

- **Decided:** `prefers-reduced-motion` stops the ambient drift, the confetti, the drawer's slide and the
  walkthrough cursor's movement.
- **Why:** it is honoured in the stylesheet so it works "even if this component never re-renders".
- **Where:** `AmbientBackground.jsx`, `Confetti.jsx`, `Drawer.css`, `Walkthrough.css`.

## Mira and dictation

### UI-25. Mira acts first and shows her work

- **Decided:** a request that only adds or edits runs straight away; every step is a row in a card under her
  reply with its own status (waiting, running, done, failed, not run); how it went is sent back to her so
  she can fix a failure or ask for exactly what is missing; she may answer her own failures at most **twice**
  in a row; the reply can be stopped; **deleting always asks**; a setting asks first about everything.
- **Why:** the lecturer found that Mira "crashed or failed" when making a project or an entry, and the brief
  we were given was that she should operate "like Claude": easy, quick, with the output you expect, and easy
  to interpret. Before this, every change waited on a confirmation card and a failed step surfaced as a raw
  error. Now a failure goes back to her to put right. The cap of two stops it looping. Deleting always asks
  because it cannot be undone.
- **Detail:** "How her actions went" is stored as a turn with the role `tool` and never retitles a
  conversation; the batch never throws (a problem is an outcome, not a crash); the choice to be asked first
  is kept in the browser only (`chronicles-mira-auto-run`), because it is a preference and not part of any
  record.
- **Where:** `useMira.js`, `miraActions.js`, `MiraAssistant.jsx`,
  [Mira actions](../features/mira-actions.md).

### UI-26. Mira can only do things from a closed list, through the ordinary API

- **Decided:** a model reply can contain function calls; each is validated on the server against a closed
  list (`mira_tools.py`) and returned to the browser as a proposal; the browser runs it through the same
  authenticated calls a manual action uses, resolving names against what exists **at that moment**.
- **Why:** so every permission and validation rule applies to Mira too, "she can't do anything you couldn't",
  and a project created earlier in a batch can be used by the next action. Something missing or unclear is put
  to the person as a question, not shown as an error. (The module's original wording, that proposals run "only
  when the signed-in person confirms", predates the auto-run change; corrected.)
- **Where:** `app/mira_tools.py`, `miraActions.js`.

### UI-27. What Mira can see is small, consented to, and versioned

- **Decided:** a snapshot of up to 30 projects, 30 open tasks, 20 recent entries (the first 50 characters of
  a title) and 20 activities, never full entries; only for people who accepted the current notice; the
  notice is versioned (`2026-09-30`), and bumping it asks everyone again.
- **Why:** it is exactly what leaves Chronicles for Google Gemini, "so it is deliberately small". Text in the
  snapshot is something the person wrote, so Mira is told to treat it as data, not instructions.
- **Where:** `app/mira_context.py`, `app/routers/ai.py`, `MiraConsentPage.jsx`.

### UI-28. Mira's Markdown is a deliberately small subset, built as React elements

- **Decided:** headings, bold, italic, inline code, code fences and lists; links stay plain text.
- **Why:** it builds React elements rather than HTML strings, so nothing Mira writes can inject markup.
- **Where:** `MiraMarkdown.jsx`.

### UI-29. Dictation sits on the browser's Web Speech API

- **Decided:** voice dictation uses the browser's built-in **`SpeechRecognition`** interface
  (`webkitSpeechRecognition` in Chrome and Edge). Chronicles does not record or upload audio. A microphone
  button in Mira's message box dictates into it.
- **What it runs on:** the recogniser is the browser vendor's. In Chromium browsers that is usually a
  network service (our own error message for the `network` error says dictation "needs an internet
  connection in this browser"), so the audio is handled by the browser vendor, **never by Chronicles'
  servers**, which is stated in the module's first comment. It is not available in every browser; the button
  is hidden where `dictationSupported()` is false.
- **Why this and not a server-side service:** it needs no new dependency, no key, no cost, and no audio ever
  reaches Chronicles. *No comparison with a hosted speech-to-text service is recorded in the repository.*
- **Settings:** `continuous` and `interimResults` are on; `maxAlternatives` is 5; the language is the
  browser's (`navigator.language`, `en-US` as a fallback).
- **Where:** `speech.js`, `MiraAssistant.jsx`.

### UI-30. What dictation adds on top of the browser

- **Decided:** the browser turns speech into words but not into writing, so `speech.js` supplies what a
  person would:
  1. *It asks for up to five readings* of each phrase and prefers the one that contains a word we expect
     ("Mira", "Chronicles"), with the recogniser's own first choice winning a tie.
  2. *It corrects the ways Mira is misheard* (meera, myra, mirah, mirra, murah, mirrah). *"Mirror" is also a
     real word,* so it is read as Mira only when she is plainly spoken to: after a greeting ("hey", "hi",
     "okay", "thanks", "ask", "tell"...) or at the start of a request ("can", "create", "add", "show"...).
  3. *Spoken punctuation works:* comma, full stop, question mark, exclamation mark, colon, semicolon, new
     line, new paragraph. *"Period"* is an ordinary word too, so it is a full stop only at the very end.
  4. *Punctuation from pauses.* A phrase is left without an ending until the next arrives, because what
     follows decides it: a gap of **1.4 seconds** or more gives a full stop and a capital, a shorter one a
     comma and a lower-case word; a phrase that opens with a question word gets a question mark; stopping
     closes the last sentence. "I" and proper names keep their capitals.
  5. *Friendly errors* replace the browser's codes (blocked microphone, no speech, no microphone, no
     network).
- **Why:** the first version typed "Mira" as "mirror" and punctuated nothing (user feedback, 2026-09-30).
- **Not recorded:** why 1.4 s. It is the default of `pauseMs`; no measurement is recorded.
- **Where:** `speech.js`, `speech.test.js`.

### UI-31. Dictation is tested without a real microphone

- **Decided:** the formatting logic is unit-tested directly, and the start/stop wiring is tested against a
  fake recogniser.
- **Not tested:** the real recogniser in a real browser, and how accurate it is. See
  [N-02](not-tested.md#n-02).

## Guidance for new people

### UI-32. The welcome tour is four steps; everything else waits until its page is open

- **Decided:** the tour on first sign-in has four steps (this is your logbook; projects hold the work; every
  view; it follows you). Each page and each project tab gets one dismissible coach mark the first time it is
  opened.
- **Why:** "guidance arrives when somebody is already looking at the thing being explained". A tour that
  front-loads nine screens before the app has been seen "teaches nothing, because there is nothing yet to
  attach it to". It is the only interruption the app ever makes on its own.
- **Details:** a step whose anchor is not on screen is **skipped**, not shown floating ("an arrow pointing at
  nothing is worse than no arrow"); coach marks are non-modal with no scrim, because "blocking the page to
  explain the page would be its own small insult"; a project-tab coach mark waits while another is on
  screen; seen-state is per account and per `TOUR_VERSION` in `localStorage`, read fresh each render rather
  than cached in state; it can be replayed from the profile. Positioning is measured from the real element
  because the nav wraps and the sidebar disappears on a phone.
- **Where:** `GuidedTour.jsx`, `tourSteps.js`.

### UI-33. Learning Chronicles is data, not pages

- **Decided:** a guide is an object in `learningContent.js`; cards and the reader render whatever is
  there. Guides reuse the help manual's block vocabulary plus `example`, `flow`, `callout` and `walkthrough`.
  The card art is drawn in SVG from one small palette.
- **Why:** adding guide 11 is "add an object to this array", not touching the Home page or the reader; one
  palette makes ten cards "one collection rather than ten unrelated graphics". The Home page and `/learning`
  share one card grid so they cannot drift apart. Duration badges were corrected from "3 to 6 minutes" to
  1 to 2 after measuring. Not a replacement for the tour: it is reachable from it.
- **Where:** `learningContent.js`, `LearningChronicles.jsx`, `LearningCardArt.jsx`.

### UI-34. Walkthroughs are scripted and played, not recorded

- **Decided:** each is a list of timed steps (caption, cursor target, click, set, type) that a player
  replays. The picture is **the real app**: its own components in a fixed 1200 × 750 frame carrying the
  page's stylesheets, scaled to fit. The player never autoplays, has play, pause, replay and a scrub bar,
  captions below the picture, and the same words under "Read it instead". No sound.
- **Why:**
  - *Scripted:* the lecturer asked for short silent videos; a script is a few kilobytes, follows the
    person's theme, and is fixed by editing text when the app changes. Because the picture is always
    computed from the time (`stateAt`), play, pause, scrub and replay are the same operation.
  - *Real components:* the first prototype used its own mock-up and the user rejected it: "that is not what
    the app looks like; for example, adding a field is not on the initial screen".
  - *A real frame, not a scaled box:* the app's layout answers to the width of the window it is in; in an
    iframe it answers to the frame, so the video looks the same on a phone and a desktop.
  - *Cursor targets are measured from the live elements,* and the panel or page is scrolled to them, as a
    person would.
  - *Hidden from screen readers;* the controls and the words are not.
- **Cost:** a script can drift from the app. A test plays every walkthrough and fails if any point the cursor
  goes to is not on screen at that moment.
- **Where:** `walkthroughs.js`, `Walkthrough.jsx`, `WalkthroughFrame.jsx`, `WalkthroughScenes.jsx`,
  `SceneKit.jsx`.

## Look and feel

### UI-35. Backgrounds are drawn, not photographs

- **Decided:** four ambient scenes (forest, ocean, rose petals, folded violet) are layered gradients and
  SVG, and a custom colour draws the same planes from the chosen glow.
- **Why:** a photograph is a megabyte loaded before the app looks like anything, cannot follow a colour
  change without a second copy, and crops badly between a phone and an ultrawide. The scenes are dim on
  purpose, because "a backdrop that competes with an entry list is a backdrop that has to be turned off"; the
  petals are seeded off their index so a re-render does not reshuffle them.
- **Where:** `AmbientBackground.jsx`.

### UI-36. A custom colour replaces the whole preset

- **Decided:** a preset accent is three things (button colour, a second colour, a background glow); a custom
  colour replaces all three, with a basic mode (one colour) and an advanced mode (the pieces).
- **Why:** laying a custom colour over a preset had left the preset's second colour showing through. Colours
  are inline custom properties, which win over every rule, so clearing them hands control straight back.
- **Where:** `preferences.js`.

### UI-37. Light, dark or system is an icon picker

- **Decided:** a segmented sun, moon and monitor picker, replacing a button that cycled.
- **Why:** reaching a specific mode could take up to three taps and never showed the other options. System
  clears `data-theme` so the stylesheet follows the device.
- **Where:** `ProfilePage.jsx`.

### UI-38. Highlights read `--accent`, which is defined

- **Decided:** `--accent` and `--accent-light` are aliases of `--blue` and `--blue-bg`.
- **Why:** eight rules asked for those variables, which nothing defined, so they silently fell back to a
  hard-coded purple and ignored the chosen accent.
- **Where:** `index.css`.

### UI-39. Moving between views is a short entrance, and a loader that does not flash

- **Decided:** the incoming view rises in (under a third of a second); the outgoing one is not animated. A
  loader appears only after a short delay, and lists use skeleton rows.
- **Why:** a transition "you have time to watch is a transition that gets in your way on the fifth use", but
  without one a tab click replaces the whole page in a frame and reads as a reload. The exit is not animated
  because holding the old view needs two copies mounted, which for a view that fetches on mount means two
  rounds of requests per navigation. The loader's delay exists so a request that resolves in 80 ms shows
  nothing, "the flash is what makes an app feel unsteady". Skeleton rows keep the page from jumping when the
  data lands. Mechanism: a `key` change remounts the wrapper, with no state and no timers.
- **Where:** `ViewTransition.jsx`.

### UI-40. Navigation uses client-side routing, not `window.location`

- **Decided:** the account menu and command palette use `useNavigate()`.
- **Why:** they had used `window.location.assign`, a full reload that re-ran session restoration, the
  top-level loader and the Mira consent check on every visit, which was the root cause of "glitchy"
  transitions (fixed 2026-09-24). The consent decision is also cached so going back into `/app` does not
  show the loading screen again.
- **Where:** `main.jsx`, `MiraConsentPage.jsx`.

### UI-41. Every route except the sign-in page is lazy-loaded

- **Decided:** `React.lazy` behind one `Suspense` boundary.
- **Why:** a Lighthouse run of the live site scored Performance 60 and a Largest Contentful Paint of 8.2 s.
  The cause was that `main.jsx` imported the whole app (charts, calendar, assistant) as one 737 KB bundle
  before an unauthenticated visitor could see the sign-in form. After the change the landing page's critical
  JavaScript went from 764 KB to 237 KB (Performance 83 to 93, LCP 3.7 s to 2.6 s locally).
- **Where:** `main.jsx`.

### UI-42. The landing page is drawn in CSS and has its own theme toggle

- **Decided:** the app is drawn in CSS on the landing page (no screenshot to download), and the landing
  page has a sun and moon toggle with its own palette (`data-lp-theme`) stored separately
  (`chronicles-landing-theme`).
- **Why:** it stays fast; a visitor has no account to carry a preference in. Storage can be unavailable
  (private mode), so the choice then lasts for the visit only.
- **Where:** `LandingPage.jsx`.

## Navigation and layout

### UI-43. Sign-out and delete-account live only on the profile page

- **Decided:** removed from the account menu.
- **Why:** having them in both places meant two routes to an irreversible action, one of them "a single
  click away from a menu opened for something else".
- **Where:** `App.jsx`, `ProfilePage.jsx`.

### UI-44. Deleting a project asks for its name back

- **Decided:** the same as deleting an account.
- **Why:** archiving is the ordinary way to finish with a project and it keeps the record, so deletion is
  "deliberately the harder of the two".
- **Where:** `App.jsx` (`DeleteProjectControl`).

### UI-45. The Dashboard is merged into Home; Today and Outstanding are in the sidebar

- **Decided:** Home is a welcome plus the embedded dashboard; Today, Outstanding, Activity and Projects sit
  in the Home sidebar; Learning Chronicles has its own launcher under Mira, not a section of the page.
- **Why:** when Today and Outstanding moved (2026-09-28) it left 8 tabs in the top bar and 4 in the sidebar;
  the commit gives no further reason. A launcher is "always there to click and never in the way of the
  dashboard". The project view's own Statistics toggle was removed because the workspace-wide Statistics page
  and the per-project field panel cover it.
- **Where:** `HomeWorkspace.jsx`, `LearningLauncher.jsx`.

### UI-46. Entries and tasks are explained, because users could not tell them apart

- **Decided:** an "Entry or task?" guide, tab hints and a nudge to record what was done when a task is ticked.
- **Why:** 58% of the Sprint 2 survey could not tell Entries from Tasks, the only majority-negative result;
  the page descriptions never mentioned each other. Past entries are also shown first with a **+ Log entry**
  button (commit `887f7bb`); *no reason is recorded for that ordering.*
- **Where:** `EntryTaskGuide.jsx`, [User feedback](../methodology/user-feedback.md).

### UI-47. The phone layout has its own navigation

- **Decided:** below **720 px** a bottom bar (Home, Projects, Entries, Calendar, More) is on every page; the
  project list opens as a sheet upward; the top bar folds away; form fields are 16 px so iOS Safari does not
  zoom; All Entries rows become cards; the project's four tabs share the width equally. 721 to 1100 px keeps
  the seven top tabs on one scrollable row. Under 420 px there is a smaller layout again.
- **Why:** an earlier version only stacked and "is still hard to use, which is not the same thing". Icon-only
  navigation works for four familiar destinations, but eight were "a grid of guesses". The four-tab grid came
  from a report that the fourth tab read "Automati" on a phone. The Back button on the profile page was blank
  below 520 px because the nav hides every `<span>`, and both its arrow and word were spans, so the icon is
  now an SVG.
- **Where:** `MobileLayout.css`, `App.jsx` (`MobileTabBar`).

### UI-48. Pinned projects, the remembered start page and panel state are browser-only preferences

- **Decided:** pinned projects, start view, folded panel, folded nav, density, theme and accent are in
  `localStorage`.
- **Why:** they are preferences, not records. Every read is guarded because private windows and blocked
  site data make `localStorage` throw rather than return nothing.
- **Where:** `App.jsx`, `ProfilePage.jsx`, `preferences.js`.

### UI-49. Totals come from the server

- **Decided:** the sidebar's totals come from `GET /statistics`.
- **Why:** counting locally was wrong: entries are only loaded for the open project, so a client-side sum
  reported one project's count as the whole logbook.
- **Where:** `App.jsx`.

### UI-50. Invitations and reminders are polled, not pushed

- **Decided:** each is a bell in the top bar that **does not exist when there is nothing to say**, re-checked
  when the tab regains focus and polled every minute (invitations) or every five minutes (reminders).
- **Why:** there is no socket, and an invitation is not urgent: "a minute late is fine, and the check is one
  small request". A permanently empty notification icon "teaches people to stop looking at it". The
  reminders poll is also what creates recurring entries once they come due. Both fail quietly: the workspace
  still works without them.
- **Where:** `Invitations.jsx`, `Reminders.jsx`.

### UI-51. The Board offers "outstanding or not" for every project

- **Decided:** a board can group by a dropdown field or by status; grouping by whether work is outstanding is
  always available. A card dragged to a new column is updated optimistically and put back if the server
  refuses. Entries whose value is no longer one of the options sit in an "Unsorted" column that is not a drop
  target.
- **Why:** a board is useful before anyone defines a dropdown. There is no value that would put an entry back
  into "Unsorted". A card has one line, so a checklist reads "2 of 3 done" and tags read as words.
- **Where:** `BoardView.jsx`.

### UI-52. Dashboard panels are dragged with pointer events

- **Decided:** one code path for mouse, finger and pen; the page scrolls itself near the top and bottom of
  the window during a drag; `touch-action: none` on the grip.
- **Why:** so the same code serves every input, and a long dashboard can be reached mid-drag.
- **Where:** `DashboardPage.jsx`.

### UI-53. The first screen is the dashboard's, but a command palette reaches everything

- **Decided:** `Ctrl` or `Cmd` + `K` opens a palette that can open a page or a project by name.
- **Why:** picking a project by name used to land on Home and leave the person to find it again, "which made
  searching for one pointless". On close it refocuses its trigger, because the trigger unmounts in the same
  render that opens the dialog and focus would otherwise fall to `<body>`; a live region announces the match
  count.
- **Where:** `CommandPalette.jsx`.

## Offline and data movement

### UI-54. Offline entries are held in IndexedDB, with an id, per user

- **Decided:** an entry captured offline is queued in IndexedDB, keeps the id it will be created with, is
  scoped to the signed-in user, and is stamped with its **capture** time.
- **Why:**
  - *IndexedDB, not `localStorage`:* the queue must survive a reload or a closed tab, holds structured data,
    and is not bound by `localStorage`'s small synchronous quota.
  - *An id:* so a replay of a request whose response was lost returns the existing entry, not a duplicate.
  - *Per user:* signing out must not hand one person's unsent work to whoever signs in next, "and must not
    silently destroy it either".
  - *Capture time:* an entry logged on Monday and synced on Thursday still lands on Monday.
  - *Rejected entries are kept,* never deleted: "the text the user typed is the only copy that exists".
  - *Queued entries are shown immediately,* merged into the open project's list, so nobody re-types one
    believing it failed (which would create a real duplicate, since the retyped copy has a different id). The
    server copy arrives with the same id and is filtered out, not shown twice.
- **Where:** `offlineQueue.js`, `offlineSync.js`, `OfflineStatus.jsx`, `App.jsx`.

### UI-55. A failed send is classified three ways

- **Decided:** **retry** (network down or the server failing: stay queued, stop the drain), **rejected** (the
  server understood and refused, for example the project was archived: move aside for the person to resolve)
  and **paused** (the session expired: touch nothing).
- **Why:** an expired session says nothing about the entries, and rejecting the queue over it "would bury real
  work behind a sign-in prompt". One drain runs at a time because the reconnect event and the periodic timer
  can fire together; the timer exists in case the `online` event never fires. Failures are told apart by a
  flag set on the error, not by matching a message string, "which is brittle".
- **Where:** `offlineSync.js`, `api.js`.

### UI-56. The offline indicator shows nothing when there is nothing to say

- **Decided:** it renders nothing while online with an empty queue, shows the pending count **while offline
  too** ("Offline - 2 waiting"), points at the field the server refused, and warns before refreshing while
  entries are unsent.
- **Why:** a permanent indicator for the ordinary case is noise; being told only "Offline" when three entries
  are banked "is the moment you most want the number"; offline, a refresh reloads from a network that is not
  there and the app may not come back.
- **Where:** `OfflineStatus.jsx`.

### UI-57. After an import, reload projects first, then entries

- **Decided:** two requests in that order, triggered by a `chronicles-imported` window event.
- **Why:** `GET /projects` omits entries, so the other order would wipe the list just fetched. The event
  avoids threading a callback through the several components between the account menu and the app.
- **Where:** `DataTransfer.jsx`, `App.jsx`.

### UI-58. An export is a download made in the browser

- **Decided:** CSV, Markdown, HTML, plain text, PDF and the JSON backup are all written in the browser from
  one "report" built from the export document.
- **Why:** each format then says the same things (every project with its fields and statuses, every entry
  with its values by name rather than id, every task with its checklist); nothing needs a server. The CSV
  endpoint cannot be a plain link because it needs the bearer token. The object URL is released on the next
  tick because revoking at once can cancel the download in some browsers.
- **Where:** `exportFormats.js`, `DataTransfer.jsx`.

### UI-59. Entry names are decided in one place

- **Decided:** an entry is named by its title; failing that, its first readable words (skipping ids); failing
  that, the day it was written, never its id. The same function names it in the link picker and the "Linked
  from" line.
- **Why:** before titles existed a link read "Entry of 9/26/2026", and a backlink read a bare UUID. One
  function means the same entry reads the same everywhere.
- **Where:** `entryNames.js`, `EntryShared.jsx`.

## Streaks and badges

### UI-60. Anything that saves counts as activity; reading and talking to Mira do not

- **Decided:** a successful save pings the streak endpoint (a day can be at most one day from the server's).
  Reading, deleting, signing in and talking to Mira do not count as "doing something".
- **Why:** it measures making a record, which is the product's purpose. The endpoint refuses a day more than
  one day away, so a streak cannot be back-filled. The ping is deferred so the saved request has fully
  returned first. A failure never gets in the way of the app.
- **Where:** `api.js`, `app/routers/streaks.py`.

### UI-61. Celebrations are asked for from the server

- **Decided:** after anything that saves, and after signing in, the client asks the server whether a badge was
  newly earned, a moment later so a flurry of saves is one check; each new badge gets its own burst, and
  nothing is celebrated for people who asked for less motion.
- **Why:** the server decides whether a badge is earned and whether its celebration has been shown, so the
  browser never has to remember. A failed check must never get in the way.
- **Where:** `AchievementCelebration.jsx`, `Confetti.jsx`.

## Content and wording

### UI-62. The help manual is researched from the source, then fact-checked

- **Decided:** 18 sections and 26 articles, with generous per-article keywords (synonyms a user might type,
  for example "formula" and "calculation" for computed fields).
- **Why:** it was written from the real code, then spot-checked: every quoted button label was searched for in
  the real JSX, and two claims that did not hold (a reachable edit button, an export button) were rewritten
  to say plainly that they were not wired up, rather than implying buttons that did not exist.
- **Where:** `HelpPage.jsx`, `helpContent.js`.

### UI-63. Back goes where you came from

- **Decided:** pages opened from the profile pass `{ from }` in navigation state, and Back returns there;
  otherwise it falls back to the workspace.
- **Where:** `HelpPage.jsx`, `LearningHubPage.jsx`.
