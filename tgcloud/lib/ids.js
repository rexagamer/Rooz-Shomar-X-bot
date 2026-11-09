// 32-symbol alphabet; 256 % 32 === 0 so there is no modulo bias.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ID_LENGTH = 10;
const ID_PATTERN = /^[A-HJ-NP-Z2-9]{10}$/;

export function newId() {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('Secure random source is not available');
  }
  const bytes = c.getRandomValues(new Uint8Array(ID_LENGTH));
  let id = '';
  for (const b of bytes) id += ALPHABET[b % ALPHABET.length];
  return id;
}

export const isValidId = (value) => typeof value === 'string' && ID_PATTERN.test(value);
