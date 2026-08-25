# Contributing to Chronicles

Thank you for contributing to Chronicles! This document provides a quick reference for our Git workflow. For full details, see the [Git Workflow documentation](https://sdp.ms.wits.ac.za/driven-by-design/Chronicles/methodology/git-workflow/).

## Quick Start

```bash
# 1. Pull latest main
git checkout main && git pull origin main

# 2. Create a feature branch
git checkout -b feature/<issue-number>-<short-description>

# 3. Make focused commits (Conventional Commits)
git commit -m "feat(scope): concise description"

# 4. Push and open a PR
git push -u origin feature/<issue-number>-<short-description>
```

## Branch Naming

```
<type>/<issue-number>-<short-kebab-description>
```

Types: `feature`, `fix`, `docs`, `refactor`, `test`, `chore`.

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
8. Squash-merge on approval, then delete the branch

## Code Style

| Language | Tool | Command |
|---|---|---|
| Python | ruff | `python -m ruff check .` |
| JavaScript/JSX | oxlint | `npm run lint` |

Run both before committing. CI will also enforce these checks.

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
