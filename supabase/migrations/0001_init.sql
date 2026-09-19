-- ============================================================
-- RecruitEase — initial schema
-- Owner: Person A (never edited by Person B — see discipline rule)
-- ============================================================

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('recruiter', 'candidate')),
  full_name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles: self read"
  on profiles for select
  using (id = auth.uid());

create policy "profiles: self update"
  on profiles for update
  using (id = auth.uid());

create policy "profiles: self insert"
  on profiles for insert
  with check (id = auth.uid());

-- ------------------------------------------------------------
-- jobs
-- ------------------------------------------------------------
create table jobs (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  jd_text text not null,
  requirements jsonb not null default '[]'::jsonb, -- Requirement[]
  created_at timestamptz not null default now()
);

alter table jobs enable row level security;

create policy "jobs: recruiter owns"
  on jobs for all
  using (recruiter_id = auth.uid())
  with check (recruiter_id = auth.uid());

-- ------------------------------------------------------------
-- candidates
-- ------------------------------------------------------------
create table candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  name text not null,
  email text not null,
  resume_path text not null,       -- Supabase storage object path
  resume_text text not null default '',
  created_at timestamptz not null default now()
);

alter table candidates enable row level security;

-- recruiter can see/manage every candidate on a job they own
create policy "candidates: recruiter via job"
  on candidates for all
  using (
    exists (select 1 from jobs j where j.id = candidates.job_id and j.recruiter_id = auth.uid())
  )
  with check (
    exists (select 1 from jobs j where j.id = candidates.job_id and j.recruiter_id = auth.uid())
  );

-- a candidate can read their own row if their profile email matches
-- (adjust once candidate accounts are linked to a candidate_id column;
--  kept simple for the hackathon weekend)
create policy "candidates: self read by email"
  on candidates for select
  using (
    email = (select email from profiles where id = auth.uid())
  );

-- ------------------------------------------------------------
-- extractions
-- ------------------------------------------------------------
create table extractions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  fields jsonb not null default '[]'::jsonb, -- ExtractedField[]
  model_version text not null,
  created_at timestamptz not null default now()
);

alter table extractions enable row level security;

create policy "extractions: recruiter via candidate->job"
  on extractions for all
  using (
    exists (
      select 1 from candidates c
      join jobs j on j.id = c.job_id
      where c.id = extractions.candidate_id and j.recruiter_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- scores
-- ------------------------------------------------------------
create table scores (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  total numeric not null,
  breakdown jsonb not null default '[]'::jsonb,   -- RequirementScore[]
  unproven jsonb not null default '[]'::jsonb,    -- string[] of requirementIds
  must_have_gate_failed boolean not null default false,
  gate_reason text,
  rubric_version text not null,
  created_at timestamptz not null default now()
);

alter table scores enable row level security;

create policy "scores: recruiter via job"
  on scores for all
  using (
    exists (select 1 from jobs j where j.id = scores.job_id and j.recruiter_id = auth.uid())
  );

-- ------------------------------------------------------------
-- interviews  (plan stored inline as jsonb — see types/index.ts Interview.plan)
-- ------------------------------------------------------------
create table interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  plan jsonb not null,   -- InterviewPlan
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed', 'abandoned')),
  started_at timestamptz,
  completed_at timestamptz
);

alter table interviews enable row level security;

create policy "interviews: recruiter via job"
  on interviews for all
  using (
    exists (select 1 from jobs j where j.id = interviews.job_id and j.recruiter_id = auth.uid())
  );

create policy "interviews: candidate can update own during session"
  on interviews for select
  using (
    exists (
      select 1 from candidates c
      where c.id = interviews.candidate_id
        and c.email = (select email from profiles where id = auth.uid())
    )
  );

-- ------------------------------------------------------------
-- turns
-- ------------------------------------------------------------
create table turns (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references interviews(id) on delete cascade,
  question_id text not null,
  question_type text not null
    check (question_type in ('resume_probe', 'gap_probe', 'artifact', 'rapid_fire', 'follow_up')),
  follow_up_depth int not null default 0 check (follow_up_depth between 0 and 2),
  asked_at timestamptz not null default now(),
  first_word_at timestamptz,
  answered_at timestamptz,
  transcript text not null default '',
  verdict text check (verdict in ('strong', 'partial', 'unproven', 'absent')),
  evidence_linked_requirement text
);

alter table turns enable row level security;

create policy "turns: recruiter via interview->job"
  on turns for all
  using (
    exists (
      select 1 from interviews i
      join jobs j on j.id = i.job_id
      where i.id = turns.interview_id and j.recruiter_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- integrity_events  — never exposed to the feedback generator, ever
-- ------------------------------------------------------------
create table integrity_events (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references interviews(id) on delete cascade,
  turn_id uuid references turns(id) on delete set null,
  type text not null check (
    type in ('latency_variance', 'tab_blur', 'fullscreen_exit', 'paste_event',
             'window_focus_loss', 'canary_triggered', 'gaze_sweep')
  ),
  payload jsonb not null default '{}'::jsonb,
  ts timestamptz not null default now()
);

alter table integrity_events enable row level security;

-- recruiter-only, no exceptions — this table is never read by the
-- candidate feedback generator's data-fetching code path.
create policy "integrity_events: recruiter via interview->job"
  on integrity_events for all
  using (
    exists (
      select 1 from interviews i
      join jobs j on j.id = i.job_id
      where i.id = integrity_events.interview_id and j.recruiter_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- reports
-- ------------------------------------------------------------
create table reports (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  report_type text not null check (report_type in ('recruiter', 'candidate_feedback')),
  body jsonb not null,          -- RecruiterReport | CandidateFeedbackReport
  outcome text check (outcome in ('advance', 'reject', 'pending')),
  draft_status text not null default 'draft' check (draft_status in ('draft', 'approved', 'sent')),
  approved_by uuid references profiles(id),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table reports enable row level security;

create policy "reports: recruiter via job"
  on reports for all
  using (
    exists (select 1 from jobs j where j.id = reports.job_id and j.recruiter_id = auth.uid())
  );

-- candidate can read only their OWN candidate_feedback report, and only
-- once it has been sent
create policy "reports: candidate reads own sent feedback"
  on reports for select
  using (
    report_type = 'candidate_feedback'
    and draft_status = 'sent'
    and exists (
      select 1 from candidates c
      where c.id = reports.candidate_id
        and c.email = (select email from profiles where id = auth.uid())
    )
  );

-- ------------------------------------------------------------
-- audit_log — append-only
-- ------------------------------------------------------------
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (
    entity in ('job', 'candidate', 'extraction', 'score', 'interview', 'turn', 'report')
  ),
  entity_id uuid not null,
  action text not null,
  actor_id text not null,       -- profile id, or literal 'system'
  model text,
  prompt_version text,
  source_ref text,
  ts timestamptz not null default now()
);

alter table audit_log enable row level security;

create policy "audit_log: recruiter read-only"
  on audit_log for select
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'recruiter')
  );

-- inserts to audit_log happen via the service role from server actions,
-- so no insert policy is granted to authenticated users.

-- ------------------------------------------------------------
-- storage bucket for resumes (run once; Supabase CLI applies this too)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

create policy "resumes: recruiter upload/read own job's files"
  on storage.objects for all
  using (
    bucket_id = 'resumes'
    and exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'recruiter'
    )
  );
