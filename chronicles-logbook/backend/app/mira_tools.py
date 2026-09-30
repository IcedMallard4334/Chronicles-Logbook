"""What Mira may propose doing, and how a proposal is checked.

Mira never changes anything herself. A model reply can contain function calls;
each one is validated here against a closed list and returned to the browser as
a *proposal*. The browser shows it, and only when the signed-in person confirms
does it run — through the same authenticated API a manual action uses, so every
ordinary permission and validation rule applies to it too.

Projects, fields, entries, tasks and activities are referred to the way a person
would (by name) or by the id Mira was shown in her context. Resolving those to
real records happens in the browser, at the moment of confirming, against what
actually exists then.
"""

from datetime import date
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError, field_validator

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
Ref = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=4000)]
Clock = Annotated[str, StringConstraints(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")]

FIELD_TYPES = ("text", "number", "date", "dropdown", "tags", "checklist", "computed")

PAGES = (
    "home", "today", "outstanding", "activities", "entries", "tasks", "board",
    "calendar", "statistics", "assistant", "profile", "help",
)


class _Args(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FieldSpec(_Args):
    name: Name
    type: Literal["text", "number", "date", "dropdown", "tags", "checklist", "computed"] = "text"
    options: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]] | None = Field(
        default=None, max_length=30
    )
    expression: str | None = Field(default=None, max_length=500)


class StatusSpec(_Args):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    done: bool = False


class CreateProject(_Args):
    name: Name
    description: ShortText | None = None
    fields: list[FieldSpec] = Field(default_factory=list, max_length=40)
    statuses: list[StatusSpec] | None = Field(default=None, max_length=8)


class UpdateProject(_Args):
    project: Ref
    name: Name | None = None
    description: ShortText | None = None


class SetStatuses(_Args):
    project: Ref
    statuses: list[StatusSpec] = Field(min_length=2, max_length=8)


class ArchiveProject(_Args):
    project: Ref
    archive: bool = True


class DeleteProject(_Args):
    project: Ref


class AddField(_Args):
    project: Ref
    field: FieldSpec


class RenameField(_Args):
    project: Ref
    field: Ref
    new_name: Name


class RemoveField(_Args):
    project: Ref
    field: Ref


class CreateEntry(_Args):
    project: Ref
    values: dict[str, Any] = Field(default_factory=dict)
    title: Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)] | None = None
    time_spent_minutes: int | None = Field(default=None, ge=0, le=100000)
    todo: bool | None = None
    status: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)] | None = None
    due_date: date | None = None
    due_time: Clock | None = None


class UpdateEntry(_Args):
    entry: Ref
    values: dict[str, Any] | None = None
    title: Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)] | None = None
    time_spent_minutes: int | None = Field(default=None, ge=0, le=100000)
    todo: bool | None = None
    status: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)] | None = None
    due_date: date | None = None
    due_time: Clock | None = None


class DeleteEntry(_Args):
    entry: Ref


class CreateTask(_Args):
    project: Ref
    title: Name
    description: ShortText | None = None
    due_date: date | None = None
    checklist: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]] = Field(
        default_factory=list, max_length=20
    )


class UpdateTask(_Args):
    task: Ref
    title: Name | None = None
    description: ShortText | None = None
    due_date: date | None = None


class CompleteTask(_Args):
    task: Ref
    completed: bool = True


class DeleteTask(_Args):
    task: Ref


class CreateActivity(_Args):
    title: Name
    day: date
    all_day: bool = False
    start_time: Clock | None = None
    end_time: Clock | None = None
    description: ShortText | None = None


class UpdateActivity(_Args):
    activity: Ref
    title: Name | None = None
    day: date | None = None
    all_day: bool | None = None
    start_time: Clock | None = None
    end_time: Clock | None = None
    description: ShortText | None = None


class DeleteActivity(_Args):
    activity: Ref


class SetReminder(_Args):
    kind: Literal["task", "entry"]
    target: Ref
    due_date: date
    due_time: Clock | None = None


class SetRecurrence(_Args):
    entry: Ref
    frequency: Literal["daily", "weekly", "monthly"]
    interval: int = Field(default=1, ge=1, le=365)
    ends_on: date | None = None


class StopRecurrence(_Args):
    entry: Ref


class RuleCondition(_Args):
    field: Ref
    operator: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)] = "equals"
    value: Any = None


class RuleAction(_Args):
    type: Literal["mark_todo", "add_tags", "set_field"]
    field: Ref | None = None
    tags: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]] | None = Field(
        default=None, max_length=10
    )
    value: Any = None
    due_in_days: int | None = Field(default=None, ge=0, le=365)

    @field_validator("field")
    @classmethod
    def blank_to_none(cls, value):
        return value or None


