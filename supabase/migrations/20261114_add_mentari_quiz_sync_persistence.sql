-- PR #181: durable Mentari quiz identity and atomic per-student submission updates.
-- Database primitives only; the application does not call this RPC yet.

ALTER TABLE public.course_updates
  ADD COLUMN IF NOT EXISTS mentari_activity_id TEXT,
  ADD COLUMN IF NOT EXISTS mentari_quiz_type TEXT,
  ADD COLUMN IF NOT EXISTS mentari_course_code TEXT,
  ADD COLUMN IF NOT EXISTS mentari_section TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'course_updates_mentari_quiz_type_check'
      AND conrelid = 'public.course_updates'::regclass
  ) THEN
    ALTER TABLE public.course_updates
      ADD CONSTRAINT course_updates_mentari_quiz_type_check
      CHECK (mentari_quiz_type IS NULL OR mentari_quiz_type IN ('PRE_TEST', 'POST_TEST'));
  END IF;
END;
$;

CREATE UNIQUE INDEX IF NOT EXISTS course_updates_mentari_activity_uidx
  ON public.course_updates (mentari_activity_id)
  WHERE mentari_activity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.mentari_sync_quiz_submission(
  p_task_row_id TEXT,
  p_external_activity_id TEXT,
  p_quiz_type TEXT,
  p_external_course_code TEXT,
  p_external_section TEXT,
  p_student_no INTEGER,
  p_external_submission_id TEXT,
  p_submitted_at BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_row public.course_updates%ROWTYPE;
  v_other_task_id TEXT;
  v_external_suffix TEXT;
  v_expected_course TEXT;
  v_submissions JSONB;
  v_current JSONB;
  v_current_sync JSONB;
  v_next JSONB;
  v_student_key TEXT;
  v_status TEXT;
  v_current_at BIGINT;
BEGIN
  IF COALESCE(BTRIM(p_task_row_id), '') = ''
     OR COALESCE(BTRIM(p_external_activity_id), '') = ''
     OR LENGTH(p_external_activity_id) > 200
     OR p_quiz_type IS NULL OR p_quiz_type NOT IN ('PRE_TEST', 'POST_TEST')
     OR COALESCE(BTRIM(p_external_course_code), '') = ''
     OR COALESCE(BTRIM(p_external_section), '') = ''
     OR p_external_section !~ '^PERTEMUAN_(?:[1-9]|1[0-6])$'
     OR p_student_no IS NULL OR p_student_no < 1 OR p_student_no > 32
     OR COALESCE(BTRIM(p_external_submission_id), '') = ''
     OR LENGTH(p_external_submission_id) > 200
     OR p_submitted_at IS NULL OR p_submitted_at <= 0 THEN
    RETURN jsonb_build_object('status', 'invalid_input');
  END IF;

  v_external_suffix := substring(p_external_course_code FROM '-(26(TEL|PAM|FTK)[0-9]{4})$');
  v_expected_course := CASE v_external_suffix
    WHEN '26TEL0004' THEN 'KIM'
    WHEN '26PAM0007' THEN 'WRG'
    WHEN '26PAM0008' THEN 'IND'
    WHEN '26PAM0010' THEN 'ENG'
    WHEN '26FTK0021' THEN 'FIS'
    WHEN '26FTK0011' THEN 'KAL'
    WHEN '26TEL0003' THEN 'ELE'
    WHEN '26TEL0002' THEN 'ALJ'
    WHEN '26TEL0001' THEN 'PRG'
    ELSE NULL
  END;

  SELECT * INTO v_row
  FROM public.course_updates
  WHERE id = p_task_row_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'task_not_found');
  END IF;

  IF v_row.task_title IS NULL THEN
    RETURN jsonb_build_object('status', 'task_slot_empty');
  END IF;

  IF v_expected_course IS NULL OR v_expected_course <> v_row.course_code THEN
    RETURN jsonb_build_object('status', 'course_mismatch');
  END IF;

  IF substring(p_external_section FROM '^PERTEMUAN_([0-9]+)$')::INTEGER
       <> v_row.meeting_number THEN
    RETURN jsonb_build_object('status', 'meeting_mismatch');
  END IF;

  IF v_row.mentari_activity_id IS NOT NULL
     AND v_row.mentari_activity_id <> p_external_activity_id THEN
    RETURN jsonb_build_object('status', 'activity_conflict');
  END IF;

  IF v_row.mentari_quiz_type IS NOT NULL
     AND v_row.mentari_quiz_type <> p_quiz_type THEN
    RETURN jsonb_build_object('status', 'quiz_type_conflict');
  END IF;

  IF v_row.mentari_course_code IS NOT NULL
     AND v_row.mentari_course_code <> p_external_course_code THEN
    RETURN jsonb_build_object('status', 'external_course_conflict');
  END IF;

  IF v_row.mentari_section IS NOT NULL
     AND v_row.mentari_section <> p_external_section THEN
    RETURN jsonb_build_object('status', 'external_section_conflict');
  END IF;

  SELECT id INTO v_other_task_id
  FROM public.course_updates
  WHERE mentari_activity_id = p_external_activity_id
    AND id <> p_task_row_id
  LIMIT 1;

  IF v_other_task_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'activity_already_linked');
  END IF;

  v_submissions := COALESCE(v_row.task_submissions, '{}'::JSONB);
  IF jsonb_typeof(v_submissions) <> 'object' THEN
    RETURN jsonb_build_object('status', 'invalid_submission_store');
  END IF;

  v_student_key := p_student_no::TEXT;
  v_current := v_submissions -> v_student_key;
  v_current_sync := CASE
    WHEN jsonb_typeof(v_current) = 'object' THEN v_current -> 'mentariSync'
    ELSE NULL
  END;

  IF v_current IS NOT NULL
     AND (jsonb_typeof(v_current) <> 'object'
          OR v_current_sync IS NULL
          OR v_current_sync = 'null'::JSONB) THEN
    v_status := 'manual_submission_preserved';
  ELSIF v_current IS NOT NULL
     AND jsonb_typeof(v_current_sync) <> 'object' THEN
    v_status := 'invalid_existing_provenance';
  ELSIF v_current IS NOT NULL
     AND v_current_sync ->> 'externalActivityId' <> p_external_activity_id THEN
    v_status := 'foreign_activity_conflict';
  ELSE
    v_current_at := NULL;
    IF v_current IS NOT NULL
       AND COALESCE(v_current ->> 'at', '') ~ '^[0-9]+$' THEN
      v_current_at := (v_current ->> 'at')::BIGINT;
    END IF;

    IF v_current_at IS NOT NULL AND v_current_at > p_submitted_at THEN
      v_status := 'newer_existing_submission_preserved';
    ELSIF v_current IS NOT NULL
       AND v_current_sync ->> 'externalActivityId' = p_external_activity_id
       AND v_current_sync ->> 'externalSubmissionId' = p_external_submission_id
       AND v_current_at IS NOT NULL AND v_current_at >= p_submitted_at THEN
      v_status := 'noop_existing_attempt';
    ELSE
      v_next := CASE
        WHEN jsonb_typeof(v_current) = 'object' THEN v_current
        ELSE jsonb_build_object('tautan', '', 'catatan', '', 'berkas', NULL)
      END;
      v_next := v_next || jsonb_build_object(
        'at', p_submitted_at,
        'mentariSync', jsonb_build_object(
          'externalActivityId', p_external_activity_id,
          'externalSubmissionId', p_external_submission_id,
          'source', 'mentari'
        )
      );
      v_submissions := jsonb_set(v_submissions, ARRAY[v_student_key], v_next, TRUE);
      v_status := CASE WHEN v_current IS NULL
        THEN 'created_mentari_submission'
        ELSE 'updated_mentari_submission'
      END;
    END IF;
  END IF;

  -- Row lock plus one UPDATE makes the metadata binding and student path atomic.
  -- Other students and subs.__review are retained by jsonb_set.
  UPDATE public.course_updates
  SET mentari_activity_id = COALESCE(mentari_activity_id, p_external_activity_id),
      mentari_quiz_type = COALESCE(mentari_quiz_type, p_quiz_type),
      mentari_course_code = COALESCE(mentari_course_code, p_external_course_code),
      mentari_section = COALESCE(mentari_section, p_external_section),
      task_submissions = v_submissions,
      updated_at = NOW()
  WHERE id = p_task_row_id;

  RETURN jsonb_build_object(
    'status', v_status,
    'taskRowId', p_task_row_id,
    'studentNo', p_student_no,
    'externalActivityId', p_external_activity_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.mentari_sync_quiz_submission(
  TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mentari_sync_quiz_submission(
  TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, BIGINT
) TO service_role;
