// Compatibility facade only. Domain logic lives in focused services.
// New code should import task-service, task-verification-service, or ad-event-service directly.

const taskService = require('./task-service');
const verificationService = require('./task-verification-service');
const adEventService = require('./ad-event-service');

module.exports = {
  ...taskService,
  startVerificationAd: verificationService.startTaskVerificationAd,
  verifyTaskAdvertisement: verificationService.verifyTaskAdvertisement,
  finalizeTaskVerification: verificationService.finalizeTaskVerification,
  startAdvertisementEvent: adEventService.startAdvertisementEvent,
  markAdvertisementVerified: adEventService.markAdvertisementVerified
};
