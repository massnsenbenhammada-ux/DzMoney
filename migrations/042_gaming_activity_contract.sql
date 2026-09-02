-- Phase 5 contract correction.
-- Activity Verified is a global qualifying activity source; Gaming Ads remain independent.
-- Historical migrations are immutable, so the old daily activity resource counter is
-- renamed and reset rather than being reinterpreted as verified activity history.

ALTER TABLE gaming_accounts
  RENAME COLUMN activity_claimed TO verified_activity_count;

ALTER TABLE gaming_accounts
  DROP COLUMN activity_day;

UPDATE gaming_accounts
SET verified_activity_count = 0;

-- The canonical Gaming Watch Ad tasks duplicated the standalone Gaming Ads surface.
-- They are retired as completed rows; normal Game Tasks remain supported by the existing Task pipeline.
UPDATE activity_tasks
SET status='completed'
WHERE task_type='game'
  AND config->>'gamingResource' IN ('spin','axe');

-- Publish the corrected reward contract as a new immutable Gaming config snapshot.
-- Keep the latest config row separate from MAX(version) so PostgreSQL does not require
-- the JSON config column to be grouped.
INSERT INTO gaming_config_versions(version, config)
SELECT latest.version + 1,
       jsonb_strip_nulls(jsonb_build_object(
         'enabled', true,
         'dailyAdLimit', COALESCE((current_config.config->>'dailyAdLimit')::integer,100),
         'resetTimezone', COALESCE(current_config.config->>'resetTimezone','UTC+1'),
         'spin', jsonb_build_object(
           'weights', jsonb_build_object(
             'coin_1000', COALESCE((current_config.config->'spin'->'weights'->>'coin_100')::integer,0) + COALESCE((current_config.config->'spin'->'weights'->>'coin_1000')::integer,0),
             'dzx_1', COALESCE((current_config.config->'spin'->'weights'->>'dzx_1')::integer,0),
             'dzx_10', COALESCE((current_config.config->'spin'->'weights'->>'dzx_10')::integer,0),
             'dzp_1', COALESCE((current_config.config->'spin'->'weights'->>'dzp_1')::integer,0),
             'dzp_10', COALESCE((current_config.config->'spin'->'weights'->>'dzp_10')::integer,0),
             'extra_spin', COALESCE((current_config.config->'spin'->'weights'->>'extra_spin')::integer,0),
             'none', COALESCE((current_config.config->'spin'->'weights'->>'none')::integer,0)
           )
         ),
         'digging', jsonb_build_object(
           'boardSize', COALESCE((current_config.config->'digging'->>'boardSize')::integer,16),
           'energy', COALESCE((current_config.config->'digging'->>'energy')::integer,3),
           'weights', jsonb_build_object(
             'coin_1000', COALESCE((current_config.config->'digging'->'weights'->>'coin_100')::integer,0),
             'dzx_1', COALESCE((current_config.config->'digging'->'weights'->>'dzx_1')::integer,0),
             'dzx_10', 0,
             'dzp_1', COALESCE((current_config.config->'digging'->'weights'->>'dzp_1')::integer,0),
             'dzp_10', 0,
             'extra_axe', COALESCE((current_config.config->'digging'->'weights'->>'extra_axe')::integer,0),
             'none', COALESCE((current_config.config->'digging'->'weights'->>'none')::integer,0)
           )
         ),
         'adBonus', COALESCE(current_config.config->'adBonus','{"coin_100":95,"dzx_1":5}'::jsonb),
         'diggingAxeEveryAds', COALESCE((current_config.config->>'diggingAxeEveryAds')::integer,10)
       ))
FROM gaming_config_versions AS current_config
CROSS JOIN (
  SELECT MAX(version) AS version
  FROM gaming_config_versions
) AS latest
WHERE current_config.version = latest.version;
