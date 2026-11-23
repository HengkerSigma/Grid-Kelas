-- Personal Grade Recap: Mentari Pre-test/Post-test import.
-- Apply only after this PR is reviewed and approved for the target Supabase project.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.quiz_import_batches (
  batch_id UUID PRIMARY KEY,
  semester TEXT NOT NULL CHECK (semester ~ '^[0-9]{5}
  status TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview','committed','rejected','expired')),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER NOT NULL CHECK (created_by BETWEEN 1 AND 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
  committed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.quiz_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semester TEXT NOT NULL,
  course_code TEXT NOT NULL,
  meeting_number SMALLINT NOT NULL CHECK (meeting_number BETWEEN 1 AND 16),
  quiz_type TEXT NOT NULL CHECK (quiz_type IN ('PRE_TEST','POST_TEST')),
  title TEXT NOT NULL DEFAULT '',
  active_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (semester, course_code, meeting_number, quiz_type)
);

CREATE TABLE IF NOT EXISTS public.quiz_activity_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.quiz_activities(id) ON DELETE RESTRICT,
  external_activity_id TEXT NOT NULL,
  batch_id UUID REFERENCES public.quiz_import_batches(batch_id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  captured_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, version_number),
  UNIQUE (external_activity_id)
);

ALTER TABLE public.quiz_activities
  DROP CONSTRAINT IF EXISTS quiz_activities_active_version_fk;
ALTER TABLE public.quiz_activities
  ADD CONSTRAINT quiz_activities_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES public.quiz_activity_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.quiz_import_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.quiz_import_batches(batch_id) ON DELETE CASCADE,
  account_key TEXT NOT NULL CHECK (account_key ~ '^akun/(0[1-9]|[12][0-9]|3[0-2])$'),
  nim TEXT NOT NULL CHECK (nim ~ '^[0-9]{6,20}$'),
  course_code TEXT NOT NULL,
  meeting_number SMALLINT NOT NULL CHECK (meeting_number BETWEEN 1 AND 16),
  quiz_type TEXT NOT NULL CHECK (quiz_type IN ('PRE_TEST','POST_TEST')),
  external_activity_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  grade NUMERIC(5,2) CHECK (grade IS NULL OR grade BETWEEN 0 AND 100),
  result_status TEXT NOT NULL CHECK (result_status IN ('graded','no_record')),
  captured_at TIMESTAMPTZ,
  row_hash TEXT NOT NULL CHECK (row_hash ~ '^[a-f0-9]{64}
);

CREATE TABLE IF NOT EXISTS public.quiz_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.quiz_activities(id) ON DELETE RESTRICT,
  account_key TEXT NOT NULL CHECK (account_key ~ '^akun/(0[1-9]|[12][0-9]|3[0-2])$'),
  nim TEXT NOT NULL CHECK (nim ~ '^[0-9]{6,20}$'),
  grade NUMERIC(5,2) CHECK (grade IS NULL OR grade BETWEEN 0 AND 100),
  result_status TEXT NOT NULL CHECK (result_status IN ('graded','no_record')),
  source_version_id UUID REFERENCES public.quiz_activity_versions(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, account_key)
);

CREATE TABLE IF NOT EXISTS public.quiz_result_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_result_id UUID NOT NULL REFERENCES public.quiz_results(id) ON DELETE RESTRICT,
  old_grade NUMERIC(5,2),
  new_grade NUMERIC(5,2),
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  batch_id UUID REFERENCES public.quiz_import_batches(batch_id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by INTEGER NOT NULL CHECK (changed_by BETWEEN 1 AND 32)
);

CREATE TABLE IF NOT EXISTS public.quiz_sync_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id UUID REFERENCES public.quiz_import_batches(batch_id) ON DELETE SET NULL,
  actor_no INTEGER NOT NULL CHECK (actor_no BETWEEN 1 AND 32),
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE OR REPLACE FUNCTION public.guard_quiz_import_staging()
RETURNS TRIGGER LANGUAGE plpgsql AS $
DECLARE v_status TEXT; v_expiry TIMESTAMPTZ;
BEGIN
  SELECT status, expires_at INTO v_status, v_expiry
  FROM public.quiz_import_batches WHERE batch_id = COALESCE(NEW.batch_id, OLD.batch_id);
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'staging_is_immutable'; END IF;
  IF TG_OP = 'INSERT' AND (v_status <> 'preview' OR v_expiry <= NOW()) THEN
    RAISE EXCEPTION 'staging_batch_not_open';
  END IF;
  RETURN NEW;
END;
$;
DROP TRIGGER IF EXISTS quiz_import_staging_guard ON public.quiz_import_staging;
CREATE TRIGGER quiz_import_staging_guard
BEFORE INSERT OR UPDATE ON public.quiz_import_staging
FOR EACH ROW EXECUTE FUNCTION public.guard_quiz_import_staging();

