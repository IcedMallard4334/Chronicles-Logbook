# Installation

## 1. Clone the repository

```bash
git clone https://sdp.ms.wits.ac.za/driven-by-design/Chronicles.git
cd Chronicles
```

## 2. Set up the database

Create a local PostgreSQL database:

```bash
# macOS/Linux
createdb chronicles

# Windows (from psql or pgAdmin)
CREATE DATABASE chronicles;
```

Make a note of your username, password, host, port, and database name.

## 3. Backend setup

```bash
cd chronicles-logbook/backend

# Create and activate a virtual environment
python -m venv .venv

# Activate (Windows PowerShell)
.\.venv\Scripts\Activate.ps1

# Activate (macOS/Linux)
source .venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Install dev/test dependencies
pip install ruff pytest pytest-asyncio httpx aiosqlite
```

Create a `.env` file in `chronicles-logbook/backend/`:

```env
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/chronicles
CORS_ORIGINS=http://localhost:5173
SQL_DEBUG=false
JWT_SECRET_KEY=your-long-random-secret-key-here
SESSION_SECRET_KEY=your-session-secret-key
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

!!! warning
    Replace `user`, `password`, and `chronicles` with your actual PostgreSQL credentials. Generate a long random string for `JWT_SECRET_KEY` (at least 32 characters).

## 4. Frontend setup

Open a **second terminal** from the repository root:

```bash
cd chronicles-logbook/frontend
npm install
```

Create a `.env` file in `chronicles-logbook/frontend/`:

```env
VITE_API_URL=http://localhost:8000
```

## 5. Verify

Start both servers and visit [http://localhost:5173](http://localhost:5173). You should see the Chronicles landing page.

AI Declaration: The preceding document was reviewed and edited with: Qoder
