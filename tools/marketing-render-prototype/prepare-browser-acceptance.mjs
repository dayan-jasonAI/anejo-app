import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const dir=path.resolve(process.argv[2]||'/tmp/anejo-browser-normalization-qa');await fs.mkdir(dir,{recursive:true});
const W=40,H=20,colors=[[230,30,20],[20,220,40],[30,40,230],[210,210,20]],cases=[];
function raw(alpha=false){const b=Buffer.alloc(W*H*(alpha?4:3));for(let y=0;y<H;y++)for(let x=0;x<W;x++){const at=(y*W+x)*(alpha?4:3);b.set(colors[(y>=10?2:0)+(x>=20?1:0)],at);if(alpha)b[at+3]=x<20?120:255;}return b;}
for(const format of ['png','jpeg'])for(let orientation=1;orientation<=8;orientation++){let p=sharp(raw(),{raw:{width:W,height:H,channels:3}}).withMetadata({orientation});const name=`${format}-${orientation}.${format}`;await fs.writeFile(`${dir}/${name}`,await p[format](format==='png'?{palette:false}:{quality:100,chromaSubsampling:'4:4:4'}).toBuffer());cases.push({name,orientation});}
for(const format of ['png','jpeg']){const name=`p3.${format}`;await fs.writeFile(`${dir}/${name}`,await sharp(raw(),{raw:{width:W,height:H,channels:3}}).withIccProfile('p3')[format](format==='png'?{}:{quality:100,chromaSubsampling:'4:4:4'}).toBuffer());const decoded=await sharp(`${dir}/${name}`).toColourspace('srgb').raw().toBuffer({resolveWithObject:true});const reference=Array.from({length:4},(_,k)=>Array.from(decoded.data.subarray(((k>=2?15:5)*W+(k%2?30:10))*decoded.info.channels,((k>=2?15:5)*W+(k%2?30:10))*decoded.info.channels+3)));cases.push({name,orientation:1,p3:true,reference});}
await fs.writeFile(`${dir}/alpha.png`,await sharp(raw(true),{raw:{width:W,height:H,channels:4}}).png().toBuffer());cases.push({name:'alpha.png',orientation:1,alpha:true});
await fs.writeFile(`${dir}/large.jpg`,await sharp({create:{width:4000,height:3000,channels:3,background:'#548866'}}).withMetadata({orientation:6}).jpeg().toBuffer());cases.push({name:'large.jpg',orientation:6,large:true});
await fs.writeFile(`${dir}/cases.json`,JSON.stringify(cases));
for(const name of ['marketing-photo-normalize.js','marketing-image-orientation.js'])await fs.copyFile(path.resolve(here,'../../public/hub/owner/assets',name),`${dir}/${name}`);

await fs.copyFile(path.join(here,'browser-acceptance.html'),path.join(dir,'index.html'));
console.log(`Browser fixtures ready: ${dir}`);