CREATE INDEX IF NOT EXISTS quiz_results_account_idx ON public.quiz_results(account_key);
CREATE INDEX IF NOT EXISTS quiz_activities_semester_course_idx ON public.quiz_activities(semester, course_code);
CREATE INDEX IF NOT EXISTS quiz_versions_activity_idx ON public.quiz_activity_versions(activity_id, version_number DESC);
CREATE INDEX IF NOT EXISTS quiz_history_result_idx ON public.quiz_result_history(quiz_result_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS quiz_staging_batch_idx ON public.quiz_import_staging(batch_id);

-- The backend uses service_role after validating the signed Grid Kelas session and admin role.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['quiz_import_batches','quiz_activities','quiz_activity_versions',
    'quiz_import_staging','quiz_results','quiz_result_history','quiz_sync_logs']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE public.quiz_sync_logs_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.mentari_commit_grade_import(p_batch_id UUID, p_actor_no INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $
DECLARE
  b public.quiz_import_batches%ROWTYPE;
  s RECORD;
  v_activity_id UUID;
  v_version_id UUID;
  v_old public.quiz_results%ROWTYPE;
  v_result_id UUID;
  v_version_no INTEGER;
  v_inserted INTEGER := 0;
  v_updated INTEGER := 0;
  v_unchanged INTEGER := 0;
  v_history INTEGER := 0;
  v_account_nim TEXT;
BEGIN
  IF p_actor_no IS NULL OR p_actor_no NOT BETWEEN 1 AND 32 THEN
    RAISE EXCEPTION 'invalid_actor';
  END IF;
  SELECT * INTO b FROM public.quiz_import_batches WHERE batch_id = p_batch_id FOR UPDATE;
  IF NOT FOUND OR b.status <> 'preview' OR b.expires_at <= NOW() THEN
    RAISE EXCEPTION 'batch_not_confirmable';
  END IF;
  IF b.created_by <> p_actor_no THEN
    RAISE EXCEPTION 'batch_owner_mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quiz_import_staging WHERE batch_id = p_batch_id) THEN
    RAISE EXCEPTION 'empty_batch';
  END IF;
  IF encode(digest((SELECT string_agg(row_hash, '|' ORDER BY external_activity_id COLLATE "C", nim COLLATE "C")
      FROM public.quiz_import_staging WHERE batch_id = p_batch_id), 'sha256'),'hex') <> b.payload_hash THEN
    RAISE EXCEPTION 'staging_hash_mismatch';
  END IF;

  -- Confirm each staged NIM still resolves to the same Grid Kelas account.
  FOR s IN SELECT * FROM public.quiz_import_staging WHERE batch_id = p_batch_id ORDER BY id LOOP
    SELECT content->>'nim' INTO v_account_nim
    FROM public.app_data WHERE key = s.account_key;
    IF v_account_nim IS DISTINCT FROM s.nim THEN
      RAISE EXCEPTION 'account_mapping_changed';
    END IF;

    INSERT INTO public.quiz_activities(semester,course_code,meeting_number,quiz_type,title)
    VALUES (b.semester,s.course_code,s.meeting_number,s.quiz_type,s.title)
    ON CONFLICT (semester,course_code,meeting_number,quiz_type)
    DO UPDATE SET title = EXCLUDED.title, updated_at = NOW()
    RETURNING id INTO v_activity_id;

    SELECT id INTO v_version_id FROM public.quiz_activity_versions
    WHERE activity_id = v_activity_id AND external_activity_id = s.external_activity_id;
    IF v_version_id IS NULL THEN
      SELECT COALESCE(MAX(version_number),0)+1 INTO v_version_no
      FROM public.quiz_activity_versions WHERE activity_id = v_activity_id;
      UPDATE public.quiz_activity_versions SET is_active = FALSE WHERE activity_id = v_activity_id;
      INSERT INTO public.quiz_activity_versions(activity_id,external_activity_id,batch_id,version_number,captured_at,is_active)
      VALUES(v_activity_id,s.external_activity_id,p_batch_id,v_version_no,s.captured_at,TRUE)
      RETURNING id INTO v_version_id;
    ELSE
      UPDATE public.quiz_activity_versions SET is_active = (external_activity_id = s.external_activity_id)
      WHERE activity_id = v_activity_id;
    END IF;
    UPDATE public.quiz_activities SET active_version_id = v_version_id, updated_at = NOW()
    WHERE id = v_activity_id;

    SELECT * INTO v_old FROM public.quiz_results
    WHERE activity_id = v_activity_id AND account_key = s.account_key FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.quiz_results(activity_id,account_key,nim,grade,result_status,source_version_id)
      VALUES(v_activity_id,s.account_key,s.nim,s.grade,s.result_status,v_version_id);
      v_inserted := v_inserted + 1;
    ELSIF v_old.grade IS NOT DISTINCT FROM s.grade AND v_old.result_status = s.result_status THEN
      UPDATE public.quiz_results SET source_version_id = v_version_id, updated_at = NOW()
      WHERE id = v_old.id;
      v_unchanged := v_unchanged + 1;
    ELSIF s.result_status = 'no_record' AND v_old.result_status = 'graded' THEN
      -- Missing attempts in an export never erase a previously recorded grade.
      v_unchanged := v_unchanged + 1;
    ELSE
      UPDATE public.quiz_results SET nim=s.nim,grade=s.grade,result_status=s.result_status,
        source_version_id=v_version_id,updated_at=NOW() WHERE id=v_old.id;
      INSERT INTO public.quiz_result_history(quiz_result_id,old_grade,new_grade,old_status,new_status,batch_id,changed_by)
      VALUES(v_old.id,v_old.grade,s.grade,v_old.result_status,s.result_status,p_batch_id,p_actor_no);
      v_updated := v_updated + 1;
      v_history := v_history + 1;
    END IF;
  END LOOP;

  UPDATE public.quiz_import_batches SET status='committed',committed_at=NOW()
  WHERE batch_id=p_batch_id;
  INSERT INTO public.quiz_sync_logs(batch_id,actor_no,action,details)
  VALUES(p_batch_id,p_actor_no,'grade_import_committed',jsonb_build_object(
    'inserted',v_inserted,'updated',v_updated,'unchanged',v_unchanged,'history',v_history));
  DELETE FROM public.quiz_import_staging WHERE batch_id=p_batch_id;
  RETURN jsonb_build_object('status','committed','inserted',v_inserted,'updated',v_updated,
    'unchanged',v_unchanged,'history',v_history);
END;
$$;

REVOKE ALL ON FUNCTION public.mentari_commit_grade_import(UUID,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mentari_commit_grade_import(UUID,INTEGER) TO service_role;
),
  UNIQUE (batch_id, external_activity_id, nim)
);

CREATE TABLE IF NOT EXISTS public.quiz_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.quiz_activities(id) ON DELETE RESTRICT,
  account_key TEXT NOT NULL CHECK (account_key ~ '^akun/(0[1-9]|[12][0-9]|3[0-2])$'),
  nim TEXT NOT NULL CHECK (nim ~ '^[0-9]{6,20}$'),
  grade NUMERIC(5,2) CHECK (grade IS NULL OR grade BETWEEN 0 AND 100),
  result_status TEXT NOT NULL CHECK (result_status IN ('graded','no_record')),
  source_version_id UUID REFERENCES public.quiz_activity_versions(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, account_key)
);

