-- Grid Kelas: pembaruan pertemuan setiap mata kuliah
-- Jalankan sekali di Supabase SQL Editor.
create table if not exists public.course_updates (
  id text primary key,
  course_code text not null references public.courses(k) on update cascade on delete cascade,
  meeting_number smallint not null check (meeting_number between 1 and 16),
  attendance_url text,
  task_title text,
  task_url text,
  submission_url text,
  deadline date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_code, meeting_number)
);
create index if not exists course_updates_course_meeting_idx on public.course_updates(course_code, meeting_number);
alter table public.course_updates enable row level security;
