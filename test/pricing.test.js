import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { PRICE_BOOK } from '../server/knowledge.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const dollars = text => [...text.matchAll(/\$\d+(?:,\d{3})*(?:\.\d+)?/g)].map(match => match[0]);
const text = html => html.replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity) => {
  if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
  if (entity.startsWith('#')) return String.fromCodePoint(Number(entity.slice(1)));
  return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }[entity];
}).replace(/\s+/g, ' ').trim();

// Read the actual price book, rather than maintaining a competing list of rates.
// A missing/renamed source row fails explicitly and requires a pricing review.
function price(prefix, index = 0) {
  const rows = PRICE_BOOK.split('\n').filter(line => line.startsWith(`- ${prefix}`));
  assert.equal(rows.length, 1, `Expected one price-book row for ${prefix}`);
  const values = dollars(rows[0]);
  assert.ok(values[index], `Missing price ${index} for ${prefix}`);
  return values[index];
}

const tv = price('TV mount 32"');
const assembly = price('Furniture assembly, standard item');
const complex = price('Complex assembly');
const patch = price('Small drywall patch');
const lock = price('Lockset or deadbolt swap');
const smartLock = price('Lockset or deadbolt swap', 2);
const door = price('Door adjustment');
const roller = price('Sliding glass door roller replacement');
const panel = price('Lanai / pool cage re-screen');
const panelHigh = price('Lanai / pool cage re-screen', 1);
const panelMinimum = price('Lanai / pool cage re-screen', 2);
const driveway = price('Pressure wash driveway');
const gutters = price('Gutter cleaning, single-story');
const shutter = price('Hurricane panel install');
const accordion = price('Hurricane accordion shutter service');
const shutterMinimum = price('Hurricane accordion shutter service', 2);
const grabBar = price('Grab bar into blocking');
const grabBarBundle = price('Grab bar into blocking', 2);
const regrout = price('Regrout a standard shower');
const caulk = price('Shower re-caulk');
const backsplash = price('Backsplash caulk');
const tile = price('Replace cracked floor tiles');

// These are scope assertions, not just a bag of allowed numbers: $65 may be
// correct for assembly on the TV page but must never label TV mounting itself.
const contracts = {
  'drywall-repair-painting': {
    badges: [`Small drywall patches from ${patch}`],
    description: [`Small drywall patches under 6 inches from ${patch}`],
    faqs: { 'How much does a drywall patch cost in Fort Lauderdale?': [`Small patches under 6 inches start at ${patch}`] },
  },
  'tv-mounting': {
    badges: [`TV mounting from ${tv}`, `Furniture assembly from ${assembly}`],
    description: [`TV mounting into studs from ${tv} for 32–55 inch screens`, `Furniture assembly from ${assembly} for standard items`],
    faqs: {
      'How much is TV mounting?': [`TV mounts into studs start at ${tv} for 32–55 inch screens`],
      'How much does furniture assembly cost?': [`Standard furniture assembly starts at ${assembly} per item`, `Complex items such as wardrobes, bunk beds and treadmills start at ${complex}`],
    },
  },
  'door-lock-smart-lock-repair': {
    badges: [`Lockset or deadbolt swaps from ${lock}`],
    description: [`Lockset or deadbolt swaps from ${lock}`, `smart lock installation and setup from ${smartLock}`],
    faqs: { 'How much do door and lock repairs cost?': [`Lockset or deadbolt swaps start at ${lock}`, `Door adjustments start at ${door}`, `smart lock installation and setup at ${smartLock}`, `sliding glass door roller replacement at ${roller} per door`] },
  },
  'pool-cage-rescreening': {
    badges: [`Panels from ${panel} each · ${panelMinimum} minimum visit`],
    description: [`Panels from ${panel} each, with a ${panelMinimum} minimum visit`],
    faqs: { 'How much does it cost to rescreen a pool cage panel?': [`Single panels run ${panel}–${panelHigh} each, with a ${panelMinimum} minimum visit`] },
  },
  'pressure-washing-hurricane-prep': {
    badges: [`Driveway washing from ${driveway}`, `Gutter cleaning from ${gutters}`],
    description: [`Two-car driveway washing from ${driveway}`, `single-story gutter cleaning from ${gutters}`],
    faqs: { 'How much do pressure washing and hurricane prep cost?': [`Two-car driveway washing starts at ${driveway}`, `Single-story gutter cleaning starts at ${gutters}`, `Existing hurricane panel installation or removal starts at ${shutter} per opening`, `accordion shutter service starts at ${accordion} per opening with a ${shutterMinimum} minimum`] },
  },
  'tile-grout-grab-bars': {
    badges: [`Grab bars from ${grabBar} each`, `Shower regrouting from ${regrout}`],
    description: [`Grab bars from ${grabBar} each`, `standard shower regrouting from ${regrout}`],
    faqs: { 'How much do grab bars and grout repairs cost?': [`Grab bars into blocking or block wall start at ${grabBar} each, or ${grabBarBundle} each for three or more`, `Standard shower regrouting starts at ${regrout}`, `shower re-caulking at ${caulk}`, `backsplash caulk and touch-up at ${backsplash}`, `Replacing one to four cracked floor tiles starts at ${tile}`] },
  },
};

