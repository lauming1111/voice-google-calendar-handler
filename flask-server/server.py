import random
from datetime import datetime

from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/api/opening', methods=['GET'])
def opening():
    greetings = [
        "How may I help you today?",
        "I'm ready when you are—what's on your mind?",
        "What would you like to schedule or check?",
        "How can I assist with your calendar right now?",
        "Tell me what you need and I'll handle it."
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


@app.route('/api/voice', methods=['POST'])
def receive_voice():
    audio_file = request.files.get('audio')
    if not audio_file:
        return jsonify({"error": "No audio provided"}), 400

    audio_bytes = audio_file.read()
    length = len(audio_bytes)
    return jsonify({"status": "received", "bytes": length})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
