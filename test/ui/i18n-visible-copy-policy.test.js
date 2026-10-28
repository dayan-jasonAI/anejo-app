import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeJavaScript, scanProject, translationIndex} from '../../scripts/i18n-visible-copy-policy.mjs';

const index=translationIndex();
const gaps=source=>analyzeJavaScript(source,{index}).filter(row=>row.needs_review);

test('new visible labels and native warnings fail until an explicit translation exists',()=>{
  const rows=gaps(`a.textContent='New unmapped customer action'; b.innerText='New unmapped message'; c.placeholder='New unmapped hint'; d.title='New unmapped title'; e.setAttribute('aria-label','New unmapped accessible label'); alert('New unmapped alert'); confirm('New unmapped refund warning'); prompt('New unmapped prompt');`);
  assert.equal(rows.length,8);
  assert.ok(rows.every(row=>row.reason.includes('deterministic EN/ES')));
});

test('registered exact copy, authored bilingual pairs and captured-value templates pass',()=>{
  assert.equal(gaps(`a.textContent='Refund'; b.placeholder=t('Enter an amount','Ingresa un importe'); confirm('Refund '+amount+'? New unregistered financial consequence.');`).length,1,'an invented variant of a warning must not inherit an unrelated template');
  assert.equal(gaps(`a.textContent='Refund'; b.placeholder=t('Enter an amount','Ingresa un importe'); a.title='Saved · '+name;`).length,0);
  assert.equal(gaps(`a.title=t('An unregistered label');`).length,1,'a translation call alone is not evidence of a dictionary pair');
});

test('code, customer variables, URLs and style nodes are outside authored UI copy',()=>{
  const source=`const status='untranslated internal state'; fetch('/api/internal'); element.className='hidden'; element.dataset.status='internal'; element.textContent=customerInput; const style=document.createElement('style'); style.textContent='body { display: block; }'; element.title='https://example.test';`;
  assert.equal(gaps(source).length,0);
});

test('source Spanish counterparts are accepted without using remote translation',()=>{
  assert.equal(gaps(`a.setAttribute('aria-label','Cambiar idioma a inglés'); a.textContent='Persona creada. '+name;`).length,0);
});

test('current Hub authored DOM and dialog copy has no unreviewed baseline exemption',()=>{
  const report=scanProject();
  assert.ok(report.files>=100);
  assert.ok(report.bindings>=650);
  assert.deepEqual(report.parse_errors,[]);
  assert.deepEqual(report.unmapped,[],JSON.stringify(report.unmapped,null,2));
});
