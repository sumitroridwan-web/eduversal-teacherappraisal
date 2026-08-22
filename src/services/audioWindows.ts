/**
 * Cutting a lesson recording into windows a transcription request can carry.
 *
 * The recorder keeps one clip per observation, and that clip is routinely far
 * larger than the 4.5MB a request may weigh. A recording cannot simply be
 * sliced by byte offset to get round that: WebM writes its header once, at the
 * front, so every piece after the first is undecodable on its own. The clip is
 * therefore decoded and re-encoded here, one self-contained window at a time.
 *
 * Windows are 16 kHz mono 16-bit WAV. That is what speech recognition wants -
 * uncompressed, at the rate the acoustic models are trained on - and it is
 * reached by decoding rather than by re-recording, so it works the same on a
 * clip captured a moment ago and on one restored from the device after a
 * reload.
 */

/** The rate speech models are trained at; more is spent bytes, less loses consonants. */
export const TRANSCRIBE_SAMPLE_RATE = 16_000;

const BYTES_PER_SAMPLE = 2; // 16-bit PCM
const WAV_HEADER_BYTES = 44;

/**
 * How large one window may be.
 *
 * The window is posted as raw bytes rather than base64 inside JSON, so the
 * body is the audio itself and none of the 33% that base64 would add. The
 * host refuses anything over 4.5MB at the edge, before any of this code runs;
 * the rest is headroom for the request line and headers.
 */
export const MAX_WINDOW_BYTES = 3_500_000;

export interface AudioWindow {
  /** Position in the recording, counted from zero, for reassembly. */
  index: number;
  /** Where this window begins within the whole recording. */
  startSeconds: number;
  durationSeconds: number;
  blob: Blob;
}

/** A window's span in the source recording, in samples. */
export interface WindowPlan {
  index: number;
  startSample: number;
  sampleCount: number;
  startSeconds: number;
  durationSeconds: number;
}

/**
 * The most samples that fit one request at a given rate. Kept separate from
 * the audio work so the arithmetic that decides whether a window will be
 * refused at the edge can be checked without a browser.
 */
export function maxSamplesPerWindow(
  sampleRate: number = TRANSCRIBE_SAMPLE_RATE,
  maxBytes: number = MAX_WINDOW_BYTES
): number {
  const usable = maxBytes - WAV_HEADER_BYTES;
  if (usable <= 0) return 0;
  return Math.floor(usable / BYTES_PER_SAMPLE);
}

/**
 * Divide a recording into equal windows no larger than the budget.
 *
 * Equal rather than greedy: a greedy split leaves a last window of a few
 * seconds, and a few seconds of classroom audio out of context transcribes
 * badly. Spreading the remainder keeps every window a comparable stretch of
 * lesson.
 */
export function planWindows(
  totalSamples: number,
  sampleRate: number = TRANSCRIBE_SAMPLE_RATE,
  maxBytes: number = MAX_WINDOW_BYTES
): WindowPlan[] {
  if (totalSamples <= 0) return [];

  const ceiling = maxSamplesPerWindow(sampleRate, maxBytes);
  if (ceiling <= 0) return [];

  const windowCount = Math.max(1, Math.ceil(totalSamples / ceiling));
  const perWindow = Math.ceil(totalSamples / windowCount);

  const plans: WindowPlan[] = [];
  for (let start = 0, index = 0; start < totalSamples; start += perWindow, index++) {
    const sampleCount = Math.min(perWindow, totalSamples - start);
    plans.push({
      index,
      startSample: start,
      sampleCount,
      startSeconds: start / sampleRate,
      durationSeconds: sampleCount / sampleRate,
    });
  }
  return plans;
}

/**
 * Write mono float samples as a 16-bit PCM WAV.
 *
 * Samples arrive in the -1..1 the Web Audio API works in and are clamped on
 * the way out: a classroom recorded without automatic gain does clip
 * occasionally, and letting that wrap round would turn a loud moment into
 * noise rather than into a loud moment.
 */
export function encodeWav(
  samples: Float32Array,
  sampleRate: number = TRANSCRIBE_SAMPLE_RATE
): ArrayBuffer {
  const dataBytes = samples.length * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true); // byte rate
  view.setUint16(32, BYTES_PER_SAMPLE, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = WAV_HEADER_BYTES;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += BYTES_PER_SAMPLE;
  }

  return buffer;
}

/** decodeAudioData is promise-returning everywhere current and callback-only on older Safari. */
function decodeAudioData(context: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const maybePromise = context.decodeAudioData(data, resolve, reject);
    if (maybePromise && typeof (maybePromise as any).then === 'function') {
      (maybePromise as Promise<AudioBuffer>).then(resolve, reject);
    }
  });
}

/** Average the channels: a classroom is one scene, and mono halves the bytes. */
function downmixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);

  const mixed = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    for (let i = 0; i < source.length; i++) mixed[i] += source[i];
  }
  for (let i = 0; i < mixed.length; i++) mixed[i] /= buffer.numberOfChannels;
  return mixed;
}

/**
 * Decode a recording to 16 kHz mono samples.
 *
 * Asking an OfflineAudioContext built at 16 kHz to decode gives a correctly
 * resampled buffer in one pass on Chrome and Firefox, which is the cheap path
 * and the one nearly every appraiser takes. Safari decodes at the file's own
 * rate instead, so the result is rendered through a second context to bring
 * it down - correct, but it holds both buffers at once, which is why it is
 * not the path taken by default.
 */
async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const OfflineCtx: typeof OfflineAudioContext =
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  if (!OfflineCtx) throw new Error('This browser cannot decode audio for transcription.');

  const bytes = await blob.arrayBuffer();
  const decoded = await decodeAudioData(new OfflineCtx(1, 1, TRANSCRIBE_SAMPLE_RATE), bytes);

  if (decoded.sampleRate === TRANSCRIBE_SAMPLE_RATE) return downmixToMono(decoded);

  const frames = Math.ceil(decoded.duration * TRANSCRIBE_SAMPLE_RATE);
  const resampler = new OfflineCtx(1, frames, TRANSCRIBE_SAMPLE_RATE);
  const source = resampler.createBufferSource();
  source.buffer = decoded;
  source.connect(resampler.destination);
  source.start();
  const rendered = await resampler.startRendering();
  return rendered.getChannelData(0);
}

/**
 * Cut a recording into transcribable windows.
 *
 * Returns them in order with the offset each one begins at, so a transcript
 * assembled from the replies carries timestamps against the lesson rather than
 * against the window.
 */
export async function splitForTranscription(blob: Blob): Promise<AudioWindow[]> {
  const samples = await decodeToMono16k(blob);
  if (!samples.length) return [];

  return planWindows(samples.length, TRANSCRIBE_SAMPLE_RATE).map((plan) => ({
    index: plan.index,
    startSeconds: plan.startSeconds,
    durationSeconds: plan.durationSeconds,
    blob: new Blob(
      [encodeWav(samples.subarray(plan.startSample, plan.startSample + plan.sampleCount))],
      { type: 'audio/wav' }
    ),
  }));
}
