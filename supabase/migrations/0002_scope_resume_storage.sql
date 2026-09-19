-- ============================================================
-- Scope the resumes bucket to job ownership.
-- 0001's policy let ANY recruiter read/list/overwrite/delete ANY object in
-- the bucket (it only checked role). Objects live at "<job_id>/<file>".
--
-- Already applied by hand on the live project (2026-09-19, SQL editor).
-- This file mirrors that policy so fresh environments built from
-- migrations get it too; it is idempotent if run again.
-- ============================================================

drop policy if exists "resumes: recruiter upload/read own job's files" on storage.objects;
drop policy if exists "recruiters manage own job resumes" on storage.objects;

create policy "recruiters manage own job resumes"
  on storage.objects for all
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] in (select id::text from jobs where recruiter_id = auth.uid())
  )
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] in (select id::text from jobs where recruiter_id = auth.uid())
  );
