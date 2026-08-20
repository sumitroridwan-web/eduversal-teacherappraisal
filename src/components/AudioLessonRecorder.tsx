import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Upload, Sparkles, Volume2, AlertCircle, RefreshCw, Clock, CheckCircle2, FileText, Copy, Trash2 } from 'lucide-react';
import { AiLessonAnalysis, CareerLevel, TranscriptSegment } from '../types';

/**
 * How much base64 audio a single analysis request may carry.
 *
 * Vercel refuses any request body over 4.5MB at the edge, before the function
 * runs, and answers with the plain text "Request Entity Too Large" - which is
 * what surfaced as "Unexpected token 'R'" when the reply was parsed as JSON.
 * Base64 inflates audio by a third, so this budget is what the encoded audio
 * may weigh, leaving room for the transcript and the rest of the envelope.
 */
const MAX_AUDIO_BASE64_BYTES = 4_000_000;

/**
 * Opus at 12 kbps mono stays intelligible for classroom speech and keeps
 * roughly the first 35 minutes of a lesson inside the budget above. The
 * browser default is several times higher, which is why a half-hour
 * observation could not be sent at all.
 */
const SPEECH_BITS_PER_SECOND = 12_000;

const formatMegabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/**
 * The notice to show when captured audio is past what the endpoint accepts,
 * or null when it fits. Raised as soon as the audio is captured rather than
 * on analysis, so the appraiser can re-record while the lesson is still live.
 */
const describeOversizedAudio = (base64Length: number): string | null => {
  if (base64Length <= MAX_AUDIO_BASE64_BYTES) return null;
  return `This audio weighs ${formatMegabytes(base64Length)} encoded, past the ${formatMegabytes(
    MAX_AUDIO_BASE64_BYTES
  )} the analysis endpoint accepts. The lesson will be analysed from the transcript and your notes instead - record in shorter segments to have the audio itself analysed.`;
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
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
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
  const [audioMimeType, setAudioMimeType] = useState<string>('audio/webm');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  // Elapsed seconds, mirrored in a ref so the speech callback can stamp a
  // segment without being re-created on every tick.
  const recordingTimeRef = useRef(0);
  const finalisedResultsRef = useRef(0);
  const transcriptRef = useRef<HTMLTextAreaElement | null>(null);
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

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start live recording
  const startRecording = async () => {
    try {
      setAnalysisError(null);
      setAnalysisWarning(null);
      // Mono, cleaned-up speech: half the bytes of stereo and a clearer signal
      // for the transcription than raw room noise.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
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
        const audioBlob = new Blob(audioChunksRef.current, { type: mime });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);

        // Convert to base64 for API transmission
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64String = (reader.result as string).split(',')[1];
          setAudioBase64(base64String);
          setAudioBytes(base64String.length);
          setAnalysisWarning(describeOversizedAudio(base64String.length));
        };

        // Stop stream tracks
        stream.getTracks().forEach((track) => track.stop());
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };

      // Optional Browser SpeechRecognition for live text capture
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';

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

          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch (recErr) {
          console.warn('Speech recognition not available or blocked', recErr);
        }
      }

      mediaRecorder.start(1000); // 1 sec chunks
      recordingTimeRef.current = 0;
      finalisedResultsRef.current = 0;
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
      setInterimText('');
      setIsRecording(false);
      setIsPaused(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (e) {}
      }
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
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
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

    setAudioMimeType(file.type || 'audio/webm');
    const url = URL.createObjectURL(file);
    setAudioUrl(url);

    setAnalysisError(null);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      setAudioBase64(base64);
      setAudioBytes(base64.length);
      setAnalysisWarning(describeOversizedAudio(base64.length));
    };
  };

  // Trigger Gemini AI Lesson Analysis
  const handleAnalyzeWithAI = async () => {
    const writtenEvidence = (transcript || '').trim() || (observerNotes || '').trim();
    if (!audioBase64 && !writtenEvidence) {
      setAnalysisError('Please record audio, upload an audio file, or provide lesson transcript/notes for AI analysis.');
      return;
    }

    // Audio past the budget cannot be sent at all, so the analysis falls back
    // to what was written down. With nothing written there is nothing to fall
    // back to, and saying so beats letting the request die at the edge.
    const audioFits = !!audioBase64 && audioBase64.length <= MAX_AUDIO_BASE64_BYTES;
    if (audioBase64 && !audioFits && !writtenEvidence) {
      setAnalysisError(
        `This recording weighs ${formatMegabytes(audioBase64.length)} encoded and cannot be sent for analysis. ` +
          'Record the lesson in shorter segments, or paste the classroom dialogue into the transcript below so ' +
          'the lesson can be analysed from your notes.'
      );
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const payload = {
        audioBase64: audioFits ? audioBase64 : null,
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
            ? 'The recording was too large for the server to accept. Record in shorter segments, or analyse from the transcript.'
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
      if (audioContextRef.current) audioContextRef.current.close();
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
                  ? `Audio Ready for Analysis${audioBytes ? ` (${formatMegabytes(audioBytes)})` : ''}`
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
              <audio src={audioUrl} controls className="w-full h-8 opacity-90" />
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
            disabled={isAnalyzing || isRecording || (!audioBase64 && !transcript && !observerNotes)}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition shadow-sm ${
              isAnalyzing
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : !audioBase64 && !transcript && !observerNotes
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
              placeholder="Speech is transcribed here with a [mm:ss] stamp as the lesson runs. Paste or correct classroom dialogue at any time - it is saved with the observation and cited by the AI analysis."
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
