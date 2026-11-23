-- Fisika Dasar (FIS) has 21 meetings; all other courses remain capped at 16.
-- Apply to Production only after the change has been reviewed and approved.

ALTER TABLE public.quiz_activities
  DROP CONSTRAINT IF EXISTS quiz_activities_meeting_number_check;

ALTER TABLE public.quiz_activities
  ADD CONSTRAINT quiz_activities_meeting_course_limit_check
  CHECK (
    (course_code = 'FIS' AND meeting_number BETWEEN 1 AND 21)
    OR
    (course_code <> 'FIS' AND meeting_number BETWEEN 1 AND 16)
  );

ALTER TABLE public.quiz_import_staging
  DROP CONSTRAINT IF EXISTS quiz_import_staging_meeting_number_check;

ALTER TABLE public.quiz_import_staging
  ADD CONSTRAINT quiz_import_staging_meeting_course_limit_check
  CHECK (
    (course_code = 'FIS' AND meeting_number BETWEEN 1 AND 21)
    OR
    (course_code <> 'FIS' AND meeting_number BETWEEN 1 AND 16)
  );
