import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const plan=require('../../public/hub/owner/assets/marketing-editorial-plan.js');
const file=readFileSync(new URL('../../public/hub/owner/assets/marketing-editorial-plan.js',import.meta.url),'utf8');
const browser=readFileSync(new URL('../../docs/marketing/cajita-social-2026-09-17/revision-3/marketing-branding.source.js',import.meta.url),'utf8');
const names=['reposado-square','reposado-dense','reposado-portrait','reposado-wide','reposado-cajita'];
const plain=x=>JSON.parse(JSON.stringify(x));
test('browser-global and CommonJS expose the same versioned geometry without DOM',()=>{
 const scope={};vm.runInNewContext(file,scope);assert.equal(scope.AnejoEditorialPlan.version,'anejo-editorial-geometry-1');
 assert.deepEqual(plain(scope.AnejoEditorialPlan.plan({sourceWidth:1448,sourceHeight:1086,templateId:'reposado-wide'})),plan.plan({sourceWidth:1448,sourceHeight:1086,templateId:'reposado-wide'}));
});
test('all five profile definitions match existing browser renderer exactly and resist caller mutation',()=>{
 const scope={AnejoEditorialPlan:plan};vm.runInNewContext(browser,scope);
 for(const name of names){assert.deepEqual(plan.profile(name),plain(scope.AnejoBranding.editorialProfile(name)));const copy=plan.profile(name);copy.textRegion.x=99;assert.ok(plan.profile(name).textRegion.x<1);}
 assert.equal(plan.profile('reposado-portrait').vertical,true);assert.equal(plan.profile('reposado-cajita').textRegion.x,.56);
 for(const invalid of ['unknown','toString','__proto__',null])assert.throws(()=>plan.profile(invalid),/Unknown/);
});
test('contain projects wide and tall sources without cropping',()=>{
 assert.deepEqual(plan.contain(4000,1000,1),{width:1080,height:1080,photo:{x:0,y:405,w:1080,h:270},extended:true});
 const tall=plan.contain(1000,2000,1);assert.deepEqual(tall.photo,{x:270,y:0,w:540,h:1080});
 assert.deepEqual(plan.projectProtectedAreas([{x:.2,y:.2,w:.2,h:.2}],tall.photo),[{x:378,y:216,w:108,h:216}]);
 const same=plan.plan({sourceWidth:1448,sourceHeight:1086,templateId:'reposado-wide'});assert.deepEqual(same.photo,{x:0,y:0,w:1080,h:810});assert.equal(same.backgroundExtended,false);
});
test('wide source protection remains on contained photograph rather than absent canvas edge',()=>{
 const r=plan.plan({sourceWidth:4000,sourceHeight:1000,templateId:'reposado-square',protectedRegions:[{x:0,y:0,w:1,h:1}]});assert.deepEqual(r.protectedRects,[{x:0,y:405,w:1080,h:270}]);assert.equal(r.visualReviewRequired,true);assert.equal(r.geometryOnly,true);
 assert.throws(()=>plan.plan({sourceWidth:1080,sourceHeight:1080,templateId:'reposado-square',protectedRegions:[{x:0,y:0,w:1,h:1}]}),/overlaps a protected/);
});
test('source projection rejects actual overlay collision after contain transform',()=>{
 assert.throws(()=>plan.plan({sourceWidth:1000,sourceHeight:2000,templateId:'reposado-square',protectedRegions:[{x:.1,y:.92,w:.5,h:.07}]}),/protected/);
 const r=plan.plan({sourceWidth:1000,sourceHeight:2000,templateId:'reposado-square',protectedRegions:[{x:.1,y:.2,w:.5,h:.3}]});assert.equal(r.protectionSource,'provided_regions');
});
test('custom editorial defaults and validated overrides preserve explicit coordinate spaces',()=>{
 const r=plan.plan({sourceWidth:1000,sourceHeight:1000});assert.equal(r.templateId,'custom_editorial');assert.equal(r.textRegion.x,86.4);assert.equal(r.protectedCoordinateSpace,'source_normalized');assert.equal(r.overlayCoordinateSpace,'canvas_pixels');
 const custom=plan.plan({sourceWidth:800,sourceHeight:1000,aspect:.8,vertical:true,textRegion:{x:.01,y:.01,w:.2,h:.1},emblemRegion:{x:.8,y:.8,w:.1,h:.1}});assert.equal(custom.height,1350);assert.equal(custom.vertical,true);assert.equal(custom.textRegion.y,13.5);
 assert.throws(()=>plan.plan({sourceWidth:1,sourceHeight:1,textRegion:{x:0,y:0,w:.5,h:.5},emblemRegion:{x:0,y:0,w:.5,h:.5}}),/separate/);
});
test('invalid geometry, aspect, rectangles and region counts fail closed',()=>{
 for(const n of [0,-1,Infinity,NaN,'1080',null])assert.throws(()=>plan.plan({sourceWidth:n,sourceHeight:1080}),/dimensions/);
 for(const n of [0,Infinity,NaN,2,'1'])assert.throws(()=>plan.contain(1080,1080,n),/aspect ratio/);
 for(const rect of [{x:-1,y:0,w:1,h:1},{x:0,y:0,w:2,h:1},{x:0,y:0,w:0,h:1},{x:0,y:NaN,w:1,h:1}])assert.throws(()=>plan.plan({sourceWidth:1,sourceHeight:1,textRegion:rect}),/areas/);
 for(const regions of [null,{},Array(21).fill({x:0,y:0,w:.1,h:.1})])assert.throws(()=>plan.plan({sourceWidth:1,sourceHeight:1,protectedRegions:regions}),/areas/);
 assert.throws(()=>plan.plan({sourceWidth:1,sourceHeight:1,vertical:'true'}),/boolean/);
});
test('plan returns independent geometry and never certifies absent protection',()=>{
 const options={sourceWidth:1080,sourceHeight:1080,templateId:'reposado-square'};const first=plan.plan(options);first.photo.x=99;first.textRegion.x=99;
 const second=plan.plan(options);assert.equal(second.photo.x,0);assert.equal(second.textRegion.x,75.60000000000001);assert.equal(second.protectionSource,'visual_review_required');assert.equal(second.visualReviewRequired,true);
});
