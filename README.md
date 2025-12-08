# Google Calendar Handler

Automates Google Calendar via Playwright (no Google API keys). Includes a Flask backend and a React client with voice or text commands.

## Prerequisites
- Prefer Unix OS
- Python 3.9+
- Node.js 18+ and npm
- Google Chrome (set `CHROME_EXECUTABLE` to its path)
- Ollama installed with the `gpt-oss:latest` model (`ollama pull gpt-oss:latest`)

Install Ollama: https://github.com/ollama/ollama

## Environment
Create `flask-server/.env`:
```
CHROME_EXECUTABLE=/path/to/Google Chrome
PLAYWRIGHT_ACTION_DELAY=1   # optional slow mode for UI stability
```

Create `client/.env` (optional):
```
REACT_APP_API_BASE=http://127.0.0.1:8080
```

## Setup & Run
### Backend
```bash
cd flask-server
source venv/bin/active
pip install -r requirements.txt
playwright install chromium
python server.py
```
Backend listens on `http://127.0.0.1:8080`.

### Frontend
```bash
cd client
npm install
npm start
```
Open the app at the URL shown by `npm start` (typically `http://localhost:3000`).

## Using the App
1) Start backend, then frontend (Safari recommended).
2) In the UI:
   - Click **Record voice command** to speak your request (e.g., “Create meeting with Alex tomorrow at 2 PM for 1 hour”). The live caption shows what was heard; it auto-sends when final.
   - Or type a request under **Manual command** and click **Send text command**.
3) Check the assistant reply; events are created at https://calendar.google.com.

## API (if calling directly)
- `POST /api/calendar/command` — body: `{ "command": "create an event tomorrow at 2 PM" }`
- `POST /api/calendar/create` — structured body: `{ "title": "...", "start": "...", "end": "...", "description": "..." }`
- `POST /api/calendar/init` — optional explicit init.

## Tips
- First run may prompt Google login in the Playwright-controlled Chrome; log in once.
- Session will storage in `flask-server/.pw_profile `
- For stability, keep the action delay (`PLAYWRIGHT_ACTION_DELAY`).
- Use secure context (HTTPS or localhost) for speech recognition in Chrome/Edge. Safari also works.
