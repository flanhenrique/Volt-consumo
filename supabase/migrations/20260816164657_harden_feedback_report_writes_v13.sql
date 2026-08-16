alter table public.feedback_reports
  add constraint feedback_screenshot_path_owner_check
  check (
    screenshot_path is null
    or split_part(screenshot_path, '/', 1) = user_id::text
  );

revoke insert on public.feedback_reports from authenticated;
grant insert (user_id, category, description, source, page, app_build, technical_context)
  on public.feedback_reports to authenticated;
