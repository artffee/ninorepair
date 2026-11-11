import test from 'node:test';
import assert from 'node:assert/strict';

test('serverless without email advertises unavailable delivery and never accepts a lost inquiry', async () => {
  process.env.VERCEL = '1';
  delete process.env.CONTACT_DELIVERY_ENABLED;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  const { default: app } = await import('../server/app.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${base}/api/health`).then(r => r.json());
    assert.equal(health.contactDelivery, false);
    const response = await fetch(`${base}/api/lead`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://ninorepair.com' },
      body: JSON.stringify({ name: 'LOCAL QA ONLY', phone: '2025550100', message: 'Synthetic test; no delivery configured.' }),
    });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.match(body.error, /send a text, or call/);
    assert.equal(body.ok, undefined);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const malformed = await fetch(`${base}/api/lead`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://ninorepair.com' }, body: '{"private_marker":',
    });
    assert.equal(malformed.status, 400);
    assert.doesNotMatch(await malformed.text(), /private_marker|SyntaxError|stack/);
    const oversized = await fetch(`${base}/api/lead`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://ninorepair.com' }, body: JSON.stringify({ message: 'x'.repeat(300000) }),
    });
    assert.equal(oversized.status, 413);
    assert.match(oversized.headers.get('cache-control'), /no-store/);
    const invalid = await fetch(`${base}/api/lead`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://ninorepair.com' }, body: '{}',
    });
    assert.equal(invalid.status, 400);
    // Optional attribution must not be mandatory or accept arbitrary content.
    for (const source of ['ChatGPT', '', 'unrecognized injected value']) {
      const r = await fetch(`${base}/api/lead`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://ninorepair.com' },
        body: JSON.stringify({ name: 'LOCAL QA ONLY', phone: '2025550100', source }),
      });
      assert.equal(r.status, source === 'unrecognized injected value' ? 400 : 503);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
