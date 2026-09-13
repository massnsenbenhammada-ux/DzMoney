# ADR-0023 — Telegram Notification Delivery

**Status:** Accepted  
**Date:** 2026-09-13

## Context

DzMoney needs a minimal notification mechanism for business events that require informing a Telegram user after a successful server-side operation.

The application already has an existing Telegram bot and an existing `BOT_TOKEN` configuration. The `users` table already stores the user's `telegram_user_id`.

The system must not introduce a second bot, a new credential, a notification database, an in-app notification inbox, a notification history subsystem, a queue, a worker, a scheduler, or a retry infrastructure solely for this requirement.

The notification mechanism is an external side effect. It must not become part of the business transaction's source of truth.

Telegram's Bot API provides `sendMessage`, which requires a target `chat_id` and message `text`. The existing Telegram user identifier is therefore sufficient to identify the target chat when Telegram permits the bot to communicate with that user.

Telegram also states that bots cannot initiate conversations with users who have never contacted them. Therefore, successful delivery cannot be guaranteed for every stored Telegram user identifier.

## Decision

### 1. Reuse the Existing Application Bot

DzMoney will reuse the existing application bot and its existing `BOT_TOKEN`.

No new Telegram bot will be created.

No new Telegram credential will be introduced.

The bot token remains a server-side secret and must never be exposed to the frontend, client code, logs, API responses, or user-visible application state.

The notification implementation will use the Telegram Bot API `sendMessage` operation.

### 2. User Identity

The notification target is obtained from the existing user identity:

```text
users.telegram_user_id
        ↓
Telegram Bot API
chat_id
```

No new notification-recipient identity table or mapping is required.

The system must not duplicate Telegram identity data solely for notifications.

### 3. Persistence

Notifications are transient external delivery attempts.

DzMoney will NOT introduce:

- a `notifications` table;
- notification records;
- an in-app notification inbox;
- read/unread state;
- notification history;
- notification delivery status as business state;
- a notification API solely for browsing historical messages.

Telegram itself remains the user-facing message history.

No database persistence is required for a notification attempt.

### 4. Transaction Boundary

The underlying business operation must complete and commit before the notification attempt is made.

The intended sequence is:

```text
Business operation
      ↓
Economy / Ledger / Membership / other authoritative state
      ↓
COMMIT
      ↓
Notification attempt
      ↓
Telegram Bot API sendMessage
```

The Telegram request must never be allowed to determine whether the underlying business transaction commits.

A Telegram delivery failure must therefore never:

- roll back the business transaction;
- undo a membership settlement;
- undo an Economy/Ledger transaction;
- change business state to pending;
- create a compensating transaction;
- block successful business completion.

### 5. Failure Isolation

Telegram delivery is best-effort and isolated from business correctness.

If `sendMessage` fails after the business transaction has committed:

```text
business result = successful
notification attempt = failed
```

The business result remains successful.

No automatic retry is required.

No fallback notification channel is required.

No in-app warning or notification indicator is required.

No notification record is required.

The failure may be logged for operational observability without exposing the bot token or sensitive credentials.

### 6. Exact Responsibility Boundary

> **The system's only obligation is a correctly-attempted delivery call to the Telegram Bot API. Whether the message reaches or is read by the user (e.g., due to the user never having started a chat with the bot, blocking the bot, or any other delivery failure) is outside this system's responsibility and requires no additional fallback, retry, or in-app indicator.**

The system therefore does not guarantee:

- message delivery;
- message visibility;
- message reading;
- user awareness;
- user acknowledgement.

The system guarantees only that, after the relevant business transaction commits, it correctly attempts the Telegram delivery operation with the required parameters.

### 7. Reusable Notification Interface

The notification capability should be exposed through one small reusable application-level interface:

```text
notifyUser({
  userId,
  message,
  metadata
})
```

Where:

- `userId` identifies the DzMoney user;
- `message` is the Telegram text to send;
- `metadata` is diagnostic/contextual information only.

`metadata` must not become notification business state.

The interface must resolve the user's existing `telegram_user_id` and perform the Telegram delivery attempt.

The interface must not own Economy, Ledger, Membership, Reward, Verification, Activity, Task, or Advertisement Event business logic.

### 8. No New Notification Infrastructure

The current architecture does not justify introducing:

- a notification queue;
- a background worker;
- a scheduler;
- a notification service subsystem;
- a notification table;
- a delivery retry engine;
- a rate-limiting subsystem;
- a persistent notification inbox.

These would violate YAGNI/KISS and increase operational and architectural surface without a proven requirement.

The notification mechanism remains a small external side-effect adapter around the existing Telegram bot.

### 9. Telegram Rate Limits

Telegram rate limits are acknowledged as a future scaling constraint.

The system does not introduce a queue, worker, retry engine, or rate limiter solely for current notification delivery.

If future observed traffic demonstrates that notification volume requires explicit scheduling or rate control, that must be addressed as a separate architectural decision supported by production evidence.

It must not be introduced preemptively as part of the current notification requirement.

### 10. Security

The existing bot token is a sensitive server-side credential.

Therefore:

- `BOT_TOKEN` must remain server-side;
- it must never be sent to the frontend;
- it must never be embedded in client JavaScript;
- it must never be included in API responses;
- it must never be included in diagnostic metadata;
- it must never be logged;
- notification errors must be sanitized before logging.

Only the minimum required Telegram request data should be transmitted.

## Scope

This ADR defines only the notification delivery architecture.

It does NOT define:

- Squad eligibility;
- Squad settlement;
- membership classification;
- membership economics;
- Economy/Ledger semantics;
- reward semantics;
- verification semantics;
- notification triggering policy for individual business features;
- UI notification state;
- retry policy;
- delivery guarantees.

Those concerns remain governed by their respective contracts and existing Single Sources of Truth.

## Acceptance Criteria

The notification architecture is considered correctly implemented only when all of the following are true:

1. The existing application bot is reused.
2. The existing `BOT_TOKEN` is reused.
3. The user's existing `telegram_user_id` is used as the Telegram `chat_id`.
4. Telegram `sendMessage` is called with valid required parameters.
5. The business transaction commits before the notification attempt.
6. Telegram failure cannot roll back or invalidate the business transaction.
7. No notification database table is introduced.
8. No notification inbox or read-state system is introduced.
9. No queue, worker, scheduler, retry engine, or fallback channel is introduced.
10. No delivery or user-awareness guarantee is claimed.
11. Notification failures remain operationally observable without exposing secrets.
12. The reusable notification interface remains independent from business-domain Single Sources of Truth.
13. The implementation does not alter Economy, Ledger, Reward, Verification, Activity, Task, or Advertisement Event semantics.
14. The implementation introduces no unnecessary API or database contract.
15. The exact responsibility boundary defined in this ADR remains unchanged.

## Architectural Principle

The notification mechanism is an external side effect, not a business-state subsystem.

The authoritative business state must remain correct even when Telegram is unavailable, rejects the request, or cannot deliver the message.

The system therefore guarantees:

```text
Correct business state
        +
Correctly-attempted Telegram delivery
```

It does not guarantee:

```text
Successful Telegram delivery
        or
User awareness
```

That distinction is intentional and mandatory.
