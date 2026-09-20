/**
 * Phase 4 — Integrity computation layer (Tier 1 + Tier 3).
 *
 * Read-only aggregation over persisted evidence (turns + integrity_events).
 * Produces an IntegrityReport: objective signals + a weighted risk category.
 * NEVER a binary cheater / not-cheater verdict, and — per the hard rule in
 * types — never shipped into CandidateFeedbackReport.
 */
import type {
  IntegrityEvent,
  IntegrityReport,
  IntegrityRiskLevel,
  IntegritySignal,
  Turn,
} from "@/types";

export type TurnTiming = {
  turnId: string;
  questionId: string;
  questionLabel: string;
  followUpDepth: number;
  seconds: number; // firstWordAt - askedAt, in seconds (clamped >= 0)
};

/** Latency in seconds for one answered turn. Null when the box auto-submitted
 *  empty (rapid-fire with no first word) or timestamps are missing. */
export function latencyForTurn(t: Turn): number | null {
  if (!t.firstWordAt || !t.answeredAt) return null;
  const ms = new Date(t.firstWordAt).getTime() - new Date(t.askedAt).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, ms / 1000);
}

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const stdDev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

/** Label for a planned question by its index in the plan, e.g. "Q3". */
export function questionLabel(
  questionId: string,
  plan: { questions: { id: string }[] } | undefined,
): string {
  if (plan) {
    const i = plan.questions.findIndex((q) => q.id === questionId);
    if (i !== -1) return `Q${i + 1}`;
  }
  return questionId;
}

/** First-seen question order in the turn stream — a plan-free label fallback. */
function firstSeenLabels(turns: Turn[]): Map<string, string> {
  const order: string[] = [];
  for (const t of turns) {
    if (!order.includes(t.questionId)) order.push(t.questionId);
  }
  const map = new Map<string, string>();
  order.forEach((id, i) => map.set(id, `Q${i + 1}`));
  return map;
}

export function latencyStats(
  turns: Turn[],
  plan?: { questions: { id: string }[] },
): {
  timings: TurnTiming[];
  samples: number;
  meanSeconds: number;
  stdDevSeconds: number;
  uniformPattern: boolean;
} {
  const fallback = firstSeenLabels(turns);
  const timings: TurnTiming[] = turns
    .filter((t) => t.answeredAt !== null)
    .map((t) => ({ t, seconds: latencyForTurn(t) }))
    .filter((x): x is { t: Turn; seconds: number } => x.seconds !== null)
    .map(({ t, seconds }) => ({
      turnId: t.id,
      questionId: t.questionId,
      questionLabel: questionLabel(t.questionId, plan) ?? fallback.get(t.questionId) ?? t.questionId,
      followUpDepth: t.followUpDepth,
      seconds,
    }));

  const samples = timings.length;
  const secs = timings.map((x) => x.seconds);
  const meanSeconds = mean(secs);
  const stdDevSeconds = stdDev(secs);
  // Near-constant delay regardless of question difficulty: the signature of an
  // external processing step. Requires enough readings and a plausible delay.
  const cv = meanSeconds > 0 ? stdDevSeconds / meanSeconds : Infinity;
  const uniformPattern =
    samples >= 3 && meanSeconds >= 0.8 && meanSeconds <= 25 && stdDevSeconds < 1.4 && cv < 0.3;

  return { timings, samples, meanSeconds, stdDevSeconds, uniformPattern };
}

/** Very small, deterministic measure of a transcript's "structure": the share
 *  of lines that look like Markdown/list/code scaffolding. */
