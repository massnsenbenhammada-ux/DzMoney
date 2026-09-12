-- Phase 3: Squad classification tiers.
-- maxMembers is a classification boundary, not a hard membership cap.
-- T10 is explicitly unbounded and therefore uses JSON null.
UPDATE admin_settings
SET value = '[
  {"minMembers":1,"maxMembers":10,"price":100},
  {"minMembers":11,"maxMembers":20,"price":200},
  {"minMembers":21,"maxMembers":50,"price":500},
  {"minMembers":51,"maxMembers":100,"price":1000},
  {"minMembers":101,"maxMembers":200,"price":2000},
  {"minMembers":201,"maxMembers":300,"price":3000},
  {"minMembers":301,"maxMembers":400,"price":4000},
  {"minMembers":401,"maxMembers":500,"price":5000},
  {"minMembers":501,"maxMembers":1000,"price":7500},
  {"minMembers":1001,"maxMembers":null,"price":10000}
]'::jsonb,
updated_at = NOW()
WHERE key = 'squad.membership_tiers';
