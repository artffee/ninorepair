import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const publicDir = new URL('../public/', import.meta.url);
const source = readFileSync(new URL('js/analytics.js', publicDir), 'utf8');
function run(hostname = 'ninorepair.com', navigator = {}) {
  const appended = [];
  const window = {};
  vm.runInNewContext(source, {
    window, navigator, location: { hostname }, URL,
    document: { createElement: () => ({}), head: { appendChild: el => appended.push(el) } },
  });
  return { appended, window };
}

test('each public HTML page includes the deferred analytics loader once', () => {
  const pages = readdirSync(publicDir, { recursive: true }).filter(path => path.endsWith('.html'));
  assert.ok(pages.length >= 18);
  for (const page of pages) {
    const html = readFileSync(new URL(page, publicDir), 'utf8');
    assert.equal((html.match(/<script src="\/js\/analytics\.js\?v=[a-f0-9]+" defer><\/script>/g) || []).length, 1, page);
  }
});

test('both production domains load analytics with a queued privacy filter', () => {
  for (const host of ['ninorepair.com', 'www.ninorepair.com']) {
    const { appended, window } = run(host);
    assert.equal(appended.length, 1);
    assert.equal(appended[0].src, '/_vercel/insights/script.js');
    assert.equal(appended[0].defer, true);
    assert.equal(window.vaq[0][0], 'beforeSend');
    const event = { type: 'pageview', url: 'https://' + host + '/services/tv-mounting/?email=private&token=secret#personal-message' };
    assert.equal(window.vaq[0][1](event).url, 'https://' + host + '/services/tv-mounting/');
    assert.ok(event.url.includes('private'), 'the original event is not mutated');
  }
});

test('previews, local development, and privacy opt-outs send no analytics', () => {
  for (const [host, navigator] of [
    ['localhost', {}], ['ninorepair-preview.vercel.app', {}],
    ['ninorepair.com', { globalPrivacyControl: true }],
    ['ninorepair.com', { doNotTrack: '1' }],
  ]) {
    const { appended, window } = run(host, navigator);
    assert.equal(appended.length, 0);
    assert.equal(window.va, undefined);
  }
});