CREATE TABLE IF NOT EXISTS public.quiz_result_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_result_id UUID NOT NULL REFERENCES public.quiz_results(id) ON DELETE RESTRICT,
  old_grade NUMERIC(5,2),
  new_grade NUMERIC(5,2),
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  batch_id UUID REFERENCES public.quiz_import_batches(batch_id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by INTEGER NOT NULL CHECK (changed_by BETWEEN 1 AND 32)
);

CREATE TABLE IF NOT EXISTS public.quiz_sync_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id UUID REFERENCES public.quiz_import_batches(batch_id) ON DELETE SET NULL,
  actor_no INTEGER NOT NULL CHECK (actor_no BETWEEN 1 AND 32),
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quiz_results_account_idx ON public.quiz_results(account_key);
CREATE INDEX IF NOT EXISTS quiz_activities_semester_course_idx ON public.quiz_activities(semester, course_code);
CREATE INDEX IF NOT EXISTS quiz_versions_activity_idx ON public.quiz_activity_versions(activity_id, version_number DESC);
CREATE INDEX IF NOT EXISTS quiz_history_result_idx ON public.quiz_result_history(quiz_result_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS quiz_staging_batch_idx ON public.quiz_import_staging(batch_id);

-- The backend uses service_role after validating the signed Grid Kelas session and admin role.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['quiz_import_batches','quiz_activities','quiz_activity_versions',
    'quiz_import_staging','quiz_results','quiz_result_history','quiz_sync_logs']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE public.quiz_sync_logs_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.mentari_commit_grade_import(p_batch_id UUID, p_actor_no INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b public.quiz_import_batches%ROWTYPE;
  s RECORD;
  v_activity_id UUID;
  v_version_id UUID;
  v_old public.quiz_results%ROWTYPE;
  v_result_id UUID;
  v_version_no INTEGER;
  v_inserted INTEGER := 0;
  v_updated INTEGER := 0;
  v_unchanged INTEGER := 0;
  v_history INTEGER := 0;
  v_account_nim TEXT;
BEGIN
  IF p_actor_no IS NULL OR p_actor_no NOT BETWEEN 1 AND 32 THEN
    RAISE EXCEPTION 'invalid_actor';
  END IF;
  SELECT * INTO b FROM public.quiz_import_batches WHERE batch_id = p_batch_id FOR UPDATE;
  IF NOT FOUND OR b.status <> 'preview' OR b.expires_at <= NOW() THEN
    RAISE EXCEPTION 'batch_not_confirmable';
  END IF;
  IF b.created_by <> p_actor_no THEN
    RAISE EXCEPTION 'batch_owner_mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quiz_import_staging WHERE batch_id = p_batch_id) THEN
    RAISE EXCEPTION 'empty_batch';
  END IF;

  -- Confirm each staged NIM still resolves to the same Grid Kelas account.
  FOR s IN SELECT * FROM public.quiz_import_staging WHERE batch_id = p_batch_id ORDER BY id LOOP
    SELECT content->>'nim' INTO v_account_nim
    FROM public.app_data WHERE key = s.account_key;
    IF v_account_nim IS DISTINCT FROM s.nim THEN
      RAISE EXCEPTION 'account_mapping_changed';
    END IF;

    INSERT INTO public.quiz_activities(semester,course_code,meeting_number,quiz_type,title)
    VALUES (b.semester,s.course_code,s.meeting_number,s.quiz_type,s.title)
    ON CONFLICT (semester,course_code,meeting_number,quiz_type)
    DO UPDATE SET title = EXCLUDED.title, updated_at = NOW()
    RETURNING id INTO v_activity_id;

    SELECT id INTO v_version_id FROM public.quiz_activity_versions
    WHERE activity_id = v_activity_id AND external_activity_id = s.external_activity_id;
    IF v_version_id IS NULL THEN
      SELECT COALESCE(MAX(version_number),0)+1 INTO v_version_no
      FROM public.quiz_activity_versions WHERE activity_id = v_activity_id;
      UPDATE public.quiz_activity_versions SET is_active = FALSE WHERE activity_id = v_activity_id;
      INSERT INTO public.quiz_activity_versions(activity_id,external_activity_id,batch_id,version_number,captured_at,is_active)
      VALUES(v_activity_id,s.external_activity_id,p_batch_id,v_version_no,s.captured_at,TRUE)
      RETURNING id INTO v_version_id;
    ELSE
      UPDATE public.quiz_activity_versions SET is_active = (external_activity_id = s.external_activity_id)
      WHERE activity_id = v_activity_id;
    END IF;
    UPDATE public.quiz_activities SET active_version_id = v_version_id, updated_at = NOW()
    WHERE id = v_activity_id;

    SELECT * INTO v_old FROM public.quiz_results
    WHERE activity_id = v_activity_id AND account_key = s.account_key FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.quiz_results(activity_id,account_key,nim,grade,result_status,source_version_id)
      VALUES(v_activity_id,s.account_key,s.nim,s.grade,s.result_status,v_version_id);
      v_inserted := v_inserted + 1;
    ELSIF v_old.grade IS NOT DISTINCT FROM s.grade AND v_old.result_status = s.result_status THEN
      UPDATE public.quiz_results SET source_version_id = v_version_id, updated_at = NOW()
      WHERE id = v_old.id;
      v_unchanged := v_unchanged + 1;
    ELSIF s.result_status = 'no_record' AND v_old.result_status = 'graded' THEN
      -- Missing attempts in an export never erase a previously recorded grade.
      v_unchanged := v_unchanged + 1;
    ELSE
      UPDATE public.quiz_results SET nim=s.nim,grade=s.grade,result_status=s.result_status,
        source_version_id=v_version_id,updated_at=NOW() WHERE id=v_old.id;
      INSERT INTO public.quiz_result_history(quiz_result_id,old_grade,new_grade,old_status,new_status,batch_id,changed_by)
      VALUES(v_old.id,v_old.grade,s.grade,v_old.result_status,s.result_status,p_batch_id,p_actor_no);
      v_updated := v_updated + 1;
      v_history := v_history + 1;
    END IF;
  END LOOP;

  UPDATE public.quiz_import_batches SET status='committed',committed_at=NOW()
  WHERE batch_id=p_batch_id;
  INSERT INTO public.quiz_sync_logs(batch_id,actor_no,action,details)
  VALUES(p_batch_id,p_actor_no,'grade_import_committed',jsonb_build_object(
    'inserted',v_inserted,'updated',v_updated,'unchanged',v_unchanged,'history',v_history));
  DELETE FROM public.quiz_import_staging WHERE batch_id=p_batch_id;
  RETURN jsonb_build_object('status','committed','inserted',v_inserted,'updated',v_updated,
    'unchanged',v_unchanged,'history',v_history);
END;
$$;

REVOKE ALL ON FUNCTION public.mentari_commit_grade_import(UUID,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mentari_commit_grade_import(UUID,INTEGER) TO service_role;
),
  source_batch_id TEXT NOT NULL UNIQUE CHECK (length(source_batch_id) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview','committed','rejected','expired')),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER NOT NULL CHECK (created_by BETWEEN 1 AND 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
  committed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.quiz_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semester TEXT NOT NULL,
  course_code TEXT NOT NULL,
  meeting_number SMALLINT NOT NULL CHECK (meeting_number BETWEEN 1 AND 16),
  quiz_type TEXT NOT NULL CHECK (quiz_type IN ('PRE_TEST','POST_TEST')),
  title TEXT NOT NULL DEFAULT '',
  active_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (semester, course_code, meeting_number, quiz_type)
);

CREATE TABLE IF NOT EXISTS public.quiz_activity_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.quiz_activities(id) ON DELETE RESTRICT,
  external_activity_id TEXT NOT NULL,
  batch_id UUID REFERENCES public.quiz_import_batches(batch_id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  captured_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, version_number),
  UNIQUE (external_activity_id)
);

ALTER TABLE public.quiz_activities
  DROP CONSTRAINT IF EXISTS quiz_activities_active_version_fk;
ALTER TABLE public.quiz_activities
  ADD CONSTRAINT quiz_activities_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES public.quiz_activity_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.quiz_import_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.quiz_import_batches(batch_id) ON DELETE CASCADE,
  account_key TEXT NOT NULL CHECK (account_key ~ '^akun/(0[1-9]|[12][0-9]|3[0-2])$'),
  nim TEXT NOT NULL CHECK (nim ~ '^[0-9]{6,20}$'),
  course_code TEXT NOT NULL,
  meeting_number SMALLINT NOT NULL CHECK (meeting_number BETWEEN 1 AND 16),
  quiz_type TEXT NOT NULL CHECK (quiz_type IN ('PRE_TEST','POST_TEST')),
  external_activity_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  grade NUMERIC(5,2) CHECK (grade IS NULL OR grade BETWEEN 0 AND 100),
  result_status TEXT NOT NULL CHECK (result_status IN ('graded','no_record')),
  captured_at TIMESTAMPTZ,
  row_hash TEXT NOT NULL CHECK (row_hash ~ '^[a-f0-9]{64}
);

CREATE TABLE IF NOT EXISTS public.quiz_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.quiz_activities(id) ON DELETE RESTRICT,
  account_key TEXT NOT NULL CHECK (account_key ~ '^akun/(0[1-9]|[12][0-9]|3[0-2])$'),
  nim TEXT NOT NULL CHECK (nim ~ '^[0-9]{6,20}$'),
  grade NUMERIC(5,2) CHECK (grade IS NULL OR grade BETWEEN 0 AND 100),
  result_status TEXT NOT NULL CHECK (result_status IN ('graded','no_record')),
  source_version_id UUID REFERENCES public.quiz_activity_versions(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, account_key)
);