function markdownRatio(text: string): number {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return 0;
  const structured = lines.filter((l) =>
    /^(\s*[-*#+]|\d+[.)]|```|>\s|`)/.test(l.trim()),
  ).length;
  return structured / lines.length;
}

function avgWordLength(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  return words.reduce((a, w) => a + w.length, 0) / words.length;
}

/** Tier 1 (part b) — linguistic uniformity. Flags a sharp stylistic shift in
 *  the latter part of the interview (e.g. short informal prose → structured
 *  Markdown out of nowhere). Deterministic and cheap; never an LLM call. */
export function styleShiftSignal(turns: Turn[]): IntegritySignal | null {
  const scored = turns
    .filter((t) => t.answeredAt !== null && t.transcript.trim().length >= 15)
    .map((t, i) => ({
      index: i,
      questionId: t.questionId,
      answeredAt: t.answeredAt!,
      md: markdownRatio(t.transcript),
      awl: avgWordLength(t.transcript),
    }));
  if (scored.length < 4) return null;

  const prev = scored.slice(0, -1);
  const last = scored[scored.length - 1];
  const mdBefore = median(prev.map((s) => s.md));
  const awlBefore = median(prev.map((s) => s.awl));

  let reason: string | null = null;
  if (last.md > 0.25 && mdBefore < 0.05) {
    reason = "answers shift abruptly from plain prose to structured Markdown mid-interview";
  } else if (Math.abs(last.awl - awlBefore) > 1.6) {
    reason = `word length shifts sharply later in the interview (avg ${awlBefore.toFixed(1)} → ${last.awl.toFixed(1)} chars)`;
  }
  if (!reason) return null;

  return {
    type: "style_shift",
    timestamp: last.answeredAt,
    weight: "medium",
    evidence: `Stylistic shift detected later in the interview: ${reason}.`,
  };
}

/** True when this event is the record of a lockdown termination. Marked in the
 *  payload rather than by its own type, because integrity_events.type is a
 *  fixed CHECK constraint. */
export function isTerminationEvent(e: IntegrityEvent): boolean {
  return e.payload?.terminated === true;
}

/** Human-readable description of one persisted event. Factual for every
 *  ordinary signal; the lockdown termination is the one deliberate exception,
 *  see the note on the gaze/termination signal in buildIntegrityReport. */
export function describeEvent(e: IntegrityEvent): string {
  if (isTerminationEvent(e)) {
    return "The interview was terminated automatically: the candidate left the interview window again after being warned.";
  }
  if (e.payload?.warned === true) {
    return "The candidate left the interview window and was shown a final warning.";
  }
  switch (e.type) {
    case "canary_triggered":
      return "A hidden verification marker was quoted back in an answer.";
    case "tab_blur":
      return "The tab lost visibility — the candidate may have switched context.";
    case "window_focus_loss":
      return "The browser window lost focus.";
    case "fullscreen_exit":
      return "Fullscreen was exited during a question.";
    case "paste_event":
      return "Text was pasted into the answer box.";
    case "latency_variance":
      return "A consistent response delay was measured across questions.";
    case "gaze_sweep":
      return "The candidate's gaze moved away from the screen.";
    default:
      return e.type;
  }
}

function eventCount(events: IntegrityEvent[], type: IntegrityEvent["type"]): number {
  return events.filter((e) => e.type === type).length;
}

/** Wall-clock span of the session in minutes, from whatever evidence exists.
 *  Used to turn raw event counts into a density. */
function interviewMinutes(turns: Turn[], events: IntegrityEvent[]): number {
  const stamps = [
    ...turns.flatMap((t) => [t.askedAt, t.answeredAt]),
    ...events.map((e) => e.ts),
  ]
    .filter((s): s is string => Boolean(s))
    .map((s) => new Date(s).getTime())
    .filter((n) => !Number.isNaN(n));
  if (stamps.length < 2) return 0;
  return (Math.max(...stamps) - Math.min(...stamps)) / 60_000;
}

/** Aggregate everything into one recruiter-facing report. */
export function buildIntegrityReport(
  interviewId: string,
  turns: Turn[],
  events: IntegrityEvent[],
): IntegrityReport {
  const { samples, meanSeconds, stdDevSeconds, uniformPattern } = latencyStats(turns);
  const signals: IntegritySignal[] = [];
  const firstOf = (type: IntegrityEvent["type"]) => events.find((e) => e.type === type);

  // Tier 3 — a canary fired is the single highest-weight signal.
  const canaryEvents = events.filter((e) => e.type === "canary_triggered");
  for (const e of canaryEvents) {
    signals.push({
      type: e.type,
      timestamp: e.ts,
      weight: "high",
      evidence: "A request to begin an answer with a hidden word was echoed back in the transcript.",
    });
  }

  // Session-level signals, weighted by their density over the whole interview.
  const blur = eventCount(events, "tab_blur");
  const focus = eventCount(events, "window_focus_loss");
  const paste = eventCount(events, "paste_event");
  const full = eventCount(events, "fullscreen_exit");

  const blurFirst = firstOf("tab_blur");
  if (blurFirst) {
    signals.push({
      type: "tab_blur",
      timestamp: blurFirst.ts,
      weight: blur >= 3 ? "medium" : "low",
      evidence: `The tab lost visibility ${blur} time${blur === 1 ? "" : "s"} during the interview.`,
    });
  }
  const focusFirst = firstOf("window_focus_loss");
  if (focusFirst) {
    signals.push({
      type: "window_focus_loss",
      timestamp: focusFirst.ts,
      weight: focus >= 4 ? "medium" : "low",
      evidence: `The window lost focus ${focus} time${focus === 1 ? "" : "s"}.`,
    });
  }
  const pasteFirst = firstOf("paste_event");
  if (pasteFirst) {
    signals.push({
      type: "paste_event",
      timestamp: pasteFirst.ts,
      weight: paste >= 4 ? "medium" : "low",
      evidence: `Text was pasted ${paste} time${paste === 1 ? "" : "s"}.`,
    });
  }
  if (full >= 2) {
    signals.push({
      type: "fullscreen_exit",
      timestamp: firstOf("fullscreen_exit")!.ts,
      weight: "low",
      evidence: `Fullscreen was exited ${full} times.`,
    });
  }

  // Lockdown termination. Deliberately the heaviest signal in the set: unlike
  // every other reading here it is not a passive observation but a recorded
  // enforcement action the candidate was warned about first.
  const terminationEvent = events.find(isTerminationEvent);
  if (terminationEvent) {
    const reason = typeof terminationEvent.payload?.reason === "string" ? terminationEvent.payload.reason : "focus_loss";
    const how =
      reason === "fullscreen_exit"
        ? "left fullscreen"
        : reason === "tab_hidden"
          ? "switched away from the interview tab"
          : "moved focus out of the interview window";
    signals.push({
      type: "window_focus_loss",
      timestamp: terminationEvent.ts,
      weight: "high",
      evidence: `Interview terminated automatically: the candidate ${how} a second time after being warned that doing so would end the interview.`,
    });
  }

  // Tier 2 — webcam gaze. Looking away is ordinary human behaviour, so raw
  // count alone says little; weight on how densely it happened over the
  // interview's own span.
  const gaze = eventCount(events, "gaze_sweep");
  const gazeFirst = firstOf("gaze_sweep");
  if (gazeFirst) {
    const minutes = Math.max(1, interviewMinutes(turns, events));
    const perMinute = gaze / minutes;
    signals.push({
      type: "gaze_sweep",
      timestamp: gazeFirst.ts,
      weight: gaze >= 6 && perMinute >= 2 ? "medium" : "low",
      evidence: `Gaze moved away from the screen ${gaze} time${gaze === 1 ? "" : "s"} over ${minutes.toFixed(0)} minute${minutes < 1.5 ? "" : "s"} (${perMinute.toFixed(1)}/min).`,
    });
  }

  // Tier 1 — computed latency variance.
  if (uniformPattern) {
    const firstAnswered =
      turns.find((t) => t.answeredAt !== null)?.answeredAt ?? new Date().toISOString();
    signals.push({
      type: "latency_variance",
      timestamp: firstAnswered,
      weight: "medium",
      evidence: `Response delay is near-constant (±${stdDevSeconds.toFixed(2)}s around ${meanSeconds.toFixed(1)}s mean) across questions of varying difficulty.`,
    });
  }

  // Tier 1 (part b) — stylistic uniformity.
  const style = styleShiftSignal(turns);
  if (style) signals.push(style);

  // Weighted aggregation — no single signal is a verdict.
  let riskLevel: IntegrityRiskLevel = "low";
  if (signals.some((s) => s.weight === "high")) riskLevel = "high";
  else if (signals.some((s) => s.weight === "medium")) riskLevel = "medium";

  return {
    interviewId,
    riskLevel,
    totalSignals: signals.length,
    latency: { samples, meanSeconds, stdDevSeconds, uniformPattern },
    signals: signals.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
  };
}