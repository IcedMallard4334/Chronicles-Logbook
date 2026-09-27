// One entry per help article. `keywords` should be generous — synonyms a
// real user might type (e.g. a "computed field" article should also match
// "formula", "calculate", "calculation"). `blocks` renders as: paragraphs,
// bullet lists, numbered steps, or a term/definition/example glossary list.
export const HELP_SECTIONS = [
  {
    id: "what-is-a-logbook",
    title: "What is a logbook?",
    articles: [
      {
        id: "what-is-a-logbook",
        title: "What Chronicles is for",
        keywords: ["logbook", "what is chronicles", "purpose", "why", "journal", "diary", "overview", "what is this"],
        blocks: [
          {
            type: "p",
            text: "A logbook is a running, dated record of work as it actually happened — what you did, when, and for how long — kept as you go rather than reconstructed afterwards from memory. Sailors, pilots and lab researchers have always kept one for the same reason: a decision or a result is only as trustworthy as the record behind it, and memory alone doesn't hold up to that.",
          },
          {
            type: "p",
            text: "Chronicles is a digital logbook for project work generally — a course, a thesis, a job, a side project, anything that unfolds over time and is worth being able to account for later. You define what an entry looks like for each project (see Schema editing), then log entries as you work. Nothing is a form to fill in for its own sake — every field you add exists because you'll want to search, chart or filter by it later.",
          },
          {
            type: "ul",
            items: [
              "Answering 'what did I actually do last week/month/term?' without having to reconstruct it from memory or scattered notes.",
              "Proving or reviewing time spent — hours logged per project, over a week, a term, or a whole account.",
              "Tracking what's still outstanding alongside what's already done, instead of losing track of one or the other.",
              "Keeping a defensible, dated history: every entry keeps a snapshot of the schema it was written under, and edits to it are kept as revisions rather than silently overwritten (see Entry history).",
            ],
          },
          {
            type: "p",
            text: "If you're new here, Creating your first project (next in this section) is the fastest way to see this in practice.",
          },
        ],
      },
    ],
  },
  {
    id: "getting-started",
    title: "Getting started",
    articles: [
      {
        id: "sign-in",
        title: "Signing in",
        keywords: ["login", "log in", "sign in", "google", "account", "authentication", "oauth", "password"],
        blocks: [
          {
            type: "p",
            text: "Chronicles signs you in with your Google account — there is no separate Chronicles password to set or remember. From the sign-in screen, choose 'Continue with Google' and pick the account you want to use. Google asks you to choose an account every time you sign in.",
          },
          {
            type: "p",
            text: "The first time you sign in you're walked through a short setup: pick a theme, accent colour and workspace density, choose which page Chronicles opens to, and decide whether Mira (the AI assistant) may send your messages to Google Gemini. Every one of these choices can be changed later from your Profile page.",
          },
        ],
      },
      {
        id: "first-project",
        title: "Creating your first project",
        keywords: ["first project", "create project", "new project", "getting started", "empty state", "demo data", "start"],
        blocks: [
          {
            type: "p",
            text: "A project is the unit everything else in Chronicles hangs off — one logbook for one thing you're working on, such as a course, a thesis or a side project. Every entry, task and schema field belongs to exactly one project.",
          },
          {
            type: "ol",
            items: [
              "Click '+ New project' on Home, or 'Create your first project' on the empty-workspace screen.",
              "Give it a name and, optionally, a description.",
              "Open the project's Schema tab and add the fields you want an entry to record — a new project has no fields until you define some.",
              "Switch to the Entries tab and log your first entry.",
            ],
          },
          {
            type: "p",
            text: "If you'd rather explore with sample data first, the empty-workspace screen also offers 'Load demo data', which creates a few example projects with a handful of dated entries.",
          },
        ],
      },
      {
        id: "main-navigation",
        title: "The main navigation",
        keywords: ["navigation", "nav bar", "home", "entries", "tasks", "board", "outstanding", "calendar", "today", "mira", "menu", "nav pill", "views"],
        blocks: [
          {
            type: "p",
            text: "The bar across the top of the app is how you move between views, and it's the same wherever you are in Chronicles.",
          },
          {
            type: "dl",
            items: [
              {
                term: "Home",
                detail: "Your workspace overview: active and archived project counts, upcoming tasks, recent activity, and a way in to Mira. The sidebar here also switches to Activity, the per-field timeline tool.",
                example: "Opening the app in the morning to see what's overdue and what you logged yesterday.",
              },
              {
                term: "Today",
                detail: "A single-day dashboard: tasks due today, overdue tasks needing attention, entries logged today, and how many active projects you have.",
                example: "Checking first thing what needs your attention before you start work.",
              },
              {
                term: "Mira",
                detail: "Chronicles' built-in assistant, for thinking through an update or a plan, or proposing a new project.",
                example: "Turning a rough note into a clear entry before you log it.",
              },
              {
                term: "All Entries",
                detail: "A searchable, filterable table of every entry across every project — the main tool for finding past work.",
                example: "Finding every entry that mentions a particular client across all your projects.",
              },
              {
                term: "All Tasks",
                detail: "Pick a project from a dropdown and manage its task list — add tasks, tick them off, filter by open or done.",
                example: "Reviewing what's still open on one specific project.",
              },
              {
                term: "Board",
                detail: "One project's entries arranged into columns, grouped either by whether they're still to do or by any Choice (dropdown) field, with drag-and-drop between columns.",
                example: "Seeing entries grouped by a Status field with values like Open, Blocked and Done.",
              },
              {
                term: "Outstanding",
                detail: "Every entry across all projects marked 'still to do', grouped into Overdue, Due today, Next 7 days, Later and No due date.",
                example: "Working down a single prioritised list of everything you still owe yourself.",
              },
              {
                term: "Calendar",
                detail: "A month view combining your logbook entries, any connected Google Calendar events, and activities you add directly on a day.",
                example: "Seeing what you have scheduled and what you've already logged, side by side.",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "projects",
    title: "Projects",
    articles: [
      {
        id: "managing-projects",
        title: "Creating and editing a project",
        keywords: ["create project", "edit project", "rename project", "project name", "project description", "new project"],
        blocks: [
          {
            type: "p",
            text: "Create a project from the '+' button beside Projects in the Home sidebar, or from the empty-workspace screen. You're asked for a name and an optional description.",
          },
          {
            type: "p",
            text: "To rename a project or change its description, open it and click the pencil icon next to its name (Edit project). This never touches its schema or its entries.",
          },
          {
            type: "p",
            text: "An open project shows Entries, Schema and Tasks tabs. The field-count pill beside a project's title is also a shortcut straight to its Schema tab.",
          },
        ],
      },
      {
        id: "archive-vs-delete",
        title: "Archiving, unarchiving and deleting a project",
        keywords: ["archive project", "unarchive project", "delete project", "remove project", "permanent", "finish a project"],
        blocks: [
          {
            type: "p",
            text: "Archiving is the ordinary way to finish with a project — it keeps every entry and task, and only marks the project as no longer active. An archived project can't receive new entries or a schema change until you unarchive it, but nothing about it disappears from the workspace's history. Archive and Unarchive are both single-click buttons at the bottom of a project.",
          },
          {
            type: "p",
            text: "Deleting a project is permanent: it removes the project together with every entry, task and share attached to it. It's meant for a project that should never have existed — a mistake, a duplicate, a test. To confirm, you have to type the project's exact name back, the same bar account deletion sets.",
          },
          {
            type: "p",
            text: "Only a project's owner can delete or archive it. A project someone else shared with you can't be archived or deleted from your side — you can only leave it.",
          },
        ],
      },
    ],
  },
  {
    id: "schema",
    title: "Schema editing",
    articles: [
      {
        id: "editing-schema",
        title: "Adding, removing and editing fields",
        keywords: ["schema", "fields", "add field", "remove field", "edit schema", "define fields", "schema builder"],
        blocks: [
          {
            type: "p",
            text: "A project's schema is the list of fields every entry in it records. A brand-new project has no fields — open its Schema tab and click Define schema (or Edit schema once fields exist) to add some.",
          },
          {
            type: "p",
            text: "While editing, each field has a name and a type (see the field types glossary), plus any extra settings its type needs — the choices for a Choice field, a target project for a Project link, or a formula for a Calculation. Two fields can't share a name (case-insensitively), and a name can't contain curly braces, since calculations use braces to refer to a field by name.",
          },
          {
            type: "p",
            text: "Saving a schema that would affect existing entries first shows a review screen: how many entries would be affected and exactly what changes — a new field, a removed field, a rename, a changed type, changed dropdown choices, a rewritten calculation, or a re-pointed project link. Nothing is applied until you approve it.",
          },
        ],
      },
      {
        id: "schema-versioning",
        title: "What happens to old entries when a schema changes",
        keywords: ["schema version", "schema snapshot", "old entries", "retired field", "retired data", "history", "backfill"],
        blocks: [
          {
            type: "p",
            text: "Changing a schema doesn't leave old entries behind. Every entry keeps its own snapshot of the schema shape it was written against, so an entry from before a field existed still reads correctly, and editing an old entry's typo brings that entry up to the project's current shape.",
          },
          {
            type: "p",
            text: "A brand-new field is backfilled onto every existing entry with a sensible default for its type: an empty string for text, 0 for a number, the first choice for a dropdown, the linked project for a project link, and the entry's own capture date for a date field.",
          },
          {
            type: "p",
            text: "Removing a field doesn't delete what was recorded under it. The value moves to a 'No longer recorded' section on the entry (a collapsible detail beneath it) and the field's own definition moves to the project's retired list. Restoring a field under the same id finds its old values waiting for it.",
          },
          {
            type: "p",
            text: "The same applies to a dropdown whose choices you removed, or a field whose type you changed in a way an existing value can't survive: the value is retired rather than deleted, never silently dropped.",
          },
        ],
      },
    ],
  },
  {
    id: "field-types",
    title: "Field types glossary",
    articles: [
      {
        id: "field-types-glossary",
        title: "Every field type, what it stores and when to use it",
        keywords: [
          "field types", "text field", "number field", "date field", "dropdown", "choice field",
          "tags", "checklist", "entry link", "project link", "project reference",
          "computed field", "calculation", "formula", "calculate", "expression",
        ],
        blocks: [
          {
            type: "p",
            text: "Chronicles has nine field types. The first six are ordinary — you type or pick a value when logging an entry. The last three behave differently: an entry link and a project link point at other records, and a calculation is worked out for you.",
          },
          {
            type: "dl",
            items: [
              {
                term: "Text",
                detail: "A single line of free-form writing.",
                example: "A 'What I did' field — a short note describing the work, e.g. 'Fixed the login redirect bug'.",
              },
              {
                term: "Number",
                detail: "An integer or decimal figure you can add up.",
                example: "Hours spent, page counts, a word count, a budget figure, a score out of 10.",
              },
              {
                term: "Date",
                detail: "A calendar day, not a time.",
                example: "The date a source was published, or a deadline you want recorded on the entry itself.",
              },
              {
                term: "Choice (dropdown)",
                detail: "One option from a fixed list you define when adding the field, entered as a comma-separated list in the schema builder.",
                example: "A Status field with options Open, Blocked, Done — useful for grouping entries on the Board view.",
              },
              {
                term: "Tags",
                detail: "A short list of free-text labels you add one at a time. Tags are what the tag-related search operators (has / has any / has all) filter on.",
                example: "Labelling entries by topic — research, writing, admin — so you can filter or search by them later.",
              },
              {
                term: "Checklist",
                detail: "A list of sub-items inside the entry, each with its own tick box. Structured search can ask whether a checklist is fully complete, still has something outstanding, or mentions particular text.",
                example: "Breaking one entry into steps — 'Draft outline', 'Write intro', 'Proofread' — and ticking each off as you go.",
              },
              {
                term: "Entry link",
                detail: "Points at another entry within the same project, chosen from a dropdown of that project's existing entries when you fill in the form.",
                example: "Linking a follow-up entry back to the original entry it continues.",
              },
              {
                term: "Project link (project reference)",
                detail: "Points at one of your other projects, decided once in the schema rather than per entry — every entry in the project shows the same linked project, as a clickable chip. It's server-derived: whatever value you'd send for it is ignored, and it can't point at the project itself.",
                example: "A 'Related project' field on a thesis project, pointing back at a separate literature-review project.",
              },
              {
                term: "Calculation (computed field)",
                detail: "A number worked out automatically from other Number or Calculation fields on the same entry, using a formula such as {Hours} * {Rate}. Only numbers, field references in braces, + - * / and parentheses are allowed. It updates live as you fill in an entry, and is recalculated by the server on every save, so its value is never typed directly.",
                example: "A 'Cost' field computed as {Hours} * 50, or a 'Total pages' field summing two other number fields.",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "entries",
    title: "Entries",
    articles: [
      {
        id: "creating-entries",
        title: "Creating an entry",
        keywords: ["create entry", "new entry", "log entry", "time spent", "hours", "minutes", "due date", "still to do", "todo", "time tracking"],
        blocks: [
          {
            type: "p",
            text: "Open a project's Entries tab to log one. The New entry form shows exactly the fields your schema defines — Calculation and Project link fields are shown as read-outs rather than inputs, since the server fills those in itself.",
          },
          {
            type: "p",
            text: "Every entry also carries two things outside the schema: how long you spent on it, and whether it's still outstanding.",
          },
          {
            type: "ul",
            items: [
              "Time spent is entered as separate Hours and Minutes fields and stored together as one duration in minutes; it's summed automatically into the project's total time.",
              "'This is still to do', with an optional due date, marks the entry as work not yet finished rather than a record of something done. That's what makes it appear on Outstanding, in Board's 'Still to do' column, and in Today's due/overdue counts.",
            ],
          },
        ],
      },
      {
        id: "editing-and-deleting-entries",
        title: "Correcting, marking done and removing an entry",
        keywords: ["edit entry", "delete entry", "remove entry", "mark done", "correct entry", "update entry"],
        blocks: [
          {
            type: "p",
            text: "There's no single 'edit this entry' form in the interface today. A few views change specific things about an entry: on Outstanding, 'Mark done' clears its 'still to do' flag; on Board, dragging a card (or using its 'Move to' dropdown) updates its status or the Choice field you're grouping by.",
          },
          {
            type: "p",
            text: "An entry captured while offline that the server refused when it tried to sync can be corrected and retried, or discarded, from the sync status panel — see Working offline.",
          },
          {
            type: "p",
            text: "There's currently no delete button for an already-saved entry in the interface — once logged, an entry stays part of the project's permanent record.",
          },
        ],
      },
      {
        id: "entry-history",
        title: "Entry history: seeing what an entry used to say",
        keywords: ["entry history", "revisions", "past values", "who changed", "audit", "version history", "previous value"],
        blocks: [
          {
            type: "p",
            text: "Editing an entry doesn't overwrite its past — every save keeps the entry's previous values as a numbered revision. Open an entry and click 'View history' to see them, newest first, each showing every field's value at that point, the time spent recorded then, when the change was made and, where known, who made it.",
          },
          {
            type: "p",
            text: "This is read-only: there's no 'restore this revision' button today, it's a record for reference — checking what a figure used to be, or when a change was actually made — rather than a way to undo an edit.",
          },
        ],
      },
    ],
  },
  {
    id: "structured-search",
    title: "Structured search",
    articles: [
      {
        id: "building-a-filter",
        title: "Building an AND/OR condition search",
        keywords: ["structured search", "filter", "condition", "and or", "match all", "match any", "custom field search"],
        blocks: [
          {
            type: "p",
            text: "On the Entries page, 'Filter by custom field' lets you build one or more conditions against a specific project's own fields. Pick a project first, since a field only means something within the schema that defines it — with no project chosen, the filter builder explains this instead of showing an empty form.",
          },
          {
            type: "p",
            text: "Each condition is a field, a comparison and a value. '+ Add filter' adds another; with more than one condition, a Match control appears so you can choose whether results must satisfy 'all of these (AND)' or 'any of these (OR)'.",
          },
          {
            type: "p",
            text: "A condition can only be answered by an entry that actually has that field recorded on it under its own schema snapshot — an entry from before the field existed is left out of the results rather than treated as a non-match or an error.",
          },
        ],
      },
      {
        id: "search-operators-and-sort",
        title: "Search operators by field type, and Best match sorting",
        keywords: ["search operators", "contains", "equals", "between", "greater than", "best match", "relevance", "sort entries"],
        blocks: [
          {
            type: "p",
            text: "Which comparisons are offered depends on the field's type.",
          },
          {
            type: "dl",
            items: [
              { term: "Text", detail: "contains, is exactly (case-insensitive)." },
              { term: "Number / Calculation", detail: "equals, is more than, is at least, is less than, is at most, is between." },
              { term: "Date", detail: "is on, is before, is after, is between." },
              { term: "Choice (dropdown)", detail: "is, is one of (pick several)." },
              { term: "Tags", detail: "includes the tag, includes any of, includes all of." },
              { term: "Checklist", detail: "has an item mentioning (a text search), plus is fully checked off / still has something outstanding." },
              { term: "Entry link / Project link", detail: "is set, is empty." },
            ],
          },
          {
            type: "p",
            text: "The Entries page's Sort control offers Newest first, Oldest first, Due date, Best match and Project name. Best match (relevance) ranks results by, in order: how many of your OR'd conditions an entry satisfies, then how many times your keyword search matches its field values and project name, then most recent first as a final tiebreak. Typing a search or adding a condition switches sort to Best match automatically, until you pick a different sort yourself.",
          },
        ],
      },
    ],
  },
  {
    id: "saved-filters",
    title: "Saved filters",
    articles: [
      {
        id: "saved-filters-howto",
        title: "Saving and reusing a search",
        keywords: ["saved filter", "save search", "reuse filter", "favourite search", "favorite search"],
        blocks: [
          {
            type: "p",
            text: "Once you've set up a search on the Entries page — keyword, project, status, structured conditions and sort together — you can name and save the whole combination with 'Save these filters as', shown just below the filter builder.",
          },
          {
            type: "p",
            text: "Saved filters appear as a row of chips. Click one to instantly re-apply every control it remembers; click the × on a chip to delete that saved filter. Saving under a name you've already used updates that filter in place rather than creating a duplicate.",
          },
        ],
      },
    ],
  },
  {
    id: "tasks",
    title: "Tasks",
    articles: [
      {
        id: "managing-tasks",
        title: "Creating, completing and managing tasks",
        keywords: ["task", "checklist item", "due date", "complete task", "toggle task", "who can edit tasks", "add task"],
        blocks: [
          {
            type: "p",
            text: "Tasks live under a project's Tasks tab, or the All Tasks nav view, which lets you switch which project you're looking at. A task has a title, an optional description, an optional due date, and an optional checklist of its own sub-items.",
          },
          {
            type: "p",
            text: "Click a task's checkbox to toggle it complete or reopen it. The task list can be filtered to All, Open or Done. A task with a checklist shows a progress bar (done out of total), and its individual checklist items can be ticked without opening the task for editing.",
          },
          {
            type: "p",
            text: "An overdue task — a due date in the past that isn't completed — is visually flagged, and counted in Today's and Home's 'needs attention' figures.",
          },
          {
            type: "p",
            text: "In a project shared with others, any accepted member can add a task and tick it complete or reopen it, but only the project's owner can edit a task's title, description, due date or checklist, or delete it — regardless of who created it.",
          },
        ],
      },
    ],
  },
  {
    id: "sharing",
    title: "Sharing a project",
    articles: [
      {
        id: "inviting-and-responding",
        title: "Inviting someone, and responding to an invitation",
        keywords: ["share project", "invite", "invitation", "accept", "decline", "leave project", "collaborate", "collaboration"],
        blocks: [
          {
            type: "p",
            text: "A project's owner invites another Chronicles account to it from the 'Shared with' panel at the bottom of the project (Invite by email). The address must belong to an existing Chronicles account — sharing doesn't email a stranger, it creates a notification the account holder sees inside the app.",
          },
          {
            type: "p",
            text: "Nothing about the project reaches the invited person until they accept — sharing is an offer, not a grant. Invitations waiting for your answer show up as a bell icon with a count in the top-right of the nav bar; opening it shows who invited you, to which project, and how many entries it already has, with Decline and Join buttons.",
          },
          {
            type: "p",
            text: "Once accepted, the project appears in your own sidebar alongside your own projects, marked as shared. 'Leave project', in a shared project's footer, ends your own membership at any time — entries you wrote stay in the project, since they're part of its record rather than of your access to it.",
          },
          {
            type: "p",
            text: "An owner sees who's pending, accepted or declined in the same 'Shared with' panel, and can cancel a pending invite or remove someone's access there.",
          },
        ],
      },
      {
        id: "permission-model",
        title: "What a member can and can't do",
        keywords: ["permissions", "owner", "member", "who can edit", "shared project rules", "authorship", "access control"],
        blocks: [
          {
            type: "p",
            text: "Accepting an invitation grants deliberately less than ownership.",
          },
          {
            type: "dl",
            items: [
              { term: "See the project, its entries and its tasks", detail: "Owner and any accepted member." },
              { term: "Add entries, and add tasks", detail: "Owner and any accepted member." },
              { term: "Tick a task complete, or reopen it", detail: "Owner and any accepted member." },
              {
                term: "Edit or delete an entry",
                detail: "Only the entry's own author, or the owner. A member can correct or remove an entry they wrote themselves, never one someone else wrote.",
              },
              {
                term: "Edit or delete a task; change the schema; archive, unarchive, delete or export the project; invite or remove members",
                detail: "Owner only — a task stays the owner's to edit or delete regardless of who created it.",
              },
            ],
          },
          {
            type: "p",
            text: "Entries and tasks show who wrote them (and who completed a task) when that's known. Work recorded before a project could be shared, or by someone who has since deleted their account, is simply shown without an author rather than as an error.",
          },
        ],
      },
    ],
  },
  {
    id: "data-export-import",
    title: "Data export and import",
    articles: [
      {
        id: "export-and-import",
        title: "Exporting and importing your whole logbook",
        keywords: ["export", "import", "backup", "json export", "restore", "migrate account", "move data"],
        blocks: [
          {
            type: "p",
            text: "From the account menu (your avatar, top right), Export downloads your entire logbook — every project you own, archived ones included, with their full schema and every entry — as a single JSON file. It's how you back up your account or move your data to a different Chronicles account.",
          },
          {
            type: "p",
            text: "Import reads a file previously produced by Export and adds it back in. Import is additive: it never deletes anything already in your account, and never changes an existing project's name, description or schema — it only adds entries that project doesn't already have. A project id in the file that isn't yet in your account is recreated in full, schema included; an id that belongs to someone else's export is recreated under a fresh id.",
          },
          {
            type: "p",
            text: "Re-importing your own export file is safe to repeat, since nothing is duplicated. Afterwards, a summary reports how many projects were restored, how many were already present and left untouched, how many entries were restored, and lists — with a reason — any entries that couldn't be restored because they no longer fit that project's current schema.",
          },
        ],
      },
      {
        id: "csv-export",
        title: "Exporting a project as a spreadsheet (CSV)",
        keywords: ["csv", "spreadsheet", "export csv", "excel"],
        blocks: [
          {
            type: "p",
            text: "Chronicles' API can produce a flat CSV of a single project's entries — one row per entry, with the schema's field names as columns — for opening directly in a spreadsheet. As of this manual, that isn't wired up to a button in the interface yet, so getting one currently means asking a developer to fetch it directly rather than clicking something in the app.",
          },
          {
            type: "p",
            text: "For backing up or moving data today, use the full logbook export above instead — it's a JSON file rather than a spreadsheet, but it's the one this interface can actually produce and restore for you.",
          },
        ],
      },
    ],
  },
  {
    id: "statistics",
    title: "Statistics",
    articles: [
      {
        id: "statistics-and-timelines",
        title: "Workspace totals and the field timeline",
        keywords: ["statistics", "stats", "activity", "field timeline", "dashboard", "chart", "totals", "time spent"],
        blocks: [
          {
            type: "p",
            text: "When you're on Home with no project open, the sidebar shows running totals for your whole workspace: how many active projects you have, total entries logged, total time logged, and how many distinct days you've been active.",
          },
          {
            type: "p",
            text: "Switching the Home sidebar from 'Projects' to 'Activity' opens every entry across every project in one chronological list — search it, filter by project, tag or status, or narrow it to a date range. Its 'Field trends' button switches to the Field Timeline tool instead: choose a project, one of its fields, and an optional date range, and it plots that field's recorded values over time as a line chart, with a table beneath listing each entry's date, value and the schema version it was recorded under.",
          },
          {
            type: "p",
            text: "A project's own Statistics tab does the same charting for that one project's fields specifically, without needing to pick the project first.",
          },
          {
            type: "p",
            text: "Time spent is tracked per entry, in minutes, and summed automatically into each project's total — visible on the project itself and in the workspace totals.",
          },
        ],
      },
    ],
  },
  {
    id: "automation",
    title: "Automation: rules, recurring entries and reminders",
    articles: [
      {
        id: "entry-rules",
        title: "Rules that run when an entry is saved",
        keywords: ["automation", "rule", "rules", "add tags", "fill in a field", "mark as to-do", "condition", "trigger"],
        blocks: [
          {
            type: "p",
            text: "A project's Automation tab lets its owner set up rules that run automatically whenever an entry in that project is created — the same condition builder used by structured search decides which entries a rule applies to.",
          },
          {
            type: "p",
            text: "With 'Match all' or 'Match any' of one or more conditions satisfied, a rule can take one or more actions:",
          },
          {
            type: "dl",
            items: [
              { term: "Add tags", detail: "Adds one or more tags to the entry (only offered if the project has a Tags field)." },
              { term: "Fill in a field", detail: "Sets a Text, Number, Date or Choice field to a fixed value — optionally only when that field is still empty, so it never overwrites something you typed yourself, or always, if 'overwrite' is turned on." },
              { term: "Mark as to-do", detail: "Flags the entry as still outstanding, optionally with a due date a set number of days out." },
            ],
          },
          {
            type: "p",
            text: "Rules can be switched off without deleting them, and members of a shared project see them running (so a tag or a to-do flag that appeared on their entry isn't a mystery) even though only the owner can create or edit one.",
          },
        ],
      },
      {
        id: "recurring-entries",
        title: "Recurring entries",
        keywords: ["recurrence", "recurring", "repeat", "repeating entry", "schedule", "daily", "weekly", "monthly"],
        blocks: [
          {
            type: "p",
            text: "Any entry can be set to repeat — daily, weekly or monthly, every N of that unit — from the Recurrence control on the entry form. Chronicles then creates a fresh copy of that entry automatically each time it comes due, rather than you re-typing the same entry on a schedule.",
          },
          {
            type: "p",
            text: "Occurrences are created in the background on a regular check, so a new one may take a few minutes to appear rather than the instant its due time arrives. Editing a field on the original entry doesn't retroactively change occurrences already created from it.",
          },
        ],
      },
      {
        id: "reminders",
        title: "Reminders",
        keywords: ["reminders", "bell", "notifications", "due", "overdue", "upcoming", "due today"],
        blocks: [
          {
            type: "p",
            text: "The bell icon in the top nav bar lists everything due across every project — to-do entries and tasks together, since from the point of view of what needs attention, they're the same kind of thing. Grouped as Overdue, Due today and Coming up (the next seven days).",
          },
          {
            type: "p",
            text: "Reminders live inside the app only — nothing is emailed or sent outside Chronicles. The list refreshes automatically every few minutes and whenever you switch back to the tab.",
          },
        ],
      },
    ],
  },
  {
    id: "google-calendar",
    title: "Google Calendar integration",
    articles: [
      {
        id: "connecting-google-calendar",
        title: "Connecting an account and what it syncs",
        keywords: ["google calendar", "calendar sync", "connect calendar", "calendar integration", "disconnect"],
        blocks: [
          {
            type: "p",
            text: "On the Calendar view, 'Connect Google Calendar' starts Google's sign-in flow and, once approved, pulls events from that account's primary calendar into the month view alongside your Chronicles entries. Access is read-only — Chronicles can see your events but never creates, edits or deletes anything on your Google Calendar.",
          },
          {
            type: "p",
            text: "You can connect more than one Google account ('+ Add Google account') and hide any of them from the view without disconnecting, using the checkbox next to each connected account. 'Disconnect' removes that account's events from view and revokes Chronicles' access to it.",
          },
          {
            type: "p",
            text: "A day's detail panel (opened by clicking a date, or 'View day') lists Google events, Chronicles entries logged that day, and any Chronicles 'activities' you've added directly on the calendar — a lightweight title-plus-time item saved only in Chronicles, for scheduling something that isn't a logbook entry or a Google event.",
          },
        ],
      },
    ],
  },
  {
    id: "mira",
    title: "Mira, the AI assistant",
    articles: [
      {
        id: "mira-assistant",
        title: "What Mira can do, and its consent requirement",
        keywords: ["mira", "ai assistant", "chatbot", "gemini", "consent", "permissions", "ai"],
        blocks: [
          {
            type: "p",
            text: "Mira is Chronicles' built-in assistant — a thinking partner for turning a rough note into a clear entry, planning a focused work session, or shaping an idea into a new project proposal. Open it from the Mira nav item, or the small launcher button that floats over every other page.",
          },
          {
            type: "p",
            text: "Before Mira can send your messages anywhere, you're asked to accept or decline: accepting sends what you type to Google Gemini to generate replies and project proposals; declining keeps Mira available in a limited, local-only mode that never contacts an AI provider. You can change this choice later from the 'Mira permissions' link on the Mira page.",
          },
          {
            type: "p",
            text: "Mira cannot read your saved projects, entries, tasks or calendar on its own, and it never creates anything without asking — a proposed project is shown as a card you must explicitly confirm or cancel before it's created. Conversation history lives only in your browser session and clears on refresh; that does not mean a provider you've consented to deletes what was already sent to it.",
          },
        ],
      },
    ],
  },
  {
    id: "personalization",
    title: "Personalizing your workspace",
    articles: [
      {
        id: "appearance-and-density",
        title: "Theme, accent colour, density and default page",
        keywords: ["theme", "dark mode", "light mode", "accent colour", "accent color", "density", "compact", "default page", "background", "ambient"],
        blocks: [
          {
            type: "p",
            text: "From Profile > Appearance, 'Switch theme' cycles between Light, Dark and System (matching your device). Workspace density toggles between Comfortable (more breathing room) and Compact (more on screen at once).",
          },
          {
            type: "p",
            text: "Profile > Workspace settings lets you pick an accent colour — Chronicles, Ocean, Forest or Rose. Besides recolouring controls and focus states, each accent gives the app's animated backdrop its own themed scene (folded violet planes, deep water, woodland light, or falling petals), which dims further in dark mode.",
          },
          {
            type: "p",
            text: "The same section lets you set your default opening page — Home, Today or Calendar — the view Chronicles takes you to right after signing in.",
          },
          {
            type: "p",
            text: "All of these are also offered as a short setup wizard the very first time you sign in, and can be revisited from Profile at any time.",
          },
        ],
      },
    ],
  },
  {
    id: "command-palette",
    title: "Command palette",
    articles: [
      {
        id: "using-command-palette",
        title: "Ctrl+K / Cmd+K quick actions",
        keywords: ["command palette", "ctrl k", "cmd k", "quick switcher", "search commands", "keyboard shortcut"],
        blocks: [
          {
            type: "p",
            text: "Press Ctrl+K (Cmd+K on a Mac) anywhere in the app, or click Search in the account menu, to open the command palette.",
          },
          {
            type: "p",
            text: "Type to filter. It can jump you straight to Today, Entries, Tasks, Board, Outstanding or Calendar, create a new project, open the help manual, or open any of your own projects by name.",
          },
          {
            type: "p",
            text: "Escape closes the palette; Ctrl/Cmd+K toggles it open and closed from anywhere.",
          },
        ],
      },
    ],
  },
  {
    id: "offline",
    title: "Working offline",
    articles: [
      {
        id: "working-offline",
        title: "Capturing offline and syncing back",
        keywords: ["offline", "no connection", "sync", "queued entries", "rejected entry", "pending", "not yet synced"],
        blocks: [
          {
            type: "p",
            text: "Entries you capture while offline are saved on your device immediately and shown in the entry list right away, marked 'Not yet synced', so nothing looks lost. A status pill near the top-right of the nav bar shows your connection state and how many entries are waiting.",
          },
          {
            type: "p",
            text: "Once you're back online, Chronicles syncs queued entries automatically, oldest first, and periodically retries in the background; you can also open the status pill and click 'Sync now' to force it.",
          },
          {
            type: "p",
            text: "If the server refuses a queued entry outright — its project was archived or deleted while you were offline, or its schema changed and the entry no longer fits — it's marked as needing attention rather than silently dropped. From the same panel you can edit its values and retry, retry it unchanged, or discard it for good, which asks for confirmation since it's the only copy of what you typed.",
          },
          {
            type: "p",
            text: "A session that simply expired while you were offline pauses syncing rather than rejecting your entries — nothing is wrong with the work itself.",
          },
        ],
      },
    ],
  },
  {
    id: "guided-tour",
    title: "The guided tour",
    articles: [
      {
        id: "replaying-the-tour",
        title: "The welcome tour, page hints, and replaying them",
        keywords: ["tour", "onboarding", "walkthrough", "hints", "tips", "replay tour", "coach mark"],
        blocks: [
          {
            type: "p",
            text: "The first time you sign in, a short four-step welcome tour points out where projects live, the main navigation, and where your account and sync status sit. It only ever runs once on its own.",
          },
          {
            type: "p",
            text: "Beyond that, the first time you open each page — Home, Today, All Entries, All Tasks, Board, Outstanding, Calendar, Mira, and Activity (with its Field Timeline view) — or each tab inside a project (Entries, Schema, Tasks, Statistics, Automation), a single dismissible coach mark explains what that page is for. Each one shows only once and never blocks what you were doing.",
          },
          {
            type: "p",
            text: "To see all of this again, go to Profile > Workspace settings > 'Replay tour'. It resets every tour and hint for your account, so they appear again as you revisit each page.",
          },
        ],
      },
    ],
  },
  {
    id: "account-privacy",
    title: "Account and privacy",
    articles: [
      {
        id: "account-and-privacy",
        title: "Your profile, signing out and deleting your account",
        keywords: ["profile", "account", "sign out", "delete account", "privacy", "email", "logout"],
        blocks: [
          {
            type: "p",
            text: "Your Profile page — reached from the account menu's avatar, or the command palette — shows your name, email and avatar as Google reports them, alongside the appearance and workspace settings described elsewhere in this manual.",
          },
          {
            type: "p",
            text: "'Sign out' ends your current session; you can sign back in with the same Google account at any time.",
          },
          {
            type: "p",
            text: "'Delete account', in the Danger zone, permanently deletes your Chronicles account and everything owned by it — every project, entry and task — and cannot be undone. To confirm, you have to type DELETE into a confirmation box.",
          },
        ],
      },
    ],
  },
]

export const HELP_ARTICLE_INDEX = HELP_SECTIONS.flatMap((section) =>
  section.articles.map((article) => ({ ...article, sectionId: section.id, sectionTitle: section.title }))
)

export default HELP_SECTIONS