function claims(actual, expected, label) {
  for (const claim of expected) assert.ok(actual.includes(claim), `${label}: missing "${claim}"`);
  assert.deepEqual(dollars(actual), dollars(expected.join(' ')), `${label}: unexpected or conflicting prices`);
}

function checkService(html, contract) {
  const badges = [...html.matchAll(/<span\b[^>]*class="[^"]*\bpg-price\b[^"]*"[^>]*>([\s\S]*?)<\/span>/g)].map(m => text(m[1]));
  assert.deepEqual(badges, contract.badges, 'Hero prices must name the job and match the price book');
  const graphs = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .flatMap(m => { const data = JSON.parse(m[1]); return data['@graph'] || [data]; });
  const service = graphs.find(node => node['@type'] === 'Service');
  assert.ok(service, 'Missing Service schema');
  claims(service.description, contract.description, 'Service schema description');
  for (const selector of ['name="description"', 'property="og:description"']) {
    const meta = html.match(new RegExp(`<meta\\b[^>]*${selector}[^>]*content="([^"]*)"[^>]*>`));
    assert.ok(meta, `Missing ${selector}`);
    assert.equal(text(meta[1]), service.description, `${selector} must match Service schema`);
  }
  const visibleFAQs = [...html.matchAll(/<details\b[^>]*class="faq-q"[^>]*>([\s\S]*?)<\/details>/g)].map(m => ({
    question: text(m[1].match(/<summary>([\s\S]*?)<\/summary>/)[1]),
    answer: text(m[1].match(/<p>([\s\S]*?)<\/p>/)[1]),
  }));
  const faq = graphs.find(node => node['@type'] === 'FAQPage');
  assert.ok(faq, 'Missing FAQ schema');
  assert.deepEqual(visibleFAQs, faq.mainEntity.map(q => ({ question: q.name, answer: q.acceptedAnswer.text })), 'Visible FAQ and JSON-LD must agree');
  for (const [question, expected] of Object.entries(contract.faqs)) {
    const answer = visibleFAQs.find(q => q.question === question)?.answer;
    assert.ok(answer, `Missing pricing FAQ: ${question}`);
    claims(answer, expected, question);
  }
}

function checkCity(html) {
  const grids = [...html.matchAll(/<ul\b[^>]*class="[^"]*\blink-grid\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/g)].map(m => m[1]).join('');
  const links = [...grids.matchAll(/<a\b[^>]*href="(\/services\/[^\"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m => ({
    href: m[1], title: text(m[2].match(/<b>([\s\S]*?)<\/b>/)[1]),
    badges: [...m[2].matchAll(/<span>([\s\S]*?)<\/span>/g)].map(span => text(span[1])),
  }));
  assert.equal(links.length, 7, 'All six services plus separate furniture assembly must be linked');
  for (const [slug, contract] of Object.entries(contracts)) {
    const matches = links.filter(link => link.href === `/services/${slug}/`);
    assert.equal(matches.length, 1, `Expected one city link for ${slug}`);
    const expected = slug === 'tv-mounting' ? contract.badges.slice(0, 1) : contract.badges;
    assert.deepEqual(matches[0].badges, expected, `City price mismatch: ${slug}`);
    if (slug === 'tv-mounting') assert.equal(matches[0].title, 'TV Mounting');
  }
  const furniture = links.filter(link => link.href === '/services/tv-mounting/#furniture-assembly');
  assert.equal(furniture.length, 1, 'Furniture assembly needs its own city link');
  assert.equal(furniture[0].title, 'Furniture Assembly');
  assert.deepEqual(furniture[0].badges, [`Furniture assembly from ${assembly}`]);
}

