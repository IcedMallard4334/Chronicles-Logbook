"""Entry statuses.

Every project tracks entries through an ordered list of statuses, each of which
either counts as done or not. The default pair, "Still to do" and "Done", is
what every project had before statuses could be customised. An entry's ``todo``
flag is always derived from its status, so everything that already reads
``todo`` (Outstanding, reminders, search) keeps working.
"""

from typing import Any

DEFAULT_STATUSES: list[dict[str, Any]] = [
    {"name": "Still to do", "done": False},
    {"name": "Done", "done": True},
]

MAX_STATUSES = 8


def statuses_of(raw: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """A project's statuses, or the default pair when it has never set any."""
    return [dict(item) for item in raw] if raw else [dict(item) for item in DEFAULT_STATUSES]


def names_of(statuses: list[dict[str, Any]]) -> list[str]:
    return [item["name"] for item in statuses]


def is_done(statuses: list[dict[str, Any]], name: str) -> bool:
    return any(item["name"] == name and item["done"] for item in statuses)


def default_name(statuses: list[dict[str, Any]], todo: bool) -> str:
    """The first status whose done-ness matches: the one a new entry starts in."""
    wanted_done = not todo
    for item in statuses:
        if item["done"] == wanted_done:
            return item["name"]
    return statuses[0]["name"]


def reconcile(statuses: list[dict[str, Any]], status: str | None, todo: bool) -> str:
    """Keep *status* if it is valid and agrees with *todo*; otherwise use the default."""
    if status in names_of(statuses) and (not is_done(statuses, status)) == bool(todo):
        return status
    return default_name(statuses, bool(todo))
