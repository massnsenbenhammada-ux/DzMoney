# DzMoney 2.0 — MASTER ROADMAP (FINAL AGREED SPECIFICATION)

> **Single source of truth.** This roadmap reflects the latest decisions agreed for the clean DzMoney 2.0 rebuild. The old BUX-era architecture, legacy compatibility layers and old business rules are NOT part of this project.

## 0. Non-negotiable architecture rules

- DzMoney 2.0 is a clean rebuild on a new PostgreSQL database.
- Do not reintroduce legacy BUX/core/compatibility code.
- Financial logic is server-side; the frontend never determines balances or rewards.
- Admin changes must modify the real backend/database settings, not merely visual labels.
- Every monetary/point movement must be recorded in an auditable ledger.
- Referral, Squad and Reward Pool are three independent economic systems.
- Implement one subsystem at a time and test it before starting the next.
- Keep each subsystem modular so fixing one area does not create a project-wide regression.

---

# 1. Currency & Economy

DzMoney has four balances:

### COIN
- Activity currency.
- Earned mainly from tasks, advertisements and approved referral activity rewards.
- Can be converted to DZP through an Admin-controlled conversion rule.
- Initial fixed economic reference:
  **1 TON = 10,000 DZX = 1,000,000 COIN**.
- The exchange relationships are configurable by Admin where specified below.

### DZX
- Main economic currency.
- Used for withdrawals, deposits/internal spending, buying packages and purchasing task/campaign budgets.
- Purchases/deposits are in TON or DZX according to the relevant flow.
- Initial reference: **1 TON = 10,000 DZX**.

### DZP
- Daily activity/participation points.
- Earned from:
  - completing tasks;
  - watching advertisements;
  - qualifying referrals.
- DZP is the activity indicator used to calculate a user's Reward Pool weight.
- DZP itself is NOT the Reward Pool payout currency.
- DZP earned from activity/conversions can contribute to Reward Pool weight according to the final weight rules.
- **Purchased DZP is excluded from Reward Pool weight** and is valid only for package-related use.

### TON
- External payout/deposit currency.
- Reward Pool distributes TON, not DZP.

---

# 2. Conversion System

Admin controls the conversion relationships.

Required conversion settings:

- COIN → DZP
- DZX → DZP
- TON → DZX
- The economic reference remains:
  **1 TON = 10,000 DZX = 1,000,000 COIN**.

The UI must expose conversion actions where appropriate, but all conversion calculations and balance mutations happen server-side.

Conversions require:
- validation;
- atomic ledger transaction;
- idempotency;
- audit record.

---

# 3. Activity Reward Engine

The standard activity reward is:

**1,000 COIN + 1 DZX + 1 DZP**

This is the default reward for qualifying standard tasks/advertisements.

Admin can change the default reward values.

Every activity event must produce a traceable reward record.

DZP from normal activity is counted toward the user's daily activity and Reward Pool weight.

---

# 4. Referral System — Independent from Squad

Referral is exactly **one level**.

### Qualification
A direct referral becomes eligible when:
1. the user enters through the referrer's referral link;
2. the referred user completes at least one qualifying activity:
   - one verified advertisement, OR
   - one verified task.

### Lifetime reward
The direct referral remains eligible for lifetime referral earnings, subject to anti-fraud rules.

### Referral reward
The referrer receives **20% of the referred user's base activity reward**.

The 20% is calculated ONLY from:
- task activity reward;
- advertisement activity reward.

It does NOT include:
- Squad Bonus;
- Squad earnings;
- Reward Pool distributions;
- package multipliers;
- other referral earnings.

### One-time referral activation reward
The referral itself gives:

**10,000 COIN + 10 DZX + 10 DZP**

The **10 DZP is granted once only when the referral qualifies** and does not participate in the lifetime 20% calculation.

The lifetime 20% referral reward consists of the applicable **COIN + DZX portion only**.

Referral earnings are completely separate from Squad economics.

---

# 5. Hierarchical Squad System

Squad is independent from Referral.

