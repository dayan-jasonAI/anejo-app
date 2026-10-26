import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceCopy,SERVICE_TEMPLATE_VERSION} from '../../functions/_lib/catering_service_messages.js';
import {cateringExperienceEmail} from '../../functions/_lib/catering_experience.js';
import {renderEventBands} from '../../functions/_lib/catering_event_labels.js';
test('catering communications are event-neutral and safely include the real location when available',()=>{
 for(const lang of ['en','es'])for(const kind of ['en_route','completed']){
 const r=serviceCopy(kind,lang,{address:'123 Example Way <Suite & A>'});assert.doesNotMatch(r.text+r.subject+r.sms,/celebrat|celebra/i);assert.match(r.text,/123 Example Way <Suite & A>/);assert.match(r.html,/123 Example Way &lt;Suite &amp; A&gt;/);assert.doesNotMatch(r.html,/<Suite/);assert.doesNotMatch(serviceCopy(kind,lang).text,/undefined|null|celebrat|celebra/i);
 }
 assert.notEqual(SERVICE_TEMPLATE_VERSION,'catering-delivery-care-v1');
 for(const lang of ['en','es'])for(const kind of ['pre_event_checkin','post_delivery_review']){const r=cateringExperienceEmail({q:{lang,customer_name:'Example'},kind,feedbackUrl:'https://example.test',accountUrl:'https://example.test'});assert.doesNotMatch(r.text+r.subject,/celebrat|celebra/i);}
});
test('band print structure is three 16 by 3-inch bands per landscape sheet, with reusable spare positions',()=>{
 const html=renderEventBands({snapshot:{theme:'blush',title:'Company lunch',phone:'561-778-7474',lines:[{name:'<Chicken & rice>'}]}});
 assert.equal((html.match(/<article class="band/g)||[]).length,3);assert.equal((html.match(/class="band standard"/g)||[]).length,2);assert.match(html,/16in;height:3in/);assert.match(html,/top:7.5in/);assert.match(html,/size:17in 11in/);assert.match(html,/100 lb glossy/);assert.match(html,/&lt;Chicken &amp; rice&gt;/);assert.match(html,/Company lunch/);assert.equal((html.match(/aria-label="Scan to visit Añejo"/g)||[]).length,6);
});
