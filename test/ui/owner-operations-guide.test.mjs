import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const html=read('public/hub/owner/operations-guide.html'),source=read('public/hub/assets/operator-playbooks.js');
test('guide uses owner guard and the standalone bilingual playbook module',()=>{assert.match(html,/operator-playbooks\.js/);assert.match(source,/window\.Owner\.init\('operations-guide', render\)/);assert.match(html,/\/hub\/owner\/assets\/owner\.js/);});
test('existing dashboard and training entry points remain available',()=>{for(const p of['public/hub/owner/index.html','public/hub/training.html'])assert.match(read(p),/\/hub\/owner\/operations-guide\.html/);});
test('guide preserves Añejo type and mobile/reduced-motion treatment',()=>{assert.match(html,/CormorantGaramond-Regular\.ttf/);assert.match(html,/JosefinSans-Regular\.ttf/);assert.match(html,/\/assets\/img\/emblem\.png/);assert.match(html,/@media\(min-width:760px\)/);assert.match(html,/#lang-toggle\{min-width:44px;min-height:44px/);assert.match(html,/prefers-reduced-motion:reduce/);assert.match(source,/aria-hidden="true"/);});
