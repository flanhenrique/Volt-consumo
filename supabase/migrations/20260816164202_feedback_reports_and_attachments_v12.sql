create table if not exists public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('bug','calculation','visual','suggestion','other')),
  description text not null check (char_length(description) between 3 and 4000),
  source text not null default 'help' check (source in ('shake','help','settings','screen')),
  page text,
  app_build text,
  technical_context jsonb not null default '{}'::jsonb,
  screenshot_path text,
  status text not null default 'received' check (status in ('received','triage','in_progress','resolved','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedback_reports_user_created_idx
  on public.feedback_reports (user_id, created_at desc);
create index if not exists feedback_reports_status_created_idx
  on public.feedback_reports (status, created_at desc);

alter table public.feedback_reports enable row level security;

revoke all on public.feedback_reports from anon;
revoke all on public.feedback_reports from authenticated;
grant select, insert on public.feedback_reports to authenticated;
grant update (screenshot_path, updated_at) on public.feedback_reports to authenticated;

create policy "feedback_insert_own"
  on public.feedback_reports
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "feedback_select_own"
  on public.feedback_reports
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "feedback_update_own_attachment"
  on public.feedback_reports
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'volt-feedback',
  'volt-feedback',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "feedback_storage_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'volt-feedback'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "feedback_storage_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'volt-feedback'
    and owner_id = (select auth.uid())::text
  );
