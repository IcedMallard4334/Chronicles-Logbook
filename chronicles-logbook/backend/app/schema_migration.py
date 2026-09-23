"""Editing a schema that already has entries (US-2.6, US-2.7).

Adding a field to an empty project is trivial. Doing it to a project with two
hundred entries is not — but the difficulty is not what it first looks like.
The tempting answer is to reshape every existing entry onto the new format:
backfill the new field, coerce what can be coerced, replace what cannot. That
keeps one tidy table, and it is wrong. It writes values into a logbook that
its owner never wrote, and it can turn a figure somebody recorded into a
default they did not choose. A logbook whose past changes when you edit a form
is not a record of anything.

So a schema change here touches **no entry data at all**. What it does:

  - the project takes the new format, and every entry written from now on is
    captured under it;
  - every existing entry keeps its own values, and keeps the format it was
    written under in ``Entry.schema_snapshot``, so an earlier version stays
    readable rather than breaking (the brief's requirement);
  - a field that leaves the live format keeps its definition in
    ``Project.retired_schema``, so values already recorded under it still have
    a label.

Reading is where the two formats meet: an entry is shown under the current
format wherever the field ids line up, and under its own snapshot wherever
they do not. That is a display decision, made fresh every time, and it can
never damage the record — which is the whole point of doing it there rather
than in the database.

The impact of an edit is worked out by running this against the real entries
and reporting what a reader would notice, then, if the user accepts, applying
the format change. Both paths call ``simulate``, so the review the user
approves cannot disagree with what is saved.
"""

from dataclasses import dataclass
from dataclasses import field as dataclass_field
from datetime import date
from typing import Any
from uuid import UUID

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

# Kinds where past entries can hold values the new format would not ask for
# again. Nothing is destroyed — the values stay on the entries and stay
# readable — but the reader is told, because "this field now means something
# different from what the older half of your logbook recorded" is worth
# knowing before you agree to it.
_DIVERGING = frozenset({REMOVED, RETYPED, OPTIONS_CHANGED, LINK_CHANGED})


@dataclass
class FieldChange:
    """One difference between the stored schema and the proposed one."""

    kind: str
    field_id: str
    field_name: str
    description: str
    # How many existing entries a reader would see differently because of this
    # change. For an added field: the entries that predate it and so have
    # nothing to show under it. For the rest: the entries holding a value the
    # new definition would not have produced.
    entries_affected: int = 0
    # Kept at zero. It counted values a migration rewrote in place, and
    # nothing is rewritten any more. It stays in the response so that a client
    # built against the older API still parses this one.
    values_coerced: int = 0
    # Values a reader will find under the entry's own format rather than under
    # the project's. "Retired" in the sense of no longer asked for, never in
    # the sense of gone.
    values_retired: int = 0

    @property
    def severity(self) -> str:
        """``warning`` when the live format stops asking for recorded values.

        Derived here rather than in the UI so that the review screen and the
        API agree on what is worth stopping for. It no longer means "you are
        about to lose something" — nothing is lost — but "part of your record
        will read under the older format from here on".
        """
        return "warning" if self.kind in _DIVERGING and self.values_retired else "info"


@dataclass
class PreservedEntry:
    """An existing entry and the format it goes on being read under.

    ``snapshot`` is what the entry was captured against. ``needs_snapshot`` is
    true for entries written before snapshots were stored, whose format has to
    be filled in from the schema that is about to be replaced — the last
    moment at which it is still knowable.

    ``diverges`` says only whether a reader will see this entry differently;
    the entry's own data is identical before and after either way.
    """

    entry: Any
    snapshot: list[dict[str, Any]]
    needs_snapshot: bool = False
    diverges: bool = False


