const express = require('express');
const { adminAuth } = require('./admin-auth');
const { getTonDepositAddresses, setTonDepositAddress } = require('../services/admin-settings-service');

function createAdminTonSettingsRouter() {
  const router = express.Router();
  router.use(adminAuth);

  router.get('/addresses', async (_req, res, next) => {
    try {
      res.json({ ok: true, addresses: await getTonDepositAddresses() });
    } catch (error) {
      next(error);
    }
  });

  router.put('/addresses/:network', async (req, res, next) => {
    try {
      const network = req.params.network;
      if (network !== 'testnet' && network !== 'mainnet') {
        return res.status(400).json({ ok: false, error: 'Unsupported TON network' });
      }
      const address = req.body?.address;
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
      const key = `deposit.ton.${network}_address`;
      const result = await setTonDepositAddress({ key, address, actorTelegramUserId: req.adminTelegramUserId, reason });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createAdminTonSettingsRouter };
