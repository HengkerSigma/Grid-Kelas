-- Lampiran foto untuk instruksi tugas yang dikelola melalui course_updates.
ALTER TABLE public.course_updates
  ADD COLUMN IF NOT EXISTS task_attachments JSONB NOT NULL DEFAULT '[]'::JSONB;

UPDATE public.course_updates
SET task_attachments = '[]'::JSONB
WHERE task_attachments IS NULL OR jsonb_typeof(task_attachments) <> 'array';
