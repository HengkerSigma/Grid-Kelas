-- Grid Kelas: integrasi seluruh tugas ke public.course_updates
-- Jalankan di Supabase SQL Editor SEBELUM deploy kode integrasi.
ALTER TABLE public.course_updates
  ADD COLUMN IF NOT EXISTS task_id TEXT,
  ADD COLUMN IF NOT EXISTS task_mode TEXT NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS task_description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS task_submissions JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS task_group_submissions JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS task_created_at BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS course_updates_task_id_uidx
  ON public.course_updates(task_id) WHERE task_id IS NOT NULL;

WITH legacy AS (
  SELECT split_part(key, '/', 2) AS task_id, content,
         content->>'k' AS course_code, content->>'judul' AS task_title,
         COALESCE(NULLIF(content->>'dibuat','')::BIGINT, 0) AS created_ms
  FROM public.app_data WHERE key LIKE 'tugas/%' AND key NOT LIKE 'tugas/%/%'
), candidates AS (
  SELECT l.*, cu.id AS update_id,
         row_number() OVER (PARTITION BY l.task_id ORDER BY cu.meeting_number) AS task_rank,
         row_number() OVER (PARTITION BY cu.id ORDER BY l.created_ms, l.task_id) AS update_rank
  FROM legacy l JOIN public.course_updates cu
    ON cu.course_code = l.course_code AND cu.task_title = l.task_title
  WHERE cu.task_id IS NULL
), matched AS (SELECT * FROM candidates WHERE task_rank=1 AND update_rank=1)
UPDATE public.course_updates cu SET
  task_id=m.task_id,
  task_mode=CASE WHEN m.content->>'mode'='group' THEN 'group' ELSE 'individual' END,
  task_description=COALESCE(m.content->>'deskripsi',''),
  task_url=COALESCE(m.content->>'link',cu.task_url),
  deadline=CASE WHEN COALESCE(m.content->>'tenggat','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (m.content->>'tenggat')::DATE ELSE cu.deadline END,
  task_submissions=CASE WHEN jsonb_typeof(m.content->'subs')='object' THEN m.content->'subs' ELSE '{}'::JSONB END,
  task_group_submissions=CASE WHEN jsonb_typeof(m.content->'groupSubs')='object' THEN m.content->'groupSubs' ELSE '{}'::JSONB END,
  task_created_at=m.created_ms
FROM matched m WHERE cu.id=m.update_id;

WITH legacy AS (
  SELECT split_part(key, '/', 2) AS task_id, content,
         content->>'k' AS course_code, content->>'judul' AS task_title,
         COALESCE(NULLIF(content->>'dibuat','')::BIGINT, 0) AS created_ms
  FROM public.app_data WHERE key LIKE 'tugas/%' AND key NOT LIKE 'tugas/%/%'
), remaining AS (
  SELECT l.*, row_number() OVER (PARTITION BY l.course_code ORDER BY l.created_ms,l.task_id) AS rn
  FROM legacy l
  WHERE NOT EXISTS (SELECT 1 FROM public.course_updates cu WHERE cu.task_id=l.task_id)
), free_slots AS (
  SELECT c.k AS course_code,n AS meeting_number,
         row_number() OVER (PARTITION BY c.k ORDER BY n) AS rn
  FROM public.courses c CROSS JOIN generate_series(1,16) AS n
  WHERE NOT EXISTS (SELECT 1 FROM public.course_updates cu WHERE cu.course_code=c.k AND cu.meeting_number=n)
), allocated AS (
  SELECT l.*,f.meeting_number FROM remaining l JOIN free_slots f
    ON f.course_code=l.course_code AND f.rn=l.rn
)
INSERT INTO public.course_updates (
  id,task_id,course_code,meeting_number,task_title,task_url,deadline,task_mode,
  task_description,task_submissions,task_group_submissions,task_created_at
)
SELECT 'legacy-'||a.task_id,a.task_id,a.course_code,a.meeting_number,
  left(COALESCE(a.task_title,''),120),COALESCE(a.content->>'link',''),
  CASE WHEN COALESCE(a.content->>'tenggat','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (a.content->>'tenggat')::DATE ELSE NULL END,
  CASE WHEN a.content->>'mode'='group' THEN 'group' ELSE 'individual' END,
  left(COALESCE(a.content->>'deskripsi',''),1000),
  CASE WHEN jsonb_typeof(a.content->'subs')='object' THEN a.content->'subs' ELSE '{}'::JSONB END,
  CASE WHEN jsonb_typeof(a.content->'groupSubs')='object' THEN a.content->'groupSubs' ELSE '{}'::JSONB END,
  a.created_ms
FROM allocated a ON CONFLICT (course_code,meeting_number) DO NOTHING;

DELETE FROM public.app_data a
WHERE a.key LIKE 'tugas/%' AND a.key NOT LIKE 'tugas/%/%'
AND EXISTS (SELECT 1 FROM public.course_updates cu WHERE cu.task_id=split_part(a.key,'/',2));
