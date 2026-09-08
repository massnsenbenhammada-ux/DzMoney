UPDATE activity_tasks
SET config = config || '{"advertisementProvider":"monetag"}'::jsonb
WHERE task_type = 'daily'
  AND config->>'systemKey' = 'view_ads';
