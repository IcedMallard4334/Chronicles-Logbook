"""Editing a schema, and what it does (or doesn't do) to existing entries.

A schema edit only ever changes the *project* — ``entry_schema`` and
``schema_version`` — never an entry that has already been saved. Every entry
keeps recording under the exact shape (``schema_snapshot``) it was created
with, permanently, until someone deliberately edits that one entry and
chooses to bring it up to date. Nothing reaches back and rewrites history on
its own: not adding a field, not removing one, not saving the schema at all.

That "bring up to date" choice is what this module actually migrates. Two
rules govern it, applied to one entry at a time, at the moment someone opts
in:

  - a field the entry didn't have gets a default that suits its type, so the
    edit form has something to start from;
  - a value that cannot survive the shape it is moving to is moved to
    ``Entry.retired_data`` rather than dropped, and the field's definition to
    ``Project.retired_schema`` so the value still has a label. "No longer in
    this entry's shape" means "kept but hidden", not "erased".

The same ``simulate``/``migrate_entry_data`` pair backs two call sites: a
preview before a schema save (which no longer touches any entry — its output
describes the shape *new* entries will use, nothing more) and a preview
before migrating one specific entry during an edit. Both run the real
migration and report what it produced, so neither review can disagree with
what a save actually does.
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
    scope: str = "project",
) -> list[FieldChange]:
    """The structural differences between two schemas, without counting data.

    Fields are matched by id, which is why the builder keeps ids stable across
    an edit: it is the difference between renaming a field and replacing it.
    ``project_names`` maps project ids to names, so a retargeted link can be
    described by the project it will point at.

    ``scope`` picks which of two true things to say, since this same diff
    backs two different reviews:

      - ``"project"`` (a schema save, which touches no entry): describes what
        changes for *new* entries, and says plainly that existing ones keep
        recording under their current shape.
      - ``"entry"`` (migrating one specific entry during an edit): describes
        what changing *this entry's* shape right now will do.
    """
    for_entry = scope == "entry"
    current_by_id = {field["id"]: field for field in current_schema}
    proposed_by_id = {field["id"]: field for field in proposed_schema}
    changes: list[FieldChange] = []

    for field in proposed_schema:
        field_id = field["id"]
        previous = current_by_id.get(field_id)

        if previous is None:
            description = (
                f"'{field['name']}' is added to this entry, with a starting value you can fill in."
                if for_entry
                else f"'{field['name']}' is new. Entries already recorded won't show it until "
                "they're individually updated to the current schema."
            )
            changes.append(
                FieldChange(kind=ADDED, field_id=field_id, field_name=field["name"], description=description)
            )
            continue

        if previous.get("type") != field.get("type"):
            description = (
                f"'{field['name']}' becomes {_type_label(field.get('type'))} on this entry "
                f"(it was {_type_label(previous.get('type'))})."
                if for_entry
                else f"'{field['name']}' changes from {_type_label(previous.get('type'))} to "
                f"{_type_label(field.get('type'))} for new entries. Entries already recorded "
                "keep the old type until they're individually updated."
            )
            changes.append(
                FieldChange(kind=RETYPED, field_id=field_id, field_name=field["name"], description=description)
            )
        elif previous.get("options") != field.get("options") and field.get("type") == "dropdown":
            removed = [
                option
                for option in (previous.get("options") or [])
                if option not in (field.get("options") or [])
            ]
            if for_entry:
                description = f"The choices for '{field['name']}' change on this entry."
                if removed:
                    description = (
                        f"'{', '.join(removed)}' "
                        f"{'is' if len(removed) == 1 else 'are'} no longer a choice "
                        f"for '{field['name']}' on this entry."
                    )
            else:
                description = f"The choices for '{field['name']}' change for new entries."
                if removed:
                    description = (
                        f"'{', '.join(removed)}' "
                        f"{'is' if len(removed) == 1 else 'are'} no longer offered for "
                        f"'{field['name']}' on new entries. Entries already recorded keep "
                        "whatever they already have until individually updated."
                    )
            changes.append(
                FieldChange(kind=OPTIONS_CHANGED, field_id=field_id, field_name=field["name"], description=description)
            )
        elif previous.get("expression") != field.get("expression"):
            description = (
                f"'{field['name']}' is recalculated for this entry from its new formula."
                if for_entry
                else f"'{field['name']}' is worked out differently from now on. Entries already "
                "recorded keep their previously calculated value until individually updated."
            )
            changes.append(
                FieldChange(kind=EXPRESSION_CHANGED, field_id=field_id, field_name=field["name"], description=description)
            )
        elif (
            field.get("type") == "project_reference"
            and previous.get("linked_project_id") != field.get("linked_project_id")
        ):
            target = field.get("linked_project_id")
            target_name = (
                project_names.get(str(target)) if target and project_names else None
            )
            target_phrase = f"'{target_name}'" if target_name else "a different project"
            description = (
                f"'{field['name']}' will point at {target_phrase} on this entry."
                if for_entry
                else f"'{field['name']}' will point at {target_phrase} for new entries. Entries "
                "already recorded keep pointing at what they already have until individually "
                "updated."
            )
            changes.append(
                FieldChange(kind=LINK_CHANGED, field_id=field_id, field_name=field["name"], description=description)
            )

        # A rename is reported alongside any of the above, because it is the
        # change the user will recognise in the entry list.
        if previous.get("name") != field.get("name"):
            description = (
                f"'{previous.get('name')}' is renamed to '{field['name']}' on this entry."
                if for_entry
                else f"'{previous.get('name')}' is renamed to '{field['name']}' for new entries. "
                f"Entries already recorded keep showing '{previous.get('name')}' until "
                "individually updated."
            )
            changes.append(
                FieldChange(kind=RENAMED, field_id=field_id, field_name=field["name"], description=description)
            )

    for field in current_schema:
        if field["id"] not in proposed_by_id:
            description = (
                f"'{field['name']}' is removed from this entry. What it recorded is kept, but hidden."
                if for_entry
                else f"'{field['name']}' will no longer be asked for on new entries. Entries "
                "already recorded keep it exactly as recorded, unless individually updated."
            )
            changes.append(
                FieldChange(kind=REMOVED, field_id=field["id"], field_name=field["name"], description=description)
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
    """Describe what saving this schema would change, going forward.

    ``entries`` is always ``[]`` for an ordinary schema save now — a save
    touches no entry, so there is nothing to migrate and nothing to count.
    The loop below only still runs anything when a caller explicitly passes
    entries in, which nothing in this codebase does anymore; it is kept
    rather than deleted only because ``describe_changes``/``migrate_entry_data``
    still need one shared place that knows how to fold a migrated entry's
    outcome into ``FieldChange`` counts, and that place is here.
    """
    current_schema = project.entry_schema or []
    changes = describe_changes(
        current_schema,
        proposed_schema,
        known_project_ids if isinstance(known_project_ids, dict) else None,
        scope="project",
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


def simulate_entry_migration(
    entry: Any,
    target_schema: list[dict[str, Any]],
    known_project_ids: dict[str, str] | set[str] | None = None,
) -> Simulation:
    """What bringing one entry up to ``target_schema`` would do, unwritten.

    The entry-edit equivalent of ``simulate``: the "current" shape is this
    one entry's own ``schema_snapshot`` (not the project's schema — the two
    may have long since diverged, that's the whole point of an entry staying
    frozen), and the "proposed" shape is whatever it would be migrated to.
    """
    current_schema = entry.schema_snapshot or []
    changes = describe_changes(current_schema, target_schema, scope="entry")

    data, retired = migrate_entry_data(
        entry.data or {},
        entry.retired_data or {},
        entry.created_at,
        current_schema,
        target_schema,
        known_project_ids,
    )

    for change in changes:
        _count_change(change, entry.data or {}, data, retired)

    return Simulation(
        changes=changes,
        entries=[MigratedEntry(entry=entry, data=data, retired_data=retired)],
    )


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
