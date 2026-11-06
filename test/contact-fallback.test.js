import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../public/js/delivery.js', import.meta.url), 'utf8');
async function prepare(health = 'offline', source = 'ChatGPT') {
  const fields = { 'l-name': 'Local Test', 'l-phone': '2025550100', 'l-city': 'Fort Lauderdale',
    'l-service': 'TV mounting', 'l-msg': '<script>not executable</script>', 'l-source': source };
  const label = { textContent: 'Send' };
  const status = { textContent: '', children: [], replaceChildren() { this.children = []; }, append(...nodes) { this.children.push(...nodes); } };
  let note, onSubmit, requests = [];
  const form = { id: 'lead-form', matches: () => true, prepend(n) { note = n; },
    querySelector(selector) {
      if (selector.includes('btn-label')) return label;
      if (selector === '.delivery-note') return note;
      if (selector === '[role="status"]') return status;
      return { value: fields[selector.slice(1)] || '' };
    } };
  const document = { querySelectorAll: () => [form], querySelector: () => null,
    addEventListener(type, callback) { if (type === 'submit') onSubmit = callback; },
    createElement(tag) { return { tag, style: {}, setAttribute() {}, remove() { note = undefined; } }; } };
  vm.runInNewContext(script, { document, fetch: async url => {
    requests.push(url);
    if (health === 'offline') throw new Error('offline');
    return { ok: health !== 'http-error', json: async () => health === 'unknown' ? {} : { contactDelivery: health === 'ready' } };
  } });
  await new Promise(setImmediate);
  let prevented = false;
  onSubmit({ target: form, preventDefault() { prevented = true; }, stopImmediatePropagation() {} });
  return { label, status, requests, prevented };
}

test('offline, failed, missing and disabled delivery all prepare a reviewable draft without sending a lead', async () => {
  for (const health of ['offline', 'http-error', 'unknown', 'disabled']) {
    const { label, status, requests, prevented } = await prepare(health);
    assert.equal(label.textContent, 'Prepare text to Nino');
    assert.equal(prevented, true);
    assert.deepEqual(requests, ['/api/health']);
    assert.match(status.children[0].textContent, /Not sent yet/);
    const sms = decodeURIComponent(status.children[1].href);
    assert.match(sms, /Found via: ChatGPT/);
    assert.match(sms, /<script>not executable<\/script>/);
    assert.equal(status.children[2].value, sms.split('?body=')[1]);
  }
});

test('unspecified discovery source remains unspecified', async () => {
  const { status } = await prepare('offline', '');
  assert.doesNotMatch(decodeURIComponent(status.children[1].href), /Found via/);
});

test('only confirmed online delivery permits the existing submit handler', async () => {
  const { label, prevented, status } = await prepare('ready');
  assert.equal(label.textContent, 'Send request to Nino');
  assert.equal(prevented, false);
  assert.deepEqual(status.children, []);
});
