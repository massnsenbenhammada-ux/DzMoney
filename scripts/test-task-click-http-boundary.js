const assert = require("assert");
const crypto = require("crypto");
const express = require("express");

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
  const { createTaskRouter } = require("../src/http/task-routes");
  const calls = [];
  const wallet = {
    createUser: async (args) => ({ id: 42, ...args }),
  };
  const tasks = {
    executeTask: async (args) => {
      calls.push({ execute: args });
      return {
        attempt: { id: "2" },
        gate: { id: 3, idempotency_key: "gate:2" },
        duplicate: false,
      };
    },
    recordTaskClick: async (args) => {
      calls.push(args);
      return { clicked: true, duplicate: false };
    },
  };
  const verification = {
    startTaskVerificationAd: async (args) => {
      calls.push({ startVerificationAd: args });
      return { adEvent: { external_ad_id: "ad-2" }, providerId: "test-ads" };
    },
    finalizeTaskVerification: async (args) => {
      calls.push({ finalize: args });
      return {
        status: "verified",
        rewarded: true,
        duplicate: false,
        reward: { coin: 1000, dzx: 1, dzp: 1 },
      };
    },
  };

  const app = express();
  app.use(express.json());
  app.use("/api/tasks", createTaskRouter({ wallet, tasks, verification }));
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
          res.on("end", () => {
            const isJson = String(res.headers["content-type"] || "").includes(
              "application/json",
            );
            resolve({
              status: res.statusCode,
              body: isJson && data ? JSON.parse(data) : null,
            });
          });
        },
      );
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });

  assert.strictEqual(
    (await request("POST", "/api/tasks/click", { attemptId: 1 })).status,
    401,
  );

  const auth = buildInitData(123);
  const forged = await request(
    "POST",
    "/api/tasks/execute",
    {
      taskId: 7,
      idempotencyKey: "execute:7",
      metadata: { link_clicked: true, client_marker: "kept" },
    },
    auth,
  );
  assert.strictEqual(forged.status, 200);
  assert.strictEqual(forged.body.attemptId, "2");
  assert.strictEqual(calls[0].execute.metadata.link_clicked, undefined);
  assert.strictEqual(calls[0].execute.metadata.client_marker, "kept");

  // PostgreSQL BIGINT/BIGSERIAL identifiers can arrive as strings. The HTTP
  // boundary must normalize them before the existing Task Verification/Economy
  // path, otherwise Share with Friends can create an attempt but never reward.
  const click = await request(
    "POST",
    "/api/tasks/click",
    { attemptId: "2" },
    auth,
  );
  assert.strictEqual(click.status, 200);
  assert.deepStrictEqual(click.body, {
    ok: true,
    clicked: true,
    duplicate: false,
    status: "verified",
    rewarded: true,
    reason: null,
  });
  assert.strictEqual(calls[2].attemptId, 2);
  assert.strictEqual(typeof calls[2].attemptId, "number");
  assert.strictEqual(calls[2].userId, 42);
  assert.deepStrictEqual(calls[3], {
    finalize: { attemptId: 2, idempotencyKey: "task:2" },
  });

  const missingAttempt = await request("POST", "/api/tasks/click", {}, auth);
  assert.strictEqual(missingAttempt.status, 400);

  await new Promise((resolve) => server.close(resolve));
  console.log(
    "task-click HTTP boundary tests passed: auth, BIGINT/string attemptId normalization, verification result, reward result, idempotency boundary",
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
