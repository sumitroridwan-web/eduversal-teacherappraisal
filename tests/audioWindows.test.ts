/**
 * A lesson recording is longer than any one request may carry, so it is cut
 * into windows before it is read.
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
  SPEECH_SAMPLE_RATE,
} from '../src/services/audioWindows';
import { formatLessonNotes } from '../src/services/lessonInsights';
import type { LessonInsight } from '../src/types';

const WAV_HEADER_BYTES = 44;
const seconds = (n: number) => n * SPEECH_SAMPLE_RATE;

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
          `a ${lesson / SPEECH_SAMPLE_RATE}s lesson produced a ${bytes} byte window`
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
      assert.equal(plan.startSeconds, plan.startSample / SPEECH_SAMPLE_RATE);
      assert.equal(plan.durationSeconds, plan.sampleCount / SPEECH_SAMPLE_RATE);
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
    assert.equal(view.getUint32(24, true), SPEECH_SAMPLE_RATE);
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

describe('formatLessonNotes', () => {
  const note = (over: Partial<LessonInsight>): LessonInsight => ({
    startSeconds: 0,
    timeLabel: '00:00',
    focus: 'Lesson Activity',
    note: 'The teacher set the task.',
    heardFrom: ['Teacher speech'],
    ...over,
  });

  test('leads every note with the stamp citations are anchored to', () => {
    const text = formatLessonNotes([
      note({
        timeLabel: '00:05',
        note: 'The teacher opened with a recall question about the graph.',
        heardFrom: ['Teacher speech'],
        quote: 'what do you notice about the graph',
      }),
      note({
        timeLabel: '00:09',
        focus: 'Classroom Environment',
        note: 'Several students answered together without being nominated.',
        heardFrom: ['Student speech', 'Classroom sound'],
      }),
    ]);

    assert.equal(
      text,
      '[00:05] Lesson Activity - The teacher opened with a recall question about the graph. ' +
        '(teacher speech; "what do you notice about the graph")\n' +
        '[00:09] Classroom Environment - Several students answered together without being ' +
        'nominated. (student speech, class noise)'
    );
  });

  test('carries the words a note rests on, so a rating cited to it can be checked', () => {
    // An appraisal that affects progression has to be able to show what was
    // said. A note summarising a moment cannot do that on its own, so the
    // quotation travels with it into the text the citation checker searches.
    const text = formatLessonNotes([note({ quote: 'so why did the volume change' })]);
    assert.match(text, /"so why did the volume change"/);
  });

  test('says what a note rests on even where nobody was quoted', () => {
    const text = formatLessonNotes([
      note({ focus: 'Classroom Environment', note: 'Chairs scraped throughout the transition.', heardFrom: ['Classroom sound'] }),
    ]);
    assert.equal(text, '[00:00] Classroom Environment - Chairs scraped throughout the transition. (class noise)');
  });

  test('has nothing to render for an empty lesson', () => {
    assert.equal(formatLessonNotes([]), '');
  });
});
