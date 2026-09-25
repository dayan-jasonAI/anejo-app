import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const page=readFileSync(new URL('../../public/hub/owner/marketing.html',import.meta.url),'utf8');
const button=page.split('\n').find(line=>line.includes("['draft','failed','published'].includes(p.status)"));
const note=page.split('\n').find(line=>line.includes('Review covers the saved Hub source design'));
const evaluate=(line,status)=>vm.runInNewContext(line.trim().replace(/\+$/,''),{p:{id:'post',status},esc:String});
test('published review exposes saved-source boundary and keeps draft wording',()=>{
 assert.match(evaluate(button,'published'),/Review saved source design/);
 assert.match(evaluate(note,'published'),/not independent verification of Instagram pixels/);
 assert.match(evaluate(note,'published'),/does not change the live post/);
 for(const status of ['draft','failed'])assert.match(evaluate(button,status),/Audit saved draft/);
 for(const status of ['scheduled','publishing'])assert.equal(evaluate(button,status),'');
});
test('published audit action reuses stored caption and never selects a publish operation',()=>{
 const action=page.slice(page.indexOf("document.querySelectorAll('[data-audit]')"),page.indexOf("Array.prototype.forEach.call(document.querySelectorAll('[data-editcap]')"));
 assert.match(action,/approvalCaption\(pid\)/);assert.match(action,/op:'audit'/);assert.match(action,/no live post was changed/);assert.doesNotMatch(action,/op:'publish'|op:'schedule'/);
 for(const script of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
});