CREATE TABLE IF NOT EXISTS public.quiz_result_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_result_id UUID NOT NULL REFERENCES public.quiz_results(id) ON DELETE RESTRICT,
  old_grade NUMERIC(5,2),
  new_grade NUMERIC(5,2),
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  batch_id UUID REFERENCES public.quiz_import_batches(batch_id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by INTEGER NOT NULL CHECK (changed_by BETWEEN 1 AND 32)
);

CREATE TABLE IF NOT EXISTS public.quiz_sync_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id UUID REFERENCES public.quiz_import_batches(batch_id) ON DELETE SET NULL,
  actor_no INTEGER NOT NULL CHECK (actor_no BETWEEN 1 AND 32),
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE OR REPLACE FUNCTION public.guard_quiz_import_staging()
RETURNS TRIGGER LANGUAGE plpgsql AS $
DECLARE v_status TEXT; v_expiry TIMESTAMPTZ;
BEGIN
  SELECT status, expires_at INTO v_status, v_expiry
  FROM public.quiz_import_batches WHERE batch_id = COALESCE(NEW.batch_id, OLD.batch_id);
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'staging_is_immutable'; END IF;
  IF TG_OP = 'INSERT' AND (v_status <> 'preview' OR v_expiry <= NOW()) THEN
    RAISE EXCEPTION 'staging_batch_not_open';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$;
