import test from 'node:test';
import assert from 'node:assert/strict';

test('serverless without email advertises unavailable delivery and never accepts a lost inquiry', async () => {
  process.env.VERCEL = '1';
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'LOCAL QA ONLY', phone: '2025550100', message: 'Synthetic test; no delivery configured.' }),
    });
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.match(body.error, /call or text/);
    assert.equal(body.ok, undefined);
    const invalid = await fetch(`${base}/api/lead`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(invalid.status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
