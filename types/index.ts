// ============================================================
// RecruitEase — Shared Contract
// ============================================================
// Every object that crosses the wire between Person A (backend/AI/data)
// and Person B (frontend/product/UI) is defined here, and ONLY here.
//
// Rules:
//   1. Do not redefine these shapes in a component or an API route.
//      Import from this file.
//   2. If a shape needs to change, change it here first, message the
//      other person, then update call sites. Never let the two of you
//      drift onto slightly different versions of "Score".
//   3. This file has zero runtime dependencies (no Zod, no Supabase
//      client). Person A can layer Zod schemas that validate INTO
//      these types in a separate file (e.g. types/schemas.ts).
// ============================================================

// ------------------------------------------------------------
// Enums / literal unions
// ------------------------------------------------------------

export type UserRole = "recruiter" | "candidate";

export type RequirementLevel = "junior" | "mid" | "senior" | "any";

/** The four-point verdict scale used for BOTH resume scoring and
 *  interview answer grading, so a candidate's report can show movement
 *  ("Unproven on paper, Strong after interview"). */
export type Verdict = "strong" | "partial" | "unproven" | "absent";

export const VERDICT_POINTS: Record<Verdict, number> = {
  strong: 1.0,
  partial: 0.5,
  unproven: 0.25,
  absent: 0,
};

export type QuestionType =
  | "resume_probe" // 2x — grounded in something the candidate already claimed
  | "gap_probe" // 2x — targets a Partial/Unproven requirement from scoring
  | "artifact" // 1x — on-screen code/diagram question (copilot is blind to it)
  | "rapid_fire" // 2-3x — 20s timer, defeats round-trip-latency copilots
  | "follow_up"; // adaptive, hard-capped at 2 per parent question

export type InterviewStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "abandoned";

export type IntegrityEventType =
  | "latency_variance" // Tier 1 — consistent 3-5s delay regardless of difficulty
  | "tab_blur" // Tier 1
  | "fullscreen_exit" // Tier 1
  | "paste_event" // Tier 1
  | "window_focus_loss" // Tier 1
  | "canary_triggered" // Tier 3 — invisible on-screen text read back by a screen-reading tool
  | "gaze_sweep"; // Tier 2 — MediaPipe, last to build, first to cut

export type IntegrityRiskLevel = "low" | "medium" | "high";

export type ReportOutcome = "advance" | "reject" | "pending";

export type DraftStatus = "draft" | "approved" | "sent";

// ------------------------------------------------------------
// Job & Requirements   (table: jobs)
// ------------------------------------------------------------

export interface Requirement {
  id: string; // stable slug, e.g. "req_react_senior"
  skill: string; // "React", "System design", "PostgreSQL"
  level: RequirementLevel;
  mustHave: boolean;
  weight: number; // 0-1, all requirements for a job sum to 1
  rawText: string; // the JD sentence/clause this was parsed from
}

export interface Job {
  id: string;
  recruiterId: string;
  title: string;
  jdText: string;
  requirements: Requirement[];
  createdAt: string; // ISO 8601
}

// ------------------------------------------------------------
// Candidate & Extraction   (tables: candidates, extractions)
// ------------------------------------------------------------

/** A quote pulled from resume_text, with the character offsets that let
 *  the UI highlight it in place. If findQuote() can't locate the exact
 *  string in resume_text, grounded=false and offsets are null — the UI
 *  must render this differently (e.g. a warning icon), never silently
 *  drop it. */
export interface Evidence {
  quote: string;
  startOffset: number | null;
  endOffset: number | null;
  grounded: boolean;
}

export interface ExtractedField {
  key: string; // "skill:React" | "experience:years" | "education" | ...
  value: string;
  evidence: Evidence;
}

export interface Candidate {
  id: string;
  jobId: string;
  name: string;
  email: string;
  resumePath: string; // Supabase storage object path
  resumeText: string; // extracted plain text (PDF.js output)
  createdAt: string;
}

export interface Extraction {
  id: string;
  candidateId: string;
  fields: ExtractedField[];
  modelVersion: string;
  createdAt: string;
}

// ------------------------------------------------------------
// Scoring   (table: scores)
// ------------------------------------------------------------

export interface RequirementScore {
  requirementId: string;
  verdict: Verdict;
  points: number; // VERDICT_POINTS[verdict], stored redundantly for easy SQL aggregation
  evidence: Evidence | null; // null only when verdict === "absent"
  reasoning: string; // one-line model justification, shown on hover
}

export interface Score {
  id: string;
  candidateId: string;
  jobId: string;
  total: number; // 0-100, weighted sum normalized
  breakdown: RequirementScore[];
  /** requirementIds with verdict "partial" or "unproven" — this list IS
   *  the input to the interview planner. Don't recompute it elsewhere. */
  unproven: string[];
  mustHaveGateFailed: boolean;
  gateReason: string | null; // set iff mustHaveGateFailed
  rubricVersion: string; // bump whenever weights/prompt change, for audit trail
  createdAt: string;
}

