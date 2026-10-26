import { describe, it, expect } from 'vitest';
import { getSmtpSettings } from '../src/lib/mail-settings';

const valid = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '465',
  SMTP_USER: 'test-user',
  SMTP_PASSWORD: 'unit-test-value',
  SMTP_FROM: 'pilot@example.test',
};
describe('SMTP configuration', () => {
  it('requires encrypted submissions and certificate verification', () => {
    const implicit = getSmtpSettings(valid);
    expect(implicit.transport.secure).toBe(true);
    expect(implicit.transport.tls.rejectUnauthorized).toBe(true);
    const starttls = getSmtpSettings({ ...valid, SMTP_PORT: '587' });
    expect(starttls.transport.secure).toBe(false);
    expect(starttls.transport.requireTLS).toBe(true);
  });
  it('rejects plaintext port25 and missing authentication', () => {
    expect(() => getSmtpSettings({ ...valid, SMTP_PORT: '25' })).toThrow();
    expect(() => getSmtpSettings({ ...valid, SMTP_PASSWORD: '' })).toThrow();
  });
  it('rejects injected headers and malformed hostnames', () => {
    expect(() =>
      getSmtpSettings({ ...valid, SMTP_FROM: 'pilot@example.test\r\nBcc: other@example.test' }),
    ).toThrow();
    expect(() =>
      getSmtpSettings({ ...valid, SMTP_HOST: 'https://smtp.example.test/path' }),
    ).toThrow();
  });
  it('does not include secrets in errors', () => {
    const secret = 'unit-test-sensitive-value';
    try {
      getSmtpSettings({ ...valid, SMTP_PASSWORD: secret, SMTP_FROM: 'invalid' });
      throw new Error('Expected rejection');
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(String(error)).toContain('SMTP_FROM');
    }
  });
});
