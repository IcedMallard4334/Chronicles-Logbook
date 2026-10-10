# What we do not test, and why

A coverage percentage cannot tell a considered exclusion from an oversight. So this page lists, one by one,
the things the automated tests do **not** check, why, what we did instead, and what the risk is. The older,
shorter list is in [Testing](../development/testing.md#what-was-deliberately-not-tested); this page
supersedes it and adds what has been built since.

!!! info "How to read the status"
    **Considered** means we looked at it and chose not to test it, for the reason given.
    **Gap** means it is simply not covered, and we say so. **Manual** means a person checked it by hand
    and nothing in the build would catch a regression.

## The numbers, and what enforces them

| | Measured on 9 October 2026 | Written target | Enforced by the build? |
|---|---|---|---|
| Backend | 800 tests, about 95% statement coverage | above 90% | **No** |
| Frontend | 1,021 tests, 84.9% statements, 87.9% lines | above 80% | **No** |

The brief's testing criterion asks "what is your code coverage (above 80%? above 50%)?". Neither suite has a
`fail-under` threshold in CI, so a drop would not fail a build; CI only reports the figure, posts it on the
pull request and publishes a badge. The targets are the team's own. *We did not set a gate. Reason: not
recorded.* Setting one is cheap (a `--cov-fail-under` flag and a `thresholds` entry in `vitest.config.js`)
and is the obvious next step.

Test names follow `test_<action>_<scenario>_<expected_result>`, and a bug fix includes a test that fails
before the fix; see the [test policy](../development/testing.md#test-policy).

## Things we cannot test automatically

### N-01. Mira against the real Gemini model — Gap {#n-01}

- **Not tested:** how the live model behaves: whether it picks sensible functions, whether it fills in
  arguments well, how it phrases a question, and latency or quota.
- **Why:** there is no API key in CI or on most developers' machines, and a test that calls a paid third
  party is slow, costs money and gives a different answer every run.
- **What we do instead:** the parts we control are tested with a **mocked event stream**: that function calls
  are validated against the closed list, that bad arguments are refused with a question, that the context
  contains only what it should, that results turns are saved without retitling, that a failed reply leaves
  nothing behind, and that the panel shows each step. The batch runner, the friendly pre-validation and the
  cap of two self-corrections limit how badly a misbehaving model can go.
- **Risk:** the model could repeat a failing action or misread a field. The cap of two makes that bounded,
  not impossible.
- **Next step:** one live run with a real key before a demonstration.

### N-02. Dictation with a real microphone and recogniser — Considered {#n-02}

- **Not tested:** the actual speech recogniser, its accuracy for a given accent or room, and every browser.
- **Why:** jsdom (the test environment) has no `SpeechRecognition`, and audio recognition cannot be run
  deterministically; the engine belongs to the browser vendor.
- **What we do instead:** everything *we* add is tested as plain functions in `speech.test.js` (choosing the
  reading with "Mira" in it, mishearings, spoken punctuation, punctuation from pauses, capitalisation,
  spacing, questions) and the start/stop wiring against a fake recogniser, including unsupported browsers and
  every error message.
- **Risk:** a real recogniser may return results in a shape or timing the fake does not.
- **Related:** [UI-29 and UI-30](interface.md#ui-29-dictation-sits-on-the-browsers-web-speech-api).
  *We have no recorded manual check of dictation in a browser other than a Chromium one; the feature is
  hidden where `SpeechRecognition` is missing.*

### N-03. Real Google sign-in and Google Calendar — Considered {#n-03}

- **Not tested:** the OAuth round trip with Google and the Calendar token refresh (`auth.py` about 85%,
  `calendar.py` about 84%).
- **Why:** exercising them means standing in a fake Google, and "a mock of an OAuth provider mostly tests
  the mock". Also, the team's shared Google OAuth client is only registered for one machine.
- **What we do instead:** the signed state token, session creation, cookie handling and every endpoint are
  tested; local development uses `/auth/dev-login` (see DB-57), which goes through the same session code. The
  real Google flow is checked by signing in against the deployed app.
- **Risk:** a change in Google's response format would only be caught in production.

### N-04. PostgreSQL-specific behaviour — Considered {#n-04}

- **Not tested:** that `JSONB` behaves like the SQLite `JSON` the tests use; the advisory lock taken at
  start-up; `ADD COLUMN IF NOT EXISTS`; the pool and SSL settings; and the unique `(recurrence, date)`
  constraint **under real concurrent workers**.
- **Why:** the suite runs on SQLite so a fresh clone and CI need no database service (DB-09). There is no test
  that runs two workers at once.
- **What we do instead:** a test fails if a migration adds a column that the start-up patch does not list
  (this is the exact class of bug that returned 500s in production once); the configuration for a PostgreSQL
  URL is tested; and the deployed app runs on PostgreSQL.
- **Risk:** a PostgreSQL-only difference reaches production before a test sees it.

### N-05. How the interface looks — Manual {#n-05}

- **Not tested:** layout, spacing, colour, animation, and whether anything overlaps or overflows.
- **Why:** jsdom performs no layout and no paint, which is why it is fast and deterministic and also why it
  cannot judge appearance. Visual-regression tools were not adopted; *whether they were evaluated is not
  recorded.*
- **What we do instead:** the interface is checked by eye in a real browser, at desktop and phone widths.
  This catches real bugs: on 9 October 2026 an eyeball check at 800 px found the drawer squeezing the page
  to one letter per line, which no test could have seen (UI-13). A test now asserts only that the right
  classes are set.
- **Risk:** a styling regression passes the build.

### N-06. Real dragging with a finger, pen or mouse — Considered {#n-06}

- **Not tested:** dragging dashboard panels, board cards and the drawer's edge on a real device.
- **Why:** jsdom has no `PointerEvent` and no layout; the tests use a small polyfill and synthetic events with
  coordinates. The logic that turns coordinates into a new position or width is tested; the browser's
  handling of touch scrolling versus dragging (`touch-action: none`) is not.
- **Risk:** a device-specific gesture problem.

### N-07. Accessibility is audited, not enforced — Manual {#n-07}

- **Not tested in the build:** colour contrast, ARIA validity, heading order, and what a screen reader says.
- **Why:** the audit uses axe-core run by hand against the signed-in app, because Lighthouse cannot sign in
  (see [Testing: accessibility checks](../development/testing.md#accessibility-checks)). It was not added to
  CI. A few structural fixes have their own tests (entry rows, the drawer's landmarks), but contrast and the
  rest could regress silently.
- **What axe cannot judge:** reading order, whether a label makes sense, how it sounds in NVDA or VoiceOver.
- **Next step:** run axe over a fixed list of screens in CI (it can run in the existing jsdom setup for
  structure; contrast needs a real browser).

### N-08. The walkthrough videos' pictures — Considered {#n-08}

- **Not tested:** how a frame of a video looks, or that its animation is smooth.
- **Why:** a video is a script played against real components, so its appearance is the app's own.
- **What we do instead:** the *timeline* is tested as a pure function (what is on screen at any moment,
  typing, clicks, ordering); the player is tested (poster, play, pause, scrub, replay, transcript); and one
  generic test plays every walkthrough and fails if any point the cursor goes to is not present at that
  moment, which is how a change to the app that breaks a video is caught.
- **Risk:** a caption that is true but unhelpful, or a scene that no longer looks like the app after a
  redesign.

### N-09. The IndexedDB adapter — Considered {#n-09}

- **Not tested:** the thin layer that talks to the browser's IndexedDB (`offlineQueue.js` lines 40 to 69).
- **Why:** jsdom has no IndexedDB, and covering it would add a `fake-indexeddb` dependency to test a
  translation layer. The queue was built to take a storage adapter for this reason.
- **What we do instead:** all the *behaviour* (ordering, per-user isolation, retry, rejection, attempt
  counts) runs against an in-memory adapter with the same interface, and the sync engine's three-way failure
  classification is tested.

### N-10. Performance, load and cold starts — Manual {#n-10}

- **Not tested in the build:** response times under load, memory, or what the first request costs after the
  app has been idle.
- **Why:** timing is unreliable on shared CI runners, and a load test against the deployed app is not
  something to run on every push.
- **What we do instead:** `scripts/load_test.py` and the recorded runs under
  [API Performance](../testing/api-performance.md) and the raw files in `docs/evidence/`. They show that
  under 50 concurrent requests responses are 15 to 20 times slower than for one user, and capacity varied by
  about a third between two runs of identical code.
- **Cold start:** not isolated. The spot check on 9 October 2026 (five requests, 0.53 to 0.95 s) does not say
  how long the app had been idle. The to-do remains in that document.

### N-11. Other browsers, real phones and real networks — Gap {#n-11}

- **Not tested:** Safari, Firefox, older browsers, real phones, slow or lossy connections.
- **Why:** nothing in the repository records a cross-browser test plan. Phone layouts are developed and
  scanned at 375 px in an emulated window; a teammate's real phone found one bug that emulation had not (the
  fourth tab cut off, fixed 2026-10-08).
- **Risk:** a browser-specific failure.

### N-12. Email and the Gemini key's availability — Considered {#n-12}

- **Not tested:** that Resend delivers, or that Gemini is reachable and within quota at a given moment.
- **Why:** both are third-party services. Email is best-effort (a failure does not block account deletion)
  and is mocked; Gemini's absence is tested as the "not configured" error shown to the person.

## Things the tests choose not to prove

### N-13. Time zones other than the ones used in the tests — Gap {#n-13}

- **Not tested:** behaviour across daylight-saving changes or in time zones far from UTC. Tests pass explicit
  dates, which is how the "today is within a day of the server's" rule (DB-08) is exercised.
- **Known limit:** statistics bucket by the database's date, not the person's.

### N-14. Large logbooks — Gap {#n-14}

- **Not tested:** search and statistics against thousands of entries for one person. Keyword, tag and
  condition search loads the matching set in Python before paging (DB-32), so its cost grows with the
  logbook; the load work measured request handling, not a very large logbook.

### N-15. Code we deleted instead of testing — Considered {#n-15}

- `generate_reply()` in the Gemini service was unreachable and accounted for 26 of 32 uncovered statements.
  It was deleted, because testing dead code raises the percentage while checking nothing.

### N-16. The calendar day view — formerly a gap, now covered {#n-16}

- `DayActivityDialog.jsx` had no test file when the older list was written. It has one now. Its focus
  handling is the browser's own (a native `<dialog>`), which is not re-tested.

### N-17. Project notes: what the tests do not prove — Gap {#n-17}

- **Colour in a real browser.** The tests check that a shared note gets the same hue for the same author and that
  the hue is set on the card; they cannot see the colour. So the tab was **scanned with axe-core by hand** on
  10 October 2026 (WCAG 2.2 AA and best practice): the system, light and dark themes, a phone-width window, and with
  an edit form open and a search active, and again after the layout was tidied, including with the confirm dialog
  open. The scans found two real problems (the dark theme's red, and the plain red button in the dialog, UI-69 and
  UI-71), which were fixed and the scan repeated clean. The converted tooltips were looked at on the project tabs and
  the sidebar, not one by one on every page they appear on. The contrast of all eight author hues was also computed for both themes. This is a
  manual check, not part of CI, like the app's other accessibility audits (UI-17). Not done:
  a real phone, a screen reader walk-through of the tab, and a user test of whether the colours are told apart.
- **Two people at once.** The permission tests act as two different accounts in turn, which proves who may see and
  change what. Two people editing the same note in the same second is not tested; the last save wins, as for the
  other free-text fields.
- **A very long list.** The list is capped at 200 notes. Behaviour beyond that is by design (the oldest are not
  shown), not tested, and not expected for one project.

## Why the numbers are not the goal

Backend coverage once read 74% and was wrong (coverage.py did not trace SQLAlchemy's greenlet switches; the
real figure was 93%). A first attempt at testing an older-browser fallback passed without reaching the code
it named, and only the coverage report exposed it. Both are written up in
[Testing](../development/testing.md#a-measurement-bug-worth-recording). The practice that follows is the one
on this page: a number is a measurement that can be wrong, and the list of what it does not cover is part of
the result.
