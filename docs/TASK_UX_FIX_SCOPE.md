# Task UX Fix Scope

This branch consolidates the observed post-PR #176 Task UX failures without introducing a new Task, Verification, Reward, Referral, Economy, or Ledger service.

Scope:
- isolate Daily Check-in cooldown from other Daily Activity actions;
- expose server-confirmed reward amounts to the existing Task UI;
- show a small success/failure reward feedback popup;
- place User Creator Task inside the existing Tasks page as a two-tab surface;
- apply the canonical permanent Invite achievement reward contract.
