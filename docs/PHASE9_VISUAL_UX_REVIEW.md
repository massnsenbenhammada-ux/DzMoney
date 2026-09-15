# Phase 9 Visual UX Review

## Status

PR #370 remains unmergeable until visual/responsive acceptance is confirmed.

## ODRCA finding

The Phase 9 API/DOM contract is implemented, but the new membership-semantic and How-it-works surfaces are not fully integrated into the existing Squad visual system.

Observed new selectors include:

- `.squad-semantic-grid`
- `.squad-semantic-card`
- `.squad-semantic-pending`
- `.squad-how-it-works`
- `.squad-how-copy`

The existing `squad.css` styles the established Squad surfaces but does not define the new semantic/how-it-works surfaces.

## Repair boundary

The repair is presentation-only:

- no Economy/Ledger changes
- no membership business-rule changes
- no database/schema changes
- no API contract changes
- no new service or source of truth
- no financial calculations in the frontend

## Visual acceptance states

The repaired UI must be evaluated for:

1. No Squad
2. Pending membership
3. Active Squad
4. Current Tier different from Purchased Tier
5. T10 (1000+)
6. Pending Upgrade
7. Owner controls
8. Invitations
9. 320/360/390/430/520px layouts
10. Telegram bottom-navigation/safe-area interaction

## Required UX hierarchy

Primary state must remain visually dominant. Current Tier and Purchased Tier must be clearly distinct. Pending must read as pending, not failed or paid. How it works must be collapsed by default and visually integrated with the existing DzMoney design language.

## Merge gate

CI success alone is insufficient. Phase 9 is accepted only after DOM/static checks, responsive reasoning, interaction-state checks, and exact-HEAD CI are all green.