// ------------------------------------------------------------
// Interview   (tables: interviews, turns)
// ------------------------------------------------------------

export interface PlannedQuestion {
  id: string;
  type: QuestionType;
  requirementId: string | null; // set for gap_probe; null for resume_probe/rapid_fire/artifact
  prompt: string;
  artifactPayload?: string; // code snippet / diagram markup — only for type "artifact"
  timeLimitSeconds: number | null; // set for rapid_fire (e.g. 20)
}

/** Fixed composition per candidate so interviews are comparable:
 *  2 resume_probe + 2 gap_probe + 1 artifact + 2-3 rapid_fire.
 *  Generated once, stored, never mutated — follow_ups are separate Turns. */
export interface InterviewPlan {
  id: string;
  candidateId: string;
  jobId: string;
  questions: PlannedQuestion[];
  generatedAt: string;
}

export interface Interview {
  id: string;
  candidateId: string;
  jobId: string;
  plan: InterviewPlan; // stored as jsonb on the interviews row — see migration
  status: InterviewStatus;
  startedAt: string | null;
  completedAt: string | null;
}

export interface Turn {
  id: string;
  interviewId: string;
  questionId: string; // references PlannedQuestion.id
  questionType: QuestionType;
  /** 0 = the original planned question. 1 or 2 = a follow-up.
   *  MUST be enforced <= 2 in code, not just by convention. */
  followUpDepth: number;
  askedAt: string;
  /** First registered token/word of the candidate's answer — the single
   *  most important timestamp for the integrity layer's latency-variance
   *  signal. Person B: this must fire accurately (see step B6). */
  firstWordAt: string | null;
  answeredAt: string | null;
  transcript: string;
  verdict: Verdict | null; // graded on the same 4-point scale as resume scoring
  evidenceLinkedRequirement: string | null; // which requirement this turn was meant to prove/disprove
}

// ------------------------------------------------------------
// Phase 3 wire contracts (interview room <-> API routes)
// A question as actually served to the candidate: base question +
// how deep into its follow-up chain it is + when it was shown.
// ------------------------------------------------------------

export interface ServedQuestion extends PlannedQuestion {
  followUpDepth: number;
  servedAt: string;
}

export interface AnswerTurnRequest {
  questionId: string;
  followUpDepth: number;
  transcript: string;
  firstWordAt: string | null; // null when the box was auto-submitted empty (rapid fire)
  answeredAt: string;
  servedAt: string; // when the room presented this question (server-issued)
  promptServed: string; // exact question text shown — persisted for the transcript view
}

export type AnswerTurnResult =
  | { done: true }
  | { done: false; next: ServedQuestion };

export interface InterviewStateResponse {
  interviewId: string;
  status: InterviewStatus;
  candidateName: string;
  plan: InterviewPlan;
  progress: { answered: number; total: number };
  servedQuestion: ServedQuestion | null; // null when the interview is complete
}

export interface IntegrityEventRequest {
  type: IntegrityEventType;
  ts: string; // client clock
  payload?: Record<string, unknown>;
}

// ------------------------------------------------------------
// Integrity   (table: integrity_events)
// ------------------------------------------------------------

export interface IntegrityEvent {
  id: string;
  interviewId: string;
  turnId: string | null; // null for session-level events (tab_blur, fullscreen_exit)
  type: IntegrityEventType;
  payload: Record<string, unknown>; // e.g. { varianceMs: 120, meanDelayMs: 4200 }
  ts: string;
}

/** Recruiter-facing ONLY. Never pass this type, or any IntegrityEvent,
 *  into the feedback-report generator's context. See CandidateFeedbackReport. */
export interface IntegritySummary {
  interviewId: string;
  riskLevel: IntegrityRiskLevel;
  signals: IntegrityEvent[];
}

/** One objective, weightable reading from the integrity layer. A signal is
 *  never a verdict on its own — families aggregate into a single risk level. */
export interface IntegritySignal {
  type: string; // event family or computed signal name, e.g. "canary_triggered" | "style_shift"
  timestamp: string; // ISO of the reading
  weight: IntegrityRiskLevel;
  evidence: string; // human-readable, objective — never accusatory
}

/** Computed recruiter-side integrity report for a (completed) interview.
 *  Outputs objective evidence + a weighted risk category only — never a
 *  binary cheater / not-cheater verdict. */
export interface IntegrityReport {
  interviewId: string;
  riskLevel: IntegrityRiskLevel;
  totalSignals: number;
  latency: {
    samples: number; // answered turns with a first_word_at reading
    meanSeconds: number;
    stdDevSeconds: number;
    uniformPattern: boolean; // near-constant delay across varying difficulty
  };
  signals: IntegritySignal[];
}

