import React, { useEffect, useRef, useState } from 'react';
import './App.css';

function App() {
  // Default to local backend if env not provided
  const API_BASE = (process.env.REACT_APP_API_BASE || 'http://127.0.0.1:8080').replace(/\/$/, '');
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('Fetching greeting...');
  const [opening, setOpening] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [assistantReply, setAssistantReply] = useState<string | null>(null);
  const [userActivatedAudio, setUserActivatedAudio] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const hasSentRef = useRef<boolean>(false);
  const stopTimeoutRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [manualCommand, setManualCommand] = useState('');

  const speak = async (text: string) => {
    if (!('speechSynthesis' in window) || !userActivatedAudio) {
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
        // Only speak after user interaction to avoid autoplay restrictions.
        if (userActivatedAudio) {
          speak(data.message);
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
    hasSentRef.current = true;
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
        const resp = `Success, please check the detail in https://calendar.google.com/calendar/u/0/r`;
        setAssistantReply(JSON.stringify(resp, null, 2));
        setSubmissionMessage('Assistant processed your request.');
      }
    } catch (err: any) {
      console.error('[voice] Command error:', err);
      setSubmissionMessage(`We could not process your command. ${err?.message || ''}`.trim());
    } finally {
      setIsSending(false);
    }
  };

  const startListening = () => {
    if (isRecording) return;
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      setError('Your browser does not support speech recognition.');
      return;
    }

    const SpeechRecognitionConstructor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor) {
      setError('Speech recognition is not supported in this browser.');
      return;
    }
    const recognition: any = new SpeechRecognitionConstructor();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    hasSentRef.current = false;

    recognition.onstart = () => {
      console.log('[voice] recognition start');
      setStatus('Listening... please speak your calendar request.');
      setTranscript('');
      setAssistantReply(null);
      setError(null);
    };

    recognition.onresult = (event: any) => {
      console.log('[voice] recognition result', event);
      const results = event?.results;
      if (!results) return;
      // Show a live caption by concatenating all transcripts
      const combined = Array.from(results)
        .map((r: any) => r?.[0]?.transcript || '')
        .join(' ')
        .trim();
      setTranscript(combined);

      const idx = event.resultIndex ?? results.length - 1;
      const result = results[idx];
      const text = result?.[0]?.transcript?.trim() || '';
      if (!text) return;

      // Only send when the current result is final
      if (result.isFinal) {
        setStatus('Heard you. Sending to assistant...');
        recognition.stop();
        sendTranscriptToBackend(text);
      }
    };

    recognition.onerror = (event: any) => {
      const err = event?.error || 'unknown';
      console.log('[voice] recognition error', err);
      setIsRecording(false);
      if (err === 'aborted' || err === 'no-speech') {
        setStatus('Listening ended.');
        return;
      }
      setError(`Speech recognition error: ${err}`);
      setStatus('Unable to transcribe your voice.');
    };

    recognition.onend = () => {
      console.log('[voice] recognition end');
      setIsRecording(false);
      // If we ended without sending but have a transcript, send it once.
      if (!hasSentRef.current && transcript.trim()) {
        sendTranscriptToBackend(transcript.trim());
      }
    };

    recognition.start();
    setIsRecording(true);
  };

  const stopListening = () => {
    const recognition = recognitionRef.current;
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
    }
    if (recognition) {
      try {
        console.log('[voice] stopping recognition');
        recognition.stop();
      } catch (e) {
        // ignore
      }
    }
    stopRecording();
  };

  const handleToggle = () => {
    if (isRecording) {
      stopListening();
    } else {
      setUserActivatedAudio(true);
      startRecording();
      startListening();
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
      // Setup silence detection
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const bufferLength = analyser.fftSize;
      const dataArray = new Uint8Array(bufferLength);
      dataArrayRef.current = dataArray;

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
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
        }
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setIsRecording(false);
        setStatus('Recording saved. Ready for the next idea.');
      };

      recorder.start();
      setIsRecording(true);
      setStatus('Recording in progress...');

      const silenceThreshold = 0.01;
      const silenceDurationMs = 2000;

      const monitorSilence = () => {
        if (!analyserRef.current || !dataArrayRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArrayRef.current);
        const normalized =
          dataArrayRef.current.reduce((acc, val) => acc + Math.abs(val - 128), 0) /
          (128 * dataArrayRef.current.length);

        const now = performance.now();
        if (normalized < silenceThreshold) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = now;
          } else if (now - silenceStartRef.current > silenceDurationMs) {
            stopRecording();
            return;
          }
        } else {
          silenceStartRef.current = null;
        }
        rafRef.current = requestAnimationFrame(monitorSilence);
      };

      rafRef.current = requestAnimationFrame(monitorSilence);
    } catch (err) {
      setError('Microphone access was blocked. Please enable it to record.');
      setStatus('Unable to record');
    }
  };

  const stopRecording = () => {
    silenceStartRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      setStatus('Wrapping up your recording...');
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
              onClick={handleToggle}
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

          {transcript && (
            <div className="playback">
              <p className="subtle">You said</p>
              <pre className="transcript">{transcript}</pre>
            </div>
          )}

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
