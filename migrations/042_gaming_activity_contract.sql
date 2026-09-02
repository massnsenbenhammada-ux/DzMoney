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
-- They are retired as closed rows; normal Game Tasks remain supported by the existing Task pipeline.
UPDATE activity_tasks
SET status='closed'
WHERE task_type='game'
  AND config->>'gamingResource' IN ('spin','axe');

-- Publish the corrected reward contract as a new immutable Gaming config snapshot.
-- Initial weights are admin-configurable; these values establish only the starting distribution.
-- Intended frequency order: no reward > 100 coin > +1 spin > 1000 coin >
-- 1 DZX > 1 DZP > 10 DZX > 10 DZP.
INSERT INTO gaming_config_versions(version, config)
SELECT latest.version + 1,
       jsonb_strip_nulls(jsonb_build_object(
         'enabled', true,
         'dailyAdLimit', COALESCE((current_config.config->>'dailyAdLimit')::integer,100),
         'resetTimezone', COALESCE(current_config.config->>'resetTimezone','UTC+1'),
         'spin', jsonb_build_object(
           'weights', jsonb_build_object(
             'none', 750,
             'coin_100', 180,
             'extra_spin', 50,
             'coin_1000', 15,
             'dzx_1', 5,
             'dzp_1', 3,
             'dzx_10', 2,
             'dzp_10', 1
           )
         ),
         'digging', jsonb_build_object(
           'boardSize', COALESCE((current_config.config->'digging'->>'boardSize')::integer,16),
           'energy', COALESCE((current_config.config->'digging'->>'energy')::integer,3),
           'weights', jsonb_build_object(
             'none', 750,
             'coin_100', 180,
             'extra_axe', 50,
             'coin_1000', 15,
             'dzx_1', 5,
             'dzp_1', 3,
             'dzx_10', 2,
             'dzp_10', 1
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
