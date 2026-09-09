"""Yonsei AI 999 — a tiny, fully offline assistant web app.

The assistant is intentionally dependency-free at inference time: it uses a
small rule-based intent engine so the app runs end to end without any external
API keys or network access. This keeps the development environment simple to
set up and reproduce.
"""

from __future__ import annotations

from flask import Flask, jsonify, render_template, request

from assistant import Assistant

app = Flask(__name__)
assistant = Assistant()


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/health")
def health():
    return jsonify(status="ok", service="yonsei-ai-999")


@app.post("/api/chat")
def chat():
    payload = request.get_json(silent=True) or {}
    message = str(payload.get("message", "")).strip()
    if not message:
        return jsonify(error="message is required"), 400

    reply = assistant.reply(message)
    return jsonify(reply=reply.text, intent=reply.intent)


def main() -> None:
    app.run(host="0.0.0.0", port=8000, debug=True)


if __name__ == "__main__":
    main()
