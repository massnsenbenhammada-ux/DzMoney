class AdsProvider {
  async verifyCompletion() {
    throw new Error('AdsProvider.verifyCompletion must be implemented by a provider adapter');
  }
}

module.exports = { AdsProvider };
