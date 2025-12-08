import React, { useEffect, useState } from 'react';
import './App.css';

function App() {
  // Default to local backend if env not provided
  const API_BASE = (process.env.REACT_APP_API_BASE || 'http://127.0.0.1:8080').replace(/\/$/, '');
  const [status, setStatus] = useState('Fetching greeting...');
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [assistantReply, setAssistantReply] = useState<string | null>(null);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [manualCommand, setManualCommand] = useState('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [spokenTranscript, setSpokenTranscript] = useState<string>('');
  const [userActivatedAudio, setUserActivatedAudio] = useState<boolean>(false);
  const [hasPlayedGreeting, setHasPlayedGreeting] = useState<boolean>(false);
  const recognitionRef = React.useRef<any>(null);
  const manualStopRef = React.useRef<boolean>(false);
  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  };

  const fetchOpening = async () => {
    try {
      setStatus('Fetching greeting...');
      const response = await fetch(`${API_BASE}/api/opening`, { method: 'GET' });
      if (!response.ok) {
        throw new Error('Failed to fetch opening');
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        console.log('opening JSON:', data);
        setOpening(data.message);
        setStatus('Ready to capture your ideas');
        if (userActivatedAudio && !hasPlayedGreeting) {
          speak(data.message);
          setHasPlayedGreeting(true);
        }
      } else {
        // Received HTML (likely the React dev server index.html). Log for debugging.
        const text = await response.text();
        console.error('Expected JSON but received non-JSON response:', text.slice(0, 1000));
        setStatus('Unable to fetch greeting');
        setError('Server returned non-JSON response (check dev server proxy).');
      }
    } catch (err) {
      console.log(123);
      console.log(err);
      setStatus('Unable to fetch greeting');
      setError('Could not load the opening statement from the server.');
    }
  };

  useEffect(() => {
    fetchOpening();
  }, []);

  const sendTranscriptToBackend = async (text: string) => {
    setIsSending(true);
    setSubmissionMessage('Sending your command to the assistant...');
    setAssistantReply(null);
    console.log('[voice] Sending transcript:', JSON.stringify({ command: text }));
    try {
      const response = await fetch(`${API_BASE}/api/calendar/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: text }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[voice] Backend error response:', response.status, errorText);
        throw new Error(`Command failed (${response.status}): ${errorText}`);
      }
      const data = await response.json();
      console.log('[voice] Backend response:', data);

      if (data.status === 'success') {
        const resp = `Success, please check the detail in https://calendar.google.com/calendar`;
        setAssistantReply(resp);
        setSubmissionMessage('Assistant processed your request.');
      }
    } catch (err: any) {
      console.error('[voice] Command error:', err);
      setSubmissionMessage('I couldn’t handle that. Please say or type your request again. Make sure to speak clearly and provide complete information. Like date, time, and event details.');
    } finally {
      setIsSending(false);
    }
  };

  const startVoiceCommand = () => {
    setUserActivatedAudio(true);
    if (isListening) return;
    setError(null);
    setSubmissionMessage(null);
    manualStopRef.current = false;
    if (opening && !hasPlayedGreeting) {
      speak(opening);
      setHasPlayedGreeting(true);
    }
    setSpokenTranscript('');

    // Chrome/Edge require a secure context; expose a clearer hint if blocked.
    const isSecure =
      window.isSecureContext ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    const SpeechRecognitionConstructor =
      (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognitionConstructor || !isSecure) {
      console.warn('[voice] SpeechRecognition unavailable. Use Chrome/Edge on HTTPS or localhost.');
      setStatus('Voice capture requires Chrome/Edge on HTTPS or localhost.');
      setError('Speech recognition is not available in this context.');
      return;
    }

    const recognition: any = new SpeechRecognitionConstructor();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setStatus('Listening... please speak your calendar request.');
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const results = event?.results;
      if (!results) return;
      const combined = Array.from(results)
        .map((r: any) => r?.[0]?.transcript || '')
        .join(' ')
        .trim();
      console.log('[voice] live transcript:', combined);
      setSpokenTranscript(combined);

      const idx = event.resultIndex ?? results.length - 1;
      const result = results[idx];
      const text = result?.[0]?.transcript?.trim() || '';
      if (!text) return;

      if (result.isFinal) {
        setStatus('Heard you. Sending to assistant...');
        recognition.stop();
        sendTranscriptToBackend(text);
      }
    };

    recognition.onerror = (event: any) => {
      const err = event?.error || 'unknown';
      if (err === 'aborted' || err === 'no-speech') {
        setStatus('Listening ended.');
        setIsListening(false);
        setError(null);
        return;
      }
      setIsListening(false);
      setStatus('Unable to transcribe your voice.');
      setError(`Speech recognition error: ${err}`);
    };

    recognition.onend = () => {
      if (manualStopRef.current) {
        setIsListening(false);
        setStatus('Listening ended.');
        return;
      }
      // Auto-restart to keep listening until user stops.
      try {
        recognition.start();
      } catch (e) {
        setIsListening(false);
        setStatus('Listening ended.');
      }
    };

    recognition.start();
  };

  const stopVoiceCommand = () => {
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch (e) {
        // ignore
      }
    }
    manualStopRef.current = true;
    setIsListening(false);
    setStatus('Listening ended.');
  };

  return (
    <div className="app-shell">
      <div className="glow" />
      <div className="record-card">
        <div className="card-copy">
          <p className="eyebrow">Calendar Assistant</p>
          <h1>Send a text command to your calendar.</h1>
          <p className="subhead">Type what you want and we’ll pass it to the backend.</p>


          <div className="status-bar" aria-live="polite">
            <div className="status-dot" />
            <span>{status}</span>
          </div>

          {error && <div className="error">{error}</div>}

          <div className="playback">
            <p className="subtle">Voice command</p>
            <button
              className="record-btn"
              onClick={() => (isListening ? stopVoiceCommand() : startVoiceCommand())}
            >
              {isListening ? 'Stop listening' : 'Record voice command'}
            </button>
            {spokenTranscript && (
              <div className="live-caption" style={{ marginTop: '0.5rem' }}>
                <p className="subtle" style={{ marginBottom: '0.25rem' }}>Live caption</p>
                <pre className="transcript">{spokenTranscript}</pre>
              </div>
            )}
          </div>
          {assistantReply && (
            <div className="playback">
              <p className="subtle">Assistant reply</p>
              <pre className="transcript">{assistantReply}</pre>
            </div>
          )}

          <div className="playback">
            <p className="subtle">Manual command</p>
            <textarea
              value={manualCommand}
              onChange={e => setManualCommand(e.target.value)}
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
              placeholder="Type a command to send to the assistant"
            />
            <button
              className="record-btn"
              onClick={() => manualCommand.trim() && !isSending && sendTranscriptToBackend(manualCommand.trim())}
              disabled={isSending}
            >
              {isSending ? 'Sending...' : 'Send text command'}
            </button>
          </div>

          {submissionMessage && <p className="subhead submission">{submissionMessage}</p>}
        </div>
      </div>
    </div>
  );
}

export default App;
