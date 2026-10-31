import test from 'node:test';
import assert from 'node:assert/strict';
import { quotePilot } from '../server/quote-pilot.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const key = 'test-key'.repeat(5);
const sample = '8123456789abcdef';
async function relay({ origin = 'https://ninorepair.com', body = { reference: sample }, gpc, status = 200, secret = key } = {}) {
  let sent;
  const handler = quotePilot(secret, async (_url, options) => {
    sent = options; return Response.json({ active: true, arm: 'B' }, { status });
  });
  const res = { code: 200, set() {}, status(n) { this.code = n; return this; }, json(v) { this.body = v; } };
  const headers = { Origin: origin, 'Sec-GPC': gpc };
  await handler({ method:'POST', get: k => headers[k], body }, res);
  return { res, sent };
}
test('relay only forwards the opaque reference and authenticates server-side', async () => {
  const { res, sent } = await relay(); assert.deepEqual(res.body, {active:true, arm:'B'});
  assert.deepEqual(JSON.parse(sent.body), {reference:sample}); assert.equal(sent.headers.Authorization, 'Bearer ' + key);
});
test('invalid origin, extra contact data, privacy opt-out and missing key never reach storage', async () => {
  for (const args of [{origin:'https://example.org'}, {body:{reference:sample, phone:'private'}}, {gpc:'1'}, {secret:''}]) {
    assert.equal((await relay(args)).sent, undefined);
  }
  assert.deepEqual((await relay({status:500})).res.body,{active:false});
});
const script = readFileSync(new URL('../public/js/quote-pilot.js',import.meta.url),'utf8');
async function render(armByte, fail = false, gpc = false) {
  const base = 'sms:+19545080246?body=Hi%20Nino';
  const link = { href:base, textContent:'Text Nino for a quote' };
  let seen, payload, check;
  class Observer { constructor(cb) { check = cb; } observe() {} disconnect() {} }
  const context = { window:{IntersectionObserver:Observer, crypto:{getRandomValues(a) { a.fill(armByte); return a; }}},
    document:{getElementById:()=>link, visibilityState:'visible', addEventListener(){}}, navigator:{globalPrivacyControl:gpc},
    location:{hostname:'ninorepair.com'}, IntersectionObserver:Observer, Date:class extends Date { static now(){ return Date.parse('2026-11-01T12:00:00Z'); } },
    sessionStorage:{getItem(){return seen}, setItem(_,v){seen=v}}, fetch:async (_,opts)=>{ payload=JSON.parse(opts.body); return { ok:!fail, json:async()=>({arm:armByte<128?'A':'B'}) }; } };
  context.crypto=context.window.crypto;
  vm.runInNewContext(script,context); check?.([{intersectionRatio:1}]); await new Promise(setImmediate);
  return {link,payload,base};
}
test('both labels open the same SMS text plus receipt reference, without sending a quote', async () => {
  for (const [byte,title] of [[1,'Contact us'],[250,'Request a repair quote']]) {
    const {link,payload,base}=await render(byte); assert.equal(link.textContent,title);
    assert.equal(decodeURIComponent(link.href),decodeURIComponent(base)+'\nRef: NR-'+payload.reference.toUpperCase());
  }
});
test('ordinary SMS stays usable when offline or privacy signals are set', async () => {
  for (const [fail,gpc] of [[true,false],[false,true]]) {
    const {link,base,payload}=await render(1,fail,gpc); assert.equal(link.href,base); if(gpc)assert.equal(payload,undefined);
  }
});
