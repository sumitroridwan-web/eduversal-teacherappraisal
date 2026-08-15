import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Upload, Sparkles, Volume2, AlertCircle, RefreshCw, Clock, CheckCircle2 } from 'lucide-react';
import { AiLessonAnalysis, CareerLevel } from '../types';

interface AudioLessonRecorderProps {
  teacherName: string;
  subject: string;
  careerLevel: CareerLevel;
  gradeClass: string;
  lessonTopic: string;
  learningObjectives?: string;
  observerNotes?: string;
  onAnalysisComplete: (analysis: AiLessonAnalysis, transcriptText?: string) => void;
  existingAnalysis?: AiLessonAnalysis;
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
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string>('audio/webm');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<any>(null);

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

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

      const mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
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
            let fullText = '';
            for (let i = 0; i < event.results.length; i++) {
              fullText += event.results[i][0].transcript + ' ';
            }
            if (fullText.trim()) {
              setTranscript((prev) => (prev ? prev + ' ' + fullText.trim() : fullText.trim()));
            }
          };

          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch (recErr) {
          console.warn('Speech recognition not available or blocked', recErr);
        }
      }

      mediaRecorder.start(1000); // 1 sec chunks
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
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
        setRecordingTime((t) => t + 1);
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

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      setAudioBase64(base64);
    };
  };

  // Trigger Gemini AI Lesson Analysis
  const handleAnalyzeWithAI = async () => {
    if (!audioBase64 && !transcript && !observerNotes) {
      setAnalysisError('Please record audio, upload an audio file, or provide lesson transcript/notes for AI analysis.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const payload = {
        audioBase64: audioBase64 || null,
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

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to analyze lesson');
      }

      onAnalysisComplete(json.data, transcript);
    } catch (err: any) {
      console.error('AI Analysis failed:', err);
      setAnalysisError(err.message || 'An error occurred while contacting the Gemini AI service.');
    } finally {
      setIsAnalyzing(false);
    }
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
                  ? 'Audio Ready for Analysis'
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

      {/* Transcript / Dialogue Scratchpad */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <details className="group">
          <summary className="text-xs font-medium text-slate-500 hover:text-slate-700 cursor-pointer flex items-center justify-between">
            <span>Speech Transcript &amp; Classroom Dialogue Scratchpad (Optional)</span>
            <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="mt-2">
            <textarea
              id="input-audio-transcript"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Live speech-to-text transcript or paste key lesson dialogue excerpts here to assist Gemini AI analysis..."
              rows={3}
              className="w-full bg-slate-50 text-slate-800 text-xs rounded-xl p-3 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition resize-y font-mono"
            />
          </div>
        </details>
      </div>

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
