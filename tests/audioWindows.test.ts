/**
 * A lesson recording is longer than any one request may carry, so it is cut
 * into windows before it is transcribed.
 *
 * What matters about that cut is arithmetic, and it is checked here without a
 * browser: that no window is large enough to be refused at the edge, that the
 * windows together cover the whole lesson with no gap and no overlap, and that
 * each one knows where in the lesson it starts - because a stamp that is wrong
 * by a window is a citation pointing at the wrong minute of the observation.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  planWindows,
  maxSamplesPerWindow,
  encodeWav,
  MAX_WINDOW_BYTES,
  TRANSCRIBE_SAMPLE_RATE,
} from '../src/services/audioWindows';
import { formatTranscriptText } from '../src/services/transcription';
import type { TranscriptSegment } from '../src/types';

const WAV_HEADER_BYTES = 44;
const seconds = (n: number) => n * TRANSCRIBE_SAMPLE_RATE;

describe('planWindows', () => {
  test('leaves a short lesson in one piece', () => {
    const plans = planWindows(seconds(60));
    assert.equal(plans.length, 1);
    assert.equal(plans[0].startSeconds, 0);
    assert.equal(plans[0].sampleCount, seconds(60));
  });

  test('keeps every window inside what a request accepts', () => {
    // Two hours: longer than any observation, and well past a single request.
    for (const lesson of [seconds(60), seconds(20 * 60), seconds(45 * 60), seconds(120 * 60)]) {
      for (const plan of planWindows(lesson)) {
        const bytes = WAV_HEADER_BYTES + plan.sampleCount * 2;
        assert.ok(
          bytes <= MAX_WINDOW_BYTES,
          `a ${lesson / TRANSCRIBE_SAMPLE_RATE}s lesson produced a ${bytes} byte window`
        );
      }
    }
  });

  test('covers the whole lesson with no gap and no overlap', () => {
    const lesson = seconds(45 * 60);
    const plans = planWindows(lesson);

    assert.ok(plans.length > 1, 'a 45 minute lesson needs more than one window');
    assert.equal(plans[0].startSample, 0);

    let expectedStart = 0;
    for (const plan of plans) {
      assert.equal(plan.startSample, expectedStart);
      expectedStart += plan.sampleCount;
    }
    assert.equal(expectedStart, lesson, 'the windows do not add up to the recording');
  });

  test('reports each window start in seconds, matching its sample offset', () => {
    for (const plan of planWindows(seconds(45 * 60))) {
      assert.equal(plan.startSeconds, plan.startSample / TRANSCRIBE_SAMPLE_RATE);
      assert.equal(plan.durationSeconds, plan.sampleCount / TRANSCRIBE_SAMPLE_RATE);
    }
  });

  test('spreads the remainder rather than leaving a sliver at the end', () => {
    // Just over one window: a greedy split would leave a second window of a
    // few seconds, which transcribes badly out of context.
    const plans = planWindows(maxSamplesPerWindow() + seconds(5));
    assert.equal(plans.length, 2);
    const ratio = plans[1].sampleCount / plans[0].sampleCount;
    assert.ok(ratio > 0.9, `the last window is only ${Math.round(ratio * 100)}% of the first`);
  });

  test('has nothing to say about an empty recording', () => {
    assert.deepEqual(planWindows(0), []);
    assert.deepEqual(planWindows(-1), []);
  });

  test('numbers the windows in order from zero', () => {
    const plans = planWindows(seconds(45 * 60));
    assert.deepEqual(
      plans.map((p) => p.index),
      plans.map((_, i) => i)
    );
  });
});

describe('encodeWav', () => {
  test('writes a header a decoder can read', () => {
    const buffer = encodeWav(new Float32Array(seconds(1)));
    const view = new DataView(buffer);
    const ascii = (offset: number, length: number) =>
      String.fromCharCode(...new Uint8Array(buffer, offset, length));

    assert.equal(ascii(0, 4), 'RIFF');
    assert.equal(ascii(8, 4), 'WAVE');
    assert.equal(ascii(12, 4), 'fmt ');
    assert.equal(ascii(36, 4), 'data');
    assert.equal(view.getUint16(20, true), 1, 'not flagged as PCM');
    assert.equal(view.getUint16(22, true), 1, 'not flagged as mono');
    assert.equal(view.getUint32(24, true), TRANSCRIBE_SAMPLE_RATE);
    assert.equal(view.getUint16(34, true), 16, 'not flagged as 16-bit');
  });

  test('declares the length it actually wrote', () => {
    const buffer = encodeWav(new Float32Array(1000));
    const view = new DataView(buffer);
    assert.equal(buffer.byteLength, WAV_HEADER_BYTES + 2000);
    assert.equal(view.getUint32(40, true), 2000, 'data chunk size');
    assert.equal(view.getUint32(4, true), 36 + 2000, 'riff size');
  });

  test('clamps a clipped classroom instead of wrapping it round', () => {
    // Recorded without automatic gain, a loud moment does go past full scale.
    // Wrapping would turn the loudest instant of the lesson into noise.
    const view = new DataView(encodeWav(new Float32Array([1.5, -1.5, 0])));
    assert.equal(view.getInt16(WAV_HEADER_BYTES, true), 32767);
    assert.equal(view.getInt16(WAV_HEADER_BYTES + 2, true), -32768);
    assert.equal(view.getInt16(WAV_HEADER_BYTES + 4, true), 0);
  });
});

describe('formatTranscriptText', () => {
  const line = (over: Partial<TranscriptSegment>): TranscriptSegment => ({
    startSeconds: 0,
    timeLabel: '00:00',
    text: 'text',
    ...over,
  });

  test('leads every line with the stamp citations are anchored to', () => {
    const text = formatTranscriptText([
      line({ timeLabel: '00:05', speaker: 'Teacher', text: 'What do you notice?' }),
      line({ timeLabel: '00:09', speaker: 'Students', text: 'It floats!' }),
    ]);
    assert.equal(text, '[00:05] Teacher: What do you notice?\n[00:09] Students: It floats!');
  });

  test('names nobody when the audio could not say who spoke', () => {
    assert.equal(formatTranscriptText([line({ speaker: 'Unclear', text: 'sit down' })]), '[00:00] sit down');
    assert.equal(formatTranscriptText([line({ text: 'sit down' })]), '[00:00] sit down');
  });

  test('has nothing to render for an empty lesson', () => {
    assert.equal(formatTranscriptText([]), '');
  });
});