DROP TRIGGER IF EXISTS quiz_import_staging_guard ON public.quiz_import_staging;
CREATE TRIGGER quiz_import_staging_guard
BEFORE INSERT OR UPDATE ON public.quiz_import_staging
FOR EACH ROW EXECUTE FUNCTION public.guard_quiz_import_staging();

CREATE INDEX IF NOT EXISTS quiz_results_account_idx ON public.quiz_results(account_key);
CREATE INDEX IF NOT EXISTS quiz_activities_semester_course_idx ON public.quiz_activities(semester, course_code);
CREATE INDEX IF NOT EXISTS quiz_versions_activity_idx ON public.quiz_activity_versions(activity_id, version_number DESC);
CREATE INDEX IF NOT EXISTS quiz_history_result_idx ON public.quiz_result_history(quiz_result_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS quiz_staging_batch_idx ON public.quiz_import_staging(batch_id);

-- The backend uses service_role after validating the signed Grid Kelas session and admin role.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['quiz_import_batches','quiz_activities','quiz_activity_versions',
    'quiz_import_staging','quiz_results','quiz_result_history','quiz_sync_logs']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE public.quiz_sync_logs_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.mentari_commit_grade_import(p_batch_id UUID, p_actor_no INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b public.quiz_import_batches%ROWTYPE;
  s RECORD;
  v_activity_id UUID;
  v_version_id UUID;
  v_old public.quiz_results%ROWTYPE;
  v_result_id UUID;
  v_version_no INTEGER;
  v_inserted INTEGER := 0;
  v_updated INTEGER := 0;
  v_unchanged INTEGER := 0;
  v_history INTEGER := 0;
  v_account_nim TEXT;
BEGIN
  IF p_actor_no IS NULL OR p_actor_no NOT BETWEEN 1 AND 32 THEN
    RAISE EXCEPTION 'invalid_actor';
  END IF;
  SELECT * INTO b FROM public.quiz_import_batches WHERE batch_id = p_batch_id FOR UPDATE;
  IF NOT FOUND OR b.status <> 'preview' OR b.expires_at <= NOW() THEN
    RAISE EXCEPTION 'batch_not_confirmable';
  END IF;
  IF b.created_by <> p_actor_no THEN
    RAISE EXCEPTION 'batch_owner_mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quiz_import_staging WHERE batch_id = p_batch_id) THEN
    RAISE EXCEPTION 'empty_batch';
  END IF;
  IF encode(digest((SELECT string_agg(row_hash, '|' ORDER BY external_activity_id, nim)
      FROM public.quiz_import_staging WHERE batch_id = p_batch_id), 'sha256'),'hex') <> b.payload_hash THEN
    RAISE EXCEPTION 'staging_hash_mismatch';
  END IF;

  -- Confirm each staged NIM still resolves to the same Grid Kelas account.
  FOR s IN SELECT * FROM public.quiz_import_staging WHERE batch_id = p_batch_id ORDER BY id LOOP
    SELECT content->>'nim' INTO v_account_nim
    FROM public.app_data WHERE key = s.account_key;
    IF v_account_nim IS DISTINCT FROM s.nim THEN
      RAISE EXCEPTION 'account_mapping_changed';
    END IF;

    INSERT INTO public.quiz_activities(semester,course_code,meeting_number,quiz_type,title)
    VALUES (b.semester,s.course_code,s.meeting_number,s.quiz_type,s.title)
    ON CONFLICT (semester,course_code,meeting_number,quiz_type)
    DO UPDATE SET title = EXCLUDED.title, updated_at = NOW()
    RETURNING id INTO v_activity_id;

    SELECT id INTO v_version_id FROM public.quiz_activity_versions
    WHERE activity_id = v_activity_id AND external_activity_id = s.external_activity_id;
    IF v_version_id IS NULL THEN
      SELECT COALESCE(MAX(version_number),0)+1 INTO v_version_no
      FROM public.quiz_activity_versions WHERE activity_id = v_activity_id;
      UPDATE public.quiz_activity_versions SET is_active = FALSE WHERE activity_id = v_activity_id;
      INSERT INTO public.quiz_activity_versions(activity_id,external_activity_id,batch_id,version_number,captured_at,is_active)
      VALUES(v_activity_id,s.external_activity_id,p_batch_id,v_version_no,s.captured_at,TRUE)
      RETURNING id INTO v_version_id;
    ELSE
      UPDATE public.quiz_activity_versions SET is_active = (external_activity_id = s.external_activity_id)
      WHERE activity_id = v_activity_id;
    END IF;
    UPDATE public.quiz_activities SET active_version_id = v_version_id, updated_at = NOW()
    WHERE id = v_activity_id;

    SELECT * INTO v_old FROM public.quiz_results
    WHERE activity_id = v_activity_id AND account_key = s.account_key FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.quiz_results(activity_id,account_key,nim,grade,result_status,source_version_id)
      VALUES(v_activity_id,s.account_key,s.nim,s.grade,s.result_status,v_version_id);
      v_inserted := v_inserted + 1;
    ELSIF v_old.grade IS NOT DISTINCT FROM s.grade AND v_old.result_status = s.result_status THEN
      UPDATE public.quiz_results SET source_version_id = v_version_id, updated_at = NOW()
      WHERE id = v_old.id;
      v_unchanged := v_unchanged + 1;
    ELSIF s.result_status = 'no_record' AND v_old.result_status = 'graded' THEN
      -- Missing attempts in an export never erase a previously recorded grade.
      v_unchanged := v_unchanged + 1;
    ELSE
      UPDATE public.quiz_results SET nim=s.nim,grade=s.grade,result_status=s.result_status,
        source_version_id=v_version_id,updated_at=NOW() WHERE id=v_old.id;
      INSERT INTO public.quiz_result_history(quiz_result_id,old_grade,new_grade,old_status,new_status,batch_id,changed_by)
      VALUES(v_old.id,v_old.grade,s.grade,v_old.result_status,s.result_status,p_batch_id,p_actor_no);
      v_updated := v_updated + 1;
      v_history := v_history + 1;
    END IF;
  END LOOP;

  UPDATE public.quiz_import_batches SET status='committed',committed_at=NOW()
  WHERE batch_id=p_batch_id;
  INSERT INTO public.quiz_sync_logs(batch_id,actor_no,action,details)
  VALUES(p_batch_id,p_actor_no,'grade_import_committed',jsonb_build_object(
    'inserted',v_inserted,'updated',v_updated,'unchanged',v_unchanged,'history',v_history));
  DELETE FROM public.quiz_import_staging WHERE batch_id=p_batch_id;
  RETURN jsonb_build_object('status','committed','inserted',v_inserted,'updated',v_updated,
    'unchanged',v_unchanged,'history',v_history);
END;
$$;

REVOKE ALL ON FUNCTION public.mentari_commit_grade_import(UUID,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mentari_commit_grade_import(UUID,INTEGER) TO service_role;
),
  UNIQUE (batch_id, external_activity_id, nim)
);

CREATE TABLE IF NOT EXISTS public.quiz_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.quiz_activities(id) ON DELETE RESTRICT,
  account_key TEXT NOT NULL CHECK (account_key ~ '^akun/(0[1-9]|[12][0-9]|3[0-2])$'),
  nim TEXT NOT NULL CHECK (nim ~ '^[0-9]{6,20}$'),
  grade NUMERIC(5,2) CHECK (grade IS NULL OR grade BETWEEN 0 AND 100),
  result_status TEXT NOT NULL CHECK (result_status IN ('graded','no_record')),
  source_version_id UUID REFERENCES public.quiz_activity_versions(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, account_key)
);

