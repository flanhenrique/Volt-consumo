create index if not exists beta_notifications_subject_user_idx
  on public.beta_notifications (subject_user_id)
  where subject_user_id is not null;

drop policy if exists beta_notifications_select_own on public.beta_notifications;
create policy beta_notifications_select_own
on public.beta_notifications for select to authenticated
using (
  (select auth.uid()) = recipient_user_id
  and (
    event_type not like 'admin.%'
    or coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
  )
);

drop policy if exists beta_notifications_update_own on public.beta_notifications;
create policy beta_notifications_update_own
on public.beta_notifications for update to authenticated
using (
  (select auth.uid()) = recipient_user_id
  and (
    event_type not like 'admin.%'
    or coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
  )
)
with check (
  (select auth.uid()) = recipient_user_id
  and (
    event_type not like 'admin.%'
    or coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
  )
);
