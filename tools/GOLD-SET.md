# The double-coded gold set

Everything else this platform does rests on an unmeasured assumption: that a
Framework 2 rating means roughly the same thing whoever produced it. This is the
protocol that tests that assumption, and `agreement.ts` is the tool that reports
the answer.

The code here can compute the figures. It cannot produce the ratings — that part
is two senior appraisers and a few afternoons, and there is no way around it.

## What you are measuring

Three questions, in order of how much they matter:

1. **How far apart are two experienced appraisers?** This is the ceiling. Every
   other number is read against it, not against perfect agreement.
2. **How far is the auto-grader from a human?** Useful only once you know (1).
   A grader that sits inside the human-human spread is doing as well as the
   instrument allows.
3. **Is any appraiser systematically severe or generous?** The severity gap in
   the report. This one has consequences for teachers immediately.

## The protocol

**Pick the sample.** 25–30 completed observations. Fewer and the confidence
interval swallows the result; the tool will warn you below 20. Spread them
across career levels, school levels and subjects — agreement is usually worse on
the domains that are hardest to see, and a sample of easy lessons will flatter
everyone.

**Rate independently and blind.** Each appraiser works from the same captured
evidence — the activity timeline, the notes, the transcript, the photos — and
never sees the original ratings, the other rater's sheet, or the auto-grade
result. A rater who has seen another sheet is no longer an independent
measurement, and the whole exercise measures nothing.

**Rate the same things.** Use the indicator set for that record's career level.
Where a rater cannot see evidence for an indicator, they mark it not observable
(`null`) rather than guessing — that is a finding in itself, and the tool counts
those clashes separately.

**Include the machine.** Run the auto-grader over each record and record its
output as a third rater called `AI`. Since grading now samples at temperature 0,
a re-run reproduces its ratings, so what you measure is the grader rather than
the noise around it.

**Do not discuss until everyone has finished.** The calibration conversation is
the point, but it comes after the data, not during.

## Running it

Generate a blank sheet with every indicator for a career level already listed:

```
npm run agreement -- --template Proficient > goldset.json
```

Fill in the ratings — one block per observation, one sheet per rater, `null`
for not observable — then:

```
npm run agreement -- goldset.json
```

There is a worked example with synthetic data at `example-goldset.json`; run it
to see the shape of the output before you collect anything real.

## Reading the output

**Weighted kappa** is quadratically weighted, which is the right choice for an
ordered rubric: raters one band apart have nearly agreed, four bands apart have
not, and unweighted kappa cannot tell those apart.

Two experienced appraisers on a 4-point classroom rubric rarely clear 0.7, and
0.5–0.6 is a normal, publishable result rather than a failure. Judge the grader
against that pair, not against 1.0.

Kappa comes back `n/a` when every rating in a comparison was the same category.
That is not perfect agreement — there is no chance agreement to correct for, so
the statistic has no denominator. It usually means the sample was too uniform to
test anything.

**Within one band** is the figure to quote to a teacher. Exact agreement on a
4-point scale is a hard test; being within one band is what "these two people
saw the same lesson" actually looks like.

**Severity gap** is the mean signed difference in bands. A gap of 0.3 across a
whole rubric means one appraiser's Grade B is another's Grade C. Treat it as a
prompt for calibration training first. Adjusting scores for appraiser severity is
a much bigger decision than it looks, and it should never be made from a single
term's data.

**Coverage clashes** count indicators one rater scored and another called not
observable. A high count usually means the evidence capture is the problem, not
the raters — it is the cheapest thing on this page to fix.

## What to do with the result

- Human-human kappa well below 0.5 → the rubric descriptors are being read
  differently. Calibration training, and probably descriptor rewrites, before
  any grade from this framework carries weight in a progression decision.
- AI far below human-human → do not present auto-grade output as a rating.
  Down-rank it to evidence-finding until it closes.
- AI inside the human-human spread → it is a reasonable first draft, and should
  still land as a suggestion an appraiser confirms, which is what
  `origin: 'ai-suggested'` already enforces.
- One appraiser well outside the others → a conversation, then a re-measure next
  term. Not a correction factor.

Re-run it each term with a fresh sample. Agreement drifts, particularly after new
appraisers join.
