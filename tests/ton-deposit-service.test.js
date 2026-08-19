"use strict";

const assert = require("assert");
const { processTonDeposit } = require("../services/ton-deposit-service");

function makeClient() {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("FROM economy_deposits")) return { rowCount: 0, rows: [] };
      return { rowCount: 0, rows: [] };
    }
  };
}

async function run() {
  const client = makeClient();
  const adapter = {
    async findTransaction({ txId, network }) {
      return {
        txId,
        network,
        recipient: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
        sender: "EQBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBUJ9",
        amountTon: 1,
        confirmed: true,
        confirmations: 3,
        success: true,
        timestamp: Math.floor(Date.now() / 1000)
      };
    }
  };

  // The test intentionally stops before DB crediting because address fixtures
  // are not real deployment addresses. It verifies the orchestration contract
  // rejects an unconfigured recipient instead of trusting client data.
  await assert.rejects(
    () => processTonDeposit(client, adapter, {
      userId: "test-user",
      txId: "test-tx",
      network: "testnet",
      rules: {
        network: "testnet",
        depositAddress: "EQCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCQ"
      }
    }),
    /Transaction recipient does not match/
  );

  console.log("ton-deposit-service tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
