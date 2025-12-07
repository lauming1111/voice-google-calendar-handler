import random
import asyncio
import os
import json
import traceback
from datetime import datetime
from pathlib import Path

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

from calendar_agent import ensure_agent_ready




app = Flask(__name__)
CORS(app)


def parse_with_ollama(text: str):
    """
    Use a local Ollama model to parse free-form text into a structured payload.
    """
    model = os.getenv("OLLAMA_MODEL", "gpt-oss:latest")
    host = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")
    system_prompt = (
        "You convert natural language calendar requests into JSON."
        "Return only JSON with keys: title (string), start (string), end (string or null), description (string or null)."
        "Do not include extra text."
        f"Today is {datetime.now().strftime('%Y-%m-%d %A')}."
        "First day of week is Sunday, Saturday is the last day."
        "next week means the week after the current week, next friday means the Friday in the next week."
        "be careful of the time format. 12 or 24 hour is acceptable, but include AM/PM if using 12 hour."
        "use Toronto timezone."
    )
    user_prompt = f'Text: """{text}"""\nReturn JSON now.'
    print(system_prompt)
    print(user_prompt)
    try:
        resp = requests.post(
            f"{host}/api/chat",
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "stream": False,
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data.get("message", {}).get("content", "") or data.get("response", "") or ""
        content = content.strip()
        if content.startswith("```"):
            content = content.strip("`")
            parts = content.split("\n", 1)
            if len(parts) == 2:
                content = parts[1]
        parsed = json.loads(content)
        print(f"[ollama] Parsed payload: {parsed}")
        return parsed
    except Exception as e:
        print(f"[ollama] parse failed: {e}")
        return {"error": str(e)}

@app.route('/api/opening', methods=['GET'])
def opening():
    greetings = [
        "How may I help you today?",
        # "I'm ready when you are—what's on your mind?",
        # "What would you like to schedule or check?",
        # "How can I assist with your calendar right now?",
        # "Tell me what you need and I'll handle it."
    ]

    hour = datetime.now().hour
    if hour < 12:
        prefix = "Good morning"
    elif hour < 18:
        prefix = "Good afternoon"
    else:
        prefix = "Good evening"

    message = f"{prefix}. {random.choice(greetings)}"
    return jsonify({"message": message})


# @app.route('/api/voice', methods=['POST'])
# def receive_voice():
#     audio_file = request.files.get('audio')
#     if not audio_file:
#         return jsonify({"error": "No audio provided"}), 400

#     audio_bytes = audio_file.read()
#     length = len(audio_bytes)
#     return jsonify({"status": "received", "bytes": length})


@app.route('/api/calendar/init', methods=['POST'])
def init_calendar():
    """Initialize the calendar agent (open Google Calendar in browser)."""
    try:
        body = request.get_json(silent=True) or {}
        headless = bool(body.get('headless', False))
        user_data_dir = body.get('user_data_dir')
        print(f"[endpoint] /api/calendar/init called (headless={headless}, user_data_dir={user_data_dir})")

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            print("[endpoint] Calling ensure_agent_ready...")
            agent = loop.run_until_complete(
                asyncio.wait_for(ensure_agent_ready(headless=headless, user_data_dir=user_data_dir), timeout=30.0)
            )
            print(f"[endpoint] Agent ready. Authenticated: {agent.is_authenticated}")
        except asyncio.TimeoutError:
            print("[endpoint] Agent initialization timeout (30s)")
            raise RuntimeError("Agent initialization timeout after 30 seconds")

        response = {
            "status": "success",
            "message": "Calendar agent initialized",
            "authenticated": agent.is_authenticated
        }

        # If not authenticated, capture a screenshot for debugging (base64)
        if not agent.is_authenticated:
            print("[endpoint] Not authenticated, attempting screenshot...")
            screenshot = loop.run_until_complete(agent.screenshot_bytes())
            if screenshot:
                import base64
                response['screenshot_base64'] = base64.b64encode(screenshot).decode('ascii')
                # Also save to file for manual inspection
                screenshot_path = os.path.join(os.path.dirname(__file__), "screenshot_debug.png")
                with open(screenshot_path, "wb") as f:
                    f.write(screenshot)
                print(f"[endpoint] Screenshot saved to {screenshot_path}")
            else:
                print("[endpoint] Screenshot was None")

        return jsonify(response)
    except Exception as e:
        import traceback
        print(f"[endpoint] Error: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/calendar/command', methods=['POST'])
def calendar_command():
    """
    Process a voice command for calendar operations.
    Expects JSON: {"command": "create event tomorrow at 2 PM"}
    """
    try:
        data = request.get_json()
        command = data.get('command', '')

        if not command:
            return jsonify({"error": "No command provided"}), 400

        parsed_payload = parse_with_ollama(command)
        print("[endpoint] Ollama parse result:", parsed_payload)

        if parsed_payload.get("error"):
            return jsonify({"error": f"Ollama parsing failed: {parsed_payload['error']}"}), 500
        if not parsed_payload.get("title") or not parsed_payload.get("start"):
            return jsonify({"error": "Ollama parsing returned incomplete payload"}), 500

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        agent = loop.run_until_complete(ensure_agent_ready())
        result = loop.run_until_complete(agent.process_structured_command(parsed_payload))

        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/calendar/create', methods=['POST'])
def calendar_create():
    """
    Accepts structured payload from an upstream parser/agent.
    Expected JSON: {"title": "...", "start": "...", "end": "...", "description": "..."}
    """
    try:
        payload = request.get_json(silent=True) or {}
        print(f"[endpoint] /api/calendar/create payload: {payload}")

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        agent = loop.run_until_complete(ensure_agent_ready())
        result = loop.run_until_complete(agent.process_structured_command(payload))
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# @app.route('/api/calendar/events/today', methods=['GET'])
# def get_today_events():
#     """Retrieve today's calendar events."""
#     try:
#         loop = asyncio.new_event_loop()
#         asyncio.set_event_loop(loop)
#         agent = loop.run_until_complete(ensure_agent_ready())
#         result = loop.run_until_complete(agent.get_today_events())
#         return jsonify(result)
#     except Exception as e:
#         return jsonify({"error": str(e)}), 500



if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
