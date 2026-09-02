-- Repair Phase 5 Gaming Tasks to the canonical Task Catalog contract.
-- Gaming resource grants are performed by task verification; legacy completion
-- configuration is not part of the current Task Catalog contract.

UPDATE activity_tasks
SET config = (config - 'completion')
WHERE task_type = 'game'
  AND config ? 'gamingResource';
