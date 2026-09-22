# Phase 14 — Telegram Android Runtime E2E

## Purpose

This gate exists to test the runtime layer that headless Chromium cannot reproduce: Android + Telegram Android + Telegram Mini App WebView + the real advertisement SDK.

GitHub-hosted Linux runners support hardware acceleration for Android SDK tools. The current workflow intentionally uses an Android API 30 `google_apis` x86 emulator because that exact configuration has been boot-validated by the repository's latest runtime evidence. The official Telegram Android APK is installed from telegram.org.

## Evidence boundary

The emulator harness proves:

- Android Emulator can boot in GitHub Actions.
- The official Telegram Android package can be installed and launched.
- Android/Telegram runtime artifacts can be captured.

It does **not** by itself prove:

- Telegram account authentication.
- Mini App launch from the user's Telegram account.
- A real ad being served.
- A real provider callback.
- Reward/Economy/Ledger completion.

Those claims require an authenticated Telegram test account and the actual provider configuration. No fake callback or provider mock may be used to turn this runtime harness into release evidence.

## Real-provider release path

The `run_real_provider` workflow input is intentionally separate. Before enabling it as a release gate, the repository must have approved secrets/configuration for a dedicated test Telegram account and the provider under test. The test must then execute the real Mini App and real SDK through the production HTTP/verification/Economy/Ledger boundaries.

## Relationship to PR #305

This workflow does not replace the real-state Playwright governance required by PR #305. It adds the missing Android/Telegram runtime layer. PR #305 must remain unmerged until its release-critical journeys have executable real-state evidence.
