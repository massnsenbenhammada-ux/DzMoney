const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const serverPath = path.join(ROOT, 'server.js');
const appPath = path.join(ROOT, 'public', 'app.js');

function replaceOnce(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`DzMoney bootstrap: marker not found for ${label}`);
  return source.replace(marker, replacement);
}

function patchServer() {
  let source = fs.readFileSync(serverPath, 'utf8');
  if (source.includes('async function ensureWithdrawalSchema()')) return;

  const schemaFunction = String.raw`

// ============================
// Runtime schema repair / admin settings
// ============================

async function ensureWithdrawalSchema() {
  await pool.query(\`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_bux BIGINT NOT NULL CHECK (amount_bux > 0),
      amount_ton NUMERIC(24,9) NOT NULL DEFAULT 0,
      fee_bux BIGINT NOT NULL DEFAULT 0,
      net_bux BIGINT NOT NULL DEFAULT 0,
      destination TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT 0,
      processed_at BIGINT
    );
    ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS amount_ton NUMERIC(24,9) NOT NULL DEFAULT 0;
    ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS fee_bux BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS net_bux BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS destination TEXT NOT NULL DEFAULT '';
    ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS admin_note TEXT NOT NULL DEFAULT '';
    ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS created_at BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS updated_at BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS processed_at BIGINT;
  \`);

  const required = await pool.query(
    \`SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='withdrawals'
       AND column_name = ANY($1::text[])\`,
    [['amount_ton','fee_bux','net_bux','destination','status','admin_note','created_at','updated_at','processed_at']]
  );
  const present = new Set(required.rows.map(row => row.column_name));
  const requiredNames = ['amount_ton','fee_bux','net_bux','destination','status','admin_note','created_at','updated_at','processed_at'];
  const missing = requiredNames.filter(name => !present.has(name));
  if (missing.length) throw new Error(`Withdrawal schema is still missing columns: ${missing.join(', ')}`);

  await pool.query(\`
    UPDATE withdrawals
    SET fee_bux = COALESCE(fee_bux, 0),
        net_bux = CASE WHEN net_bux IS NULL OR net_bux = 0 THEN amount_bux - COALESCE(fee_bux, 0) ELSE net_bux END,
        amount_ton = COALESCE(amount_ton, 0),
        destination = COALESCE(destination, ''),
        status = COALESCE(status, 'pending'),
        admin_note = COALESCE(admin_note, ''),
        created_at = COALESCE(created_at, 0),
        updated_at = COALESCE(updated_at, created_at, 0)
  \`);

  for (const [key, value] of Object.entries({ minimum_withdraw_bux: '2000', withdrawal_fee_bux: '0' })) {
    await pool.query(
      \`INSERT INTO settings (key,value,updated_at)
       VALUES ($1,$2,$3)
       ON CONFLICT (key) DO NOTHING\`,
      [key, value, Date.now()]
    );
  }
}

app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(\`SELECT key,value FROM settings ORDER BY key ASC\`);
    const settings = Object.fromEntries(result.rows.map(row => [row.key, row.value]));
    settings.coins_per_bux = String(ECONOMY.COINS_PER_BUX);
    settings.bux_per_ton = String(ECONOMY.BUX_PER_TON);
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Admin settings load error:', error);
    res.status(500).json({ success: false, message: 'Unable to load settings.' });
  }
});

app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  const incoming = req.body?.settings && typeof req.body.settings === 'object' ? req.body.settings : {};
  const allowed = new Set(['withdrawal_fee_bux','minimum_withdraw_bux','daily_reward_coins','daily_reward_bux','daily_ads_limit','daily_reward_ad_separate','referral_percentage']);
  const normalized = {};
  for (const [key, raw] of Object.entries(incoming)) {
    if (!allowed.has(key)) continue;
    const value = String(raw ?? '').trim();
    if (!value || value.length > 100) return res.status(400).json({ success: false, message: `Invalid value for ${key}.` });
    normalized[key] = value;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'withdrawal_fee_bux')) {
    const fee = Number(normalized.withdrawal_fee_bux);
    if (!Number.isSafeInteger(fee) || fee < 0) return res.status(400).json({ success: false, message: 'Withdrawal fee must be a non-negative whole number of BUX.' });
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'minimum_withdraw_bux')) {
    const minimum = Number(normalized.minimum_withdraw_bux);
    if (!Number.isSafeInteger(minimum) || minimum < 1) return res.status(400).json({ success: false, message: 'Minimum withdrawal must be a positive whole number of BUX.' });
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'referral_percentage')) {
    const percentage = Number(normalized.referral_percentage);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) return res.status(400).json({ success: false, message: 'Referral percentage must be between 0 and 100.' });
  }
  try {
    for (const [key, value] of Object.entries(normalized)) {
      await pool.query(\`INSERT INTO settings (key,value,updated_at) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=$3\`, [key, value, Date.now()]);
    }
    await audit(req.admin.adminId, 'settings_update', '', Object.entries(normalized).map(([key,value]) => `${key}=${value}`).join(';'));
    res.json({ success: true, updated: normalized });
  } catch (error) {
    console.error('Admin settings save error:', error);
    res.status(500).json({ success: false, message: 'Unable to save settings.' });
  }
});

app.get('/api/admin/audit', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(\`SELECT admin_id,action,target_id,details,created_at FROM admin_audit ORDER BY created_at DESC LIMIT 200\`);
    res.json({ success: true, logs: result.rows });
  } catch (error) {
    console.error('Admin audit load error:', error);
    res.status(500).json({ success: false, message: 'Unable to load audit log.' });
  }
});
`.replaceAll('\\`', '`');

  source = replaceOnce(source, '// ============================\n// TON Wallet + TON Proof\n// ============================', schemaFunction + '\n// ============================\n// TON Wallet + TON Proof\n// ============================', 'server admin/settings block');
  source = replaceOnce(source, '    await initDatabase();\n    console.log("PostgreSQL schema/settings/tasks: OK");', '    await initDatabase();\n    await ensureWithdrawalSchema();\n    console.log("PostgreSQL schema/settings/tasks/withdrawals: OK");', 'server startup schema verification');
  fs.writeFileSync(serverPath, source, 'utf8');
}

