# Phase 14 Real-State E2E Status

## Current state

The release-critical Gaming and Share with Friends journeys now have concrete Playwright real-state specs on the validation branch.

### Gaming

`tests/e2e/gaming-real-state.spec.js` exercises the actual UI, authenticated HTTP boundary, existing Gaming provider registry, server-side completion, canonical Economy/Ledger transaction, duplicate completion, and reload persistence.

### Share with Friends

`tests/e2e/share-with-friends-real-state.spec.js` exercises the actual Tasks UI, existing daily-system-task execution, verification-ad boundary, Click Proof, canonical Economy/Ledger reward, verification polling, and reload persistence.

The Share flow also required a production-boundary correction: `/api/tasks/click` must record Click Proof and expose the current verification state instead of attempting finalization before the advertisement verification callback has arrived. Finalization remains owned by the existing Task Verification service when the trusted advertisement verification is available.

## Still separate release gates

- These CI specs use deterministic existing provider adapters/trusted postback boundaries and are not evidence of a real AdsGram network advertisement.
- Telegram Android authenticated-session evidence is still separate.
- Public non-production HTTPS Telegram runtime is still separate.
- Final real AdsGram Watch Ad evidence is still required.
- The canonical npm `test:e2e:real-state-gaming` and `test:e2e:real-state-share-with-friends` script entries still need to be registered in `package.json` before the governance registry can be considered fully closed.
