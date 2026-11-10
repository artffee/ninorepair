import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../public/js/delivery.js', import.meta.url), 'utf8');
async function prepare(health = 'offline', source = 'ChatGPT', formId = 'lead-form') {
  const fields = { 'l-name': 'Local Test', 'l-phone': '2025550100', 'l-city': 'Fort Lauderdale',
    'l-service': 'TV mounting', 'l-msg': '<script>not executable</script>', 'l-source': source,
    'l-email': 'qa@example.com', 'rl-name': 'Estimate Test', 'rl-phone': '2025550101' };
  const service = { value: fields['l-service'], options: [{ value: 'TV mounting' }, { value: 'Airbnb / property care' }] };
  const callbacks = {};
  const label = { textContent: 'Send' };
  const status = { textContent: '', children: [], replaceChildren() { this.children = []; }, append(...nodes) { this.children.push(...nodes); } };
  let note, onSubmit, requests = [];
  const form = { id: formId, dataset: { estimateRef: 'NR-local-test' }, matches: () => true, prepend(n) { note = n; },
    querySelector(selector) {
      if (selector.includes('btn-label')) return label;
      if (selector === '.delivery-note') return note;
      if (selector === '[role="status"]') return status;
      if (formId === 'res-lead' && selector.startsWith('#l-')) return null;
      if (selector === '#l-service') return service;
      return { value: fields[selector.slice(1)] || '' };
    } };
  const document = { querySelectorAll: () => [form], querySelector(selector) {
      if (selector === '#lead-form') return form;
      if (selector === '#city') return { value: 'Hollywood' };
      if (selector === '#desc') return { value: 'Rental door needs adjustment' };
      if (selector === '.res-title') return { textContent: 'Door adjustment' };
      if (selector === '.res-price') return { textContent: '$95–$190 ballpark' };
      return null;
    },
    addEventListener(type, callback) { callbacks[type] = callback; if (type === 'submit') onSubmit = callback; },
    createElement(tag) { return { tag, style: {}, setAttribute() {}, remove() { note = undefined; } }; } };
  vm.runInNewContext(script, { document, fetch: async url => {
    requests.push(url);
    if (health === 'offline') throw new Error('offline');
    return { ok: health !== 'http-error', json: async () => health === 'unknown' ? {} : { contactDelivery: health === 'ready' } };
  } });
  await new Promise(setImmediate);
  let prevented = false;
  onSubmit({ target: form, preventDefault() { prevented = true; }, stopImmediatePropagation() {} });
  return { label, status, requests, prevented, fields, form, callbacks, service, submit: () => onSubmit({ target: form, preventDefault() {}, stopImmediatePropagation() {} }) };
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


test('prepared request retains the email that the visitor entered', async () => {
  const { status } = await prepare();
  assert.match(status.children[2].value, /Email: qa@example.com/);
});

test('estimate follow-up retains its reference, city, original problem and range', async () => {
  const { status, requests } = await prepare('offline', '', 'res-lead');
  const message = status.children[2].value;
  for (const text of ['Estimate Test', 'NR-local-test', 'Hollywood', 'Rental door needs adjustment', 'Door adjustment', '$95–$190']) {
    assert.ok(message.includes(text), `Missing ${text}`);
  }
  assert.deepEqual(requests, ['/api/health']);
});

test('property-care CTA selects the right service, keeps details and invalidates an old draft', async () => {
  const { callbacks, service, fields, status, submit } = await prepare();
  callbacks.click({ target: { closest: () => ({ dataset: { contactService: 'Airbnb / property care' } }) } });
  assert.equal(service.value, 'Airbnb / property care');
  assert.deepEqual(status.children, []);
  assert.equal(fields['l-msg'], '<script>not executable</script>');
  submit();
  assert.match(status.children[2].value, /Airbnb \/ property care/);
});

test('editing request details removes the stale draft until it is prepared again', async () => {
  for (const type of ['input', 'change']) {
    const { callbacks, form, fields, status, submit } = await prepare();
    fields['l-msg'] = 'Updated check-in time';
    callbacks[type]({ target: { closest: () => form } });
    assert.deepEqual(status.children, []);
    submit();
    assert.match(status.children[2].value, /Updated check-in time/);
    assert.doesNotMatch(status.children[2].value, /not executable/);
  }
});
