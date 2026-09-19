// Self-check for the pipeline's pure logic: findQuote, weight normalization,
// score derivation. No LLM or DB calls. Run: node scripts/check-pipeline.mjs
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// Resolve the "@/..." tsconfig alias and extensionless .ts imports.
const root = pathToFileURL(fileURLToPath(new URL("..", import.meta.url))).href;
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) {
      const base = root + spec.slice(2);
      spec = [".ts", "/index.ts", ""].map((ext) => base + ext).find((u) => existsSync(new URL(u))) ?? base;
    }
    return next(spec, ctx);
  },
});

const { findQuote } = await import("@/lib/resume/findQuote");
const { toRequirements } = await import("@/lib/jd/parseRequirements");
const { deriveScore } = await import("@/lib/scoring/scoreCandidate");

// --- findQuote ---------------------------------------------------------
const raj = `PROFESSIONAL EXPERIENCE
*Designed schema for orders DB(Postgres) supporting 500k+ rows,added
indices to speed up reporting queries used by finance team.
*built REST api's in node.js + typescript for the order-mgmt
system...integrated with react frontend team owns`;
const at = (e) => raj.slice(e.startOffset, e.endOffset);

let e = findQuote(raj, "supporting 500k+ rows");
assert.deepEqual(e, { quote: "supporting 500k+ rows", startOffset: raj.indexOf("supporting"), endOffset: raj.indexOf("supporting") + 21, grounded: true });

e = findQuote(raj, "supporting 500k+ rows, added indices to speed up reporting queries");
assert.equal(e.grounded, true, "line break + missing space after comma");
assert.equal(at(e), "supporting 500k+ rows,added\nindices to speed up reporting queries");

e = findQuote(raj, "“Built REST API’s in Node.js + TypeScript for the order-mgmt system.”");
assert.equal(e.grounded, true, "case, curly quotes, wrapping quotes, trailing period");
assert.equal(at(e), "built REST api's in node.js + typescript for the order-mgmt\nsystem");

e = findQuote(raj, "…integrated with react frontend");
assert.equal(at(e), "integrated with react frontend", "leading ellipsis");

e = findQuote("Led the rebuild - checkout flow", "Led the rebuild — checkout flow");
assert.equal(e.grounded, true, "em dash vs hyphen");

e = findQuote(raj, "Architected a Kafka event bus");
assert.deepEqual(e, { quote: "Architected a Kafka event bus", startOffset: null, endOffset: null, grounded: false });
assert.equal(findQuote(raj, "   ").grounded, false, "blank quote");
assert.equal(findQuote(raj, undefined).grounded, false, "never throws on bad input");

// --- toRequirements ----------------------------------------------------
const reqs = toRequirements([
  { skill: "React", level: "senior", mustHave: true, weight: 10, rawText: " React. " },
  { skill: "SQL & relational DBs", level: "mid", mustHave: true, weight: 9, rawText: "SQL" },
  { skill: "React", level: "senior", mustHave: false, weight: 1, rawText: "dup" },
  { skill: "C++", level: "any", mustHave: false, weight: -3, rawText: "c++" },
]);
assert.deepEqual(reqs.map((r) => r.id), ["req_react_senior", "req_sql_relational_dbs_mid", "req_react_senior_2", "req_cplusplus_any"]);
assert.ok(Math.abs(reqs.reduce((s, r) => s + r.weight, 0) - 1) < 1e-9, "weights sum to 1");
assert.equal(reqs[3].weight, 0, "negative weight clamps to 0");
assert.equal(reqs[0].rawText, "React.");
assert.throws(() => toRequirements([]));

// --- deriveScore -------------------------------------------------------
const text = "Built React apps. Skills: SQL, AWS.";
const job = [
  { id: "a", skill: "React", level: "senior", mustHave: true, weight: 5, rawText: "" },
  { id: "b", skill: "Cloud", level: "any", mustHave: false, weight: 3, rawText: "" },
  { id: "c", skill: "SQL", level: "mid", mustHave: true, weight: 2, rawText: "" },
]; // weights deliberately NOT normalized: total must still be right
const s = deriveScore(job, [
  { requirementId: " a ", verdict: "strong", reasoning: "x", quote: "Built React apps" },
  { requirementId: "b", verdict: "unproven", reasoning: "x", quote: "" },
  { requirementId: "c", verdict: "absent", reasoning: "x", quote: "" },
  { requirementId: "a", verdict: "absent", reasoning: "dup ignored", quote: "" },
], text);
assert.equal(s.total, 57.5); // 100 * (0.5*1 + 0.3*0.25 + 0.2*0)
assert.deepEqual(s.breakdown.map((b) => b.points), [1, 0.25, 0]);
assert.equal(s.breakdown[0].evidence.grounded, true);
assert.deepEqual(s.breakdown[1].evidence, { quote: "", startOffset: null, endOffset: null, grounded: false });
assert.equal(s.breakdown[2].evidence, null, "absent + no quote -> null evidence");
assert.deepEqual(s.unproven, ["b"]);
assert.equal(s.mustHaveGateFailed, true);
assert.match(s.gateReason, /SQL/);
assert.equal(s.rubricVersion, "v1");

const pass = deriveScore(job.slice(0, 2), [
  { requirementId: "a", verdict: "partial", reasoning: "x", quote: "React" },
  { requirementId: "b", verdict: "absent", reasoning: "x", quote: "" },
], text);
assert.equal(pass.mustHaveGateFailed, false, "absent non-must-have does not gate");
assert.equal(pass.gateReason, null);
assert.equal(pass.total, 31.3); // 100 * 0.625*0.5 = 31.25 -> 31.3
assert.throws(() => deriveScore(job, [], text), /No verdict/);

console.log("pipeline checks passed");
