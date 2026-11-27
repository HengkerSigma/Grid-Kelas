-- Mentari activity participation sync. Apply to staging first.
CREATE TABLE IF NOT EXISTS public.mentari_activity_import_batches (
 batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), source_batch_id TEXT NOT NULL UNIQUE CHECK(length(source_batch_id) BETWEEN 1 AND 120),
 semester TEXT NOT NULL CHECK(semester='20261'), status TEXT NOT NULL DEFAULT 'preview' CHECK(status IN('preview','committed','expired')),
 payload JSONB NOT NULL DEFAULT '{}'::jsonb, summary JSONB NOT NULL DEFAULT '{}'::jsonb, warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
 created_by INTEGER NOT NULL CHECK(created_by BETWEEN 1 AND 32), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '30 minutes', committed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.mentari_activities (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), semester TEXT NOT NULL CHECK(semester='20261'),
 course_code TEXT NOT NULL CHECK(course_code IN('KAL','FIS','WRG','IND','ENG','PRG','ALJ','ELE','KIM')),
 external_activity_id TEXT NOT NULL, meeting_number SMALLINT NOT NULL CHECK(meeting_number BETWEEN 1 AND 21),
 section_code TEXT NOT NULL, activity_type TEXT NOT NULL CHECK(activity_type IN('PRE_TEST','POST_TEST','FORUM','QUESTIONNAIRE')),
 title TEXT NOT NULL DEFAULT '', forum_id TEXT, data_complete BOOLEAN NOT NULL DEFAULT FALSE, captured_at TIMESTAMPTZ,
 roster_count SMALLINT NOT NULL DEFAULT 32 CHECK(roster_count=32), participated_count SMALLINT NOT NULL DEFAULT 0,
 not_started_count SMALLINT NOT NULL DEFAULT 0, unknown_count SMALLINT NOT NULL DEFAULT 32,
 last_batch_id UUID REFERENCES public.mentari_activity_import_batches(batch_id) ON DELETE SET NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(semester,course_code,external_activity_id),
 CHECK(participated_count+not_started_count+unknown_count=roster_count)
);
CREATE TABLE IF NOT EXISTS public.mentari_activity_participants (
 activity_id UUID NOT NULL REFERENCES public.mentari_activities(id) ON DELETE CASCADE,
 account_key TEXT NOT NULL CHECK(account_key~'^akun/(0[1-9]|[12][0-9]|3[0-2])$'),
 nim TEXT NOT NULL CHECK(nim~'^[0-9]{6,20}$'), status TEXT NOT NULL CHECK(status IN('participated','not_started','unknown')),
 reply_count INTEGER NOT NULL DEFAULT 0 CHECK(reply_count>=0), attempt_status TEXT,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(activity_id,account_key), UNIQUE(activity_id,nim)
);
CREATE INDEX IF NOT EXISTS mentari_activities_course_meeting_idx ON public.mentari_activities(semester,course_code,meeting_number,activity_type);
CREATE INDEX IF NOT EXISTS mentari_activity_participants_account_idx ON public.mentari_activity_participants(account_key);
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['mentari_activity_import_batches','mentari_activities','mentari_activity_participants'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t); EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO service_role',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.mentari_commit_activity_import(p_batch_id UUID,p_actor_no INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.mentari_activity_import_batches%ROWTYPE; a JSONB; p JSONB; v_id UUID; v_nim TEXT; v_account_nim TEXT; v_count INTEGER:=0;
BEGIN
 IF p_actor_no IS NULL OR p_actor_no NOT BETWEEN 1 AND 32 THEN RAISE EXCEPTION 'invalid_actor'; END IF;
 SELECT * INTO b FROM public.mentari_activity_import_batches WHERE batch_id=p_batch_id FOR UPDATE;
 IF NOT FOUND OR b.status<>'preview' OR b.expires_at<=NOW() THEN RAISE EXCEPTION 'batch_not_confirmable'; END IF;
 IF b.created_by<>p_actor_no THEN RAISE EXCEPTION 'batch_owner_mismatch'; END IF;
 FOR a IN SELECT value FROM jsonb_array_elements(b.payload->'activities') LOOP
  INSERT INTO public.mentari_activities(semester,course_code,external_activity_id,meeting_number,section_code,activity_type,title,forum_id,data_complete,captured_at,roster_count,participated_count,not_started_count,unknown_count,last_batch_id,updated_at)
  VALUES(b.semester,a->>'course_code',a->>'external_activity_id',(a->>'meeting_number')::SMALLINT,a->>'section_code',a->>'activity_type',COALESCE(a->>'title',''),a->>'forum_id',COALESCE((a->>'data_complete')::BOOLEAN,FALSE),NULLIF(a->>'captured_at','')::TIMESTAMPTZ,32,(a->>'participated_count')::SMALLINT,(a->>'not_started_count')::SMALLINT,(a->>'unknown_count')::SMALLINT,p_batch_id,NOW())
  ON CONFLICT(semester,course_code,external_activity_id) DO UPDATE SET meeting_number=EXCLUDED.meeting_number,section_code=EXCLUDED.section_code,activity_type=EXCLUDED.activity_type,title=EXCLUDED.title,forum_id=EXCLUDED.forum_id,data_complete=EXCLUDED.data_complete,captured_at=EXCLUDED.captured_at,roster_count=32,participated_count=EXCLUDED.participated_count,not_started_count=EXCLUDED.not_started_count,unknown_count=EXCLUDED.unknown_count,last_batch_id=p_batch_id,updated_at=NOW()
  RETURNING id INTO v_id;
  DELETE FROM public.mentari_activity_participants WHERE activity_id=v_id;
  FOR p IN SELECT value FROM jsonb_array_elements(a->'participants') LOOP
   v_nim:=p->>'nim'; SELECT content->>'nim' INTO v_account_nim FROM public.app_data WHERE key=p->>'account_key';
   IF v_account_nim IS DISTINCT FROM v_nim THEN RAISE EXCEPTION 'account_mapping_changed'; END IF;
   INSERT INTO public.mentari_activity_participants(activity_id,account_key,nim,status,reply_count,attempt_status)
   VALUES(v_id,p->>'account_key',v_nim,p->>'status',COALESCE((p->>'reply_count')::INTEGER,0),p->>'attempt_status');
   v_count:=v_count+1;
  END LOOP;
 END LOOP;
 UPDATE public.mentari_activity_import_batches SET status='committed',payload='{}'::JSONB,committed_at=NOW() WHERE batch_id=p_batch_id;
 RETURN jsonb_build_object('status','committed','activities',jsonb_array_length(b.payload->'activities'),'participant_rows',v_count);
END $$;
REVOKE ALL ON FUNCTION public.mentari_commit_activity_import(UUID,INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mentari_commit_activity_import(UUID,INTEGER) TO service_role;