CREATE TABLE IF NOT EXISTS public.quiz_result_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_result_id UUID NOT NULL REFERENCES public.quiz_results(id) ON DELETE RESTRICT,
  old_grade NUMERIC(5,2),
  new_grade NUMERIC(5,2),
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  batch_id UUID REFERENCES public.quiz_import_batches(batch_id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by INTEGER NOT NULL CHECK (changed_by BETWEEN 1 AND 32)
);

CREATE TABLE IF NOT EXISTS public.quiz_sync_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id UUID REFERENCES public.quiz_import_batches(batch_id) ON DELETE SET NULL,
  actor_no INTEGER NOT NULL CHECK (actor_no BETWEEN 1 AND 32),
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quiz_results_account_idx ON public.quiz_results(account_key);
CREATE INDEX IF NOT EXISTS quiz_activities_semester_course_idx ON public.quiz_activities(semester, course_code);
CREATE INDEX IF NOT EXISTS quiz_versions_activity_idx ON public.quiz_activity_versions(activity_id, version_number DESC);
CREATE INDEX IF NOT EXISTS quiz_history_result_idx ON public.quiz_result_history(quiz_result_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS quiz_staging_batch_idx ON public.quiz_import_staging(batch_id);

-- The backend uses service_role after validating the signed Grid Kelas session and admin role.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['quiz_import_batches','quiz_activities','quiz_activity_versions',
    'quiz_import_staging','quiz_results','quiz_result_history','quiz_sync_logs']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE public.quiz_sync_logs_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.mentari_commit_grade_import(p_batch_id UUID, p_actor_no INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b public.quiz_import_batches%ROWTYPE;
  s RECORD;
  v_activity_id UUID;
  v_version_id UUID;
  v_old public.quiz_results%ROWTYPE;
  v_result_id UUID;
  v_version_no INTEGER;
  v_inserted INTEGER := 0;
  v_updated INTEGER := 0;
  v_unchanged INTEGER := 0;
  v_history INTEGER := 0;
  v_account_nim TEXT;
BEGIN
  IF p_actor_no IS NULL OR p_actor_no NOT BETWEEN 1 AND 32 THEN
    RAISE EXCEPTION 'invalid_actor';
  END IF;
  SELECT * INTO b FROM public.quiz_import_batches WHERE batch_id = p_batch_id FOR UPDATE;
  IF NOT FOUND OR b.status <> 'preview' OR b.expires_at <= NOW() THEN
    RAISE EXCEPTION 'batch_not_confirmable';
  END IF;
  IF b.created_by <> p_actor_no THEN
    RAISE EXCEPTION 'batch_owner_mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quiz_import_staging WHERE batch_id = p_batch_id) THEN
    RAISE EXCEPTION 'empty_batch';
  END IF;

  -- Confirm each staged NIM still resolves to the same Grid Kelas account.
  FOR s IN SELECT * FROM public.quiz_import_staging WHERE batch_id = p_batch_id ORDER BY id LOOP
    SELECT content->>'nim' INTO v_account_nim
    FROM public.app_data WHERE key = s.account_key;
    IF v_account_nim IS DISTINCT FROM s.nim THEN
      RAISE EXCEPTION 'account_mapping_changed';
    END IF;

    INSERT INTO public.quiz_activities(semester,course_code,meeting_number,quiz_type,title)
    VALUES (b.semester,s.course_code,s.meeting_number,s.quiz_type,s.title)
    ON CONFLICT (semester,course_code,meeting_number,quiz_type)
    DO UPDATE SET title = EXCLUDED.title, updated_at = NOW()
    RETURNING id INTO v_activity_id;

    SELECT id INTO v_version_id FROM public.quiz_activity_versions
    WHERE activity_id = v_activity_id AND external_activity_id = s.external_activity_id;
    IF v_version_id IS NULL THEN
      SELECT COALESCE(MAX(version_number),0)+1 INTO v_version_no
      FROM public.quiz_activity_versions WHERE activity_id = v_activity_id;
      UPDATE public.quiz_activity_versions SET is_active = FALSE WHERE activity_id = v_activity_id;
      INSERT INTO public.quiz_activity_versions(activity_id,external_activity_id,batch_id,version_number,captured_at,is_active)
      VALUES(v_activity_id,s.external_activity_id,p_batch_id,v_version_no,s.captured_at,TRUE)
      RETURNING id INTO v_version_id;
    ELSE
      UPDATE public.quiz_activity_versions SET is_active = (external_activity_id = s.external_activity_id)
      WHERE activity_id = v_activity_id;
    END IF;
    UPDATE public.quiz_activities SET active_version_id = v_version_id, updated_at = NOW()
    WHERE id = v_activity_id;

    SELECT * INTO v_old FROM public.quiz_results
    WHERE activity_id = v_activity_id AND account_key = s.account_key FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.quiz_results(activity_id,account_key,nim,grade,result_status,source_version_id)
      VALUES(v_activity_id,s.account_key,s.nim,s.grade,s.result_status,v_version_id);
      v_inserted := v_inserted + 1;
    ELSIF v_old.grade IS NOT DISTINCT FROM s.grade AND v_old.result_status = s.result_status THEN
      UPDATE public.quiz_results SET source_version_id = v_version_id, updated_at = NOW()
      WHERE id = v_old.id;
      v_unchanged := v_unchanged + 1;
    ELSIF s.result_status = 'no_record' AND v_old.result_status = 'graded' THEN
      -- Missing attempts in an export never erase a previously recorded grade.
      v_unchanged := v_unchanged + 1;
    ELSE
      UPDATE public.quiz_results SET nim=s.nim,grade=s.grade,result_status=s.result_status,
        source_version_id=v_version_id,updated_at=NOW() WHERE id=v_old.id;
      INSERT INTO public.quiz_result_history(quiz_result_id,old_grade,new_grade,old_status,new_status,batch_id,changed_by)
      VALUES(v_old.id,v_old.grade,s.grade,v_old.result_status,s.result_status,p_batch_id,p_actor_no);
      v_updated := v_updated + 1;
      v_history := v_history + 1;
    END IF;
  END LOOP;

  UPDATE public.quiz_import_batches SET status='committed',committed_at=NOW()
  WHERE batch_id=p_batch_id;
  INSERT INTO public.quiz_sync_logs(batch_id,actor_no,action,details)
  VALUES(p_batch_id,p_actor_no,'grade_import_committed',jsonb_build_object(
    'inserted',v_inserted,'updated',v_updated,'unchanged',v_unchanged,'history',v_history));
  DELETE FROM public.quiz_import_staging WHERE batch_id=p_batch_id;
  RETURN jsonb_build_object('status','committed','inserted',v_inserted,'updated',v_updated,
    'unchanged',v_unchanged,'history',v_history);
END;
$$;

REVOKE ALL ON FUNCTION public.mentari_commit_grade_import(UUID,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mentari_commit_grade_import(UUID,INTEGER) TO service_role;
