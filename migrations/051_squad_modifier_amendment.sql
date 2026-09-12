-- Squad modifier amendment: uncapped rate and raw pre-modifier contribution semantics.
ALTER TABLE squad_daily_states
  DROP CONSTRAINT IF EXISTS squad_daily_states_modifier_rate_check;

ALTER TABLE squad_daily_states
  ADD CONSTRAINT squad_daily_states_modifier_rate_check CHECK (modifier_rate >= 0);
