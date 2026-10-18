import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCateringJourney} from '../../functions/api/leads.js';
test('submitted journey preserves only known public entry route and labels its evidence limits',()=>{
 assert.deepEqual(normalizeCateringJourney({entry_path:'/catering/wellington',email:'private',history:['secret'],evidence:'full replay'}),{entry_path:'/catering/wellington',form_path:'/catering',evidence:'submitted_page_context'});
 for(const entry_path of ['/q/token','/hub/owner','https://other.example/','/catering?email=private','/client/account','/../hub'])assert.equal(normalizeCateringJourney({entry_path}),null);
 for(const value of [null,[],{},'private'])assert.equal(normalizeCateringJourney(value),null);
});
