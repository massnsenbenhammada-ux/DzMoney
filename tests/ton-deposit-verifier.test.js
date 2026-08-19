"use strict";

const assert = require("assert");
const { verifyTonDepositCandidate } = require("../services/ton-deposit-verifier");

const address = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";

function base(overrides = {}) {
  return {
    txId: "test-tx-001",
    network: "mainnet",
    recipient: address,
    sender: address,
    amountTon: 1,
    confirmed: true,
    confirmations: 3,
    success: true,
    timestamp: Math.floor(Date.now() / 1000),
    ...overrides
  };
}

assert.equal(
  verifyTonDepositCandidate(base(), { network: "mainnet", depositAddress: address }).verified,
  true
);

assert.throws(
  () => verifyTonDepositCandidate(base({ amountTon: 0.5 }), { network: "mainnet", depositAddress: address }),
  /minimum/
);

assert.throws(
  () => verifyTonDepositCandidate(base({ confirmed: false }), { network: "mainnet", depositAddress: address }),
  /confirmed/
);

assert.throws(
  () => verifyTonDepositCandidate(base({ confirmations: 1 }), { network: "mainnet", depositAddress: address, requiredConfirmations: 2 }),
  /confirmations/
);

assert.throws(
  () => verifyTonDepositCandidate(base({ recipient: "EQBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" }), { network: "mainnet", depositAddress: address }),
  /recipient/
);

console.log("TON deposit verifier tests passed.");
