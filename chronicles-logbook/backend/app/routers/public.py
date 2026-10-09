"""Reference information anyone may read, without signing in.

Everything here is **the same for every caller and holds no one's data**: it describes the API itself, the kinds
of field a logbook can have, and the limits the API enforces. It touches no database and reads no session, so it
costs next to nothing to serve, cannot leak anything, and needs no rate limit beyond the platform's. Someone
building against Chronicles needs exactly this before they have an account, which is why it is open.

Nothing that belongs to a person is ever added here. Counts of users, projects or entries are deliberately not
offered: they say how much Chronicles is used, and nobody needs that to build against it.
"""

from fastapi import APIRouter, Response

from app import statuses
from app.schemas import (
    MAX_CHECKLIST_ITEM_LENGTH,
    MAX_CHECKLIST_ITEMS,
    MAX_DUE_IN_DAYS,
    MAX_LONG_TEXT_LENGTH,
    MAX_RULE_CONDITIONS,
    MAX_RULES_PER_PROJECT,
    MAX_SHORT_TEXT_LENGTH,
    MAX_TAG_LENGTH,
    MAX_TAGS,
    MAX_TIME_SPENT_MINUTES,
    FieldType,
)
from app.search import MAX_CONDITIONS, OPERATORS_BY_TYPE

router = APIRouter(prefix="/public", tags=["Public reference"])

# Reference data changes only when the code does, so a browser or a CDN may keep it for an hour.
_CACHE = "public, max-age=3600"

# What each field type is, in the words the schema editor uses. A test fails if a type is added to
# ``FieldType`` without being described here, so the catalogue cannot quietly fall behind.
FIELD_TYPE_REFERENCE: dict[FieldType, dict[str, str | int | None]] = {
    FieldType.TEXT: {
        "label": "Short text",
        "description": "A name, a place or a line of writing.",
        "stores": "string",
        "max_length": MAX_SHORT_TEXT_LENGTH,
    },
    FieldType.LONG_TEXT: {
        "label": "Long text",
        "description": "Notes, a description or a paragraph.",
        "stores": "string",
        "max_length": MAX_LONG_TEXT_LENGTH,
    },
    FieldType.NUMBER: {"label": "Number", "description": "A figure you can add up.", "stores": "number"},
    FieldType.DATE: {"label": "Date", "description": "A calendar day.", "stores": "string, YYYY-MM-DD"},
    FieldType.DROPDOWN: {
        "label": "Choice",
        "description": "One option from a fixed list the schema defines.",
        "stores": "string, one of the field's options",
    },
    FieldType.TAGS: {
        "label": "Tags",
        "description": "Short labels you can filter entries by.",
        "stores": f"list of 1 to {MAX_TAGS} strings, each up to {MAX_TAG_LENGTH} characters",
    },
    FieldType.CHECKLIST: {
        "label": "Checklist",
        "description": "Sub-tasks ticked off inside the entry.",
        "stores": f"list of up to {MAX_CHECKLIST_ITEMS} items, each up to {MAX_CHECKLIST_ITEM_LENGTH} characters",
    },
    FieldType.LINK: {
        "label": "Entry link",
        "description": "Points at another entry in the same project.",
        "stores": "string, an entry id",
    },
    FieldType.PROJECT_REFERENCE: {
        "label": "Project link",
        "description": "Points at another of the owner's projects; the target is chosen in the schema.",
        "stores": "string, a project id (set by the server)",
    },
    FieldType.COMPUTED: {
        "label": "Calculation",
        "description": "Worked out from the number fields on the same entry using + - * / and brackets.",
        "stores": "number (set by the server; any value sent is ignored)",
    },
}


@router.get("/info")
async def api_info(response: Response):
    """What this API is and where its documentation is."""
    response.headers["Cache-Control"] = _CACHE
    return {
        "name": "Chronicles API",
        "description": "The API behind Chronicles, a digital logbook with entries shaped by the person using it.",
        "openapi": "/openapi.json",
        "interactive_docs": "/docs",
        "health": "/health",
        "authentication": {
            "scheme": "Bearer token (JWT)",
            "how": "Sign in with Google in the app; the app then sends the token in the Authorization header.",
            "public_endpoints": ["/health", "/public/info", "/public/field-types", "/public/limits"],
        },
    }


@router.get("/field-types")
async def field_types(response: Response):
    """Every field type a schema can use, what it stores, and how it can be searched."""
    response.headers["Cache-Control"] = _CACHE
    return [
        {
            "type": field_type.value,
            **FIELD_TYPE_REFERENCE[field_type],
            "search_operators": sorted(OPERATORS_BY_TYPE.get(field_type.value, set())),
        }
        for field_type in FieldType
    ]


@router.get("/limits")
async def limits(response: Response):
    """The limits the API enforces, read from the same constants the validation uses."""
    response.headers["Cache-Control"] = _CACHE
    return {
        "short_text_max_length": MAX_SHORT_TEXT_LENGTH,
        "long_text_max_length": MAX_LONG_TEXT_LENGTH,
        "tags_per_field": MAX_TAGS,
        "tag_max_length": MAX_TAG_LENGTH,
        "checklist_max_items": MAX_CHECKLIST_ITEMS,
        "checklist_item_max_length": MAX_CHECKLIST_ITEM_LENGTH,
        "time_spent_max_minutes": MAX_TIME_SPENT_MINUTES,
        "statuses_per_project": {"min": 2, "max": statuses.MAX_STATUSES},
        "rules_per_project": MAX_RULES_PER_PROJECT,
        "rule_max_conditions": MAX_RULE_CONDITIONS,
        "rule_max_days_ahead": MAX_DUE_IN_DAYS,
        "search_max_conditions": MAX_CONDITIONS,
        "project_name_max_length": 255,
        "project_description_max_length": 4000,
        "mira_message_max_length": 2000,
    }
