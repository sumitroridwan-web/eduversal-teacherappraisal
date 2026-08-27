/**
 * Turning a stored lesson recording into the notes an appraiser writes up.
 *
 * The recording is read for what it shows, not for what was said word for
 * word. A verbatim transcript of forty minutes runs to thousands of lines,
 * and an appraiser reading it back has to do the whole observation a second
 * time before it says anything; what they actually need on the sheet is the
 * lesson as it unfolded - the activity running at each point, and the state
 * of the room around it - already written as sentences they can lift into a
 * report.
 *
 * The recording is cut into windows, each is sent to the server to be read
 * against the audio itself, and the replies are stitched back into one
 * timeline. The browser's own speech engine still runs while the lesson is
 * live so the appraiser can see the capture is following the room, but it is
 * a dictation tool - one near voice, one language, no idea who is speaking -
 * and nothing it hears goes onto the record.
 */
import { LessonInsight, LessonInsightSource } from '../types';
import { splitForInsightPass } from './audioWindows';

/**
 * How many windows to have in flight at once.
 *
 * Windows are independent, so this is only a question of how hard to lean on
 * the quota. Three keeps a long lesson moving without a burst of twenty
 * simultaneous requests that the provider would start refusing.
 */
const WINDOW_CONCURRENCY = 3;

export interface InsightProgress {
  /** Windows whose reply is in, successful or not. */
  completed: number;
  total: number;
}

export interface InsightPassResult {
  insights: LessonInsight[];
  /** Windows that could not be read; the rest of the lesson still was. */
  failedWindows: number;
  totalWindows: number;
}

/** How a note's basis reads in the written line: "teacher speech, class noise". */
const SOURCE_LABELS: Record<LessonInsightSource, string> = {
  'Teacher speech': 'teacher speech',
  'Student speech': 'student speech',
  'Classroom sound': 'class noise',
};

/**
 * Render insights as the lesson notes the appraiser reads and edits.
 *
 * The stamp leads each line because every citation downstream - the rubric
 * evidence, the classroom conditions, the AI narrative - is anchored to it.
 * What the note rests on trails it in brackets, so an appraiser challenged on
 * a line can see at a glance whether it came from the teacher, the class or
 * the noise of the room, and read back the words it turned on.
 */
export function formatLessonNotes(insights: LessonInsight[]): string {
  return insights
    .map((insight) => {
      const sources = (insight.heardFrom || [])
        .map((source) => SOURCE_LABELS[source] || String(source).toLowerCase())
        .join(', ');
      const quote = insight.quote?.trim();
      const basis = [sources, quote ? `"${quote}"` : ''].filter(Boolean).join('; ');
      const head = `[${insight.timeLabel}] ${insight.focus} - ${insight.note}`;
      return basis ? `${head} (${basis})` : head;
    })
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
 * Read a whole recording for lesson insights, however long it is.
 *
 * A window that fails is counted and skipped rather than taking the lesson
 * down with it: forty minutes of observation with one bad minute is still
 * worth having, and the caller is told how much is missing so it can say so.
 */
export async function readLessonInsights(
  blob: Blob,
  options: {
    language: string;
    onProgress?: (progress: InsightProgress) => void;
    signal?: AbortSignal;
  }
): Promise<InsightPassResult> {
  const windows = await splitForInsightPass(blob);
  if (!windows.length) {
    return { insights: [], failedWindows: 0, totalWindows: 0 };
  }

  let completed = 0;
  let failedWindows = 0;
  options.onProgress?.({ completed: 0, total: windows.length });

  const perWindow = await mapWithConcurrency(
    windows,
    WINDOW_CONCURRENCY,
    async (window): Promise<LessonInsight[]> => {
      try {
        if (options.signal?.aborted) return [];

        const query = new URLSearchParams({
          offsetSeconds: String(Math.round(window.startSeconds)),
          language: options.language,
          mimeType: 'audio/wav',
        });

        const res = await fetch(`/api/lesson-insights-window?${query}`, {
          method: 'POST',
          headers: { 'Content-Type': 'audio/wav' },
          body: window.blob,
          signal: options.signal,
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || `The insight pass returned HTTP ${res.status}`);
        }
        return Array.isArray(json.insights) ? json.insights : [];
      } catch (err) {
        if (options.signal?.aborted) return [];
        console.warn(`Window ${window.index} could not be read`, err);
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
  const insights = perWindow.flat();

  return { insights, failedWindows, totalWindows: windows.length };
}
