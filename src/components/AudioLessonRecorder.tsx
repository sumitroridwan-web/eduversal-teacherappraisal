import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Upload, Sparkles, Volume2, AlertCircle, RefreshCw, Clock, CheckCircle2, FileText, Copy, Trash2, ScrollText } from 'lucide-react';
import { AiLessonAnalysis, CareerLevel, TranscriptSegment } from '../types';
import { putMedia, getMedia, deleteMedia, blobToBase64, formatBytes } from '../services/mediaStore';
import { useLanguage } from '../i18n/LanguageContext';
import { transcribeRecording, formatTranscriptText, TranscriptionProgress } from '../services/transcription';

/**
 * How large a recording may be before it can no longer be sent for analysis.
 *
 * Vercel refuses any request body over 4.5MB at the edge, before the function
 * runs, and answers with the plain text "Request Entity Too Large" - which is
 * what surfaced as "Unexpected token 'R'" when the reply was parsed as JSON.
 * Base64 inflates audio by a third on the way out, so three megabytes on disk
 * is about four in the request, leaving room for the transcript and the rest
 * of the envelope. This is a limit on analysing a clip, never on keeping one:
 * the recording is stored on the device whatever it weighs.
 */
const MAX_AUDIO_UPLOAD_BYTES = 3_000_000;

/**
 * Opus at 24 kbps mono. 12 kbps was enough for a mic held to one mouth, but
 * a device at the back of a room hears the teacher distant and reverberant,
 * and that codec floor removed the very detail transcription needs.
 *
 * The budget above no longer decides how much of a lesson can be understood,
 * only how much can be sent to the analysis endpoint whole: transcription
 * cuts the recording into windows and reads all of it however long it runs.
 */
const SPEECH_BITS_PER_SECOND = 24_000;

/**
 * The locale handed to the browser's speech engine, which needs a full BCP-47
 * tag rather than the two-letter code the app stores. This was pinned to
 * en-US, so an Indonesian lesson was decoded against an English acoustic
 * model and came back as phonetic nonsense.
 */
const SPEECH_LOCALES: Record<string, string> = { en: 'en-US', id: 'id-ID' };

/**
 * How long to wait before restarting the speech engine after it ends itself.
 * Calling start() straight from the onend handler throws InvalidStateError in
 * Chrome, which would end the transcript for good on the first restart.
 */
const SPEECH_RESTART_DELAY_MS = 300;

/**
 * The notice to show when captured audio is past what the endpoint accepts,
 * or null when it fits. Raised as soon as the audio is captured rather than
 * on analysis, so the appraiser can re-record while the lesson is still live.
 */
const describeOversizedAudio = (bytes: number): string | null => {
  if (bytes <= MAX_AUDIO_UPLOAD_BYTES) return null;
  return `This recording is ${formatBytes(bytes)}, past the ${formatBytes(
    MAX_AUDIO_UPLOAD_BYTES
  )} the analysis endpoint accepts in one piece. It stays saved on this device - press Transcribe audio to have the whole lesson read from the recording, and the analysis will be built on that transcript.`;
};

/**
 * Reads a reply that may not be JSON at all: the host answers an oversized
 * upload with plain text and a crashed function with HTML, either of which
 * used to bury the real cause behind a JSON syntax error.
 */