@dataclass
class Simulation:
    """What an edit would do, in full, without having done any of it."""

    changes: list[FieldChange] = dataclass_field(default_factory=list)
    entries: list[PreservedEntry] = dataclass_field(default_factory=list)
    retired_schema: list[dict[str, Any]] = dataclass_field(default_factory=list)

    @property
    def entries_affected(self) -> int:
        return sum(1 for preserved in self.entries if preserved.diverges)


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def reads_as(value: Any, field: dict[str, Any]) -> bool:
    """Whether a recorded value still reads correctly under a field's new type.

    Nothing is converted here and nothing is written. This only decides
    whether the review should say that part of the record will be read under
    its original format from now on — and, at display time, whether a stored
    value can be shown in the current format's column at all.
    """
    field_type = field.get("type")

    if value is None or value == "":
        return True

    if field_type == "text":
        # Anything can be written down, so text can always show what is there.
        return True

    if field_type == "number":
        if _is_number(value):
            return True
        if isinstance(value, str):
            try:
                float(value.strip())
            except ValueError:
                return False
            return True
        return False

    if field_type == "date":
        if not isinstance(value, str):
            return False
        try:
            date.fromisoformat(value[:10])
        except ValueError:
            return False
        return True

    if field_type == "dropdown":
        return value in (field.get("options") or [])

    if field_type == "project_reference":
        if not isinstance(value, str):
            return False
        try:
            UUID(value)
        except ValueError:
            return False
        target = field.get("linked_project_id")
        return target is None or str(value) == str(target)

    if field_type == "tags":
        return isinstance(value, list) and all(isinstance(tag, str) for tag in value)

    if field_type == "checklist":
        return isinstance(value, list) and all(isinstance(item, dict) for item in value)

    if field_type == "link":
        return isinstance(value, str)

    # A calculation's stored figure came from the expression in force when the
    # entry was written. Under a new expression it is that older answer, which
    # is exactly what a record should keep.
    return field_type != "computed"


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
                    description=(
                        f"'{field['name']}' is new. Entries written from now on will "
                        "carry it; entries already written are left exactly as they are."
                    ),
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
                        f"{_type_label(previous.get('type'))} to "
                        f"{_type_label(field.get('type'))}. Entries already written "
                        "keep what they recorded."
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
                    f"{'is' if len(removed) == 1 else 'are'} no longer offered for "
                    f"'{field['name']}'. Entries that already chose "
                    f"{'it' if len(removed) == 1 else 'one of them'} keep it."
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
                        f"'{field['name']}' is worked out differently from now on. "
                        "Entries already written keep the figure they were saved with."
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
                        f"'{field['name']}' will point at '{target_name}' from now on. "
                        "Entries already written keep the project they pointed at."
                        if target_name
                        else f"'{field['name']}' will point at a different project from "
                        "now on. Entries already written keep the project they pointed at."
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
                        "entries recorded under it is kept and stays readable."
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
        "tags": "tags",
        "checklist": "a checklist",
        "link": "a link to another entry",
        "project_reference": "a project link",
        "computed": "a calculation",
    }.get(field_type or "", field_type or "unknown")


def entry_schema_for(entry: Any, project_schema: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The format one entry was written under.

    Entries captured before snapshots were stored have none; the project's
    current format is the closest honest answer for those, and is what they
    were already being read under before snapshots existed.
    """
    snapshot = getattr(entry, "schema_snapshot", None)
    return list(snapshot) if snapshot else list(project_schema or [])


def _count_change(
    change: FieldChange,
    entry_data: dict[str, Any],
    proposed_by_id: dict[str, dict[str, Any]],
) -> bool:
    """Fold one entry's outcome into the tally shown in the review.

    Returns whether this entry reads differently because of this change.
    """
    field_id = change.field_id

    if change.kind == RENAMED:
        # A label change touches no data, and saying "200 entries affected"
        # about it would teach the user to ignore the warnings that matter.
        return False

    if change.kind == ADDED:
        # Every entry that predates the field will show it as unrecorded.
        change.entries_affected += 1
        return True

    recorded = entry_data.get(field_id)
    if recorded is None or recorded == "":
        return False

    if change.kind == REMOVED:
        change.entries_affected += 1
        change.values_retired += 1
        return True

    # Retyped, options withdrawn, link retargeted, expression rewritten: the
    # value stays exactly as recorded. It only counts as divergence when the
    # new definition could not itself have produced it.
    if reads_as(recorded, proposed_by_id.get(field_id, {})):
        return False

    change.entries_affected += 1
    change.values_retired += 1
    return True


def simulate(
    project: Any,
    entries: list[Any],
    proposed_schema: list[dict[str, Any]],
    known_project_ids: dict[str, str] | set[str] | None = None,
) -> Simulation:
    """Work out an edit in full without writing any of it.

    The preview endpoint returns this; the apply endpoint writes it. Running
    the same code for both is what makes the review honest.

    ``known_project_ids`` maps project ids to names, so a retargeted link can
    be described by the project it will point at. It used to decide which
    references a migration was allowed to rewrite; nothing is rewritten now.
    """
    current_schema = project.entry_schema or []
    changes = describe_changes(
        current_schema,
        proposed_schema,
        known_project_ids if isinstance(known_project_ids, dict) else None,
    )

    result = Simulation(changes=changes)
    proposed_by_id = {field["id"]: field for field in proposed_schema}

    for entry in entries:
        data = entry.data or {}
        diverges = False
        for change in changes:
            if _count_change(change, data, proposed_by_id):
                diverges = True

        stored = getattr(entry, "schema_snapshot", None)
        result.entries.append(
            PreservedEntry(
                entry=entry,
                # Taken from the schema about to be replaced, which is the last
                # moment this entry's original format is knowable.
                snapshot=(
                    list(stored)
                    if stored
                    else [dict(field) for field in current_schema]
                ),
                needs_snapshot=not stored,
                diverges=diverges,
            )
        )

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
    """The definitions needed to label whatever past entries still hold.

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