### Hierarchy
Membership is hierarchical.

Example:

```text
A ─── B ─── C
│          │
D ─── Y    X
```

B, C, D, Y and X can belong to A's hierarchical Squad according to the tree relationship.

A newly qualified member is automatically attached to the appropriate Squad hierarchy.

There is no artificial global maximum number of Squad members.

### Levels
- **10 Squad levels**.
- Each level has an Admin-defined member requirement.
- Each level has an Admin-defined percentage bonus.
- Bonus is an increase percentage, not a fixed reward.
- Each level can have a different percentage.

### Daily activation
The unlocked Squad level is NOT automatically active every day.

For day D:
1. calculate the user's Squad size/eligible members;
2. verify the level member requirement;
3. calculate Squad activity for the day;
4. at least **50% of eligible Squad members** must either:
   - watch at least one verified advertisement, OR
   - complete at least one verified task.

If **both** conditions are satisfied:
- the Squad Bonus becomes active for **the following day (D+1)**.

If either condition fails:
- the Squad Bonus is inactive for D+1.

This daily activation must be deterministic and auditable.

### Separation
Squad Bonus does NOT feed the Referral 20% calculation.

Squad Bonus does NOT replace Reward Pool weight.

The final formula for any separate Squad earnings/distribution mechanism remains a dedicated specification item and must not be invented during implementation.

---

# 6. Reward Pool

Reward Pool is independent from Referral and Squad.

### Funding
Reward Pool is funded from **daily project revenue**.

Admin must have a setting for:

**Daily Reward Pool Distribution Amount (TON)**

This is the amount of TON that will be distributed to eligible members each day.

The Reward Pool pays **TON**, not DZP.

### Activation requirement
A user must watch exactly:

**10 advertisements inside the Reward Pool page**

for the Reward Pool service to become active for that user.

Important:
- these must be the 10 ads displayed by the Reward Pool page;
- advertisements watched inside Tasks do NOT satisfy this requirement;
- until all 10 Reward Pool ads are completed, the user's Reward Pool is shown as inactive/locked.

### Weight
DZP represents the user's normal daily activity indicator.

Example:
- Total eligible user activity points for the day = 25,000 DZP.
- User 1 has 250 eligible DZP.
- User 1's base Reward Pool weight = 250 / 25,000 = **1%**.

If the user owns an active package with multiplier **1.10x**, the user's effective weight becomes:

**1% × 1.10 = 1.10%**

Purchased DZP does NOT increase this weight.

### Distribution
At the daily distribution time, the system calculates the total eligible weight and distributes the Admin-configured daily TON pool proportionally.

The exact final formula is:

