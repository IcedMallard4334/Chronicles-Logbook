# Frontend

The frontend is a **React** application built with **Vite** (v8.2.0).

## Single-file architecture

The entire UI lives in a small number of files — there is no client-side routing library. Views are switched via state in the main `App.jsx` component:

| File | Responsibility |
|---|---|
| `App.jsx` | Auth state, navigation, all views (Auth, Projects, ProjectDetail) |
| `TaskPanel.jsx` | Task tracking UI (form, list, filters) |
| `api.js` | HTTP client wrapping all backend endpoints |
| `App.css` | Component styles (~900 lines) |
| `tasks.css` | Task-specific styles (~190 lines) |
| `index.css` | Global CSS variables, light/dark themes |

## Theme system

The frontend supports three modes: **light**, **dark**, and **system**. Themes are controlled by a `data-theme` attribute on the `<html>` element and a set of CSS custom properties defined in `index.css`:

```css
:root {
  --bg: #f7f7fa;
  --surface: #ffffff;
  --text: #2a2a3b;
  --muted: #8b8ba3;
  --blue: #6366f1;
  --mauve: #c4b5fd;
  --line: #e6e6ee;
  --radius: 14px;
}

[data-theme="dark"] {
  --bg: #1a1a2e;
  --surface: #23233a;
  --text: #e6e6ee;
  --muted: #8b8ba3;
  --line: #3a3a55;
}
```

## Colour palette

- **Blue** (`--blue: #6366f1`) — actions, links, interactive elements
- **Mauve** (`--mauve: #c4b5fd`) — highlights, completed states
- **Grey tones** (`--muted`) — secondary text, borders

## State management

The app uses React's built-in `useState` and `useEffect` hooks. There is no Redux, Zustand, or other external state management library. Each view component manages its own data fetching.

## Build and tooling

| Tool | Purpose |
|---|---|
| Vite | Dev server and production bundler |
| Vitest | Unit and component tests |
| oxlint | JavaScript/JSX linter |
| npm | Package management |

## Key design decisions

- **No routing library** — the app has few enough views that conditional rendering in `App.jsx` is simpler and avoids the complexity of React Router.
- **CSS custom properties over CSS-in-JS** — themes are achieved purely through CSS variables, keeping the styling layer simple and performant.
- **Fetch-based API client** — `api.js` wraps the native `fetch` API with token injection and error handling, rather than using Axios or another library.
