/**
 * Turning a stored lesson recording into a transcript the record can cite.
 *
 * The browser's speech engine runs while the lesson is live so the appraiser
 * can see the capture is following the room, but it is a dictation tool: one
 * near voice, one language, no idea who is speaking. This drives the real
 * pass - the recording is cut into windows, each is sent to the server to be
 * transcribed against the audio itself, and the replies are stitched back
 * into one timeline.
 */
import { TranscriptSegment } from '../types';
import { splitForTranscription } from './audioWindows';

/**
 * How many windows to have in flight at once.
 *
 * Windows are independent, so this is only a question of how hard to lean on
 * the transcription quota. Three keeps a long lesson moving without a burst
 * of twenty simultaneous requests that the provider would start refusing.
 */
const WINDOW_CONCURRENCY = 3;

export interface TranscriptionProgress {
  /** Windows whose reply is in, successful or not. */
  completed: number;
  total: number;
}

export interface TranscriptionResult {
  segments: TranscriptSegment[];
  /** Windows that could not be transcribed; the rest of the lesson still is. */
  failedWindows: number;
  totalWindows: number;
}

/**
 * Render segments as the transcript text the appraiser reads and edits.
 *
 * The stamp leads each line because every citation downstream - the rubric
 * evidence, the classroom conditions, the AI narrative - is anchored to it.
 */
export function formatTranscriptText(segments: TranscriptSegment[]): string {
  return segments
    .map((seg) =>
      seg.speaker && seg.speaker !== 'Unclear'
        ? `[${seg.timeLabel}] ${seg.speaker}: ${seg.text}`
        : `[${seg.timeLabel}] ${seg.text}`
    )
    .join('\n');
}

/**
 * Run tasks a few at a time, keeping every result in the order it was queued.
 *
 * Written out rather than pulled in: the whole of it is a worker loop pulling
 * from a shared cursor, and a dependency for that would cost more than it saves.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Transcribe a whole recording, however long it is.
 *
 * A window that fails is counted and skipped rather than taking the lesson
 * down with it: forty minutes of observation with one bad minute is still
 * worth having, and the caller is told how much is missing so it can say so.
 */
export async function transcribeRecording(
  blob: Blob,
  options: {
    language: string;
    onProgress?: (progress: TranscriptionProgress) => void;
    signal?: AbortSignal;
  }
): Promise<TranscriptionResult> {
  const windows = await splitForTranscription(blob);
  if (!windows.length) {
    return { segments: [], failedWindows: 0, totalWindows: 0 };
  }

  let completed = 0;
  let failedWindows = 0;
  options.onProgress?.({ completed: 0, total: windows.length });

  const perWindow = await mapWithConcurrency(
    windows,
    WINDOW_CONCURRENCY,
    async (window): Promise<TranscriptSegment[]> => {
      try {
        if (options.signal?.aborted) return [];

        const query = new URLSearchParams({
          offsetSeconds: String(Math.round(window.startSeconds)),
          language: options.language,
          mimeType: 'audio/wav',
        });

        const res = await fetch(`/api/transcribe-window?${query}`, {
          method: 'POST',
          headers: { 'Content-Type': 'audio/wav' },
          body: window.blob,
          signal: options.signal,
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || `Transcription returned HTTP ${res.status}`);
        }
        return Array.isArray(json.segments) ? json.segments : [];
      } catch (err) {
        if (options.signal?.aborted) return [];
        console.warn(`Window ${window.index} could not be transcribed`, err);
        failedWindows++;
        return [];
      } finally {
        completed++;
        options.onProgress?.({ completed, total: windows.length });
      }
    }
  );

  // Concatenated in window order, which is already lesson order - each window
  // was stamped against the offset it starts at before it came back.
  const segments = perWindow.flat();

  return { segments, failedWindows, totalWindows: windows.length };
}
