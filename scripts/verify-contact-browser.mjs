// Local browser checks only. All delivery/AI API outcomes are intercepted;
// external network requests are blocked. No email, SMS or AI request is sent.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw new Error('Install Playwright to run browser checks.');
  ({ chromium } = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright')));
}
process.env.CONTACT_DELIVERY_ENABLED = 'false';
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
delete process.env.NINO_PILOT_KEY;
const { default: app } = await import('../server/app.js');
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
let passed = 0;
try {
  for (const width of [390, 320]) {
    for (const mode of ['disabled', 'accepted', 'rejected', 'legacy-ok', 'network-error', 'validation']) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [], sent = [];
      page.on('pageerror', err => errors.push(err.message));
      await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
      await page.route('**/api/health', route => route.fulfill({ json: { contactDelivery: mode !== 'disabled' } }));
      await page.route('**/api/lead', route => {
        sent.push(route.request().postDataJSON());
        if (mode === 'network-error') return route.abort();
        return route.fulfill({
          status: { accepted: 202, rejected: 502, 'legacy-ok': 200, validation: 400 }[mode] || 503,
          json: mode === 'accepted' ? { ok: true, delivery: 'accepted' } : mode === 'legacy-ok' ? { ok: true } : mode === 'validation' ? { error: 'Please check your optional email.' } : { delivery: 'unconfirmed' },
        });
      });
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.locator('#l-name').fill('Synthetic Browser Test');
      await page.locator('#l-phone').fill('2025550100');
      await page.locator('#l-email').fill('qa@example.com');
      await page.locator('#l-msg').fill('Synthetic repair request');
      await page.locator('[data-contact-service="Airbnb / property care"]').first().click();
      assert.equal(await page.locator('#l-service').inputValue(), 'Airbnb / property care');
      await page.locator('#lead-go').click();
      await page.waitForFunction(() => !document.querySelector('#lead-go').disabled);
      const status = await page.locator('#lead-msg').innerText();
      if (mode === 'accepted') {
        assert.match(status, /accepted by the email service/);
        assert.match(status, /Inbox arrival is not yet confirmed/);
        assert.equal(await page.locator('#l-name').inputValue(), '');
      } else if (mode === 'validation') {
        assert.match(status, /check your optional email/);
        assert.equal(await page.locator('#l-name').inputValue(), 'Synthetic Browser Test');
      } else {
        await page.locator('#lead-msg textarea').waitFor();
        const draft = await page.locator('#lead-msg textarea').inputValue();
        assert.match(draft, /Airbnb \/ property care/);
        assert.match(draft, /qa@example.com/);
        assert.match(draft, /Synthetic repair request/);
        assert.equal(await page.locator('#l-name').inputValue(), 'Synthetic Browser Test');
        assert.match(status, mode === 'disabled' ? /Not sent yet/ : /could not be confirmed/);
        if (mode !== 'disabled') assert.doesNotMatch(await page.locator('#lead-form .delivery-note').innerText(), /Nothing is sent automatically/);
        await page.locator('#l-msg').fill('Updated synthetic request');
        assert.equal(await page.locator('#lead-msg textarea').count(), 0);
        await page.locator('#lead-go').click();
        assert.match(await page.locator('#lead-msg textarea').inputValue(), /Updated synthetic request/);
        if (width === 390 && mode === 'rejected' && process.env.NINO_BROWSER_SCREENSHOT) {
          await page.locator('#lead-form').screenshot({ path: process.env.NINO_BROWSER_SCREENSHOT });
        }
      }
      assert.equal(sent.length, mode === 'disabled' ? 0 : 1);
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await context.close();
      passed++;
    }
  }
  for (const mode of ['accepted', 'rejected']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const sent = [];
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await page.route('**/api/health', route => route.fulfill({ json: { contactDelivery: true } }));
    await page.route('**/api/estimate', route => route.fulfill({ json: { ref: 'EST-ABCD', delivery: 'unavailable', estimate: { bucket: 'handyman', jobTitle: 'Synthetic door adjustment', priceLow: 95, priceHigh: 190, confidence: 'medium', summary: 'Synthetic estimate only' } } }));
    await page.route('**/api/lead', route => {
      sent.push(route.request().postDataJSON());
      return route.fulfill({ status: mode === 'accepted' ? 202 : 502, json: mode === 'accepted' ? { ok: true, delivery: 'accepted' } : { delivery: 'unconfirmed' } });
    });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('#desc').fill('Synthetic sticking door');
    await page.locator('#city').fill('Hollywood');
    await page.locator('#est-go').click();
    await page.locator('#rl-name').fill('Synthetic Followup');
    await page.locator('#rl-phone').fill('2025550101');
    await page.locator('#rl-go').click();
    await page.waitForFunction(() => !document.querySelector('#rl-go').disabled);
    if (mode === 'accepted') assert.match(await page.locator('#rl-msg').innerText(), /Inbox arrival is not yet confirmed/);
    else {
      const draft = await page.locator('#rl-msg textarea').inputValue();
      for (const value of ['EST-ABCD', 'Hollywood', 'Synthetic sticking door', 'Synthetic door adjustment']) assert.ok(draft.includes(value));
    }
    assert.equal(sent.length, 1);
    assert.equal(sent[0].ref, 'EST-ABCD');
    await context.close();
    passed++;
  }
  console.log(`${passed} browser scenarios passed; all delivery/AI responses mocked and external traffic blocked.`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
