import React, { useEffect, useRef, useState } from 'react';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('Fetching greeting...');
  const [opening, setOpening] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const speak = async (text: string) => {
    if (!('speechSynthesis' in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  };

  const fetchOpening = async () => {
    try {
      setStatus('Fetching greeting...');
      const response = await fetch('/api/opening', { method: 'GET' });
      if (!response.ok) {
        throw new Error('Failed to fetch opening');
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        console.log('opening JSON:', data);
        setOpening(data.message);
        setStatus('Ready to capture your ideas');
        speak(data.message);
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

  const sendAudioToBackend = async (blob: Blob) => {
    setSubmissionMessage('Sending your recording to the assistant...');
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');
      const response = await fetch('/api/voice', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }
      const data = await response.json();
      setSubmissionMessage(`Assistant received your clip (${data.bytes} bytes).`);
    } catch (err) {
      setSubmissionMessage('We could not send your recording. Please try again.');
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      setSubmissionMessage(null);
      setAudioUrl(null);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Your browser does not support audio capture.');
        setStatus('Unable to record');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = event => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        recorder.stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setIsRecording(false);
        setStatus('Recording saved. Ready for the next idea.');
        sendAudioToBackend(blob);
      };

      recorder.start();
      setIsRecording(true);
      setStatus('Recording in progress...');
    } catch (err) {
      setError('Microphone access was blocked. Please enable it to record.');
      setStatus('Unable to record');
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      setStatus('Wrapping up your recording...');
    }
  };

  const handleStartRecording = async () => {
    if (opening) {
      speak(opening);
      // Wait a moment for speech to start, then begin recording
      // Adjust the timeout if needed based on opening message length
      setTimeout(() => {
        startRecording();
      }, 2000);
    } else {
      startRecording();
    }
  };

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [audioUrl]);

  return (
    <div className="app-shell">
      <div className="glow" />
      <div className="record-card">
        <div className="card-copy">
          <p className="eyebrow">Voice Capture</p>
          <h1>
            Turn spoken thoughts into saved notes with one tap.
          </h1>
          <p className="subhead">
            Hit record, listen for your assistant&apos;s prompt, speak naturally, and we&apos;ll send
            it to the backend for handling.
          </p>


          <div className="status-bar" aria-live="polite">
            <div className={`status-dot ${isRecording ? 'live' : ''}`} />
            <span  >{status}</span>
          </div>

          {error && <div className="error">{error}</div>}

          <div className="actions">
            <button
              className={`record-btn ${isRecording ? 'recording' : ''}`}
              onClick={isRecording ? stopRecording : handleStartRecording}

            >
              <span className="icon">
                <svg width="18" height="24" viewBox="0 0 18 24" fill="none" aria-hidden="true">
                  <rect x="4" y="2" width="10" height="14" rx="5" fill="currentColor" />
                  <path
                    d="M2 11.5C2 14.5376 4.46243 17 7.5 17H10.5C13.5376 17 16 14.5376 16 11.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path d="M9 17V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M5 22H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
              {isRecording ? 'Stop recording' : 'Start recording'}
            </button>
            <div className="waveform" aria-hidden="true">
              {Array.from({ length: 16 }).map((_, index) => (
                <span key={index} className={`bar ${isRecording ? 'active' : ''}`} />
              ))}
            </div>
          </div>

          {audioUrl && (
            <div className="playback">
              <p className="subtle">Latest clip</p>
              <audio controls src={audioUrl} />
            </div>
          )}

          {submissionMessage && <p className="subhead submission">{submissionMessage}</p>}
        </div>
      </div>
    </div>
  );
}

export default App;
