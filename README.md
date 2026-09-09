# yonsei_ai_999

A tiny, fully offline AI-themed assistant web app used to demonstrate a working
Cloud Agent development environment.

The assistant is a small, deterministic rule-based engine (no external API keys
or network access required), served through a Flask backend with a modern chat
UI.

## Features

- `POST /api/chat` — send `{ "message": "..." }`, get `{ "reply, intent }`.
- `GET /api/health` — health check.
- `GET /` — chat web UI.

Supported intents: greeting, `reverse <text>`, `count words in <text>`,
arithmetic (e.g. `2 * (3 + 4)`), help, and an echo fallback.

## Requirements

- Python 3.12+

## Setup

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
. .venv/bin/activate
python app.py
```

Then open http://localhost:8000.

## Test

```bash
. .venv/bin/activate
pytest -q
```

## Cloud Agent environment

`.cursor/environment.json` configures the Cloud Agent environment:

- `install` creates a virtualenv and installs dependencies.
- A `web` terminal runs the dev server on port 8000.
