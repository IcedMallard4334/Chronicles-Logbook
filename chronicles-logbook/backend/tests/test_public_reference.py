"""The public reference endpoints: open to anyone, the same for everyone, and never anyone's data."""

from app.routers.public import FIELD_TYPE_REFERENCE
from app.schemas import (
    MAX_LONG_TEXT_LENGTH,
    MAX_SHORT_TEXT_LENGTH,
    MAX_TIME_SPENT_MINUTES,
    FieldType,
)

PUBLIC_PATHS = ["/public/info", "/public/field-types", "/public/limits"]


async def test_the_public_endpoints_need_no_sign_in(async_client):
    for path in PUBLIC_PATHS:
        response = await async_client.get(path)
        assert response.status_code == 200, path


async def test_the_public_endpoints_are_cacheable_because_they_never_change_per_caller(async_client):
    for path in PUBLIC_PATHS:
        assert "max-age" in (await async_client.get(path)).headers["cache-control"]


async def test_every_field_type_is_described_so_the_catalogue_cannot_fall_behind():
    assert set(FIELD_TYPE_REFERENCE) == set(FieldType)


async def test_the_catalogue_lists_every_type_with_what_it_stores(async_client):
    types = {item["type"]: item for item in (await async_client.get("/public/field-types")).json()}

    assert set(types) == {field_type.value for field_type in FieldType}
    assert types["text"]["max_length"] == MAX_SHORT_TEXT_LENGTH
    assert types["long_text"]["max_length"] == MAX_LONG_TEXT_LENGTH
    assert types["number"]["label"] == "Number"
    assert all(item["stores"] and item["description"] for item in types.values())


async def test_search_operators_come_from_the_search_module_itself(async_client):
    types = {item["type"]: item for item in (await async_client.get("/public/field-types")).json()}

    assert types["number"]["search_operators"] == ["between", "equals", "gt", "gte", "lt", "lte"]
    assert types["tags"]["search_operators"] == ["has", "has_all", "has_any"]
    # A type with no structured search says so with an empty list, not by being left out.
    assert all(isinstance(item["search_operators"], list) for item in types.values())


async def test_the_limits_are_the_ones_validation_enforces(async_client, authenticated_client):
    limits = (await async_client.get("/public/limits")).json()

    assert limits["short_text_max_length"] == MAX_SHORT_TEXT_LENGTH
    assert limits["time_spent_max_minutes"] == MAX_TIME_SPENT_MINUTES
    assert limits["statuses_per_project"] == {"min": 2, "max": 8}

    # And the advertised project name limit really is the limit.
    too_long = await authenticated_client.post(
        "/projects", json={"name": "x" * (limits["project_name_max_length"] + 1), "entry_schema": []}
    )
    assert too_long.status_code == 422
    at_limit = await authenticated_client.post(
        "/projects", json={"name": "x" * limits["project_name_max_length"], "entry_schema": []}
    )
    assert at_limit.status_code == 201


async def test_info_says_which_endpoints_are_public_and_how_to_sign_in(async_client):
    info = (await async_client.get("/public/info")).json()

    assert info["name"] == "Chronicles API"
    assert set(PUBLIC_PATHS) <= set(info["authentication"]["public_endpoints"])
    assert info["openapi"] == "/openapi.json"


async def test_nothing_that_belongs_to_a_person_is_in_any_public_response(async_client, test_user):
    text = ""
    for path in PUBLIC_PATHS + ["/health"]:
        text += (await async_client.get(path)).text

    assert test_user.email not in text
    assert str(test_user.id) not in text


async def test_the_public_endpoints_only_read(async_client):
    for path in PUBLIC_PATHS:
        assert (await async_client.post(path)).status_code == 405
        assert (await async_client.delete(path)).status_code == 405
