import crypto from 'crypto';

export default function generatePassword(length = 12) {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}
