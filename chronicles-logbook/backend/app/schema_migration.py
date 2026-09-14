"""Editing a schema that already has entries (US-2.6, US-2.7).

Adding a field to an empty project is trivial. Doing it to a project with two
hundred entries is not, because every one of those entries was validated
against the old shape and has to satisfy the new one. Left alone, the entry
form would demand a value that no historical entry has, and the entry list
would show gaps it cannot explain.

Three rules make an edit safe:

  - a new field is backfilled on every existing entry with a default that
    suits its type, so the entry stays valid and the list stays complete;
  - a value that cannot survive the edit is moved to ``Entry.retired_data``
    rather than deleted, and the field's definition to
    ``Project.retired_schema`` so the value still has a label. "Removed from
    the schema" means "no longer offered", not "erased";
  - a field that comes back under the same id gets its retired value back.

The impact of an edit is worked out by running the migration against the real
entries and reporting what happened, then, if the user accepts, running it
again to write the result. Both paths call ``simulate``, so the review the
user approves cannot disagree with what is saved.
"""

from dataclasses import dataclass
from dataclasses import field as dataclass_field
from datetime import date, datetime
from typing import Any
from uuid import UUID

from app.computed import apply_computed_fields

# What happened to one field in an edit. The kinds are deliberately about the
# schema rather than about the data, because that is what the user changed and
# so what they need to see described back to them.
ADDED = "added"
REMOVED = "removed"
RENAMED = "renamed"
RETYPED = "retyped"
OPTIONS_CHANGED = "options_changed"
EXPRESSION_CHANGED = "expression_changed"
LINK_CHANGED = "link_changed"


@dataclass
class FieldChange:
    """One difference between the stored schema and the proposed one."""

    kind: str
    field_id: str
    field_name: str
    description: str
    entries_affected: int = 0
    values_coerced: int = 0
    values_retired: int = 0

    @property
    def severity(self) -> str:
        """``warning`` when data changes shape or leaves the live entry.

        Derived here rather than in the UI so that the review screen and the
        API agree on what counts as worth stopping for.
        """
        if self.values_retired or self.values_coerced:
            return "warning"
        return "info"


@dataclass
class MigratedEntry:
    """The result of migrating one entry, before anything is written."""

    entry: Any
    data: dict[str, Any]
    retired_data: dict[str, Any]

    @property
    def changed(self) -> bool:
        return self.data != self.entry.data or self.retired_data != self.entry.retired_data


@dataclass
class Simulation:
    """What an edit would do, in full, without having done any of it."""

    changes: list[FieldChange] = dataclass_field(default_factory=list)
    entries: list[MigratedEntry] = dataclass_field(default_factory=list)
    retired_schema: list[dict[str, Any]] = dataclass_field(default_factory=list)

    @property
    def entries_affected(self) -> int:
        return sum(1 for migrated in self.entries if migrated.changed)


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _as_text(value: Any) -> str:
    return "" if value is None else str(value)


def _coerce(
    value: Any,
    field: dict[str, Any],
    known_project_ids: dict[str, str] | set[str] | None,
) -> tuple[Any, bool]:
    """Read an existing value as the field's new type.

    Returns the value and whether it survived. A value that did not survive is
    retired rather than discarded, so this only has to decide what the new type
    can honestly represent — never what to throw away.
    """
    field_type = field.get("type")

    if value is None:
        return None, False

    if field_type == "text":
        # Anything can be written down, so a change to text never loses data.
        return (value, True) if isinstance(value, str) else (_as_text(value), True)

    if field_type == "number":
        if _is_number(value):
            return value, True
        if isinstance(value, str):
            try:
                number = float(value.strip())
            except ValueError:
                return None, False
            return (int(number) if number == int(number) else number), True
        return None, False

    if field_type == "date":
        if isinstance(value, str):
            try:
                date.fromisoformat(value[:10])
            except ValueError:
                return None, False
            return value[:10], True
        return None, False

    if field_type == "dropdown":
        text = value if isinstance(value, str) else _as_text(value)
        return (text, True) if text in (field.get("options") or []) else (None, False)

    if field_type == "project_reference":
        if not isinstance(value, str):
            return None, False
        try:
            canonical = str(UUID(value))
        except ValueError:
            return None, False
        if known_project_ids is not None and canonical not in known_project_ids:
            return None, False
        return canonical, True

    # A computed field's value is never carried over; it is derived again from
    # whatever the migrated entry ends up holding.
    return None, False


