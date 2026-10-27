import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const login = readFileSync(new URL('../../public/login.html', import.meta.url), 'utf8');
const language = readFileSync(new URL('../../public/assets/js/i18n.js', import.meta.url), 'utf8');

test('fresh staff PIN login applies the authenticated profile language through AnejoLang', () => {
  assert.match(language, /var KEY = 'anejo:lang'/, 'use the existing shared preference key');
  assert.match(login, /function applyStaffLanguage\(lang\)[\s\S]*window\.AnejoLang\.set\(lang\)/);
  const failedAuth = login.indexOf("if(res.status>=400 || !res.body.ok)");
  const applyPreference = login.indexOf('applyStaffLanguage(res.body.lang)');
  const forcedPinChange = login.indexOf('if(res.body.must_change_pin)');
  const hubRedirect = login.indexOf('window.location.replace(res.body.redirect || \'/hub/\')');
  assert.ok(failedAuth >= 0 && failedAuth < applyPreference, 'invalid PIN must return before applying a server preference');
  assert.ok(applyPreference < forcedPinChange && forcedPinChange < hubRedirect, 'set language before either authenticated landing flow');
});

test('manual language selection stays owned by the shared preference engine after login', () => {
  assert.match(language, /function setLang\(l\)[\s\S]*localStorage\.setItem\(KEY, lang\)/);
  assert.equal((login.match(/window\.AnejoLang\.set\(lang\)/g) || []).length, 1, 'login sets the preference once rather than on each page load');
  assert.match(login, /window\.AnejoLang && typeof window\.AnejoLang\.set === 'function'[\s\S]*window\.AnejoLang\.set\(lang\)/);
});