**User TON Share = Daily Reward Pool TON × (User Effective Weight / Sum of All Eligible Users' Effective Weights)**

Distribution time:

**Beginning of each day at UTC+1.**

The previous day's activity is used for that day's distribution according to the finalized day-boundary implementation.

### User explanation
The Reward Pool page must clearly explain:
- what the pool is;
- why it is locked;
- the 10 Reward Pool ads requirement;
- how DZP affects weight;
- that packages multiply weight;
- that purchased DZP does not increase weight;
- that distribution is TON;
- that the daily pool amount comes from the project's configured daily distribution budget.

Include a short anti-manipulation warning.

---

# 7. Packages

Packages are shown on **Home**.

A user may own **only one active package at a time**.

No stacking.

A user cannot buy another package while the current package is active.

When a package expires:
- the user returns to normal activity-based Reward Pool weight;
- the user may purchase a new package.

### Durations
- 30 days
- 60 days
- 90 days
- 180 days
- 360 days
- Lifetime

### Configuration
Admin determines:
- package name;
- price in DZX;
- duration;
- multiplier;
- availability;
- display order;
- package status.

Packages should have distinct professional names and colors.

Creative UI feature:
- while a package is active, the user's profile can visually adopt the package's color;
- when it expires, the profile returns to the normal style.

Packages affect **Reward Pool weight only** through their multiplier.

---

# 8. Ads & Tasks

Task categories are strictly separated.

A task cannot be created/published under the wrong category.

Required categories:

### Daily Tasks
- Daily Check-in
- Check for Update
- Share with Friends
- View Ads
- Invite milestones

Daily Check-in is advertisement-gated where configured: user must watch the required ad before claiming the reward.

### Game Tasks
For Telegram Mini Apps/games.

### Social Tasks
For Telegram social actions such as channel/community actions.

### Web Tasks
For external web visits/actions.

### Special / Partner Tasks
- Partner-special campaigns require Admin contact/approval.
- They are not freely created by normal users.

### Standard reward
Default qualifying task/ad reward:

**1,000 COIN + 1 DZX + 1 DZP**

Admin controls the defaults.

---

# 9. User-Created Tasks

User-created tasks are available for:

- **Game**
- **Social**
- **Web**

Partner/Special campaigns require contacting Admin.

The system must enforce category isolation:
- Game tasks cannot be created as Social tasks;
- Social tasks cannot be created as Game tasks;
- each category has its own validation and verification rules.

### Campaign budget
The creator pays the campaign cost.

The campaign must reserve sufficient DZX before activation.

The creator's reward is the configured default unless the creator explicitly changes it within the permitted limits.

The reward is charged to the task creator.

### Fee reference
Admin-configured pricing uses this reference benchmark:

**1,000 valid visits/executions = 0.90 TON = 9,000 DZX**

The system scales this reference proportionally.

Example:
- 2,000 executions → 1.80 TON equivalent → 18,000 DZX reference budget.

The exact final fee can be changed by Admin.

The user-facing campaign price must be clear and include applicable platform fees.

### Lifecycle
Draft → Pending Review → Active → Paused → Completed/Expired → Closed/Refunded according to policy.

Unused campaign budget follows the final refund policy.

---

# 10. Buying Points

Users can buy **DZX**.

Admin controls:
- available purchase options;
- prices;
- limits;
- status.

Purchased DZX is economic capital and is not treated as earned activity.

DZP acquired through purchase-related conversion is marked as **purchased DZP** and:
- can be used for eligible package-related purposes;
- does NOT contribute to Reward Pool weight.

Earned/activity DZP remains separate from purchased DZP at ledger level.

---

# 11. Deposit System

Deposit currency: **TON**.

Flow:

**TON deposit → blockchain confirmation → automatic TON→DZX conversion → DZX credit**

The deposited amount is not directly withdrawable.

Deposited DZX becomes available for internal use according to system rules, such as:
- packages;
- user-created task budgets;
- buying eligible points/services.

A deposit must have:
- unique blockchain transaction reference;
- confirmation status;
- idempotency protection;
- immutable ledger record.

---

# 12. Withdrawal System

Initial minimum withdrawal:

**0.2 TON**

Initial required balances:

**2,000,000 COIN + 2,000 DZX**

These requirements are Admin-configurable.

On successful withdrawal:
- the required balances are deducted/locked according to the transaction flow;
- withdrawal fees are charged to the user where configured;
- deposited/non-withdrawable DZX cannot be used as withdrawable DZX.

Withdrawal fees are fully Admin-controlled and changeable at any time through the real backend settings.

---

# 13. Promo Codes

Home must include a Promo Code field.

Claim/Redeem flow:

**Enter code → press Claim/Redeem → advertisement opens → reward granted only after verified ad completion**

Promo code rewards are server-side and auditable.

Admin controls:
- code;
- reward;
- limits;
- expiry;
- eligibility;
- ad-gating requirement.

---

# 14. User App Structure

### Home
Must show:
- COIN balance;
- DZX balance;
- DZP balance;
- Promo Code field;
- Squad summary;
- Squad member count;
- Squad level;
- Reward Pool status;
- Package section;
- Daily Activity DZP;
- Daily Total Activity;
- Coming Soon section.

Bottom navigation:

**Home — Tasks — Referral — Wallet**

Package section is on Home and is not a bottom-navigation tab.

### User button / profile drawer
The user button opens a drawer/modal from right to left covering approximately 85% of the screen.

It contains:
- username;
- profile photo;
- COIN balance;
- DZX balance;
- DZP balance;
- Squad membership;
- Squad status;
- Reward Pool status;
- Daily Activity DZP;
- Daily Total Activity.

### Squad page
Must explain:
- hierarchy;
- member count;
- current level;
- member requirement;
- 50% activity rule;
- when Bonus activates;
- the next level requirements;
- anti-manipulation warning.

### Reward Pool page
Must explain the complete Reward Pool mechanism and the 10-ad activation requirement.

---

# 15. Admin Panel

Admin Panel is an operational control system, not a decorative UI.

Every setting must flow:

**Admin UI → backend API → PostgreSQL → live business logic**

No setting is considered implemented if it only changes frontend text.

Admin must control at minimum:

### Economy
- TON→DZX
- COIN→DZP
- DZX→DZP
- reference economic values
- activity rewards
- purchase prices

### Referral
- referral activation reward
- lifetime percentage
- qualification settings

### Squad
- 10 level thresholds
- 10 level bonus percentages
- 50% activity threshold

### Reward Pool
- daily TON distribution amount
- activation ad count (default 10)
- weight rules
- package multipliers

### Packages
- six durations
- prices
- multipliers
- colors/names/status

### Tasks
- category configuration
- default rewards
- ad counts
- user-created task limits
- campaign fees
- review/approval
- partner/special task handling

### Wallet
- deposit rules
- withdrawal minimum
- COIN requirement
- DZX requirement
- fees

### Users
- user search
- balances
- account status
- manual balance adjustment with reason/audit
- DZP balance adjustment with explicit separation between earned and purchased DZP

### Dashboard
Real-time:
- member count;
- advertisements watched;
- tasks completed.

Seven-day bar charts (NOT curves/line charts) for each metric, with different colors.

Bottom lists:
- Top 10 most active members;
- Top 10 members who brought the most referrals.

Admin Panel must not contain obsolete BUX terminology or unexplained empty legacy fields.

---

# 16. Ledger & Accounting

At minimum maintain separate accounting for:

- COIN earned
- DZX earned
- DZX deposited/purchased
- DZX withdrawable
- DZX locked
- DZP earned
- DZP purchased
- Referral rewards
- Squad Bonus
- Squad earnings (if/when separately specified)
- Reward Pool TON distributions
- Package purchases
- Task campaign budgets
- Fees
- Deposits
- Withdrawals

Every financial mutation requires:
- transaction ID;
- user ID;
- currency;
- amount;
- balance before;
- balance after;
- source/type;
- status;
- timestamp;
- related entity;
- idempotency key;
- audit metadata.

---

# 17. Anti-Fraud & Verification

Protect against:
- multi-account abuse;
- self-referrals;
- referral farming;
- duplicate task completion;
- fake social/game/web verification;
- fake screenshots;
- bots/ad fraud;
- Squad manipulation;
- Reward Pool manipulation;
- repeated promo redemption;
- duplicate blockchain deposits;
- replayed callbacks/webhooks;
- manual balance abuse.

Suspicious rewards can remain pending until verified.

---

# 18. Implementation Phases

## Phase 0 — Specification Lock
- [x] Final business rules recorded.
- [x] Legacy project abandoned for clean rebuild.
- [x] New PostgreSQL selected.
- [x] Roadmap established as the authoritative specification.

## Phase 1 — Core Foundation
- [x] Clean Node/Express runtime.
- [x] PostgreSQL connection.
- [x] Clean migration runner.
- [x] Core user/wallet/ledger schema foundation.
- [x] Wallet service foundation.
- [x] Ledger service foundation.
- [ ] Full automated ledger tests.
- [ ] Reconciliation checks.
- [ ] Production migration/health validation.

## Phase 2 — Economy & Conversion
- [ ] COIN/DZX/DZP/TON accounting rules.
- [ ] TON→DZX conversion.
- [ ] COIN→DZP.
- [ ] DZX→DZP.
- [ ] Earned vs purchased DZP separation.
- [ ] Admin-controlled rates.

## Phase 3 — Activity / Ads / Tasks
- [ ] Activity engine.
- [ ] Standard reward 1000 COIN + 1 DZX + 1 DZP.
- [ ] Daily tasks.
- [ ] Ad integration.
- [ ] Task categories and verification.

## Phase 4 — Referral
- [ ] One-level referral.
- [ ] Qualification rule.
- [ ] One-time 10,000 COIN + 10 DZX + 10 DZP activation reward.
- [ ] Lifetime 20% COIN+DZX activity reward.
- [ ] Anti-fraud.

## Phase 5 — Squad
- [ ] Hierarchical tree.
- [ ] 10 Admin-defined levels.
- [ ] 50% daily activity test.
- [ ] Next-day Bonus activation.
- [ ] Squad explanations/UI.

## Phase 6 — Packages & Weight
- [ ] Six package durations.
- [ ] One-package-only rule.
- [ ] Admin prices/multipliers.
- [ ] DZP weight calculation.
- [ ] Purchased DZP exclusion.
- [ ] Package profile-color effect.

## Phase 7 — Reward Pool
- [ ] Daily TON distribution budget.
- [ ] 10 Reward Pool page ads.
- [ ] Activity weight calculation.
- [ ] Package multiplier.
- [ ] Proportional TON distribution at UTC+1.
- [ ] Pool page explanation.

## Phase 8 — User-Created Tasks & Commercial Engine
- [ ] Game/Social/Web creation.
- [ ] Partner/Special Admin-contact flow.
- [ ] Category isolation.
- [ ] Campaign budgets.
- [ ] 0.90 TON / 1,000 execution reference.
- [ ] Creator-paid rewards.
- [ ] Review/refund lifecycle.

## Phase 9 — Deposit / Purchase / Withdrawal
- [ ] TON deposits.
- [ ] Automatic TON→DZX.
- [ ] DZX purchase system.
- [ ] Withdrawal requirements.
- [ ] Admin fees.
- [ ] Withdrawable/deposited separation.

## Phase 10 — User UI/UX
- [ ] Home.
- [ ] Tasks.
- [ ] Referral.
- [ ] Wallet.
- [ ] User drawer.
- [ ] Squad page.
- [ ] Reward Pool page.
- [ ] Packages.
- [ ] Promo codes.
- [ ] Daily activity indicators.
- [ ] Auto-refresh data without page navigation reset.

## Phase 11 — Admin Panel
- [ ] Real backend-connected settings.
- [ ] User management.
- [ ] Balance/DZP management.
- [ ] Task management.
- [ ] Dashboard real-time metrics.
- [ ] Seven-day bar charts.
- [ ] Top 10 lists.
- [ ] Audit logs.

## Phase 12 — Security / Testing / Production
- [ ] Full financial integration tests.
- [ ] Anti-fraud tests.
- [ ] Load/stress tests.
- [ ] Blockchain edge cases.
- [ ] Idempotency/replay tests.
- [ ] Production deployment validation.

---

# 19. Explicitly Unresolved Items

These must be designed before their implementation phase, not guessed in code:

1. Final detailed Squad Earnings mechanism, if separate Squad earnings are retained.
2. Final exact Reward Pool eligible-user/day-boundary edge cases.
3. Final package names/colors/prices/multipliers (Admin-configurable architecture is fixed).
4. Final task verification matrix for every task subtype.
5. Final refund policy for unused user-created-task budget.
6. Final anti-fraud scoring/limits.

These are specification tasks, not permission to invent business rules during implementation.

---

# 20. Change Control

Whenever a business rule changes:
1. update this roadmap first;
2. record the change in `IMPLEMENTATION_STATUS.md`;
3. implement the backend rule;
4. test it;
5. update the UI only after the backend is correct.

**Never allow the frontend to become the source of truth.**