def _default_value(field: dict[str, Any], captured_at: datetime) -> Any:
    """The value a field takes on an entry written before it existed.

    A date defaults to the day the entry was captured rather than to today or
    to a blank: for a field added later, the entry's own date is the only
    honest guess available, and it keeps the column readable.
    """
    field_type = field.get("type")

    if field_type == "text":
        return ""
    if field_type == "number":
        return 0
    if field_type == "date":
        return captured_at.date().isoformat()
    if field_type == "dropdown":
        options = field.get("options") or []
        return options[0] if options else ""

    # A reference nobody has chosen yet, and a computed field with nothing to
    # compute from, are both genuinely unknown.
    return None


def describe_changes(
    current_schema: list[dict[str, Any]],
    proposed_schema: list[dict[str, Any]],
    project_names: dict[str, str] | None = None,
) -> list[FieldChange]:
    """The structural differences between two schemas, without counting data.

    Fields are matched by id, which is why the builder keeps ids stable across
    an edit: it is the difference between renaming a field and replacing it.
    ``project_names`` maps project ids to names, so a retargeted link can be
    described by the project it will point at.
    """
    current_by_id = {field["id"]: field for field in current_schema}
    proposed_by_id = {field["id"]: field for field in proposed_schema}
    changes: list[FieldChange] = []

    for field in proposed_schema:
        field_id = field["id"]
        previous = current_by_id.get(field_id)

        if previous is None:
            changes.append(
                FieldChange(
                    kind=ADDED,
                    field_id=field_id,
                    field_name=field["name"],
                    description=f"'{field['name']}' is new and will be filled in on past entries.",
                )
            )
            continue

        if previous.get("type") != field.get("type"):
            changes.append(
                FieldChange(
                    kind=RETYPED,
                    field_id=field_id,
                    field_name=field["name"],
                    description=(
                        f"'{field['name']}' changes from "
                        f"{_type_label(previous.get('type'))} to {_type_label(field.get('type'))}."
                    ),
                )
            )
        elif previous.get("options") != field.get("options") and field.get("type") == "dropdown":
            removed = [
                option
                for option in (previous.get("options") or [])
                if option not in (field.get("options") or [])
            ]
            description = f"The choices for '{field['name']}' change."
            if removed:
                description = (
                    f"'{', '.join(removed)}' "
                    f"{'is' if len(removed) == 1 else 'are'} no longer a choice "
                    f"for '{field['name']}'."
                )
            changes.append(
                FieldChange(
                    kind=OPTIONS_CHANGED,
                    field_id=field_id,
                    field_name=field["name"],
                    description=description,
                )
            )
        elif previous.get("expression") != field.get("expression"):
            changes.append(
                FieldChange(
                    kind=EXPRESSION_CHANGED,
                    field_id=field_id,
                    field_name=field["name"],
                    description=(
                        f"'{field['name']}' is worked out differently and will be "
                        f"recalculated on past entries."
                    ),
                )
            )
        elif (
            field.get("type") == "project_reference"
            and previous.get("linked_project_id") != field.get("linked_project_id")
        ):
            target = field.get("linked_project_id")
            target_name = (
                project_names.get(str(target)) if target and project_names else None
            )
            changes.append(
                FieldChange(
                    kind=LINK_CHANGED,
                    field_id=field_id,
                    field_name=field["name"],
                    description=(
                        f"'{field['name']}' will point at '{target_name}' and past "
                        f"entries will be relinked."
                        if target_name
                        else f"'{field['name']}' will point at a different project "
                        "and past entries will be relinked."
                    ),
                )
            )

        # A rename is reported alongside any of the above, because it is the
        # change the user will recognise in the entry list.
        if previous.get("name") != field.get("name"):
            changes.append(
                FieldChange(
                    kind=RENAMED,
                    field_id=field_id,
                    field_name=field["name"],
                    description=f"'{previous.get('name')}' is renamed to '{field['name']}'.",
                )
            )

    for field in current_schema:
        if field["id"] not in proposed_by_id:
            changes.append(
                FieldChange(
                    kind=REMOVED,
                    field_id=field["id"],
                    field_name=field["name"],
                    description=(
                        f"'{field['name']}' will no longer be asked for. What past "
                        f"entries recorded under it is kept, but hidden."
                    ),
                )
            )

    return changes


def _type_label(field_type: str | None) -> str:
    """The name for a field type as the builder shows it."""
    return {
        "text": "text",
        "number": "number",
        "date": "date",
        "dropdown": "a list of choices",
        "project_reference": "a project link",
        "computed": "a calculation",
    }.get(field_type or "", field_type or "unknown")