class CreateRule(_Args):
    project: Ref
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    match: Literal["all", "any"] = "all"
    conditions: list[RuleCondition] = Field(default_factory=list, max_length=10)
    actions: list[RuleAction] = Field(min_length=1, max_length=5)


class ShareProject(_Args):
    project: Ref
    email: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=320)]


class CreateStatistic(_Args):
    project: Ref
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    expression: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class OpenPage(_Args):
    page: Literal[
        "home", "today", "outstanding", "activities", "entries", "tasks", "board",
        "calendar", "statistics", "assistant", "profile", "help",
    ]


class SetTheme(_Args):
    theme: Literal["light", "dark", "system"]


# ── Declarations handed to the model ─────────────────────────────────


def _s(description: str, **extra: Any) -> dict[str, Any]:
    return {"type": "string", "description": description, **extra}


def _n(description: str) -> dict[str, Any]:
    return {"type": "number", "description": description}


def _b(description: str) -> dict[str, Any]:
    return {"type": "boolean", "description": description}


def _arr(items: dict[str, Any], description: str) -> dict[str, Any]:
    return {"type": "array", "items": items, "description": description}


def _obj(properties: dict[str, Any], required: list[str] | None = None, description: str = "") -> dict[str, Any]:
    body: dict[str, Any] = {"type": "object", "properties": properties}
    if required:
        body["required"] = required
    if description:
        body["description"] = description
    return body


_PROJECT = _s("The project: its name as the person says it, or its id from your context.")
_DATE = _s("A date as YYYY-MM-DD.")
_CLOCK = _s("A time of day as HH:MM, 24-hour.")
_FIELD_SPEC = _obj(
    {
        "name": _s("Field label."),
        "type": _s("Field type.", enum=list(FIELD_TYPES)),
        "options": _arr({"type": "string"}, "Choices, for a dropdown field."),
        "expression": _s("For a computed field: arithmetic over other fields, each written as {Field name}."),
    },
    ["name"],
)
_STATUS_SPEC = _obj(
    {"name": _s("Status name."), "done": _b("True when work in this status counts as finished.")},
    ["name"],
)
_ENTRY_EXTRAS = {
    "title": _s("Optional short title."),
    "time_spent_minutes": _n("Minutes spent."),
    "todo": _b("True when the work is still to do."),
    "status": _s("One of the project's statuses."),
    "due_date": _DATE,
    "due_time": _CLOCK,
}


