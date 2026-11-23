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

DO $test$
DECLARE
  v_batch UUID;
  v_committed_batch UUID;
  v_result JSONB;
  v_grade NUMERIC;
  v_history INTEGER;
  v_versions INTEGER;
  v_row_hash TEXT;
  v_payload_hash TEXT;
  v_count INTEGER;
BEGIN
  -- Initial insert.
  v_batch := gen_random_uuid();
  PERFORM pg_temp.stage_one(v_batch, 'ci-rpc-insert', 'ci-quiz-uuid-1', 80, 'graded');
   v_result := public.mentari_commit_grade_import(v_batch, 4);
  v_committed_batch := v_batch;
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
  -- Multiple rows must use deterministic external_activity_id + NIM ordering.
  v_batch := gen_random_uuid();

  v_row_hash := encode(digest('multi-row-a', 'sha256'), 'hex');
  v_payload_hash := encode(
    digest(
      v_row_hash || '|' ||
      encode(digest('multi-row-b', 'sha256'), 'hex'),
      'sha256'
    ),
    'hex'
  );

  INSERT INTO public.quiz_import_batches(
    batch_id, source_batch_id, semester, status, payload_hash, created_by
  )
  VALUES (
    v_batch, 'ci-rpc-multi-row', '20261', 'preview', v_payload_hash, 4
  );

  INSERT INTO public.quiz_import_staging(
    batch_id, account_key, nim, course_code, meeting_number, quiz_type,
    external_activity_id, title, grade, result_status, row_hash
  )
  VALUES
    (v_batch, 'akun/01', '12345678', '26TEL0001', 2, 'PRE_TEST',
     'activity-a', 'Multi row A', 70, 'graded', v_row_hash),
    (v_batch, 'akun/01', '12345678', '26TEL0001', 2, 'POST_TEST',
     'activity-b', 'Multi row B', 75, 'graded',
     encode(digest('multi-row-b', 'sha256'), 'hex'));

  v_result := public.mentari_commit_grade_import(v_batch, 4);

  IF v_result->>'inserted' <> '2' THEN
    RAISE EXCEPTION 'expected two inserted results for multi-row batch, got %', v_result;
  END IF;
    -- Incorrect payload hash must be rejected.
  v_batch := gen_random_uuid();
  PERFORM pg_temp.stage_one(
    v_batch, 'ci-rpc-invalid-hash', 'ci-invalid-hash', 60, 'graded'
  );

  UPDATE public.quiz_import_batches
     SET payload_hash = encode(digest('wrong-payload', 'sha256'), 'hex')
   WHERE batch_id = v_batch;

  BEGIN
    PERFORM public.mentari_commit_grade_import(v_batch, 4);
    RAISE EXCEPTION 'invalid payload hash unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invalid payload hash unexpectedly succeeded' THEN
      RAISE;
    END IF;
    IF SQLERRM <> 'staging_hash_mismatch' THEN
      RAISE;
    END IF;
  END;

  -- Only the batch owner may confirm an import.
  v_batch := gen_random_uuid();
  PERFORM pg_temp.stage_one(
    v_batch, 'ci-rpc-owner-mismatch', 'ci-owner-mismatch', 65, 'graded'
  );

  BEGIN
    PERFORM public.mentari_commit_grade_import(v_batch, 5);
    RAISE EXCEPTION 'non-owner confirmation unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'non-owner confirmation unexpectedly succeeded' THEN
      RAISE;
    END IF;
    IF SQLERRM <> 'batch_owner_mismatch' THEN
      RAISE;
    END IF;
  END;
    -- Expired batches must not be confirmed.
  v_batch := gen_random_uuid();
  PERFORM pg_temp.stage_one(
    v_batch, 'ci-rpc-expired', 'ci-expired-batch', 55, 'graded'
  );

  UPDATE public.quiz_import_batches
     SET expires_at = NOW() - INTERVAL '1 minute'
   WHERE batch_id = v_batch;

  BEGIN
    PERFORM public.mentari_commit_grade_import(v_batch, 4);
    RAISE EXCEPTION 'expired batch confirmation unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'expired batch confirmation unexpectedly succeeded' THEN
      RAISE;
    END IF;
    IF SQLERRM <> 'batch_not_confirmable' THEN
      RAISE;
    END IF;
  END;
    -- A failure on the second row must roll back the entire batch.
  v_batch := gen_random_uuid();

  v_row_hash := encode(digest('atomic-row-a', 'sha256'), 'hex');
  v_payload_hash := encode(
    digest(
      v_row_hash || '|' ||
      encode(digest('atomic-row-b', 'sha256'), 'hex'),
      'sha256'
    ),
    'hex'
  );

  INSERT INTO public.quiz_import_batches(
    batch_id, source_batch_id, semester, status, payload_hash, created_by
  )
  VALUES (
    v_batch, 'ci-rpc-atomic-rollback', '20261', 'preview', v_payload_hash, 4
  );

  INSERT INTO public.quiz_import_staging(
    batch_id, account_key, nim, course_code, meeting_number, quiz_type,
    external_activity_id, title, grade, result_status, row_hash
  )
  VALUES
    (v_batch, 'akun/01', '12345678', '26TEL0001', 3, 'PRE_TEST',
     'atomic-a', 'Atomic valid row', 70, 'graded', v_row_hash),
    (v_batch, 'akun/01', '87654321', '26TEL0001', 4, 'PRE_TEST',
     'atomic-b', 'Atomic invalid row', 80, 'graded',
     encode(digest('atomic-row-b', 'sha256'), 'hex'));

  BEGIN
    PERFORM public.mentari_commit_grade_import(v_batch, 4);
    RAISE EXCEPTION 'invalid account mapping unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invalid account mapping unexpectedly succeeded' THEN
      RAISE;
    END IF;
    IF SQLERRM <> 'account_mapping_changed' THEN
      RAISE;
    END IF;
  END;

  SELECT COUNT(*) INTO v_count
    FROM public.quiz_activity_versions
   WHERE external_activity_id IN ('atomic-a', 'atomic-b');

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'atomic rollback failed: found % activity versions', v_count;
  END IF;
    SELECT COUNT(*) INTO v_count
    FROM public.quiz_activities
   WHERE semester = '20261'
     AND course_code = '26TEL0001'
     AND meeting_number IN (3, 4);

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'atomic rollback failed: found % activities', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.quiz_results r
    JOIN public.quiz_activities a ON a.id = r.activity_id
   WHERE a.semester = '20261'
     AND a.course_code = '26TEL0001'
     AND a.meeting_number IN (3, 4);

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'atomic rollback failed: found % results', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.quiz_import_staging
   WHERE batch_id = v_batch;

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'failed batch staging rows were not preserved: found %', v_count;
  END IF;
  -- A second confirmation of a committed batch must be rejected.
  BEGIN
    PERFORM public.mentari_commit_grade_import(v_committed_batch, 4);
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
