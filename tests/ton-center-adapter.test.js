"use strict";

const assert = require("assert");
const { apiBase } = require("../services/ton-center-adapter");

assert.strictEqual(apiBase("mainnet"), "https://toncenter.com/api/v3");
assert.strictEqual(apiBase("testnet"), "https://testnet.toncenter.com/api/v3");
assert.throws(() => apiBase("unknown"), /Unsupported TON network/);

console.log("ton-center-adapter tests passed");
