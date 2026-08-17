# DzMoney wallet/auth fix

This build fixes the `Telegram session could not be verified` problem in the wallet flow.

## Important
1. Deploy the whole project, including `public/app.js`, `public/index.html`, and `server.js`.
2. In Railway, `TELEGRAM_BOT_TOKEN` must be the token for `@DzaMoneybot`. Do not add quotes around it.
3. `TELEGRAM_WEBAPP_URL` / `PUBLIC_URL` should point to `https://dzmoney-production.up.railway.app` (or your current Railway public URL).
4. After deployment, send `/start` to the bot and use the **Open DzMoney** button from the bot message. This button is now a real Telegram Web App button, so Telegram supplies signed `initData`.
5. Do not test the wallet by opening the raw Railway URL in a normal browser/in-app browser. The wallet verification endpoint intentionally requires signed Telegram Mini App data.

## What changed
- `/start` now sends a real Telegram `web_app` button instead of only a normal URL.
- Telegram `initData` is also sent in `X-Telegram-Init-Data`.
- Server accepts the header as well as body/query data.
- Telegram bot token is trimmed/sanitized to avoid accidental spaces/quotes breaking HMAC verification.
- Auth errors now distinguish missing vs invalid Telegram `initData`.
- Telegram Web App script and TON Connect UI versions are pinned.
- Removed the webpage URL from TON Connect `twaReturnUrl`; TON Connect now uses its default return strategy.

No balances, tasks, withdrawals, database schema, or admin functionality were intentionally changed.
