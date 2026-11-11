import test from 'node:test';
import assert from 'node:assert/strict';
import { sendOwnerEmail, smtpConfiguration } from '../server/email-delivery.js';

const message = { to: 'owner@example.com', text: 'Local synthetic test only' };
const receipt = { accepted: ['owner@example.com'], rejected: [], response: '250 2.0.0 queued', messageId: 'synthetic' };
const env = { CONTACT_DELIVERY_ENABLED: 'true', SMTP_HOST: 'smtp.resend.com', SMTP_PORT: '587', SMTP_USER: 'resend', SMTP_PASS: 'synthetic-not-a-key', SMTP_FROM: 'website@example.com', LEAD_TO: message.to };

test('owner email requires exact recipient acceptance and a final successful SMTP response', async () => {
  for (const bad of [undefined, {}, { accepted: [] },
    { ...receipt, accepted: ['other@example.com'] },
    { ...receipt, accepted: ['other@example.com', message.to] },
    { ...receipt, rejected: [message.to] },
    { ...receipt, rejected: undefined },
    { ...receipt, response: '550 denied' },
    { ...receipt, response: undefined }]) {
    await assert.rejects(sendOwnerEmail({ sendMail: async () => bad }, message), /did not accept/);
  }
});

test('transport errors propagate; accepted mail retains provider evidence', async () => {
  await assert.rejects(sendOwnerEmail({ sendMail: async () => { throw new Error('offline'); } }, message), /offline/);
  let received;
  assert.equal(await sendOwnerEmail({ sendMail: async value => { received = value; return receipt; } }, message), receipt);
  assert.equal(received, message);
});

test('SMTP receipt address objects and case differences are supported', async () => {
  const info = { ...receipt, accepted: [{ address: 'OWNER@example.com' }] };
  assert.equal(await sendOwnerEmail({ sendMail: async () => info }, message), info);
});

test('a stalled send fails within a deadline and is never automatically retried', async () => {
  let calls = 0;
  await assert.rejects(sendOwnerEmail({ sendMail: () => { calls++; return new Promise(() => {}); } }, message, 10), /timed out/);
  assert.equal(calls, 1);
});

test('multiple or injected owner addresses cannot reach the transport', async () => {
  const mailer = { sendMail: () => assert.fail('must not send') };
  for (const to of ['a@example.com,b@example.com', 'a@example.com\r\nBcc: b@example.com', undefined]) {
    await assert.rejects(sendOwnerEmail(mailer, { to }), /Invalid owner/);
  }
});

test('SMTP remains off without explicit activation and complete valid configuration', () => {
  for (const key of ['CONTACT_DELIVERY_ENABLED', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'LEAD_TO']) {
    const missing = { ...env }; delete missing[key];
    assert.equal(smtpConfiguration(missing), null, key);
  }
  for (const patch of [{ CONTACT_DELIVERY_ENABLED: 'false' }, { CONTACT_DELIVERY_ENABLED: '1' },
    { SMTP_PORT: '25' }, { SMTP_PORT: 'invalid' }, { SMTP_FROM: 'resend' },
    { SMTP_FROM: 'Nino <sender@example.com>' }, { LEAD_TO: 'a@example.com,b@example.com' }]) {
    assert.equal(smtpConfiguration({ ...env, ...patch }), null);
  }
});

test('preview and Vercel development cannot send even with production credentials', () => {
  for (const VERCEL_ENV of ['preview', 'development', undefined]) {
    assert.equal(smtpConfiguration({ ...env, VERCEL: '1', VERCEL_ENV }), null);
  }
  assert.ok(smtpConfiguration({ ...env, VERCEL: '1', VERCEL_ENV: 'production' }));
});

test('SMTP transport enforces encryption, certificate validation, deadlines and safe content handling', () => {
  for (const port of ['465', '587', '2465', '2587']) {
    const config = smtpConfiguration({ ...env, SMTP_PORT: port });
    const smtp = config.transport;
    assert.equal(smtp.secure, ['465', '2465'].includes(port));
    assert.equal(smtp.requireTLS, true);
    assert.deepEqual(smtp.tls, { minVersion: 'TLSv1.2', rejectUnauthorized: true });
    assert.equal(smtp.disableFileAccess, true);
    assert.equal(smtp.disableUrlAccess, true);
    assert.equal(smtp.debug, false);
    assert.ok(smtp.socketTimeout < 15000);
    assert.deepEqual(config.from, { name: 'NinoRepair Website', address: env.SMTP_FROM });
  }
});
