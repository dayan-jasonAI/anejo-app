import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = readFileSync(path.join(root, 'public/hub/owner/operations-guide.html'), 'utf8');
const source = readFileSync(path.join(root, 'public/hub/owner/assets/operations-guide.js'), 'utf8');
const home = readFileSync(path.join(root, 'public/hub/owner/index.html'), 'utf8');
const training = readFileSync(path.join(root, 'public/hub/training.html'), 'utf8');
const ownerJs = readFileSync(path.join(root, 'public/hub/owner/assets/owner.js'), 'utf8');

function fixture(initial = 'en') {
  let lang = initial;
  const listeners = {};
  const toggleListeners = {};
  const rootNode = { innerHTML: '' };
  const toggle = { textContent: '', label: '', setAttribute(name, value) { if (name === 'aria-label') this.label = value; }, addEventListener(name, fn) { toggleListeners[name] = fn; } };
  let render;
  let initArgs;
  const window = {
    AnejoLang: { get: () => lang, set: (next) => { lang = next; (listeners['anejo:langchange'] || (() => {}))(); } },
    AnejoI18n: { refresh() {} },
    Hub: {},
    Owner: { init(...args) { initArgs = args; render = args[1]; } }
  };
  const document = {
    getElementById(id) { return id === 'owner-root' ? rootNode : id === 'lang-toggle' ? toggle : null; },
    addEventListener(name, fn) { listeners[name] = fn; }
  };
  vm.runInNewContext(source, { window, document });
  return { rootNode, toggle, toggleListeners, listeners, window, get render() { return render; }, get initArgs() { return initArgs; } };
}

test('guide is a protected owner route using the existing role guard', () => {
  assert.match(html, /operations-guide\.js/);
  assert.match(source, /Owner\.init\('operations-guide', render\)/);
  assert.match(ownerJs, /var roles = \(opts && opts\.roles\) \|\| \['owner'\]/);
  const page = fixture();
  assert.equal(page.initArgs[0], 'operations-guide');
  assert.equal(page.initArgs.length, 2, 'guide uses the owner-only default and does not widen access');
});

test('the seven operating stops render in English and switch fully to Spanish', () => {
  const page = fixture('en');
  page.render();
  for (const phrase of ['Your day at Añejo', 'Handle requests &amp; quotes', 'Plan orders &amp; stock', 'Run the kitchen &amp; check temperatures', 'Assign &amp; follow deliveries', 'Record costs &amp; payouts', 'Review marketing &amp; follow up', 'Close the day']) {
    assert.ok(page.rootNode.innerHTML.includes(phrase), `English guide contains ${phrase}`);
  }
  page.window.AnejoLang.set('es');
  for (const phrase of ['Tu día en Añejo', 'Atiende solicitudes y cotizaciones', 'Planifica pedidos e inventario', 'Dirige la cocina y revisa temperaturas', 'Asigna y sigue las entregas', 'Registra gastos y pagos', 'Revisa marketing y da seguimiento', 'Cierra el día']) {
    assert.ok(page.rootNode.innerHTML.includes(phrase), `Spanish guide contains ${phrase}`);
  }
  assert.equal((page.rootNode.innerHTML.match(/<details class="guide-card"/g) || []).length, 7);
});

test('each task stays concise, has 2–3 concrete actions, and exposes its primary route first', () => {
  const copy = fixture().window.AnejoOwnerOperationsGuide.copy;
  for (const lang of ['en', 'es']) {
    assert.equal(copy[lang].steps.length, 7);
    for (const [index, step] of copy[lang].steps.entries()) {
      assert.ok(step.actions.length >= 2 && step.actions.length <= 3, `${lang} task ${index + 1} has 2–3 steps`);
      const words = [step.title, step.subtitle, ...step.actions].join(' ').trim().split(/\s+/).length;
      assert.ok(words <= 60, `${lang} task ${index + 1} has ${words} words`);
      assert.ok(step.href.startsWith('/hub/'), `${lang} task ${index + 1} has a primary Hub route`);
      assert.ok(step.button, `${lang} task ${index + 1} has a clear primary action label`);
    }
  }
});

test('every deep link maps to an existing project route', () => {
  const page = fixture();
  page.render();
  const hrefs = [...page.rootNode.innerHTML.matchAll(/href="(\/hub\/[^"]+)"/g)].map((match) => match[1]);
  assert.ok(hrefs.length >= 20);
  for (const href of new Set(hrefs)) {
    let target = path.join(root, 'public', href.slice(1));
    if (!existsSync(target) && href.endsWith('/')) target = path.join(target, 'index.html');
    assert.ok(existsSync(target), `${href} has a local page target`);
  }
});

test('owner dashboard and owner training link to the guide without replacing existing features', () => {
  assert.match(home, /href="\/hub\/owner\/operations-guide\.html"/);
  assert.match(home, /Run the business/);
  assert.match(home, /Owner\.init\('overview', render\)/, 'existing dashboard remains guarded and mounted');
  assert.match(training, /id="owner-guide-callout"/);
  assert.match(training, /href="\/hub\/owner\/operations-guide\.html"/);
  assert.match(training, /Abrir guía bilingüe/);
  assert.match(training, /older narrated owner module below is English-only reference material/);
  assert.match(training, /El módulo narrado anterior de abajo está solo en inglés/);
  assert.match(training, /Tu guía de operaciones para la dueña/);
  assert.match(training, /Las lecciones narradas de abajo son material anterior de referencia en inglés/);
  assert.doesNotMatch(training, /Owner walkthrough covers the whole system end to end/i);
});

test('audience guide stays focused on operating steps and has no generic evidence warning panel', () => {
  assert.doesNotMatch(source, /\/api\/hub\/training\/(?:complete|status)|function\s+finish|competenc(?:y|ia).{0,20}(?:complete|completed|completada)/i);
  assert.doesNotMatch(source + html, /Needs Dayan confirmation|does not confirm that|not a competency|not a completion record|not proof/i);
  assert.doesNotMatch(html, /guide-note|guide-footer|warning|source accuracy/i);
  assert.match(source, /Record the temperature you actually read/);
  assert.match(source, /Before sending, check the recipient and preview/);
});

test('guide uses mobile-first, accessible controls and reduced-motion support', () => {
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.match(html, /@media\(min-width:760px\)/, 'multi-column layout is an enhancement above the mobile default');
  assert.match(html, /min-height:44px/, 'summary and primary controls have touch-sized hit areas');
  assert.match(html, /#lang-toggle\{min-width:44px;min-height:44px/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html + source, /aria-hidden="true"/);
  assert.match(html, /CormorantGaramond-Regular\.ttf/);
  assert.match(html, /JosefinSans-Regular\.ttf/);
  assert.match(html, /\/assets\/img\/emblem\.png/);
});
