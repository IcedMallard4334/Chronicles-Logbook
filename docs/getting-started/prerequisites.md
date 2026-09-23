# Prerequisites

Before running Chronicles locally, install the following:

## Required

| Tool | Version | Purpose |
|---|---|---|
| **Python** | 3.12+ | Backend runtime |
| **Node.js** | 20+ | Frontend build tooling |
| **PostgreSQL** | 15+ | Database |
| **Git** | Latest | Version control |

## Optional

| Tool | Purpose |
|---|---|
| **Docker** | Run PostgreSQL in a container instead of installing locally |
| **pgAdmin** | GUI for managing the PostgreSQL database |
| **VS Code** | Recommended editor with Python and React extensions |

## Windows-specific notes

- Use PowerShell (not Command Prompt) for all terminal commands
- Python 3.12 can be installed from [python.org](https://www.python.org/downloads/) or the Microsoft Store
- Node.js 20+ can be installed from [nodejs.org](https://nodejs.org/)
- PostgreSQL installer available at [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)

## Verify your installation

```bash
python --version    # Should show 3.12.x or higher
node --version      # Should show v20.x or higher
psql --version      # Should show 15.x or higher
git --version       # Any recent version
```

AI Declaration: The preceding document was reviewed and edited with: Qoder
