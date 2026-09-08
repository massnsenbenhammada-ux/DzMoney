# Phase 14 Real-State E2E Status

## Current state

The release-critical Gaming and Share with Friends journeys now have concrete Playwright real-state specs on the validation branch.

### Gaming

`tests/e2e/gaming-real-state.spec.js` exercises the actual UI, authenticated HTTP boundary, the existing Gaming provider registry, server-side completion, canonical Economy/Ledger transaction, duplicate completion, and reload persistence.

### Share with Friends

`tests/e2e/share-with-friends-real-state.spec.js` exercises the actual Tasks UI, existing daily-system-task execution, verification-ad boundary, Click Proof, canonical Economy/Ledger reward, verification polling, and reload persistence.

### Share verification race correction

The previous `/api/tasks/click` boundary attempted to finalize verification immediately after recording Click Proof. That can race the trusted advertisement callback and produces the observed `Verification advertisement must be verified first` failure. The boundary now records Click Proof and returns the current verification state; the existing Task Verification service remains the sole finalization/reward owner when trusted advertisement verification arrives.

## Release gates still separate

- CI deterministic provider evidence is not real AdsGram network evidence.
- Telegram Android authenticated-session evidence is separate.
- A public non-production HTTPS Telegram runtime is separate.
- Final real AdsGram Watch Ad evidence is still required.
- The canonical npm `test:e2e:real-state-gaming` and `test:e2e:real-state-share-with-friends` script entries still need registration in `package.json` before the PR #305 governance registry is fully closed.
