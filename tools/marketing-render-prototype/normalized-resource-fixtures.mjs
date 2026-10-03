// Local synthetic fixtures only; no production/customer assets or network.
// Extends the shared maximum-input suite with color/orientation and real phone dimensions.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const output=execFileSync(process.execPath,[fileURLToPath(new URL('./resource-fixtures.mjs',import.meta.url))],{encoding:'utf8'}).trim();
const manifest=JSON.parse(readFileSync(join(output,'manifest.json'),'utf8'));
const source=readFileSync(join(output,'square.jpg'));
async function save(file,bytes,details){writeFileSync(join(output,file),bytes,{flag:'wx'});manifest.fixtures.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),...details});}
for(const orientation of [1,6]){
 const bytes=await sharp(source).withIccProfile('p3').withMetadata({orientation}).jpeg({quality:80}).toBuffer();
 await save(`square-p3-orientation-${orientation}.jpg`,bytes,{mime:'image/jpeg',width:2000,height:2000,pixels:4_000_000,orientation,expected:'accepted',note:'Synthetic 4 MP input with P3 ICC; orientation applied once.'});
}
for(const [width,height] of [[4032,3024],[6000,4000]]){
 const bytes=await sharp({create:{width,height,channels:3,background:'#b38a53'}}).withIccProfile('p3').jpeg({quality:80}).toBuffer();
 await save(`phone-${width}x${height}.jpg`,bytes,{mime:'image/jpeg',width,height,pixels:width*height,expected:'rejected by current pixel limit',note:'Valid synthetic phone-size image. Refusal records unresolved support, not product readiness.'});
}
manifest.normalizedPipelineScope='local-private-worker-v3';manifest.generatedAt=new Date().toISOString();
writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(output);
