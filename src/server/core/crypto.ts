import 'server-only';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';
import { env } from './config';

// ============================================================
// 암호화 유틸 — schema.dbml kit_subscribers: AES-256 + SHA-256
// L-5: 비즈니스 무관. K-뷰티 용어 없음.
// L-4: core/ 신규 파일 (승인 완료).
// G-9: export 3개 (encrypt, decrypt, hash).
// ============================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * AES-256-GCM 암호화.
 * @returns `iv:authTag:ciphertext` (hex 인코딩, : 구분)
 */
export function encrypt(plaintext: string): string {
  const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * AES-256-GCM 복호화.
 * @param ciphertext `iv:authTag:encrypted` 형식
 */
export function decrypt(ciphertext: string): string {
  const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * SHA-256 해시. 중복 체크용 (복호화 불가).
 */
export function hash(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}
