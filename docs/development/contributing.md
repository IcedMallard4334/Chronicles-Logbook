# Contributing

We follow a **trunk-based development** workflow with short-lived feature branches.

## Branch naming

Use the pattern `feat/<short-description>`:

```bash
git checkout -b feat/task-tracking
git checkout -b feat/us15-archive-projects
```

## Workflow

1. **Pull latest main**
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feat/my-feature
   ```

3. **Make small, focused commits**
   ```bash
   git add .
   git commit -m "feat(scope): concise description"
   ```

4. **Push and open a pull request**
   ```bash
   git push -u origin feat/my-feature
   ```
   Then open a PR on Gitea targeting `main`.

5. **Request review** — at least one teammate must approve before merging.

## Commit messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
feat(tasks): add task tracking CRUD with due-date list UI
fix(auth): handle expired tokens gracefully
docs(api): add entries endpoint documentation
```

## Code style

| Language | Tool | Command |
|---|---|---|
| Python | ruff | `python -m ruff check .` |
| JavaScript/JSX | oxlint | `npm run lint` |

Run both before committing. CI will also enforce these checks.

## Sprint structure

| Wave | Days | Activity |
|---|---|---|
| Planning | 1–4 | Story estimation, delegation |
| Dev + Testing | 5–16 | Implementation with testing docs |
| Demo Prep | 17–19 | Sprint planning, demo video |

## Reviewing pull requests

- Check that tests pass
- Verify no linting errors
- Ensure the change doesn't break existing features
- Approve or request changes