def _tool(name: str, description: str, properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {
        "type": "function",
        "name": name,
        "description": description,
        "parameters": _obj(properties, required or []),
    }


# name -> (declaration, argument model, destructive)
TOOLS: dict[str, tuple[dict[str, Any], type[_Args], bool]] = {}


def _register(declaration: dict[str, Any], model: type[_Args], destructive: bool = False) -> None:
    TOOLS[declaration["name"]] = (declaration, model, destructive)


_register(_tool("create_project", "Create a new project, optionally with its fields and statuses.", {
    "name": _s("Project name."), "description": _s("Short description."),
    "fields": _arr(_FIELD_SPEC, "The fields each entry records."),
    "statuses": _arr(_STATUS_SPEC, "Ordered statuses entries move through (2 to 8)."),
}, ["name"]), CreateProject)
_register(_tool("update_project", "Rename a project or change its description.", {
    "project": _PROJECT, "name": _s("New name."), "description": _s("New description."),
}, ["project"]), UpdateProject)
_register(_tool("set_statuses", "Replace the statuses a project's entries move through.", {
    "project": _PROJECT, "statuses": _arr(_STATUS_SPEC, "Ordered statuses, at least one finished and one not."),
}, ["project", "statuses"]), SetStatuses)
_register(_tool("archive_project", "Archive a project (or unarchive it with archive=false).", {
    "project": _PROJECT, "archive": _b("False to unarchive."),
}, ["project"]), ArchiveProject)
_register(_tool("delete_project", "Permanently delete a project and everything in it.", {"project": _PROJECT}, ["project"]), DeleteProject, True)
_register(_tool("add_field", "Add a field to a project's schema.", {"project": _PROJECT, "field": _FIELD_SPEC}, ["project", "field"]), AddField)
_register(_tool("rename_field", "Rename a field in a project's schema.", {
    "project": _PROJECT, "field": _s("The field's current name."), "new_name": _s("The new name."),
}, ["project", "field", "new_name"]), RenameField)
_register(_tool("remove_field", "Remove a field from a project's schema. Values already recorded are kept.", {
    "project": _PROJECT, "field": _s("The field's name."),
}, ["project", "field"]), RemoveField)
_register(_tool("create_entry", "Log an entry in a project. Use values for the project's fields, keyed by field name.", {
    "project": _PROJECT,
    "values": {"type": "object", "description": "Field name to value. Tags are a list of strings."},
    **_ENTRY_EXTRAS,
}, ["project"]), CreateEntry)
_register(_tool("update_entry", "Change an existing entry (id from your context).", {
    "entry": _s("The entry's id."),
    "values": {"type": "object", "description": "Field name to new value."},
    **_ENTRY_EXTRAS,
}, ["entry"]), UpdateEntry)
_register(_tool("delete_entry", "Delete an entry (it can be restored from the project's deleted entries).", {
    "entry": _s("The entry's id."),
}, ["entry"]), DeleteEntry, True)
_register(_tool("create_task", "Add a task to a project.", {
    "project": _PROJECT, "title": _s("Task title."), "description": _s("Details."), "due_date": _DATE,
    "checklist": _arr({"type": "string"}, "Checklist item texts, each under 30 characters."),
}, ["project", "title"]), CreateTask)
_register(_tool("update_task", "Change a task (id from your context).", {
    "task": _s("The task's id."), "title": _s("New title."), "description": _s("New details."), "due_date": _DATE,
}, ["task"]), UpdateTask)
_register(_tool("complete_task", "Mark a task done, or reopen it with completed=false.", {
    "task": _s("The task's id."), "completed": _b("False to reopen."),
}, ["task"]), CompleteTask)
_register(_tool("delete_task", "Delete a task.", {"task": _s("The task's id.")}, ["task"]), DeleteTask, True)
_register(_tool("create_activity", "Schedule an activity on the calendar (saved in Chronicles, not Google).", {
    "title": _s("Activity title."), "day": _DATE, "all_day": _b("True for an all-day activity."),
    "start_time": _CLOCK, "end_time": _CLOCK, "description": _s("Notes."),
}, ["title", "day"]), CreateActivity)
_register(_tool("update_activity", "Change a scheduled activity (id from your context).", {
    "activity": _s("The activity's id."), "title": _s("New title."), "day": _DATE, "all_day": _b("All day?"),
    "start_time": _CLOCK, "end_time": _CLOCK, "description": _s("Notes."),
}, ["activity"]), UpdateActivity)
_register(_tool("delete_activity", "Delete a scheduled activity.", {"activity": _s("The activity's id.")}, ["activity"]), DeleteActivity, True)
_register(_tool("set_reminder", "Set when a task or entry is due, so it appears in Reminders.", {
    "kind": _s("What to remind about.", enum=["task", "entry"]),
    "target": _s("The task's or entry's id."), "due_date": _DATE, "due_time": _CLOCK,
}, ["kind", "target", "due_date"]), SetReminder)
_register(_tool("set_recurrence", "Make an entry repeat.", {
    "entry": _s("The entry's id."), "frequency": _s("How often.", enum=["daily", "weekly", "monthly"]),
    "interval": _n("Every N periods."), "ends_on": _DATE,
}, ["entry", "frequency"]), SetRecurrence)
_register(_tool("stop_recurrence", "Stop an entry repeating.", {"entry": _s("The entry's id.")}, ["entry"]), StopRecurrence)
_register(_tool("create_rule", "Create an automation rule that runs when a new entry is saved in a project.", {
    "project": _PROJECT, "name": _s("Rule name."),
    "match": _s("Whether all or any condition must hold.", enum=["all", "any"]),
    "conditions": _arr(_obj({
        "field": _s("Field name."), "operator": _s("equals, contains, gt, lt, ..."), "value": {"type": "string", "description": "Value to compare."},
    }, ["field"]), "When the rule applies; none means every new entry."),
    "actions": _arr(_obj({
        "type": _s("What to do.", enum=["mark_todo", "add_tags", "set_field"]),
        "field": _s("Field name, for add_tags and set_field."),
        "tags": _arr({"type": "string"}, "Tags to add."), "value": {"type": "string", "description": "Value to set."},
        "due_in_days": _n("For mark_todo: due this many days after capture."),
    }, ["type"]), "What the rule does."),
}, ["project", "name", "actions"]), CreateRule)
_register(_tool("share_project", "Invite someone to a project by email.", {
    "project": _PROJECT, "email": _s("Their email address."),
}, ["project", "email"]), ShareProject)
_register(_tool("create_statistic", "Save a custom statistic over a project's entries.", {
    "project": _PROJECT, "name": _s("Statistic name."),
    "expression": _s("Arithmetic over the project's fields, e.g. SUM({Hours})."),
}, ["project", "name", "expression"]), CreateStatistic)
_register(_tool("open_page", "Take the person to a page of the app.", {
    "page": _s("The page.", enum=list(PAGES)),
}, ["page"]), OpenPage)
_register(_tool("set_theme", "Switch the app's colour theme.", {
    "theme": _s("Theme.", enum=["light", "dark", "system"]),
}, ["theme"]), SetTheme)

DECLARATIONS = [declaration for declaration, _model, _destructive in TOOLS.values()]


class InvalidProposal(ValueError):
    """A function call the model made that can't be turned into a safe proposal."""


def validate_call(name: str, arguments: Any) -> dict[str, Any]:
    """Check one function call and return the proposal to send to the browser."""
    if name not in TOOLS:
        raise InvalidProposal(f"'{name}' is not something Mira can do.")
    if not isinstance(arguments, dict):
        raise InvalidProposal("The request was not well formed.")
    _declaration, model, destructive = TOOLS[name]
    try:
        payload = model.model_validate(arguments).model_dump(mode="json", exclude_none=True)
    except ValidationError as error:
        first = error.errors()[0]
        where = ".".join(str(part) for part in first["loc"]) or "request"
        raise InvalidProposal(f"{where}: {first['msg']}") from error
    return {
        "type": name,
        "payload": payload,
        "requires_confirmation": True,
        "destructive": destructive,
        "summary": summarise(name, payload),
    }


def _ref(value: str) -> str:
    return f"“{value}”"


def summarise(name: str, p: dict[str, Any]) -> str:
    """One plain sentence describing what a proposal will do."""
    match name:
        case "create_project":
            extra = f" with {len(p['fields'])} field{'s' if len(p['fields']) != 1 else ''}" if p.get("fields") else ""
            return f"Create project {_ref(p['name'])}{extra}"
        case "update_project":
            return f"Update project {_ref(p['project'])}" + (f" (rename to {_ref(p['name'])})" if p.get("name") else "")
        case "set_statuses":
            return f"Set the statuses of {_ref(p['project'])} to {', '.join(s['name'] for s in p['statuses'])}"
        case "archive_project":
            return f"{'Archive' if p.get('archive', True) else 'Unarchive'} project {_ref(p['project'])}"
        case "delete_project":
            return f"Delete project {_ref(p['project'])} and everything in it"
        case "add_field":
            return f"Add the field {_ref(p['field']['name'])} ({p['field'].get('type', 'text')}) to {_ref(p['project'])}"
        case "rename_field":
            return f"Rename the field {_ref(p['field'])} to {_ref(p['new_name'])} in {_ref(p['project'])}"
        case "remove_field":
            return f"Remove the field {_ref(p['field'])} from {_ref(p['project'])} (recorded values are kept)"
        case "create_entry":
            return f"Log an entry in {_ref(p['project'])}" + (f": {p['title']}" if p.get("title") else "")
        case "update_entry":
            return "Update an entry"
        case "delete_entry":
            return "Delete an entry"
        case "create_task":
            due = f", due {p['due_date']}" if p.get("due_date") else ""
            return f"Add the task {_ref(p['title'])} to {_ref(p['project'])}{due}"
        case "update_task":
            return "Update a task"
        case "complete_task":
            return "Mark a task done" if p.get("completed", True) else "Reopen a task"
        case "delete_task":
            return "Delete a task"
        case "create_activity":
            return f"Schedule {_ref(p['title'])} on {p['day']}"
        case "update_activity":
            return "Update a scheduled activity"
        case "delete_activity":
            return "Delete a scheduled activity"
        case "set_reminder":
            at = f" at {p['due_time']}" if p.get("due_time") else ""
            return f"Remind you about a {p['kind']} on {p['due_date']}{at}"
        case "set_recurrence":
            unit = {"daily": "day", "weekly": "week", "monthly": "month"}[p["frequency"]]
            count = p.get("interval", 1)
            return f"Repeat an entry every {unit}" if count == 1 else f"Repeat an entry every {count} {unit}s"
        case "stop_recurrence":
            return "Stop an entry repeating"
        case "create_rule":
            return f"Create the rule {_ref(p['name'])} in {_ref(p['project'])}"
        case "share_project":
            return f"Invite {p['email']} to {_ref(p['project'])}"
        case "create_statistic":
            return f"Save the statistic {_ref(p['name'])} for {_ref(p['project'])}"
        case "open_page":
            return f"Open the {p['page']} page"
        case "set_theme":
            return f"Switch to the {p['theme']} theme"
    return name