test('every service directory has a pricing contract', () => {
  const dirs = readdirSync(new URL('public/services/', root), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
  assert.deepEqual(dirs, Object.keys(contracts).sort());
});
for (const [slug, contract] of Object.entries(contracts)) {
  test(`${slug}: badges, metadata, visible FAQ and JSON-LD match authoritative prices`, () => {
    checkService(read(`public/services/${slug}/index.html`), contract);
  });
}
const cities = readdirSync(new URL('public/handyman/', root), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
test('city audit includes all existing city pages', () => assert.ok(cities.length >= 9));
for (const city of cities) {
  test(`${city}: service grid keeps starting prices and scopes consistent`, () => checkCity(read(`public/handyman/${city}/index.html`)));
}
test('furniture assembly city links have a real destination', () => {
  assert.match(read('public/services/tv-mounting/index.html'), /id="furniture-assembly"/);
});

// Mutation cases prove the check rejects the original bugs and subtle drift,
// including changing both FAQ copies to the same wrong value. No files change.
const regressions = [
  ['TV hero uses assembly rate', 'tv-mounting', `TV mounting from ${tv}`, `TV mounting from ${assembly}`],
  ['TV hero loses the service label', 'tv-mounting', `TV mounting from ${tv}`, `from ${assembly}`],
  ['TV FAQ and JSON-LD both drift', 'tv-mounting', `TV mounts into studs start at ${tv}`, `TV mounts into studs start at ${assembly}`],
  ['assembly FAQ drifts', 'tv-mounting', `Standard furniture assembly starts at ${assembly}`, `Standard furniture assembly starts at ${tv}`],
  ['tile metadata uses backsplash rate', 'tile-grout-grab-bars', `Grab bars from ${grabBar} each; standard shower`, `Grab bars from ${backsplash} each; standard shower`],
  ['pressure washing uses gutter rate', 'pressure-washing-hurricane-prep', `Driveway washing from ${driveway}`, `Driveway washing from ${gutters}`],
  ['pool minimum disappears', 'pool-cage-rescreening', ` · ${panelMinimum} minimum visit`, ''],
  ['drywall price drifts', 'drywall-repair-painting', `Small drywall patches from ${patch}`, 'Small drywall patches from $1'],
  ['lock price drifts', 'door-lock-smart-lock-repair', `Lockset or deadbolt swaps from ${lock}`, 'Lockset or deadbolt swaps from $1'],
];
for (const [label, slug, before, after] of regressions) {
  test(`reject regression: ${label}`, () => {
    const original = read(`public/services/${slug}/index.html`);
    const changed = original.replaceAll(before, after);
    assert.notEqual(changed, original, 'Mutation must exercise real markup');
    assert.throws(() => checkService(changed, contracts[slug]), assert.AssertionError);
  });
}
test('reject regression: city TV rate uses assembly price', () => {
  const html = read('public/handyman/fort-lauderdale/index.html');
  assert.throws(() => checkCity(html.replace(`TV mounting from ${tv}`, `TV mounting from ${assembly}`)), assert.AssertionError);
});
test('reject regression: city combines TV mounting and assembly under one rate', () => {
  const html = read('public/handyman/fort-lauderdale/index.html');
  assert.throws(() => checkCity(html.replace('<b>TV Mounting</b>', '<b>TV Mounting &amp; Assembly</b>')), assert.AssertionError);
});
