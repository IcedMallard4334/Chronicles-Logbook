# Testing

## Backend tests

The backend uses **pytest** with **pytest-asyncio** for async test support.

### Running tests

```bash
cd chronicles-logbook/backend
python -m pytest              # Run all tests
python -m pytest -v           # Verbose output
python -m pytest -k "auth"    # Run tests matching "auth"
```

### Test structure

Tests are in `chronicles-logbook/backend/tests/`. The test suite uses an in-memory SQLite database via `aiosqlite` for isolation — no PostgreSQL needed for tests.

```python
@pytest.fixture
async def client():
    # Creates a test app with SQLite in-memory DB
    # Yields an httpx.AsyncClient for making requests
    ...
```

### Writing new tests

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_create_task(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/projects/{project_id}/tasks",
        json={"title": "Test task", "due_date": "2026-08-25"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Test task"
    assert data["completed"] is False
```

---

## Frontend tests

The frontend uses **Vitest** for unit and component tests.

### Running tests

```bash
cd chronicles-logbook/frontend
npm run test            # Watch mode
npm run test -- --run   # Single run
```

### Writing new tests

```javascript
import { describe, it, expect } from "vitest"

describe("TaskPanel", () => {
  it("renders the task form", () => {
    // Test component rendering
  })

  it("filters tasks by status", () => {
    // Test filter logic
  })
})
```

---

## Linting

| Tool | Scope | Command |
|---|---|---|
| ruff | Python (backend) | `python -m ruff check .` |
| oxlint | JavaScript/JSX (frontend) | `npm run lint` |

Both tools are configured via their default settings. Fix issues before committing.

---

## Sprint 2 requirements

The rubric requires:

- Tests must pass and not be skipped
- Each user story should have corresponding tests
- Linting should show no errors or warnings
- A testing document describing strategy and test cases

This documentation serves as the testing document for Sprint 1.
