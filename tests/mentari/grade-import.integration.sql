-- Disposable PostgreSQL integration test for the Mentari grade-import RPC.
-- Run only after the migration has been applied to the CI database.
INSERT INTO public.app_data(key, content)
VALUES ('akun/01', '{"nim":"12345678"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET content = EXCLUDED.content;

CREATE OR REPLACE FUNCTION pg_temp.stage_one(
  p_batch UUID,
  p_source TEXT,
  p_external TEXT,
  p_grade NUMERIC,
  p_status TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $stage$
DECLARE
  v_row_hash TEXT;
BEGIN
  v_row_hash := encode(
    digest(
      p_external || '|' || COALESCE(p_grade::text, 'null') || '|' || p_status,
      'sha256'
    ),
    'hex'
  );

  INSERT INTO public.quiz_import_batches(
    batch_id, source_batch_id, semester, status, payload_hash, created_by
  )
  VALUES (
    p_batch, p_source, '20261', 'preview',
    encode(digest(v_row_hash, 'sha256'), 'hex'), 4
  );

  INSERT INTO public.quiz_import_staging(
    batch_id, account_key, nim, course_code, meeting_number, quiz_type,
    external_activity_id, title, grade, result_status, row_hash
  )
  VALUES (
    p_batch, 'akun/01', '12345678', '26TEL0001', 1, 'PRE_TEST',
    p_external, 'Integration test', p_grade, p_status, v_row_hash
  );
END;
$stage$;

-- Course-specific meeting limits: FIS permits meeting 21; other courses stop at 16.
DO $limits$
DECLARE
  v_batch UUID := gen_random_uuid();
  v_hash TEXT := encode(digest('meeting-limit-test', 'sha256'), 'hex');
  v_external TEXT := 'ci-fis-meeting-21-' || gen_random_uuid()::text;
BEGIN
  INSERT INTO public.quiz_activities(semester, course_code, meeting_number, quiz_type, title)
  VALUES ('99999', 'FIS', 21, 'PRE_TEST', 'FIS meeting 21');

  BEGIN
    INSERT INTO public.quiz_activities(semester, course_code, meeting_number, quiz_type, title)
    VALUES ('99999', 'KAL', 17, 'PRE_TEST', 'Invalid KAL meeting 17');
    RAISE EXCEPTION 'non-FIS meeting 17 unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  INSERT INTO public.quiz_import_batches(
    batch_id, source_batch_id, semester, status, payload_hash, created_by
  )
  VALUES (
    v_batch, 'ci-meeting-limit-' || v_batch::text, '99999', 'preview', v_hash, 4
  );

  INSERT INTO public.quiz_import_staging(
    batch_id, account_key, nim, course_code, meeting_number, quiz_type,
    external_activity_id, title, grade, result_status, row_hash
  )
  VALUES (
    v_batch, 'akun/01', '12345678', 'FIS', 21, 'PRE_TEST',
    v_external, 'FIS meeting 21', 80, 'graded', v_hash
  );

  BEGIN
    INSERT INTO public.quiz_import_staging(
      batch_id, account_key, nim, course_code, meeting_number, quiz_type,
      external_activity_id, title, grade, result_status, row_hash
    )
    VALUES (
      v_batch, 'akun/01', '12345678', 'KAL', 17, 'PRE_TEST',
      'ci-invalid-kal-meeting-17-' || v_batch::text, 'Invalid KAL meeting 17',
      80, 'graded', v_hash
    );
    RAISE EXCEPTION 'non-FIS staging meeting 17 unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  DELETE FROM public.quiz_import_batches WHERE batch_id = v_batch;
END;
$limits$;

DO $test$
DECLARE
  v_batch UUID;
  v_result JSONB;
  v_grade NUMERIC;
  v_history INTEGER;
  v_versions INTEGER;
BEGIN
  -- Initial insert.
  v_batch := gen_random_uuid();
  PERFORM pg_temp.stage_one(v_batch, 'ci-rpc-insert', 'ci-quiz-uuid-1', 80, 'graded');
  v_result := public.mentari_commit_grade_import(v_batch, 4);
  IF v_result->>'inserted' <> '1' THEN
    RAISE EXCEPTION 'expected one inserted result, got %', v_result;
  END IF;

  -- Grade change must update the result and create one history row.
  v_batch := gen_random_uuid();
  PERFORM pg_temp.stage_one(v_batch, 'ci-rpc-update', 'ci-quiz-uuid-1', 90, 'graded');
  v_result := public.mentari_commit_grade_import(v_batch, 4);
  IF v_result->>'updated' <> '1' OR v_result->>'history' <> '1' THEN
    RAISE EXCEPTION 'expected one update and one history row, got %', v_result;
  END IF;

  -- A missing attempt must not erase a previously recorded grade.
  v_batch := gen_random_uuid();
  PERFORM pg_temp.stage_one(v_batch, 'ci-rpc-no-record', 'ci-quiz-uuid-1', NULL, 'no_record');
  v_result := public.mentari_commit_grade_import(v_batch, 4);
  SELECT grade INTO v_grade
    FROM public.quiz_results
   WHERE account_key = 'akun/01';
  IF v_result->>'unchanged' <> '1' OR v_grade <> 90 THEN
    RAISE EXCEPTION 'no_record overwrote a valid grade: result %, grade %', v_result, v_grade;
  END IF;

  -- A replacement external UUID creates a new activity version without losing the grade.
  v_batch := gen_random_uuid();
  PERFORM pg_temp.stage_one(v_batch, 'ci-rpc-new-version', 'ci-quiz-uuid-2', 90, 'graded');
  v_result := public.mentari_commit_grade_import(v_batch, 4);
  SELECT COUNT(*) INTO v_versions
    FROM public.quiz_activity_versions;
  SELECT COUNT(*) INTO v_history
    FROM public.quiz_result_history;
  IF v_versions <> 2 OR v_history <> 1 OR v_result->>'unchanged' <> '1' THEN
    RAISE EXCEPTION 'activity version replacement failed: versions %, history %, result %',
      v_versions, v_history, v_result;
  END IF;

  -- A second confirmation of a committed batch must be rejected.
  BEGIN
    PERFORM public.mentari_commit_grade_import(v_batch, 4);
    RAISE EXCEPTION 'duplicate confirmation unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'duplicate confirmation unexpectedly succeeded' THEN
      RAISE;
    END IF;
    IF SQLERRM <> 'batch_not_confirmable' THEN
      RAISE;
    END IF;
  END;
END;
$test$;

DROP FUNCTION pg_temp.stage_one(UUID, TEXT, TEXT, NUMERIC, TEXT);
