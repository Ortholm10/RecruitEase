# Seed data — RecruitEase

One JD, five resumes, deliberately spread across the verdict scale so the
scoring engine and interview planner have something real to chew on from
hour one. Both of you use these same five candidates all weekend — don't
invent new ones mid-hackathon, or your two halves of the demo will disagree.

## Files

| File | Intended result against the JD |
| --- | --- |
| `job-description.md` | Full Stack Engineer — 3 must-haves: React, Node/TS, SQL |
| `resumes/01-strong-priya-sharma.txt` | Strong across nearly every requirement, quantified outcomes. Use this to sanity-check your rubric isn't too harsh. |
| `resumes/02-partial-arjun-mehta.txt` | Mixed bag — decent React/Node, thin/Partial SQL, Unproven testing, Absent cloud/CI-CD. This is your main "interesting" candidate — should generate a rich interview plan. |
| `resumes/03-weak-buzzword-karan-singh.txt` | Every JD keyword appears in the skills list, but zero specifics in the experience bullets. Should score mostly **Unproven**, not Absent — this is the test case that proves your rubric isn't just keyword matching. |
| `resumes/04-missing-musthave-fatima-khan.txt` | Strong React/frontend, but explicitly zero relational DB experience (Firebase/Firestore only). Should trip `mustHaveGateFailed = true` on the SQL requirement. |
| `resumes/05-ugly-formatting-raj-verma.txt` | Deliberately messy: pseudo-table with `\|`, interleaved two-column text, irregular spacing/capitalization, inline `*` bullets, mid-sentence line breaks. This is **A1's "one deliberately ugly resume"** — use it to prove your PDF extraction and `findQuote()` offset-matching degrade gracefully (flag `grounded: false` where it can't match) instead of crashing. |

## How to use these

1. **A3 (PDF→text):** these are plain `.txt` for convenience, but you should
   also convert at least `01-strong` and `05-ugly-formatting` to real PDFs
   (any "print to PDF" / online converter works — for `05`, try exporting
   with two columns if your tool supports it, to get genuinely interleaved
   extraction) so your PDF.js pipeline is tested against a real PDF, not
   just plain text, before the demo.
2. **A5 (scoring + calibration):** hand-rank these five yourself against
   the JD *before* running them through the model. Compare your ranking to
   the model's output. If they disagree, adjust requirement **weights**,
   not the prompt — that's the calibration step from the build plan.
3. **B3 (bulk upload):** upload all five in one batch to exercise the
   per-file progress UI and the "visible failure state" — `05-ugly...`
   should trigger a visible (but non-blocking) low-confidence/partial
   extraction warning, not a silent failure.
4. **Demo:** `02-partial-arjun-mehta` is your best on-stage candidate — the
   interview plan generated from his gaps (SQL, testing, cloud) is what
   demonstrates the resume→score→interview pipeline actually working end
   to end, and the "movement" narrative in the report (e.g. "Unproven on
   paper, Strong after interview") reads best on a mixed profile, not a
   perfect or a hopeless one.

## Adding a real 6th/7th candidate later

If you want more variety once the pipeline works, keep the same shape:
name the file by what it's meant to prove (`06-strong-but-junior-...`,
`07-overqualified-...`), and add one line to the table above so the other
person knows what to expect from it without opening the file.
