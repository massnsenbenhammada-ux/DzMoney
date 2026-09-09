const assert = require("assert");
const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const path = require("path");

process.env.BOT_TOKEN = "test-bot-token";

function buildInitData(userId) {
  const params = new URLSearchParams();
  params.set("auth_date", String(Math.floor(Date.now() / 1000)));
  params.set("user", JSON.stringify({ id: userId, first_name: "Test" }));
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(process.env.BOT_TOKEN)
    .digest();
  params.set(
    "hash",
    crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex"),
  );
  return params.toString();
}

async function run() {
  const dailyTasksPath =
    require.resolve("../src/services/daily-system-task-service");
  const verificationPath =
    require.resolve("../src/services/task-verification-service");
  const walletPath = require.resolve("../src/services/wallet-service");
  const originalDailyTasks = require(dailyTasksPath);
  const originalVerification = require(verificationPath);
  const originalWallet = require(walletPath);
  const calls = [];
  let verificationAdCalls = 0;

  require.cache[dailyTasksPath].exports = {
    ...originalDailyTasks,
    executeSystemTask: async (args) => {
      calls.push(args);
      return {
        attempt: { id: 42 },
        gate: { id: 9, idempotency_key: "gate-1", status: "pending" },
        duplicate: false,
      };
    },
  };
  require.cache[verificationPath].exports = {
    ...originalVerification,
    startTaskVerificationAd: async () => {
      verificationAdCalls += 1;
      throw new Error("Check for Update must not start an advertisement");
    },
  };
  require.cache[walletPath].exports = {
    ...originalWallet,
    createUser: async () => ({ id: 42 }),
  };

  const {
    createDailySystemTaskRouter,
  } = require("../src/http/daily-system-task-routes");
  const app = express();
  app.use(express.json());
  app.use(
    "/api/daily-tasks",
    createDailySystemTaskRouter({ providerRegistry: {} }),
  );
  const http = require("http");
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const request = (method, requestPath, body, initData) =>
    new Promise((resolve, reject) => {
      const headers = { "content-type": "application/json" };
      if (initData) headers["X-Telegram-Init-Data"] = initData;
      const req = http.request(
        { hostname: "127.0.0.1", port, path: requestPath, method, headers },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              body: data ? JSON.parse(data) : null,
            }),
          );
        },
      );
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });

  assert.strictEqual(
    (
      await request("POST", "/api/daily-tasks/execute", {
        systemKey: "check_for_update",
        idempotencyKey: "check-1",
      })
    ).status,
    401,
  );
  const auth = buildInitData(123);
  const result = await request(
    "POST",
    "/api/daily-tasks/execute",
    { systemKey: "check_for_update", idempotencyKey: "check-1" },
    auth,
  );
  assert.strictEqual(result.status, 200);
  assert.strictEqual(result.body.attemptId, 42);
  assert.strictEqual(result.body.verificationAdId, null);
  assert.strictEqual(result.body.actionUrl, "https://t.me/DzMoneyChecking");
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].systemKey, "check_for_update");
  assert.strictEqual(verificationAdCalls, 0);

  const frontend = fs.readFileSync(
    path.join(__dirname, "../public/check-for-update.js"),
    "utf8",
  );
  assert.match(frontend, /RETURN_VERIFY_COOLDOWN_MS = 10000/);
  assert.match(
    frontend,
    /now - lastReturnVerifyAt < RETURN_VERIFY_COOLDOWN_MS/,
  );
  assert.match(frontend, /lastReturnVerifyAt = now/);
  assert.match(
    frontend,
    /document\.addEventListener\('visibilitychange', verifyOnReturn\)/,
  );
  assert.match(frontend, /window\.addEventListener\('focus', verifyOnReturn\)/);

  await new Promise((resolve) => server.close(resolve));
  require.cache[dailyTasksPath].exports = originalDailyTasks;
  require.cache[verificationPath].exports = originalVerification;
  require.cache[walletPath].exports = originalWallet;
  console.log("Check for Update HTTP boundary: PASS");
}

run().catch((error) => {
  console.error("Check for Update HTTP boundary: FAIL");
  console.error(error);
  process.exit(1);
});