const readJsonResponse = async (res: Response): Promise<any | null> => {
  const body = await res.text();
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

interface AudioLessonRecorderProps {
  teacherName: string;
  subject: string;
  careerLevel: CareerLevel;
  gradeClass: string;
  lessonTopic: string;
  learningObjectives?: string;
  observerNotes?: string;
  onAnalysisComplete: (analysis: AiLessonAnalysis, transcriptText?: string, segments?: TranscriptSegment[]) => void;
  existingAnalysis?: AiLessonAnalysis;
  /** Transcript already held on this teacher's observation, restored on open. */
  initialTranscript?: string;
  initialSegments?: TranscriptSegment[];
  /**
   * Fires on every change so the transcript is stored against the teacher as
   * it is spoken. Waiting for the AI analysis meant a closed tab, a refused
   * upload or an appraiser who never pressed Analyze lost the whole record of
   * what was said.
   */
  onTranscriptChange?: (transcript: string, segments: TranscriptSegment[]) => void;
  /** Owns the recording in the device's media store, and deletes it with it. */
  appraisalId: string;
  /** A recording already held on this device for this observation. */
  initialAudioClipId?: string;
  /** Fires once a clip is on the device, so the record can point at it. */
  onAudioCaptured?: (clip: { clipId: string; mimeType: string; durationSeconds: number }) => void;
}

export const AudioLessonRecorder: React.FC<AudioLessonRecorderProps> = ({
  teacherName,
  subject,
  careerLevel,
  gradeClass,
  lessonTopic,
  learningObjectives,
  observerNotes,
  onAnalysisComplete,
  existingAnalysis,
  initialTranscript,
  initialSegments,
  onTranscriptChange,
  appraisalId,
  initialAudioClipId,
  onAudioCaptured,
}) => {
  const { language } = useLanguage();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  // Seeded from the stored observation. The parent remounts this component
  // per record id, so the seeding happens once per teacher rather than on
  // every keystroke echoed back down from the form.
  const [transcript, setTranscript] = useState<string>(initialTranscript || '');
  const [segments, setSegments] = useState<TranscriptSegment[]>(initialSegments || []);
  // What the engine is still hearing: shown live, never written to the record
  // until the engine settles on it.
  const [interimText, setInterimText] = useState('');
  const [showTranscript, setShowTranscript] = useState(true);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'blocked'>('idle');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisWarning, setAnalysisWarning] = useState<string | null>(null);
  const [audioBytes, setAudioBytes] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState<TranscriptionProgress | null>(null);
  const [transcribeNotice, setTranscribeNotice] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string>('audio/webm');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  /**
   * Whether the engine is meant to be listening. The engine stops itself on a
   * quiet stretch or a network blip and, until this flag existed, nothing
   * started it again: a lesson transcribed for the first few minutes and then
   * went silent for the rest of the observation with no sign anything had
   * failed. onend restarts only while this is true, so a deliberate stop or
   * pause still ends the session.
   */
  const speechShouldRunRef = useRef(false);
  const speechRestartTimerRef = useRef<any>(null);
  // Elapsed seconds, mirrored in a ref so the speech callback can stamp a
  // segment without being re-created on every tick.
  const recordingTimeRef = useRef(0);
  const finalisedResultsRef = useRef(0);
  const transcriptRef = useRef<HTMLTextAreaElement | null>(null);
  // The clip itself, held for playback and for the analysis request. It is
  // not state: nothing renders it directly, and re-encoding a half-hour of
  // audio into a base64 string on every render is exactly what to avoid.
  const audioBlobRef = useRef<Blob | null>(null);
  const audioClipIdRef = useRef<string | undefined>(initialAudioClipId);
  const audioUrlRef = useRef<string | null>(null);
  /**
   * Seconds already captured in earlier recordings of this same observation.
   * A lesson is often taken in several passes - more so now the endpoint only
   * accepts so much audio at once - and a transcript that restarted at 00:00
   * each time could not be read, cited or scored as one timeline.
   */
  const transcriptOffsetRef = useRef(
    (initialSegments || []).reduce((latest, seg) => Math.max(latest, seg.startSeconds || 0), 0)
  );
  // What the observation was last told the transcript is. Compared rather
  // than counted, so merely opening a record - or React re-running effects on
  // mount - cannot report a change that never happened.
  const lastPublishedRef = useRef(
    `${(initialSegments || []).length}|${initialTranscript || ''}`
  );

  /**
   * Takes a clip that was just recorded or chosen: makes it playable, stores
   * it on this device, and tells the observation where it lives.
   *
   * Storage failing is not fatal - the clip is still playable and analysable
   * for as long as the page is open - but it is said out loud, because the
   * appraiser is the only one who can decide to re-record.
   */
  const adoptAudio = async (blob: Blob, durationSeconds: number) => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = URL.createObjectURL(blob);
    audioUrlRef.current = url;
    audioBlobRef.current = blob;

    const mime = blob.type || 'audio/webm';
    setAudioUrl(url);
    setAudioBytes(blob.size);
    setAudioMimeType(mime);
    setAnalysisWarning(describeOversizedAudio(blob.size));

    const replaced = audioClipIdRef.current;
    try {
      const clipId = await putMedia({ appraisalId, kind: 'audio', blob });
      audioClipIdRef.current = clipId;
      // Only once the new clip is safely stored, so a failed write cannot
      // leave the observation pointing at a recording that was just deleted.
      if (replaced && replaced !== clipId) void deleteMedia(replaced);
      onAudioCaptured?.({ clipId, mimeType: mime, durationSeconds });
    } catch (e) {
      console.warn('The recording could not be stored on this device', e);
      setAnalysisWarning(
        'This recording could not be saved to the device, so it will be lost if the page is ' +
          'reloaded. Analyse it now, or check that this browser is allowed to store data.'
      );
    }
  };

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Stop listening and stay stopped: clears the restart flag first so the
   * engine's own onend does not immediately bring it back.
   */
  const stopSpeechRecognition = () => {
    speechShouldRunRef.current = false;
    if (speechRestartTimerRef.current) {
      clearTimeout(speechRestartTimerRef.current);
      speechRestartTimerRef.current = null;
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (e) {}
      speechRecognitionRef.current = null;
    }
    setInterimText('');
  };

  /**
   * Open a speech session and keep reopening it for as long as the lesson is
   * being recorded. Each session is a fresh instance: a stopped one cannot be
   * restarted, and its results list starts from zero again, so the count of
   * lines already written to the transcript resets with it.
   */
  const startSpeechRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    speechShouldRunRef.current = true;

    const open = () => {
      if (!speechShouldRunRef.current) return;
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = SPEECH_LOCALES[language] || 'en-US';

        recognition.onresult = (event: any) => {
          // Only append results the engine has finalised, and only ones not
          // already recorded - onresult replays the whole results list each
          // time, which previously duplicated the transcript on every event.
          let pending = '';

          for (let i = finalisedResultsRef.current; i < event.results.length; i++) {
            const result = event.results[i];
            if (!result.isFinal) {
              // Not settled yet: shown under the transcript so the appraiser
              // can see the capture is still following the room.
              pending = `${pending} ${String(result[0].transcript)}`.trim();
              continue;
            }

            const text = String(result[0].transcript).trim();
            finalisedResultsRef.current = i + 1;
            if (!text) continue;

            const at = transcriptOffsetRef.current + recordingTimeRef.current;
            const stamp = formatTime(at);

            setSegments((prev) => [...prev, { startSeconds: at, timeLabel: stamp, text }]);
            setTranscript((prev) => (prev ? `${prev}\n[${stamp}] ${text}` : `[${stamp}] ${text}`));
          }

          setInterimText(pending);
        };

        recognition.onerror = (event: any) => {
          // A refused microphone will refuse every retry, so stop asking and
          // leave the appraiser the recording and the typed transcript. Every
          // other error - no-speech, network, aborted - is transient and is
          // left to onend to recover from.
          if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
            speechShouldRunRef.current = false;
          }
        };

        recognition.onend = () => {
          speechRecognitionRef.current = null;
          if (!speechShouldRunRef.current) return;
          // A new session numbers its results from zero.
          finalisedResultsRef.current = 0;
          speechRestartTimerRef.current = setTimeout(open, SPEECH_RESTART_DELAY_MS);
        };

        recognition.start();
        speechRecognitionRef.current = recognition;
      } catch (recErr) {
        console.warn('Speech recognition not available or blocked', recErr);
      }
    };

    open();
  };

  // Start live recording
  const startRecording = async () => {
    try {
      setAnalysisError(null);
      setAnalysisWarning(null);
      // Mono, and otherwise unprocessed. The browser's voice-call filters are
      // tuned for one speaker close to the mic: noise suppression reads a
      // teacher across the room, and the class responding to them, as noise
      // and gates it out, while auto gain pumps between quiet and loud
      // stretches of the lesson. Turning them on is what made the recordings
      // capture neither the teacher nor the room. A classroom wants the raw
      // signal - the transcription model is better at the noise than the
      // filters are.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      // Audio Context for live visualizer
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      drawWaveform();

      // Media Recorder
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      setAudioMimeType(mime);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mime,
        audioBitsPerSecond: SPEECH_BITS_PER_SECOND,
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const captured = recordingTimeRef.current;

        // Stop stream tracks
        stream.getTracks().forEach((track) => track.stop());
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        await adoptAudio(new Blob(audioChunksRef.current, { type: mime }), captured);
      };

      mediaRecorder.start(1000); // 1 sec chunks
      recordingTimeRef.current = 0;
      finalisedResultsRef.current = 0;
      // Optional browser speech recognition for live text capture, restarted
      // for as long as the lesson runs.
      startSpeechRecognition();
      // Deliberately keeps whatever is already transcribed: a second pass
      // continues the lesson's timeline instead of erasing the first. Clear
      // Transcript is there for starting the record over.
      setInterimText('');
      setShowTranscript(true);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((t) => {
          recordingTimeRef.current = t + 1;
          return t + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error('Error accessing microphone', err);
      setAnalysisError('Microphone access was denied or not found. You can also upload an audio file or paste lesson notes.');
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      transcriptOffsetRef.current += recordingTimeRef.current;
      setIsRecording(false);
      setIsPaused(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      stopSpeechRecognition();
    }
  };

  // Pause / Resume recording
  const togglePause = () => {
    if (!mediaRecorderRef.current) return;
    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((t) => {
          recordingTimeRef.current = t + 1;
          return t + 1;
        });
      }, 1000);
      finalisedResultsRef.current = 0;
      startSpeechRecognition();
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      // The clock stops with the recorder, so anything the engine heard while
      // paused would be stamped at the moment the pause began.
      stopSpeechRecognition();
    }
  };

  // Draw audio visualizer
  const drawWaveform = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animationFrameRef.current = requestAnimationFrame(render);
      analyserRef.current!.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, '#4f46e5'); // Indigo 600
        gradient.addColorStop(1, '#818cf8'); // Indigo 400

        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };

    render();
  };

  // Handle local audio file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalysisError(null);
    // Duration is unknown until it plays; the <audio> element reports it once
    // the metadata is read, and the record is updated then.
    void adoptAudio(file, 0);
  };

  /**
   * Transcribe the stored recording against the audio itself.
   *
   * This is the transcript the observation keeps. What the browser captured
   * while the lesson ran was a live preview - it hears one near voice, in one
   * language, and cannot say who spoke - so a successful pass replaces it
   * rather than being merged into it. The appraiser is asked first, because
   * anything they typed or corrected by hand goes with it.
   */
  const handleTranscribeRecording = async () => {
    const audioBlob = audioBlobRef.current;
    if (!audioBlob) {
      setAnalysisError('There is no recording on this observation to transcribe.');
      return;
    }

    if (transcript.trim()) {
      const confirmed = window.confirm(
        'Transcribe the recording from the audio? This replaces the transcript currently held ' +
          'for this observation, including any lines you have typed or corrected.'
      );
      if (!confirmed) return;
    }

    setIsTranscribing(true);
    setAnalysisError(null);
    setTranscribeNotice(null);
    setTranscribeProgress({ completed: 0, total: 0 });

    try {
      const result = await transcribeRecording(audioBlob, {
        language,
        onProgress: setTranscribeProgress,
      });

      if (!result.totalWindows) {
        setAnalysisError('This recording could not be read as audio, so there was nothing to transcribe.');
        return;
      }

      if (!result.segments.length) {
        setAnalysisError(
          result.failedWindows === result.totalWindows
            ? 'The transcription service could not be reached. The recording is still saved on this device - try again in a moment.'
            : 'No intelligible speech was found in this recording. Check that the device was near enough to the class to hear the lesson.'
        );
        return;
      }

      setSegments(result.segments);
      setTranscript(formatTranscriptText(result.segments));
      setInterimText('');
      setCopyState('idle');
      // Every stamp now runs from the start of this recording, so the offset
      // any later live capture counts from has to start there too.
      transcriptOffsetRef.current = 0;
      setShowTranscript(true);

      setTranscribeNotice(
        result.failedWindows
          ? `Transcribed ${result.totalWindows - result.failedWindows} of ${result.totalWindows} parts of the lesson. ` +
              `${result.failedWindows} could not be read and are missing from the transcript - run it again to fill the gaps.`
          : `Transcribed the full recording: ${result.segments.length} timestamped lines.`
      );
    } catch (err: any) {
      console.error('Transcription failed:', err);
      setAnalysisError(
        err?.message || 'The recording could not be transcribed. It is still saved on this device.'
      );
    } finally {
      setIsTranscribing(false);
      setTranscribeProgress(null);
    }
  };

  // Trigger Gemini AI Lesson Analysis
  const handleAnalyzeWithAI = async () => {
    const writtenEvidence = (transcript || '').trim() || (observerNotes || '').trim();
    const audioBlob = audioBlobRef.current;
    if (!audioBlob && !writtenEvidence) {
      setAnalysisError('Please record audio, upload an audio file, or provide lesson transcript/notes for AI analysis.');
      return;
    }

    // Audio past the budget cannot be sent at all, so the analysis falls back
    // to what was written down. With nothing written there is nothing to fall
    // back to, and saying so beats letting the request die at the edge.
    const audioFits = !!audioBlob && audioBlob.size <= MAX_AUDIO_UPLOAD_BYTES;
    if (audioBlob && !audioFits && !writtenEvidence) {
      setAnalysisError(
        `This recording is ${formatBytes(audioBlob.size)} and cannot be sent for analysis in one piece. It ` +
          'stays saved on this device - press Transcribe audio to have the whole lesson read from the ' +
          'recording, then analyse it from that transcript.'
      );
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const payload = {
        // Encoded here rather than held encoded: the clip lives on the device
        // as binary, and only this one request needs it as base64.
        audioBase64: audioFits && audioBlob ? await blobToBase64(audioBlob) : null,
        mimeType: audioMimeType,
        transcript: transcript || observerNotes || 'Lesson observation discussion and active instruction dialogue.',
        teacherName: teacherName || 'Observed Teacher',
        subject: subject || 'Subject',
        careerLevel,
        gradeClass,
        lessonTopic,
        learningObjectives,
        additionalNotes: observerNotes,
      };

      const res = await fetch('/api/analyze-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await readJsonResponse(res);
      if (!json) {
        throw new Error(
          res.status === 413
            ? 'The recording was too large for the server to accept in one piece. Press Transcribe audio to have it read window by window, then analyse from that transcript.'
            : `The analysis service returned HTTP ${res.status} without a readable error.`
        );
      }
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to analyze lesson');
      }

      onAnalysisComplete(json.data, transcript, segments);
    } catch (err: any) {
      console.error('AI Analysis failed:', err);
      setAnalysisError(err.message || 'An error occurred while contacting the Gemini AI service.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Bring back the recording this observation already has on the device, so
  // reopening a teacher's sheet finds the lesson still there rather than an
  // empty recorder that quietly lost it on the last reload.
  useEffect(() => {
    if (!initialAudioClipId) return;
    // The clip just captured comes straight back down as a prop once the
    // observation records it. Reloading it from the device then would open a
    // second window onto bytes already in hand.
    if (audioClipIdRef.current === initialAudioClipId && audioBlobRef.current) return;
    let cancelled = false;

    void (async () => {
      const stored = await getMedia(initialAudioClipId);
      if (cancelled || !stored) return;

      audioClipIdRef.current = initialAudioClipId;
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const url = URL.createObjectURL(stored.blob);
      audioUrlRef.current = url;
      audioBlobRef.current = stored.blob;
      setAudioUrl(url);
      setAudioBytes(stored.bytes || stored.blob.size);
      setAudioMimeType(stored.mimeType || 'audio/webm');
      setAnalysisWarning(describeOversizedAudio(stored.bytes || stored.blob.size));
    })();

    return () => {
      cancelled = true;
    };
  }, [initialAudioClipId]);

  // Hand every change up to the observation, which autosaves it against this
  // teacher. Runs for typed corrections too, not only for captured speech.
  useEffect(() => {
    const signature = `${segments.length}|${transcript}`;
    if (signature === lastPublishedRef.current) return;
    lastPublishedRef.current = signature;
    onTranscriptChange?.(transcript, segments);
  }, [transcript, segments]);

  // Keep the newest line in view while the lesson is running, so the panel
  // reads as a live feed rather than something to scroll after the fact.
  useEffect(() => {
    if (!isRecording || !transcriptRef.current) return;
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [transcript, interimText, isRecording]);

  const handleCopyTranscript = async () => {
    const text = transcript.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      // The clipboard API is refused without a user gesture in some browsers
      // and absent entirely over plain http, so fall back to selecting the
      // text and let the appraiser press the shortcut.
      transcriptRef.current?.focus();
      transcriptRef.current?.select();
      setCopyState('blocked');
    }
  };

  // Bytes on disk stand in for "there is a clip": the blob itself is a ref,
  // and a ref cannot re-render the controls that depend on it.
  const hasAudio = audioBytes > 0;

  const handleClearTranscript = () => {
    if (!transcript && segments.length === 0) return;
    const confirmed = window.confirm(
      'Clear the transcript for this observation? The captured lines are removed from the teacher\'s record.'
    );
    if (!confirmed) return;
    setTranscript('');
    setSegments([]);
    setInterimText('');
    transcriptOffsetRef.current = 0;
    setCopyState('idle');
  };

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      // Without this the restart timer outlives the component and reopens the
      // microphone after the appraiser has left the sheet.
      speechShouldRunRef.current = false;
      if (speechRestartTimerRef.current) clearTimeout(speechRestartTimerRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
      // The clip stays on the device; only this window onto it is released.
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  return (
    <div className="bg-white text-slate-800 rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-5 pb-3 sm:pb-4 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-0.5">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2 flex-wrap">
              <span>Live Lesson Audio Capture &amp; AI</span>
              <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Gemini 3.7 Flash
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Record live classroom audio or upload audio to evaluate talk time and cognitive depth.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isRecording && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 px-3 py-1.5 rounded-full">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
              <span className="text-[11px] sm:text-xs font-semibold text-red-600 uppercase tracking-wider">Recording</span>
              <span className="text-xs text-slate-700 font-mono font-bold">{formatTime(recordingTime)}</span>
            </div>
          )}

          {existingAnalysis && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>AI Analysis Active</span>
            </div>
          )}
        </div>
      </div>

      {/* Recording Controls & Visualizer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-center">
        {/* Left: Action Buttons */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {!isRecording ? (
              <button
                id="btn-start-record"
                type="button"
                onClick={startRecording}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition shadow-sm cursor-pointer text-xs sm:text-sm min-h-[44px]"
              >
                <Mic className="w-4 h-4" />
                <span>Start Live Recording</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  id="btn-pause-record"
                  type="button"
                  onClick={togglePause}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-xl transition text-xs sm:text-sm cursor-pointer min-h-[44px]"
                >
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  <span>{isPaused ? 'Resume' : 'Pause'}</span>
                </button>
                <button
                  id="btn-stop-record"
                  type="button"
                  onClick={stopRecording}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl transition text-xs sm:text-sm cursor-pointer min-h-[44px]"
                >
                  <Square className="w-4 h-4" />
                  <span>Stop</span>
                </button>
              </div>
            )}

            <label
              htmlFor="audio-file-upload"
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-xl border border-slate-200 transition cursor-pointer text-xs sm:text-sm shadow-2xs min-h-[44px]"
              title="Upload existing audio file (MP3, WebM, WAV, M4A)"
            >
              <Upload className="w-4 h-4 text-slate-500" />
              <span>Upload Audio</span>
              <input
                id="audio-file-upload"
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Status & Timer */}
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isRecording ? (isPaused ? 'bg-amber-400' : 'bg-red-500 animate-ping') : 'bg-slate-400'
                }`}
              />
              <span>
                {isRecording
                  ? isPaused
                    ? 'Recording Paused'
                    : 'Recording Live Classroom...'
                  : audioUrl
                  ? `Audio Saved on This Device${audioBytes ? ` (${formatBytes(audioBytes)})` : ''}`
                  : 'Ready to Record'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-sm text-slate-700 font-semibold">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{formatTime(recordingTime)}</span>
            </div>
          </div>
        </div>

        {/* Center: Live Waveform Canvas */}
        <div className="lg:col-span-4 bg-slate-50 rounded-xl p-3 border border-slate-200 flex flex-col justify-center h-24">
          {isRecording ? (
            <canvas ref={canvasRef} width={280} height={70} className="w-full h-full" />
          ) : audioUrl ? (
            <div className="flex flex-col items-center justify-center gap-2 py-1">
              <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium">
                <Volume2 className="w-4 h-4" />
                <span>Audio Captured Successfully</span>
              </div>
              <audio
                src={audioUrl}
                controls
                className="w-full h-8 opacity-90"
                onLoadedMetadata={(e) => {
                  // An uploaded clip has no duration until it is read, and a
                  // recorded one reports Infinity in Chrome until it seeks.
                  const seconds = e.currentTarget.duration;
                  const clipId = audioClipIdRef.current;
                  if (!clipId || !Number.isFinite(seconds) || seconds <= 0) return;
                  onAudioCaptured?.({ clipId, mimeType: audioMimeType, durationSeconds: Math.round(seconds) });
                }}
              />
            </div>
          ) : (
            <div className="text-center text-xs text-slate-400 flex flex-col items-center justify-center py-2">
              <Mic className="w-5 h-5 text-slate-300 mb-1" />
              <span>Audio waveform will appear during recording</span>
            </div>
          )}
        </div>

        {/* Right: AI Analyze Button */}
        <div className="lg:col-span-3">
          <button
            id="btn-run-ai-analysis"
            type="button"
            onClick={handleAnalyzeWithAI}
            disabled={isAnalyzing || isRecording || (!hasAudio && !transcript && !observerNotes)}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition shadow-sm ${
              isAnalyzing
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : !hasAudio && !transcript && !observerNotes
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100 cursor-pointer'
            }`}
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                <span>Analyzing Lesson...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Analyze with AI</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live Transcript - open by default and left open while recording, so
          the lesson can be read, corrected and copied as it is spoken. */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowTranscript((open) => !open)}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer flex items-center gap-1.5"
              aria-expanded={showTranscript}
            >
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Live Transcript &amp; Classroom Dialogue</span>
              <span className={`text-slate-400 transition-transform ${showTranscript ? 'rotate-180' : ''}`}>▼</span>
            </button>

            {isRecording && !isPaused && (
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                Live
              </span>
            )}

            {segments.length > 0 && (
              <span className="text-[11px] text-slate-500">
                {segments.length} timestamped {segments.length === 1 ? 'line' : 'lines'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {copyState === 'copied' && (
              <span className="text-[11px] font-medium text-emerald-600">Copied to clipboard</span>
            )}
            {copyState === 'blocked' && (
              <span className="text-[11px] font-medium text-amber-600">Selected - press Cmd/Ctrl+C</span>
            )}
            <button
              id="btn-transcribe-recording"
              type="button"
              onClick={handleTranscribeRecording}
              disabled={!hasAudio || isTranscribing || isRecording}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition ${
                hasAudio && !isTranscribing && !isRecording
                  ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 cursor-pointer'
                  : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
              }`}
              title="Transcribe the recording from the audio, with the teacher and the class told apart"
            >
              {isTranscribing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ScrollText className="w-3.5 h-3.5" />
              )}
              <span>
                {isTranscribing
                  ? transcribeProgress?.total
                    ? `Transcribing ${transcribeProgress.completed}/${transcribeProgress.total}`
                    : 'Reading audio...'
                  : 'Transcribe audio'}
              </span>
            </button>
            <button
              id="btn-copy-transcript"
              type="button"
              onClick={handleCopyTranscript}
              disabled={!transcript.trim()}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition ${
                transcript.trim()
                  ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 cursor-pointer'
                  : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
              }`}
              title="Copy the full timestamped transcript"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </button>
            <button
              id="btn-clear-transcript"
              type="button"
              onClick={handleClearTranscript}
              disabled={!transcript.trim() && segments.length === 0}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition ${
                transcript.trim() || segments.length
                  ? 'bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border-slate-200 cursor-pointer'
                  : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
              }`}
              title="Clear the transcript held for this observation"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {isTranscribing && (
          <div className="mb-2 p-2.5 rounded-xl bg-indigo-50 border border-indigo-100">
            <p className="text-[11px] text-indigo-800 font-medium mb-1.5">
              {transcribeProgress?.total
                ? `Transcribing the lesson from the audio - part ${Math.min(
                    transcribeProgress.completed + 1,
                    transcribeProgress.total
                  )} of ${transcribeProgress.total}. Leave this open.`
                : 'Reading the recording. A long lesson takes a moment to prepare.'}
            </p>
            <div className="h-1.5 rounded-full bg-indigo-100 overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{
                  width: transcribeProgress?.total
                    ? `${Math.round((transcribeProgress.completed / transcribeProgress.total) * 100)}%`
                    : '10%',
                }}
              />
            </div>
          </div>
        )}

        {transcribeNotice && !isTranscribing && (
          <div className="mb-2 flex items-start gap-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-emerald-800 leading-snug">{transcribeNotice}</p>
          </div>
        )}

        {showTranscript && (
          <>
            <textarea
              id="input-audio-transcript"
              ref={transcriptRef}
              value={transcript}
              onChange={(e) => {
                setTranscript(e.target.value);
                setCopyState('idle');
              }}
              placeholder="Speech is transcribed here with a [mm:ss] stamp as the lesson runs - a live preview of what the room is being heard as. Press Transcribe audio afterwards for the accurate pass, which reads the recording itself and tells the teacher and the class apart. Paste or correct classroom dialogue at any time; it is saved with the observation and cited by the AI analysis."
              rows={isRecording ? 10 : 6}
              className="w-full bg-slate-50 text-slate-800 text-xs rounded-xl p-3 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition resize-y font-mono leading-relaxed"
            />

            {interimText && (
              <p className="mt-1.5 text-[11px] text-slate-400 font-mono truncate">
                [{formatTime(transcriptOffsetRef.current + recordingTime)}] {interimText}...
              </p>
            )}

            <p className="mt-1.5 text-[11px] text-slate-400">
              Saved to {teacherName ? `${teacherName}'s` : "this teacher's"} observation as it is captured, and
              carried into the report and the AI analysis.
            </p>
          </>
        )}
      </div>

      {/* Oversized-audio notice: the analysis still runs, from the transcript */}
      {analysisWarning && !analysisError && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">Audio Too Long to Send: </span>
            {analysisWarning}
          </div>
        </div>
      )}

      {/* Error Alert */}
      {analysisError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">Analysis Notice: </span>
            {analysisError}
          </div>
        </div>
      )}
    </div>
  );
};
