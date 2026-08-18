// DzMoney TON Connect reconnect safety patch.
// A TON Connect instance can still have an asynchronous protocol callback in
// flight immediately after disconnect(). Reloading only after the SDK and
// backend disconnect calls have completed gives the next connection a clean
// TonConnectUI instance and prevents stale protocol calls from reaching a
// disconnected wallet.
(function () {
  const originalDisconnect = window.disconnectTonWallet;
  if (typeof originalDisconnect !== "function") return;

  window.disconnectTonWallet = async function () {
    try {
      await originalDisconnect();
    } finally {
      // Do not keep a stale TON Connect instance in memory after disconnect.
      // The next page load creates a fresh TonConnectUI session.
      window.setTimeout(() => {
        window.location.reload();
      }, 150);
    }
  };
})();
