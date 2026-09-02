-- Repair Phase 5 Gaming Tasks to the canonical advertisement verification contract.
-- The existing Task Verification service routes advertisement gates through dailyMode.
-- No new verifier, reward system, or ad system is introduced.

UPDATE activity_tasks
SET config = config || '{"dailyMode":"advertisement"}'::jsonb
WHERE task_type = 'game'
  AND config ? 'gamingResource'
  AND config->>'gamingResource' IN ('spin', 'axe');
