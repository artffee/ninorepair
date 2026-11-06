import test from 'node:test';
import assert from 'node:assert/strict';
import { sendOwnerEmail } from '../server/email-delivery.js';

test('owner email requires recipient acceptance, not just a resolved send', async () => {
  for (const receipt of [undefined, {}, { accepted: [], rejected: ['owner@example.com'] }]) {
    await assert.rejects(sendOwnerEmail({ sendMail: async () => receipt }, {}), /did not accept/);
  }
});
test('transport errors propagate and accepted mail retains provider evidence', async () => {
  await assert.rejects(sendOwnerEmail({ sendMail: async () => { throw new Error('offline'); } }, {}), /offline/);
  const receipt = { accepted: ['owner@example.com'], messageId: 'synthetic-test' };
  let received;
  const message = { to: 'owner@example.com', text: 'Local unit test only' };
  assert.equal(await sendOwnerEmail({ sendMail: async value => { received = value; return receipt; } }, message), receipt);
  assert.equal(received, message);
});
