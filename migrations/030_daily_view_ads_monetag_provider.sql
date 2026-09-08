-- Daily View Ads uses Monetag only in the user-facing Ad View flow.
-- Keep the provider selection server-authoritative so the generic task registry
-- cannot silently rotate this task onto another provider.
UPDATE activity_tasks
SET config = config || '{"advertisementProvider":"monetag"}'::jsonb
WHERE task_type = 'daily'
  AND config->>'systemKey' = 'view_ads';
