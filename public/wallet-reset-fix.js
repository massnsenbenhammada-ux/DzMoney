// DzMoney TON Connect reconnect safety patch v2.
// The previous patch relied on a page reload. This version explicitly destroys
// the stale TonConnectUI instance after disconnect and forces the next connect
// attempt to use a fresh instance.
(function () {
  const originalDisconnect = window.disconnectTonWallet;
  const originalConnect = window.connectTonWallet;

  if (typeof originalDisconnect !== "function" || typeof originalConnect !== "function") {
    console.error("DzMoney TON reconnect patch could not attach.");
    return;
  }

  window.disconnectTonWallet = async function () {
    try {
      if (typeof tonConnectUI !== "undefined" && tonConnectUI) {
        if (tonConnectUI.connected) {
          await tonConnectUI.disconnect();
        }
      }

      try {
        await api("/api/wallet/disconnect", { method: "POST" });
      } catch (error) {
        console.warn("Backend wallet disconnect failed:", error);
      }
    } catch (error) {
      console.error("TON Connect disconnect error:", error);
      alert(error?.message || "Unable to disconnect the wallet.");
    } finally {
      connectedWallet = null;

      // Drop the old SDK object completely. The next connection gets a new
      // bridge/session instead of reusing a disconnected connector.
      tonConnectUI = null;

      if (currentSection === "wallet") {
        await showWallet();
      }
    }
  };

  window.connectTonWallet = async function () {
    try {
      // Never reuse a TonConnectUI object that has already been disconnected.
      if (typeof tonConnectUI !== "undefined" && tonConnectUI && !tonConnectUI.connected) {
        tonConnectUI = null;
      }

      if (!initTonConnect() || !tonConnectUI) {
        throw new Error("TON Connect could not be initialized. Please try again.");
      }

      // Follow the official ton_proof flow: create a fresh server payload,
      // attach it to the connect request, then open the wallet modal.
      const data = await api("/api/ton-proof/payload", { method: "POST" });
      const payload = typeof data?.payload === "string" ? data.payload.trim() : "";

      if (!payload) {
        throw new Error(data?.message || "The server did not return a TON Proof payload.");
      }

      tonConnectUI.setConnectRequestParameters({
        state: "ready",
        value: { tonProof: payload }
      });

      await tonConnectUI.openModal();
    } catch (error) {
      console.error("TON wallet reconnect error:", error);
      // Do not call setConnectRequestParameters(null) here. If the connector
      // has already become disconnected, that protocol call can itself trigger
      // the exact WalletNotConnected SDK error we are preventing.
      alert(error?.message || "Unable to start TON wallet connection.");
    }
  };
})();
