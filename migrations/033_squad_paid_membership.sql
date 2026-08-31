-- Phase 4: paid Squad membership purchase configuration.
-- The purchase price is resolved server-side from this admin setting.
INSERT INTO admin_settings (key, value)
VALUES (
  'squad.membership_tiers',
  '[
    {"minMembers":1,"maxMembers":10,"price":100},
    {"minMembers":11,"maxMembers":20,"price":200},
    {"minMembers":21,"maxMembers":50,"price":500},
    {"minMembers":51,"maxMembers":100,"price":1000},
    {"minMembers":101,"maxMembers":200,"price":2000},
    {"minMembers":201,"maxMembers":300,"price":3000}
  ]'::jsonb
)
ON CONFLICT (key) DO NOTHING;
