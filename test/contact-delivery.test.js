import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { leadHandler } from '../server/contact-delivery.js';

const payload = { name: 'Synthetic Customer', phone: '(202) 555-0100', email: 'qa@example.com', city: 'Hollywood', service: 'Airbnb / property care', message: '<script>literal customer text</script>\nSecond line', ref: 'EST-ABCD' };
const receipt = { accepted: ['owner@example.com'], rejected: [], response: '250 queued' };
async function fixture(t, sendMail = async () => receipt) {
  const calls = [], logs = [];
  const app = express();
  app.use(express.json());
  app.post('/api/lead', leadHandler({
    mailer: sendMail && { sendMail: async message => { calls.push(message); return sendMail(message); } },
    from: { name: 'NinoRepair Website', address: 'website@example.com' }, to: 'owner@example.com',
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const post = async (body = payload, headers = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/lead`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://ninorepair.com', ...headers }, body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
  };
  return { calls, logs, post };
}

test('valid request returns only SMTP acceptance, uses fixed owner and safe reply-to', async t => {
  const { post, calls, logs } = await fixture(t);
  const res = await post();
  assert.equal(res.status, 202);
  assert.deepEqual(res.body, { ok: true, delivery: 'accepted' });
  assert.match(res.cache, /no-store/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].to, 'owner@example.com');
  assert.equal(calls[0].replyTo, payload.email);
  assert.equal(calls[0].from.address, 'website@example.com');
  assert.match(calls[0].text, /<script>literal customer text<\/script>/);
  assert.equal(calls[0].html, undefined);
  assert.deepEqual(logs, [['[lead] smtp_accepted']]);
});

test('disabled transport refuses honestly without storing or logging customer details', async t => {
  const { post, calls, logs } = await fixture(t, null);
  const res = await post();
  assert.equal(res.status, 503);
  assert.equal(res.body.delivery, 'unavailable');
  assert.equal(res.body.ok, undefined);
  assert.deepEqual(calls, []);
  assert.deepEqual(logs, []);
});

for (const [name, send] of [
  ['SMTP rejection', async () => ({ ...receipt, accepted: [], rejected: ['owner@example.com'] })],
  ['wrong recipient', async () => ({ ...receipt, accepted: ['other@example.com'] })],
  ['missing receipt', async () => undefined],
  ['transport exception', async () => { throw new Error('credential and qa@example.com must not appear'); }],
]) test(`${name} never confirms success or leaks raw provider details`, async t => {
  const { post, calls, logs } = await fixture(t, send);
  const res = await post();
  assert.equal(res.status, 502);
  assert.equal(res.body.ok, undefined);
  assert.equal(res.body.delivery, 'unconfirmed');
  assert.match(res.body.error, /delayed email may still arrive/);
  assert.equal(calls.length, 1);
  assert.deepEqual(logs, [['[lead] acceptance_unconfirmed']]);
  assert.doesNotMatch(JSON.stringify(res), /qa@example|credential/);
});

test('invalid fields, injection attempts, honeypots and extra routing fields never send', async t => {
  const { post, calls } = await fixture(t);
  for (const patch of [
    { name: '   ' }, { name: 'Customer\r\nBcc: other@example.com' }, { phone: 'abcdefg' },
    { phone: '123456' }, { phone: '1234567890123456' }, { email: 'not-an-email' },
    { email: 'a@example.com\r\nBcc: other@example.com' }, { email: 'a@example.com,b@example.com' },
    { city: 'City\nBcc: x' }, { service: 'x'.repeat(121) }, { message: 'x'.repeat(3001) },
    { message: 'null\0byte' }, { source: 'arbitrary' }, { website: 'bot' },
    { ref: 'x\r\nBcc' }, { to: 'attacker@example.com' }, { attachments: [] },
  ]) {
    const res = await post({ ...payload, ...patch });
    assert.equal(res.status, 400, JSON.stringify(patch).slice(0, 90));
    assert.equal(res.body.ok, undefined);
  }
  assert.deepEqual(calls, []);
});

test('foreign/missing origins, cross-site requests and non-JSON bodies never send', async t => {
  const { post, calls } = await fixture(t);
  for (const Origin of ['', 'null', 'https://ninorepair.com.attacker.test', 'http://ninorepair.com', 'https://other.example']) {
    assert.equal((await post(payload, { Origin })).status, 403);
  }
  assert.equal((await post(payload, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await post(payload, { 'Content-Type': 'text/plain' })).status, 415);
  assert.deepEqual(calls, []);
});

test('www origin, formatted phones and optional empty email remain supported', async t => {
  const { post, calls } = await fixture(t);
  assert.equal((await post({ name: '  Synthetic Customer  ', phone: '+1 (202) 555-0100', email: '' }, { Origin: 'https://www.ninorepair.com' })).status, 202);
  assert.equal(calls[0].replyTo, undefined);
  assert.match(calls[0].text, /Name:    Synthetic Customer\n/);
});
