# Achievements

Chronicles recognises milestones with **badges**: a hexagonal medal with a name, a
rarity and a short explanation, collected on the **Profile** page. Earning one
triggers a celebration with confetti. There are 34 badges in seven areas.

The API behind this is in [Streaks and achievements](../api/progress.md).

## How a badge is earned

Every badge watches **one measured figure** and is earned when it reaches a
target. The catalogue is data (`backend/app/achievements.py`): a key, a name, a
tier, a category, the figure it watches, the target, a one-line celebration
(`blurb`) and a plain instruction (`how`).

Figures are **counted from what is already stored**, never kept as separate
counters, so a badge cannot drift out of step with the work behind it:

| Figure | Counted from |
|---|---|
| `projects`, `archived_projects`, `custom_status_projects` | The person's own projects |
| `entries`, `hours` | Entries they created; hours are the sum of `time_spent` (minutes) divided by 60 |
| `tasks_done` | Tasks they completed |
| `activities` | Their scheduled calendar activities |
| `login_streak`, `activity_streak` | The **longest** run in `user_activity_days` (see below) |
| `rules`, `statistics`, `panels` | Automation rules in their projects, saved statistics, dashboard panels |
| `shared` | People invited to their projects |
| `mira_chats` | Their Mira conversations |
| `reverts` | Entry versions they created by reverting |
| `calendar` | A connected Google Calendar (either account table) |

### Earned stays earned

Once reached, a badge is written to `user_achievements` with the time it was earned.
Deleting the project or entries that earned it does **not** take it back, and its
progress reads complete from then on.

### Two streaks

The two streak badge families use the streaks described in
[Streaks and achievements](../api/progress.md#streaks):

- **Showing up** (login): opening the app on consecutive days.
- **Keeping busy** (activity): *saving something* on consecutive days: logging an
  entry, completing a task, creating a project, scheduling an activity, changing a
  status, and so on.

Each needs a run, not a total, so one missed day resets the current run (the badge
already earned is kept).

### Quiet catch-up

The first time anyone's badges are checked, any they already qualify for are
awarded **quietly**: earned, but without a celebration. Otherwise an account that
existed before badges did would be greeted with a stack of celebrations at once.
From then on, every badge earned is celebrated.

## The catalogue

| Badge | Rarity | Area | How to earn it |
|---|---|---|---|
| First Chapter | Bronze | Projects | Create your first project. |
| Bookshelf | Silver | Projects | Create 5 projects. |
| Grand Library | Gold | Projects | Create 10 projects. |
| Ink Spilled | Bronze | Entries | Log your first entry. |
| Page Turner | Bronze | Entries | Log 10 entries. |
| Chronicler | Silver | Entries | Log 50 entries. |
| Centurion Scribe | Gold | Entries | Log 100 entries. |
| Saga Weaver | Legendary | Entries | Log 500 entries. |
| Hour Hand | Bronze | Time | Record 10 hours of time spent across your entries. |
| Deep Diver | Silver | Time | Record 50 hours of time spent. |
| Century Clock | Gold | Time | Record 100 hours of time spent. |
| Marathon Mind | Legendary | Time | Record 500 hours of time spent. |
| Regular | Bronze | Showing up | Open Chronicles 3 days in a row. |
| Creature of Habit | Silver | Showing up | Open Chronicles 10 days in a row. |
| Lighthouse Keeper | Gold | Showing up | Open Chronicles 30 days in a row. |
| Eternal Flame | Legendary | Showing up | Open Chronicles 100 days in a row. |
| Warming Up | Bronze | Keeping busy | Save something 3 days in a row. |
| In the Flow | Silver | Keeping busy | Save something 10 days in a row. |
| Unstoppable | Gold | Keeping busy | Save something 30 days in a row. |
| Relentless | Legendary | Keeping busy | Save something 100 days in a row. |
| Box Ticked | Bronze | Tasks | Complete your first task. |
| Closer | Silver | Tasks | Complete 25 tasks. |
| Finisher | Gold | Tasks | Complete 100 tasks. |
| Time Blocker | Bronze | Exploring | Schedule an activity. |
| Calendar Sync | Bronze | Exploring | Connect a Google Calendar. |
| Workflow Designer | Silver | Exploring | Give a project your own statuses. |
| Autopilot | Silver | Exploring | Create an automation rule. |
| Number Cruncher | Silver | Exploring | Save a custom statistic. |
| Dashboard Architect | Silver | Exploring | Put 3 panels on your dashboard. |
| Team Player | Silver | Exploring | Share a project with someone. |
| Hello, Mira | Bronze | Exploring | Start a conversation with Mira. |
| Thinking Partner | Silver | Exploring | Have 10 conversations with Mira. |
| Time Traveller | Silver | Exploring | Revert an entry to an earlier version. |
| Tidy Mind | Bronze | Exploring | Archive a project. |

That is 11 bronze, 13 silver, 6 gold and 4 legendary.

## On the Profile page

The **Achievements** section has three parts:

1. **A progress ring** of badges earned out of the total.
2. **Two bar charts**: progress by rarity (bars coloured bronze, silver, gold and a
   legendary gradient) and by area.
3. **Every badge**, grouped by area, with *All / Earned / To earn* filters. An earned
   badge is coloured by its tier; one still to earn is grey with a **ring showing how
   far along it is** and a `progress/target` count.

**Clicking a badge** opens a card with a large version of it, its name and rarity,
the celebration line, *how to earn it*, and either when it was earned or a progress
bar with the exact figure.

Badge art is drawn in SVG (`BadgeArt.jsx`): a hexagon filled with the tier's
gradient, a line glyph for the area, and one to four stars for the rarity. It is
decorative (`aria-hidden`); each tile's accessible name says the badge, rarity and
state, for example *"Creature of Habit, Silver, 4 of 10"*.

## Celebrations

`AchievementCelebration` runs for the whole signed-in session. It asks the server
for badges after anything is **saved** (every successful create or edit dispatches a
`chronicles-activity` event) and after a streak changes, a moment after activity
settles so a burst of saves becomes a single check. A badge the server reports as
new pops up in a dialog with a bouncing badge and a burst of **confetti** from both
bottom corners and the top of the screen. If several arrive together they are shown
one after another ("Next"). The dialog offers *See all my badges* (straight to the
profile section) and marks each celebration as shown, so it is never repeated.

Confetti (`Confetti.jsx`) is a small canvas animation with no library: about 170
pieces with gravity, spin and a fade-out over roughly three and a half seconds. For
anyone whose system asks for **reduced motion**, no confetti is drawn and the badge
does not animate; the dialog still appears.

## Testing

- **Backend** (`tests/test_achievements.py`): catalogue integrity; earning on the
  exact threshold; "new" exactly once; earned-stays-earned after deletion; streak
  badges from the longest run; quiet catch-up; isolation between users; the tier and
  area summaries; marking seen (including unknown keys and other people's badges).
- **Frontend** (`Achievements.test.jsx`): badge art per tier and state; the confetti
  pieces, reduced-motion and no-canvas fallbacks and its frame loop; the profile
  section (summary, filters, detail card, errors, scroll-to-section); the
  celebration queue, dismissal, deep-link and settling of repeated checks.