function patchFrontend() {
  let source = fs.readFileSync(appPath, 'utf8');
  if (source.includes('const HOME_MARKUP = getMain()?.innerHTML')) return;

  const homePatch = `
// ============================
// Stable Home navigation
// ============================

const HOME_MARKUP = getMain()?.innerHTML || '';

function showHome() {
  const main = getMain();
  if (!main) return;
  main.innerHTML = HOME_MARKUP;
  currentSection = 'home';
  setActiveNav('home');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  updateBalance();
  updateDaily();
  loadUser();
  bindDailyButton();
}
`;

  const oldHome = `function showHome() {
  // Home is the original/static page. A reload is intentionally retained
  // because its markup is defined by index.html, but make the navigation
  // state explicit first.
  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  location.reload();
}`;
  source = replaceOnce(source, oldHome, homePatch.trim(), 'Home reload removal');

  const oldDaily = `if (dailyButton) {

  dailyButton.addEventListener(
    "click",
    async () => {

      if (
        dailyRemaining > 0
      ) {
        return;
      }

      dailyButton.disabled =
        true;

      try {
        const data =
          await api(
            "/api/daily/claim",
            { method: "POST" }
          );

        coins = data.user.coins;
        bux = data.user.bux;
        dailyRemaining = 86400;
        updateBalance();
        updateDaily();

      } catch (error) {
        alert(error.message);
        dailyButton.disabled = false;
      }
    }
  );

}`;

  const newDaily = `function bindDailyButton() {
  const button = document.getElementById('daily-button');
  if (!button || button.dataset.bound === '1') return;
  button.dataset.bound = '1';
  button.addEventListener('click', async () => {
    if (dailyRemaining > 0) return;
    button.disabled = true;
    try {
      const data = await api('/api/daily/claim', { method: 'POST' });
      coins = data.user.coins;
      bux = data.user.bux;
      dailyRemaining = 86400;
      updateBalance();
      updateDaily();
    } catch (error) {
      alert(error.message);
      button.disabled = false;
    }
  });
}`;

  if (source.includes(oldDaily)) source = source.replace(oldDaily, newDaily);
  else source = source.replace('const dailyButton =', 'const dailyButtonLegacy =');

  source = replaceOnce(source, 'updateDaily();\n\nloadUser();\ninitTonConnect();', 'updateDaily();\nbindDailyButton();\nloadUser();\ninitTonConnect();', 'Daily reward initial binding');
  source = source.replace('  if (\n    !dailyButton ||\n    !dailyText\n  ) {\n    return;\n  }', "  const button = document.getElementById('daily-button');\n  const text = document.getElementById('daily-text');\n  if (!button || !text) return;");
  source = source.replaceAll('dailyButton.disabled', 'button.disabled');
  source = source.replaceAll('dailyButton.textContent', 'button.textContent');
  source = source.replaceAll('dailyText.textContent', 'text.textContent');
  fs.writeFileSync(appPath, source, 'utf8');
}

try {
  patchServer();
  patchFrontend();
  require(serverPath);
} catch (error) {
  console.error('DzMoney bootstrap failed:', error);
  process.exit(1);
}
