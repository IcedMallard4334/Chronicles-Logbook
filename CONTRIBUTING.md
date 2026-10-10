# Contributing to Chronicles

Thank you for contributing to Chronicles! This document provides a quick reference for our Git workflow. For full details, see the [Git Workflow documentation](https://sdp.ms.wits.ac.za/driven-by-design/Chronicles/methodology/git-workflow/).

## Quick Start

```bash
# 1. Pull latest main
git checkout main && git pull origin main

# 2. Create a feature branch
git checkout -b feat/<short-description>

# 3. Make focused commits (Conventional Commits)
git commit -m "feat(scope): concise description"

# 4. Push and open a PR
git push -u origin feat/<short-description>
```

## Branch Naming

```
<type>/<short-description>
```

- `feat/<short-description>` — new feature
- `fix/<short-description>` — bug fix
- `docs/<short-description>` — documentation change
- `chore/<short-description>` — maintenance or tooling change

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

[optional body — explain why, not what]

[optional footer — Closes #23]
```

- Imperative mood ("add", not "added")
- Subject under 72 characters, no trailing full stop

## Pull Requests

1. Assign yourself the issue, move it to **In Progress**
2. Branch from up-to-date `main`
3. Commit following the convention above
4. Push and open a PR targeting `main`
5. Ensure CI passes (lint + test + build)
6. Request review from at least one teammate
7. Address review comments in new commits
8. After review, merge into `main`. The deploy pipeline then pushes the change to Azure

## Code Style

| Language | Tool | Command |
|---|---|---|
| Python | ruff | `python -m ruff check .` |
| JavaScript/JSX | oxlint | `npm run lint` |

Run both before committing. CI will also enforce these checks. Then run the tests and check that the docs still match the code:

```bash
# Backend (from chronicles-logbook/backend)
python -m pytest
python ../scripts/docs_audit.py

# Frontend (from chronicles-logbook/frontend)
npm run test -- --run
```

When you change behaviour, update the docs in the same pull request and record the decision and its reason in [docs/decisions](docs/decisions/index.md).

## What Not to Commit

- No `.env` files or secrets (use `.env.example`)
- No `node_modules/`, `venv/`, or `dist/`
- No IDE configuration (`.vscode/`, `.idea/`)
- No large binaries

## Full Documentation

- [Project Methodology](https://sdp.ms.wits.ac.za/driven-by-design/Chronicles/methodology/project-methodology/)
- [Git Workflow](https://sdp.ms.wits.ac.za/driven-by-design/Chronicles/methodology/git-workflow/)
- [Architecture Overview](https://sdp.ms.wits.ac.za/driven-by-design/Chronicles/architecture/overview/)
- [Testing Guide](https://sdp.ms.wits.ac.za/driven-by-design/Chronicles/development/testing/)
