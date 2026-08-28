function requiredUrl(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required`);
  return new URL(value.trim());
}

function referralValuePattern(value) {
  const match = value.match(/^(.*?)([A-Za-z0-9]+)$/);
  if (!match) return null;
  const prefix = match[1];
  const dynamic = match[2];
  return {
    prefix,
    length: dynamic.length,
    classes: [...dynamic].map(character => /[0-9]/.test(character) ? 'digit' : 'letter')
  };
}

function matchesReferralValue(referenceValue, candidateValue) {
  const pattern = referralValuePattern(referenceValue);
  if (!pattern) return referenceValue === candidateValue;
  if (!candidateValue.startsWith(pattern.prefix)) return false;
  const dynamic = candidateValue.slice(pattern.prefix.length);
  if (dynamic.length !== pattern.length) return false;
  return [...dynamic].every((character, index) => pattern.classes[index] === (/\d/.test(character) ? 'digit' : 'letter'));
}

function matchesUrlFormat(referenceUrl, candidateUrl) {
  let reference;
  let candidate;
  try {
    reference = requiredUrl(referenceUrl, 'referenceUrl');
    candidate = requiredUrl(candidateUrl, 'candidateUrl');
  } catch {
    return false;
  }
  if (reference.protocol !== candidate.protocol || reference.hostname !== candidate.hostname || reference.port !== candidate.port || reference.pathname !== candidate.pathname || reference.hash !== candidate.hash) return false;
  const referenceEntries = [...reference.searchParams.entries()];
  const candidateEntries = [...candidate.searchParams.entries()];
  if (referenceEntries.length !== candidateEntries.length) return false;
  return referenceEntries.every(([key, value], index) => candidateEntries[index][0] === key && matchesReferralValue(value, candidateEntries[index][1]));
}

module.exports = { matchesUrlFormat };
