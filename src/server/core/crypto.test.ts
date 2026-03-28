import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// config mock — 64-char hex key (32 bytes AES-256)
vi.mock('@/server/core/config', () => ({
  env: {
    ENCRYPTION_KEY: 'a'.repeat(64),
  },
}));

describe('crypto utils', () => {
  it('encrypt → decrypt 라운드트립: 원문 복원', async () => {
    const { encrypt, decrypt } = await import('@/server/core/crypto');
    const plaintext = 'test@example.com';
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it('같은 입력 → 다른 암호문 (IV 랜덤)', async () => {
    const { encrypt } = await import('@/server/core/crypto');
    const plaintext = 'test@example.com';
    const c1 = encrypt(plaintext);
    const c2 = encrypt(plaintext);
    expect(c1).not.toBe(c2);
  });

  it('hash 결정론적: 같은 입력 → 같은 해시', async () => {
    const { hash } = await import('@/server/core/crypto');
    const input = 'test@example.com';
    expect(hash(input)).toBe(hash(input));
  });

  it('잘못된 암호문 → decrypt 에러', async () => {
    const { decrypt } = await import('@/server/core/crypto');
    expect(() => decrypt('bad:data:here')).toThrow();
  });
});
