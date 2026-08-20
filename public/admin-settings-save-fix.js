"use strict";

// Final Admin settings save bridge. The economy-control preload owns requests
// containing TON/DZX/COIN rates, so mixed requests must be split; otherwise
// the rate handler would consume the whole request and silently drop the
// ordinary settings in the same payload.
(function installAdminSettingsSaveFix(){
  const RATE_KEYS = new Set(["dzx_per_ton","coins_per_dzx","coins_per_ton"]);

  window.saveSettings = async function saveSettingsFixed(){
    const all = {};
    document.querySelectorAll("[data-setting]").forEach((input) => {
      const key = input.dataset.setting;
      if (window.SETTINGS_KEYS instanceof Set ? window.SETTINGS_KEYS.has(key) : true) {
        all[key] = input.value;
      }
    });

    const rateSettings = {};
    const normalSettings = {};
    for (const [key,value] of Object.entries(all)) {
      (RATE_KEYS.has(key) ? rateSettings : normalSettings)[key] = value;
    }

    try {
      if (Object.keys(rateSettings).length) {
        const rateResult = await window.api("/api/admin/settings", {
          method: "PUT",
          body: JSON.stringify({ settings: rateSettings })
        });
        if (!rateResult.success) throw new Error(rateResult.message || "Economy settings were not saved");
      }

      if (Object.keys(normalSettings).length) {
        const result = await window.api("/api/admin/settings", {
          method: "PUT",
          body: JSON.stringify({ settings: normalSettings })
        });
        if (!result.success) throw new Error(result.message || "Settings were not saved");
      }

      await window.loadSettings();
      alert("Settings saved and applied.");
    } catch (error) {
      alert("Save failed: " + error.message);
    }
  };
})();
