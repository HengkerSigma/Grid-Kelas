-- Integration test for the Mentari activity import RPC.
INSERT INTO public.app_data(key,content)
SELECT 'akun/'||lpad(n::text,2,'0'),jsonb_build_object('nim',(261090100100+n)::text)
FROM generate_series(1,32) AS n
ON CONFLICT(key) DO UPDATE SET content=EXCLUDED.content;

INSERT INTO public.mentari_activity_import_batches(
 batch_id,source_batch_id,semester,status,payload,summary,created_by,expires_at
) VALUES(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','activity-batch-test','20261','preview',
 jsonb_build_object('activities',jsonb_build_array(jsonb_build_object(
  'course_code','KIM','external_activity_id','forum-test','meeting_number',1,'section_code','PERTEMUAN_1',
  'activity_type','FORUM','title','Forum test','forum_id','forum-root','data_complete',true,
  'captured_at',NOW()::text,'participated_count',2,'not_started_count',30,'unknown_count',0,
  'participants',(SELECT jsonb_agg(jsonb_build_object(
    'nim',(261090100100+n)::text,'account_key','akun/'||lpad(n::text,2,'0'),
    'status',CASE WHEN n<=2 THEN 'participated' ELSE 'not_started' END,
    'reply_count',CASE WHEN n<=2 THEN 2 ELSE 0 END,'attempt_status',NULL
  ) ORDER BY n) FROM generate_series(1,32) AS n)
 ))),jsonb_build_object('activities',1),1,NOW()+INTERVAL '30 minutes'
);
DO $$
DECLARE result JSONB; v_activity_id UUID; participant_count INTEGER;
BEGIN
 result:=public.mentari_commit_activity_import('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1);
 IF result->>'status'<>'committed' OR (result->>'participant_rows')::INTEGER<>32 THEN
  RAISE EXCEPTION 'unexpected activity import result: %',result;
 END IF;
 SELECT id INTO v_activity_id FROM public.mentari_activities WHERE semester='20261' AND course_code='KIM' AND external_activity_id='forum-test';
 SELECT COUNT(*) INTO participant_count FROM public.mentari_activity_participants WHERE activity_id=v_activity_id;
 IF participant_count<>32 THEN RAISE EXCEPTION 'expected 32 participants, got %',participant_count; END IF;
 IF (SELECT COUNT(*) FROM public.mentari_activity_participants WHERE activity_id=v_activity_id AND status='participated')<>2 THEN
  RAISE EXCEPTION 'participated status count mismatch';
 END IF;
END $$;
