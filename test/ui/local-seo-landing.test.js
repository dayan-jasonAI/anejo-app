import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../public/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const cityFiles = ['catering/', 'es/catering/'].flatMap((dir) =>
  readdirSync(new URL(dir, root)).filter((name) => name.endsWith('.html')).map((name) => dir + name));

test('all generated landings use the consent loader and visible FAQ text matches schema', () => {
  for (const path of [...cityFiles, 'cuban-food.html', 'es/comida-cubana.html', 'mediterranean-catering.html', 'es/catering-mediterraneo.html']) {
    const html = read(path);
    assert.equal((html.match(/src="\/assets\/js\/consent.js"/g) || []).length, 1, path);
    assert.ok(!html.includes('googletagmanager.com'), 'no direct analytics bypass: ' + path);
    const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)[1];
    for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const schema = JSON.parse(match[1]);
      if (schema['@type'] !== 'FAQPage') continue;
      for (const question of schema.mainEntity) {
        assert.ok(main.includes(question.name), path + ': visible question');
        assert.ok(main.includes(question.acceptedAnswer.text), path + ': visible answer');
      }
    }
    assert.ok(!main.includes('Nearby service areas') && !main.includes('ciudades cercanas'), path);
  }
});

test('city links preserve location, and Spanish landings expose translated navigation and English counterpart', () => {
  const english = read('catering/west-palm-beach.html');
  assert.equal((english.match(/href="\/catering\?city=West%20Palm%20Beach#quote"/g) || []).length, 2);
  const spanish = read('es/catering/west-palm-beach.html');
  assert.ok(spanish.includes('aria-label="Navegación principal"'));
  assert.ok(spanish.includes('>Saltar al contenido</a>'));
  assert.ok(spanish.includes('href="https://anejocateringco.com/catering/west-palm-beach">English</a>'));
});

test('catering city prefill decodes safely, is bounded, and preserves existing user input', () => {
  const source = read('catering.html');
  const code = source.slice(source.indexOf('  var params=new URLSearchParams'), source.indexOf("  var requestedMenu=params.get('menu');"));
  function run(search, value = '') {
    const input = { value };
    vm.runInNewContext(code, { URLSearchParams, window: { location: { search } }, document: { getElementById: () => input } });
    return input.value;
  }
  assert.equal(run('?city=West%20Palm%20Beach'), 'West Palm Beach');
  assert.equal(run('?city=Atlantis', 'User-entered location'), 'User-entered location');
  assert.equal(run('?city=' + 'a'.repeat(200)).length, 160);
  assert.equal(run('?city=%3Cscript%3E'), '<script>'); // assigned to value, never HTML
  assert.equal(run(''), '');
});

test('public business contacts use Dayan-confirmed business number', () => {
  for (const path of ['index.html', 'lunch-count.html', 'legal/privacy.html', 'legal/refund.html', 'legal/terms.html', 'assets/js/i18n.js', 'assets/js/chat.js', ...cityFiles.filter((path) => !path.includes('service-areas') && !path.includes('areas-de-servicio'))]) {
    const html = read(path);
    assert.ok(html.includes('561-778-7474'), path);
    assert.ok(!/561[- .]?567[- .]?1047/.test(html), path + ': personal number must not be public');
  }
});
