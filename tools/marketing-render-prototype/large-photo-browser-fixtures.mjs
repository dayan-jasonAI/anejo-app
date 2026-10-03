// Synthetic local browser acceptance inputs. Native Sharp is a test reference only.
import sharp from 'sharp';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const output=fileURLToPath(new URL('./output/large-photo-qa/',import.meta.url));mkdirSync(output,{recursive:true});
const W=6000,H=4000,colors=[[190,80,45],[45,155,80],[40,90,180],[230,210,170]];
for(const noise of [false,true]){
 const data=Buffer.alloc(W*H*3);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const at=(y*W+x)*3;
  if(noise){const bx=x>>>2,by=y>>>2;data[at]=(bx*13+by*7+(bx>>>5)*31)&255;data[at+1]=(bx*3+by*11+(by>>>5)*19)&255;data[at+2]=((bx^by)*5)&255;}
  else data.set(colors[(y>=H/2?2:0)+(x>=W/2?1:0)],at);
 }
 const source=await sharp(data,{raw:{width:W,height:H,channels:3}}).withIccProfile('p3').withMetadata({orientation:6}).jpeg(noise?{quality:60}:{quality:95,chromaSubsampling:'4:4:4'}).toBuffer();
 if(source.length>5*1024*1024)throw Error('Synthetic fixture exceeds five MiB input bound');
 writeFileSync(join(output,noise?'phone-p3-24mp-noise.jpg':'phone-p3-24mp.jpg'),source,{flag:'wx'});
 let reference={originalWidth:W,originalHeight:H,orientation:6,strictPatches:false,tolerance:5};
 if(!noise){
  const expected=await sharp(source).autoOrient().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).withIccProfile('srgb').raw().toBuffer({resolveWithObject:true});
  const patches=[[.25,.25],[.75,.25],[.25,.75],[.75,.75]].map(([x,y])=>{const at=(Math.floor(expected.info.height*y)*expected.info.width+Math.floor(expected.info.width*x))*3;return Array.from(expected.data.subarray(at,at+3));});
  reference={width:expected.info.width,height:expected.info.height,patches,tolerance:5};
 }
 writeFileSync(join(output,noise?'noise-expected.json':'expected.json'),JSON.stringify(reference,null,2)+'\n',{flag:'wx'});
}
console.log(output);
