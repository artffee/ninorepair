import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const scripts = ['delivery', 'main'].map(name => readFileSync(new URL(`../public/js/${name}.js`, import.meta.url), 'utf8'));
const flush = () => new Promise(setImmediate);
async function setup(t, mode) {
  // No resource loader: no network, email, SMS, analytics or AI calls.
  const dom = new JSDOM(html, { url: 'https://ninorepair.com', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, d = w.document, requests = [];
  t.after(() => w.close());
  w.matchMedia = () => ({ matches: true });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.AbortSignal.timeout = () => new w.AbortController().signal;
  w.fetch = async (url, options) => {
    if (url === '/api/health') return { ok: true, json: async () => ({ contactDelivery: mode !== 'disabled' }) };
    if (url === '/api/estimate') return { ok: true, json: async () => ({ ref: 'EST-ABCD', delivery: 'unavailable', estimate: { jobTitle: 'Synthetic door repair', bucket: 'handyman', priceLow: 95, priceHigh: 190, summary: 'Synthetic only' } }) };
    assert.equal(url, '/api/lead');
    requests.push(JSON.parse(options.body));
    if (mode === 'network-error') throw new Error('Synthetic offline');
    if (mode === 'timeout') throw new DOMException('Synthetic timeout', 'TimeoutError');
    if (mode === 'invalid-json') return { status: 200, json: async () => { throw new Error('invalid JSON'); } };
    return {
      status: { accepted: 202, rejected: 502, 'legacy-ok': 200, validation: 400, unavailable: 503 }[mode],
      json: async () => mode === 'accepted' ? { ok: true, delivery: 'accepted' } : mode === 'legacy-ok' ? { ok: true } : mode === 'validation' ? { error: 'Please check your optional email.' } : { delivery: mode === 'unavailable' ? 'unavailable' : 'unconfirmed' },
    };
  };
  scripts.forEach(script => w.eval(script));
  await flush();
  const set = (id, value) => { d.querySelector(id).value = value; d.querySelector(id).dispatchEvent(new w.Event('input', { bubbles: true })); };
  const submit = async id => { d.querySelector(id).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await flush(); };
  return { w, d, requests, set, submit };
}

for (const mode of ['disabled', 'accepted', 'rejected', 'legacy-ok', 'network-error', 'timeout', 'invalid-json', 'validation', 'unavailable']) {
  test(`actual homepage scripts: ${mode} preserves honest contact status`, async t => {
    const { w, d, requests, set, submit } = await setup(t, mode);
    set('#l-name', 'Synthetic Customer'); set('#l-phone', '2025550100');
    set('#l-email', 'qa@example.com'); set('#l-msg', 'Synthetic repair details');
    d.querySelector('[data-contact-service="Airbnb / property care"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await submit('#lead-form');
    const status = d.querySelector('#lead-msg').textContent;
    assert.equal(d.querySelector('#lead-go').disabled, false);
    if (mode === 'accepted') {
      assert.match(status, /accepted by the email service/);
      assert.match(status, /Inbox arrival is not yet confirmed/);
      assert.equal(d.querySelector('#l-name').value, '');
    } else {
      assert.equal(d.querySelector('#l-name').value, 'Synthetic Customer');
      if (mode === 'validation') assert.match(status, /check your optional email/);
      else {
        const draft = d.querySelector('#lead-msg textarea').value;
        for (const value of ['qa@example.com', 'Airbnb / property care', 'Synthetic repair details']) assert.ok(draft.includes(value));
        assert.match(status, ['disabled', 'unavailable'].includes(mode) ? /Not sent yet/ : /could not be confirmed/);
        set('#l-msg', 'Updated synthetic details');
        assert.equal(d.querySelector('#lead-msg textarea'), null);
        await submit('#lead-form');
        assert.match(d.querySelector('#lead-msg textarea').value, /Updated synthetic details/);
      }
    }
    assert.equal(requests.length, mode === 'disabled' ? 0 : 1);
    if (requests.length) assert.equal(requests[0].service, 'Airbnb / property care');
  });
}

for (const mode of ['disabled', 'accepted', 'rejected', 'legacy-ok', 'network-error']) {
  test(`actual estimate follow-up scripts: ${mode} retains context and truthful status`, async t => {
    const { d, requests, set, submit } = await setup(t, mode);
    set('#desc', 'Synthetic sticking door'); set('#city', 'Hollywood');
    await submit('#est-form');
    set('#rl-name', 'Synthetic Followup'); set('#rl-phone', '2025550101');
    await submit('#res-lead');
    assert.equal(d.querySelector('#rl-go').disabled, false);
    if (mode === 'accepted') assert.match(d.querySelector('#rl-msg').textContent, /Inbox arrival is not yet confirmed/);
    else {
      const draft = d.querySelector('#rl-msg textarea').value;
      for (const value of ['EST-ABCD', 'Hollywood', 'Synthetic sticking door', 'Synthetic door repair']) assert.ok(draft.includes(value));
      assert.match(d.querySelector('#rl-msg').textContent, mode === 'disabled' ? /Not sent yet/ : /could not be confirmed/);
    }
    assert.equal(requests.length, mode === 'disabled' ? 0 : 1);
    if (requests.length) assert.equal(requests[0].ref, 'EST-ABCD');
  });
}