def migrate_entry_data(
    data: dict[str, Any],
    retired_data: dict[str, Any],
    captured_at: datetime,
    current_schema: list[dict[str, Any]],
    proposed_schema: list[dict[str, Any]],
    known_project_ids: dict[str, str] | set[str] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Reshape one entry's values to fit a new schema.

    Returns the new ``data`` and ``retired_data``. Neither argument is
    modified: the caller decides whether to keep the result.
    """
    proposed_by_id = {field["id"]: field for field in proposed_schema}
    current_by_id = {field["id"]: field for field in current_schema}
    new_data: dict[str, Any] = {}
    new_retired = dict(retired_data)

    for field in proposed_schema:
        field_id = field["id"]

        if field.get("type") == "computed":
            # Retire whatever was typed in before, then let the expression
            # fill the field once the rest of the entry is settled.
            if field_id in data and data[field_id] is not None:
                if current_by_id.get(field_id, {}).get("type") != "computed":
                    new_retired[field_id] = data[field_id]
            new_data[field_id] = None
            continue

        if field.get("type") == "project_reference" and field.get("linked_project_id"):
            # A link names its target once, in the schema, so it is re-pointed
            # here rather than coerced: whatever the entry held — a value
            # chosen per entry, before links moved into the schema, or the
            # previous target — the new target is what it will show.
            new_data[field_id] = str(field["linked_project_id"])
            new_retired.pop(field_id, None)
            continue

        # A field that was removed and then added back under the same id finds
        # its value waiting in retired_data.
        if field_id in data:
            source = data[field_id]
        else:
            source = new_retired.get(field_id)

        value, kept = _coerce(source, field, known_project_ids)

        if kept:
            new_data[field_id] = value
            new_retired.pop(field_id, None)
        else:
            if source is not None:
                new_retired[field_id] = source
            new_data[field_id] = _default_value(field, captured_at)

    for field_id, value in data.items():
        if field_id not in proposed_by_id and value is not None:
            new_retired[field_id] = value

    return apply_computed_fields(new_data, proposed_schema), new_retired


def _count_change(
    change: FieldChange,
    before: dict[str, Any],
    after: dict[str, Any],
    after_retired: dict[str, Any],
) -> None:
    """Fold one entry's outcome into the tally shown in the review."""
    field_id = change.field_id

    if change.kind == RENAMED:
        # A label change touches no data, and saying "200 entries affected"
        # about it would teach the user to ignore the warnings that matter.
        return

    if change.kind == REMOVED:
        if field_id in before and before[field_id] is not None:
            change.entries_affected += 1
            change.values_retired += 1
        return

    if change.kind == ADDED:
        change.entries_affected += 1
        return

    was = before.get(field_id)
    now = after.get(field_id)

    if was == now:
        return

    change.entries_affected += 1
    if field_id in after_retired and after_retired.get(field_id) == was:
        change.values_retired += 1
    elif was is not None:
        change.values_coerced += 1


def simulate(
    project: Any,
    entries: list[Any],
    proposed_schema: list[dict[str, Any]],
    known_project_ids: dict[str, str] | set[str] | None = None,
) -> Simulation:
    """Work out an edit in full without writing any of it.

    The preview endpoint returns this; the apply endpoint writes it. Running
    the same code for both is what makes the review honest.
    """
    current_schema = project.entry_schema or []
    changes = describe_changes(
        current_schema, proposed_schema, known_project_ids if isinstance(known_project_ids, dict) else None
    )

    result = Simulation(changes=changes)

    for entry in entries:
        data, retired = migrate_entry_data(
            entry.data or {},
            entry.retired_data or {},
            entry.created_at,
            current_schema,
            proposed_schema,
            known_project_ids,
        )
        result.entries.append(MigratedEntry(entry=entry, data=data, retired_data=retired))

        for change in changes:
            _count_change(change, entry.data or {}, data, retired)

    result.retired_schema = _merge_retired_schema(
        project.retired_schema or [],
        current_schema,
        proposed_schema,
    )

    return result


def _merge_retired_schema(
    retired_schema: list[dict[str, Any]],
    current_schema: list[dict[str, Any]],
    proposed_schema: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """The definitions needed to label whatever is now in retired_data.

    A field that has come back into the live schema is dropped from here, so
    the same id is never described twice.
    """
    proposed_ids = {field["id"] for field in proposed_schema}
    by_id = {
        field["id"]: field
        for field in retired_schema
        if field["id"] not in proposed_ids
    }

    for field in current_schema:
        if field["id"] not in proposed_ids:
            by_id[field["id"]] = field

    return list(by_id.values())
