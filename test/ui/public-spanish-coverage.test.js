import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { buildAudit } from '../../scripts/audit-public-spanish-coverage.mjs';
import { readFileSync } from 'node:fs';

const addonPath = new URL('../../public/assets/js/public-i18n-coverage.js', import.meta.url);
const enginePath = new URL('../../public/assets/js/i18n.js', import.meta.url);

function objectLiteral(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing object marker ${marker}`);
  const open = source.indexOf('{', start);
  let depth = 0, quote = null, escaped = false, comment = null;
  for (let i = open; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (comment === 'line') { if (c === '\n') comment = null; continue; }
    if (comment === 'block') { if (c === '*' && next === '/') { comment = null; i++; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && next === '/') { comment = 'line'; i++; continue; }
    if (c === '/' && next === '*') { comment = 'block'; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return vm.runInNewContext(`(${source.slice(open, i + 1)})`);
  }
  throw new Error(`unterminated object marker ${marker}`);
}

async function loadAddon() {
  const source = await readFile(addonPath, 'utf8');
  let dictionary;
  const window = { AnejoI18n: { extend(value) { dictionary = value; } } };
  vm.runInNewContext(source, { window });
  return dictionary;
}

test('public coverage dictionary registers with an already-loaded engine and queues before it', async () => {
  const source = await readFile(addonPath, 'utf8');
  const dict = await loadAddon();
  assert.ok(Object.keys(dict).length >= 150);
  assert.equal(dict['Continue to secure checkout'], 'Continuar al pago seguro');
  assert.equal(dict['Yes, text me order & delivery updates from Añejo Catering Co. at this number.'], undefined,
    'the established core translation for this consent line must remain authoritative');

  const window = {};
  vm.runInNewContext(source, { window });
  assert.equal(window.__hubI18nQueue.length, 1);
  assert.equal(window.__hubI18nQueue[0]['Add & pay'], 'Añadir y pagar');
  assert.equal(window.__anejoI18nAliases['Saltar al contenido'], 'Skip to content');
});

test('inverse-only source aliases register and static public text has no unresolved literals', async () => {
  const source = await readFile(addonPath, 'utf8');
  const aliases = {};
  vm.runInNewContext(source, { window: { AnejoI18n: {
    extend() {},
    extendAliases(value) { Object.assign(aliases, value); }
  } } });
  assert.equal(aliases['Solicita cotización'], 'Request a quote');
  assert.equal(aliases['Palm Beach County'], 'Palm Beach County');
  assert.equal(aliases.English, 'English', 'English remains a canonical source endonym on Spanish-page language controls');
  const audit = await buildAudit();
  assert.deepEqual(audit.staticTextAudit.englishTextNotMatchedToDictionary.strings, []);
  assert.deepEqual(audit.staticTextAudit.spanishTextNotMatchedToInverseDictionary.strings, []);
  assert.equal(audit.staticTextAudit.dictionaryCounts.inverseOnlyAliases, 7);
  assert.ok(audit.staticTextAudit.pairedRouteAnalysis.authoredSourcePairs.length >= 640);
  assert.ok(audit.staticTextAudit.pairedRouteAnalysis.authoredSourcePairs.every(pair => pair.routes.length && pair.paths.length),
    'source-paired translations should retain route and DOM-path evidence');
});

test('new public dictionary does not silently override existing curated translations', async () => {
  const engine = readFileSync(enginePath, 'utf8');
  const core = objectLiteral(engine, 'var ES =');
  const extra = await loadAddon();
  const publicCatering = objectLiteral(readFileSync(new URL('../../public/assets/js/catering-i18n.js', import.meta.url), 'utf8'), 'var es =');
  for (const [label, dict] of [['shared engine', core], ['public catering dictionary', publicCatering]]) {
    const conflicts = Object.keys(extra).filter(key => dict[key] !== undefined && dict[key] !== extra[key]);
    assert.deepEqual(conflicts, [], `review conflicts with ${label}: ${conflicts.join(', ')}`);
  }
});

test('catalog localization follows Spanish fields in API and repository catalog sources', async () => {
  const catalog = JSON.parse(await readFile(new URL('../../docs/menu-2026-09/catalog.json', import.meta.url), 'utf8'));
  const launch = JSON.parse(await readFile(new URL('../../docs/menu-launch/catalog.json', import.meta.url), 'utf8'));
  for (const [label, rows] of [['menu snapshot', catalog], ['launch catalog', launch]]) {
    assert.ok(rows.length > 0, `${label} has rows`);
    for (const row of rows) {
      assert.ok(row.name, `${label} ${row.id} has an English name`);
      assert.ok(row.name_es, `${label} ${row.id} has an owner-source Spanish name`);
      if (row.description) assert.ok(row.description_es, `${label} ${row.id} has an owner-source Spanish description`);
    }
  }
  const apiLibrary = readFileSync(new URL('../../functions/_lib/menu.js', import.meta.url), 'utf8');
  assert.match(apiLibrary, /name_es:\s*it\.name_es\s*\|\|\s*it\.name/);
  assert.match(apiLibrary, /desc_es:\s*it\.description_es\s*\|\|\s*it\.description/);
  const order = readFileSync(new URL('../../public/order.html', import.meta.url), 'utf8');
  assert.match(order, /nameEs:\s*it\.name_es\s*\|\|\s*it\.name/);
  assert.match(order, /descEs:\s*it\.desc_es\s*\|\|\s*it\.desc\s*\|\|\s*''/);
});

test('route audit separates static public routes, Hub, Studio, and trainer surfaces', async () => {
  const audit = await buildAudit();
  assert.ok(audit.totals.publicNonHub.htmlRoutes > 100);
  assert.ok(audit.totals.publicNonHub.withoutSharedEngine > 0,
    'record current engine gaps for the parent to bootstrap');
  assert.ok(audit.totals.studio.htmlRoutes > 0);
  assert.ok(audit.totals.trainer.htmlRoutes > 0);
  assert.ok(audit.missingSharedEnginePublicRoutes.includes('/go'));
  assert.ok(audit.missingSharedEnginePublicRoutes.includes('/daily-lunch'));
  assert.ok(audit.routes.filter(row => row.surface === 'hub-excluded').length > 0);
  assert.ok(audit.routes.filter(row => row.surface === 'studio-react-review').length > 0);
  const saved = JSON.parse(await readFile(new URL('../../docs/i18n/public-spanish-coverage-route-audit.json', import.meta.url), 'utf8'));
  assert.deepEqual(saved.totals, audit.totals, 'committed inventory should reflect this source snapshot');
  assert.deepEqual(saved.missingSharedEnginePublicRoutes, audit.missingSharedEnginePublicRoutes);
});

test('high-value customer-flow translations cover order, feedback, account, and consent wording', async () => {
  const dict = await loadAddon();
  for (const key of [
    'Continue to secure checkout', 'How did we do?', 'Save this response',
    'Sign in to continue', 'Save new card', 'Checking your payment',
    'for help,', 'to cancel anytime.', 'Consent is not a condition of purchase.',
    'Office & Team Meals', 'What makes us different'
  ]) {
    assert.ok(dict[key] || key in objectLiteral(readFileSync(enginePath, 'utf8'), 'var ES ='), `missing curated translation: ${key}`);
  }
  assert.equal(dict['Office & Team Meals'], 'Comidas para oficinas y equipos');
});
