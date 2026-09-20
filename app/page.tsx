"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { StormScene } from "@/components/landing/storm-scene";
import { GlassCta } from "@/components/landing/glass-cta";
import "./landing.css";

// The reference composition's entry cascade: every element springs from
// y:14 / opacity:0 on a {tension:220, friction:26} spring, staggered 45ms
// per step. `motion` is already a dependency and its spring takes exactly
// those constants as stiffness/damping, so there is no integrator to port.
const SPRING = { type: "spring", stiffness: 220, damping: 26, mass: 1 } as const;
const STEP = 0.045;

function Rise({
  order = 0,
  children,
  className,
  inView = false,
}: {
  order?: number;
  children: ReactNode;
  className?: string;
  inView?: boolean;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  const anim = { opacity: 1, y: 0 };
  const transition = { ...SPRING, delay: order * STEP };

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      {...(inView
        ? { whileInView: anim, viewport: { once: true, amount: 0.25 } }
        : { animate: anim })}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}

// ── The product pipeline, in order. This is the actual flow, not copy. ──
const STAGES = [
  {
    n: "Stage 01",
    title: "Job description in",
    body: "Paste the JD. The agent extracts a structured requirement list — each one weighted, and flagged must-have or nice-to-have.",
  },
  {
    n: "Stage 02",
    title: "Resumes scored against it",
    body: "Every requirement gets a verdict on a 4-point scale, and every verdict is backed by a literal quote highlighted in the resume. Never an unexplained number.",
    verdicts: true,
  },
  {
    n: "Stage 03",
    title: "Adaptive interview on the gaps",
    body: "Whatever scored Partial or Unproven becomes the input to an AI interview that asks about those gaps specifically — and is built to resist AI-copilot cheating.",
  },
  {
    n: "Stage 04",
    title: "Feedback report out",
    body: "If rejected, an auto-drafted report explains why, citing the same evidence — reviewed and approved by the recruiter before it reaches the candidate.",
  },
];

const FEATURES = [
  {
    title: "Evidence-linked scoring",
    body: "Every verdict cites a real quote from the resume. Click through and see it highlighted in place, in the original document.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M9 14l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Copilot-resistant interviews",
    body: "Designed against AI-assisted cheating: consistent response-latency detection, on-screen artifact questions a copilot cannot see, and focus/tab monitoring.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path
          d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Candidate feedback loop",
    body: "Rejected candidates get a real, specific explanation instead of silence — drafted by AI, approved by a human before it sends.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path
          d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

const PROOF = [
  {
    n: "42/42",
    label: "Evidence citations correctly grounded",
    body: "Across the test resumes used during development, every citation pointed at text that actually exists in the resume.",
  },
  {
    n: "4-stage",
    label: "AI pipeline, end to end",
    body: "Job description → evidence-backed scoring → adaptive interview → candidate feedback report.",
  },
  {
    n: "4-point",
    label: "Verdict scale, no hidden maths",
    body: "Strong, Partial, Unproven, Absent. A recruiter can read a score and know exactly what it means.",
  },
];

export default function Home() {
  return (
    <>
      {/* The living ground — the composition floats on top of it. */}
      <StormScene />

      <div className="lk-stage">
        {/* ── Frame 68 · the nav bar ──────────────────────────────── */}
        <header className="sp-nav">
          <Link className="sp-brand" href="/">
            <svg className="sp-mark" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M9 0.5C13.6944 0.5 17.5 4.30558 17.5 9C17.5 13.6944 13.6944 17.5 9 17.5C4.30558 17.5 0.5 13.6944 0.5 9C0.5 4.30558 4.30558 0.5 9 0.5Z"
                stroke="white"
              />
            </svg>
            RecruitEase
          </Link>

          <nav className="sp-links">
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <a href="#proof">Proof</a>
          </nav>

          <div className="sp-nav-actions">
            <Link className="sp-ghost-sm" href="/auth/login">
              Sign in
            </Link>
            <GlassCta href="/auth/sign-up" size="sm">
              Get Started
            </GlassCta>
          </div>
        </header>

        {/* ── Frame 67 · the hero ─────────────────────────────────── */}
        <section className="lk lk-spotlight">
          <div className="sp-hero">
            <Rise order={1} className="sp-head">
              <h1 className="sp-h1">Hire on evidence,</h1>
              <p className="sp-h2">not on hunches</p>
              <p className="sp-sub">
                Paste a job description. Get candidates scored against it with a cited quote behind
                every verdict, an adaptive AI interview that probes only the gaps, and a feedback
                report drafted for you to approve.
              </p>
            </Rise>

            <Rise order={2} className="sp-cta">
              <GlassCta href="/auth/sign-up">Get started</GlassCta>
              <a className="sp-btn sp-btn-ghost" href="#how-it-works">
                See how it works
              </a>
            </Rise>
          </div>
        </section>

        <div className="sp-flow">
          {/* ── How it works · the 4-stage pipeline ─────────────────── */}
          <section id="how-it-works" className="sp-section">
          <Rise inView>
            <p className="sp-eyebrow">How it works</p>
            <h2 className="sp-h2-sec">Four stages, one thread of evidence.</h2>
            <p className="sp-lede">
              The same quotes that justify a score are the quotes the interview probes, and the same
              quotes the rejection letter cites. Nothing is re-derived and nothing is invented.
            </p>
          </Rise>

          <div className="sp-steps">
            {STAGES.map((s, i) => (
              <Rise key={s.n} order={i} inView>
                <article className="sp-card">
                  <span className="sp-step-n">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                  {s.verdicts && (
                    <div className="sp-verdicts">
                      <span className="sp-verdict sp-verdict-strong">Strong</span>
                      <span className="sp-verdict sp-verdict-partial">Partial</span>
                      <span className="sp-verdict sp-verdict-unproven">Unproven</span>
                      <span className="sp-verdict sp-verdict-absent">Absent</span>
                    </div>
                  )}
                </article>
              </Rise>
            ))}
          </div>
        </section>

        {/* ── Why it's different · 3 callouts ─────────────────────── */}
        <section id="features" className="sp-section">
          <Rise inView>
            <p className="sp-eyebrow">Why it&rsquo;s different</p>
            <h2 className="sp-h2-sec">A score you can argue with.</h2>
            <p className="sp-lede">
              Recruiters get proof instead of a ranking. Candidates get an answer instead of
              silence.
            </p>
          </Rise>

          <div className="sp-features">
            {FEATURES.map((f, i) => (
              <Rise key={f.title} order={i} inView>
                <article className="sp-card">
                  <span className="sp-feature-icon" aria-hidden="true">
                    {f.icon}
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </article>
              </Rise>
            ))}
          </div>
        </section>

        {/* ── Proof points ────────────────────────────────────────── */}
        <section id="proof" className="sp-section">
          <Rise inView>
            <p className="sp-eyebrow">Where it stands</p>
            <h2 className="sp-h2-sec">Measured, not claimed.</h2>
            <p className="sp-lede">
              These are the numbers the build actually produced. There are no customer counts here
              because there are not any yet.
            </p>
          </Rise>

          <div className="sp-proof">
            {PROOF.map((p, i) => (
              <Rise key={p.n} order={i} inView>
                <article className="sp-card">
                  <span className="sp-proof-n">{p.n}</span>
                  <h3>{p.label}</h3>
                  <p>{p.body}</p>
                </article>
              </Rise>
            ))}
          </div>

          <Rise inView>
            <p className="sp-proof-note">
              Built for AI Agent Hackathon 2026 (Product Space) — September 2026.
            </p>
          </Rise>
        </section>

        {/* ── Closing CTA ─────────────────────────────────────────── */}
        <section className="sp-section">
          <Rise inView>
            <div className="sp-card sp-close">
              <h2 className="sp-h2-sec">Put the evidence in front of the decision.</h2>
              <p className="sp-lede">
                Start with one job description and a stack of resumes. You will see the quotes
                before you see a shortlist.
              </p>
              <GlassCta href="/auth/sign-up">Get started</GlassCta>
            </div>
          </Rise>
        </section>

        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <footer className="sp-footer">
          <span className="sp-footer-brand">RecruitEase</span>
          <span>Built for AI Agent Hackathon 2026</span>
          <a
            href="https://github.com/Ortholm10/RecruitEase"
            target="_blank"
            rel="noreferrer noopener"
          >
            github.com/Ortholm10/RecruitEase &middot; MIT
          </a>
        </footer>
      </div>
    </>
  );
}