// ------------------------------------------------------------
// Reports   (table: reports)
// ------------------------------------------------------------

export interface RecruiterReportSection {
  requirementId: string;
  resumeVerdict: Verdict;
  interviewVerdict: Verdict | null; // null if this requirement wasn't probed
  movement: string | null; // e.g. "Unproven on paper, Strong after interview"
  evidence: Evidence[];
}

export interface RecruiterReport {
  id: string;
  candidateId: string;
  jobId: string;
  sections: RecruiterReportSection[];
  integrity: IntegritySummary | null;
  outcome: ReportOutcome;
  createdAt: string;
}

// ------------------------------------------------------------
// Phase 5 — Evaluation Report (B8, "the money screen"). Rendered on the
// candidate page from the resume Score + answered Interview turns. Built by
// lib/report/buildReport.ts (pure logic) — this shape is the UI contract.
// ------------------------------------------------------------

/** Interview evidence for ONE requirement. `turns` are the answered turn
 *  chain (parent gap-probe + its follow-ups) that targeted the requirement. */
export interface InterviewEvidence {
  probed: boolean; // a planned question for this requirement was answered
  verdict: Verdict | null; // verdict of the primary answer; null if never answered
  turns: Turn[];
}

/** Movement of a requirement across sources. */
export type Movement = "up" | "down" | "held" | null;

export interface RequirementEvaluationRow {
  requirementId: string;
  skill: string;
  level: RequirementLevel;
  mustHave: boolean;
  weight: number;
  resumeVerdict: Verdict;
  resumeQuote: string | null;
  resumeReasoning: string;
  interview: InterviewEvidence;
  movement: Movement;
  movementLabel: string | null; // e.g. "Unproven -> Strong"
  remainingGap: boolean; // not demonstrated strong after both sources
  gapReason: string | null;
}

export interface EvaluationReport {
  candidateId: string;
  jobId: string;
  interviewId: string;
  rows: RequirementEvaluationRow[];
  /** The subset of rows the recruiter still needs to resolve: everything that
   *  is not &apos;strong&apos; after resume + interview evidence is combined. */
  gaps: RequirementEvaluationRow[];
  outcome: ReportOutcome;
  createdAt: string;
}

// ------------------------------------------------------------
// Reports — AI job summary (recruiter-facing, on-demand). One LLM call per
// job over every candidate's resume + interview evidence, built by
// lib/report/summarizeJobCandidates.ts. Never stored — regenerated per click.
// ------------------------------------------------------------

export interface CandidateAiSummary {
  candidateId: string;
  name: string;
  resumeScore: number | null;
  aiScore: number; // 1-100, model's judgment
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendation: ReportOutcome;
}

export interface JobAiSummary {
  jobId: string;
  jobTitle: string;
  candidates: CandidateAiSummary[];
  generatedAt: string;
}

/**
 * The candidate-facing artifact. HARD RULES for whatever generates this:
 *   1. Every claim must cite a stored Evidence item — no evidence, no sentence.
 *   2. This type must NEVER carry integrity data. If you're about to add
 *      an `integrity` field here, stop — that's the rule being broken.
 *   3. Never state or imply a reason tied to a protected characteristic.
 *      Enforce with a post-generation output check, not just prompt text.
 * Recruiter reviews as `draft`, edits inline, sets `approved`, system
 * sends and stamps `sent`. Every transition logged to AuditLogEntry.
 */
export interface CandidateFeedbackReport {
  id: string;
  candidateId: string;
  jobId: string;
  stagesCompleted: { stage: string; date: string }[];
  interviewSummary: { question: string; answerSummary: string }[];
  scoreBreakdown: {
    requirementLabel: string;
    verdict: Verdict;
    evidenceQuote: string;
  }[];
  keyGaps: { requirementLabel: string; nextStep: string }[];
  strengths: string[];
  draftStatus: DraftStatus;
  approvedBy: string | null; // recruiter's profile id
  sentAt: string | null;
}

// ------------------------------------------------------------
// Audit log   (table: audit_log)
// ------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  entity: "job" | "candidate" | "extraction" | "score" | "interview" | "turn" | "report";
  entityId: string;
  action: string; // "generated" | "approved" | "sent" | "overridden" | ...
  actorId: string; // profile id, or "system"
  model: string | null; // model name/version if AI-generated
  promptVersion: string | null;
  sourceRef: string | null; // evidence id / requirement id this action is grounded in
  ts: string;
}

// ------------------------------------------------------------
// Profile   (table: profiles)
// ------------------------------------------------------------

export interface UserProfile {
  id: string; // matches auth.users.id
  role: UserRole;
  fullName: string;
  email: string;
  createdAt: string;
}
