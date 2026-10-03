import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
// Isolated ESM adaptation. Original license retained verbatim. No globals/polyfills.
let src=readFileSync(new URL('./node_modules/jpeg-js/lib/encoder.js',import.meta.url),'utf8');
src=src.replace(/if \(typeof module !== 'undefined'\) \{[\s\S]*?\n\}\n\nfunction encode/, 'function encode');
src=src.replace("if (typeof module === 'undefined') return new Uint8Array(byteout);\n      return Buffer.from(byteout);",'return new Uint8Array(byteout);');
src=src.slice(0,src.indexOf('// helper function to get the imageData'))+'\nexport { encode };\n';
// Keep the pinned adaptation reproducible; fail on upstream source drift.
function replaceOnce(before,after){assert.equal(src.split(before).length-1,1,'Pinned encoder source changed');src=src.replace(before,after);}
replaceOnce('var bitcode = new Array(65535);\n\tvar category = new Array(65535);', '// Per-encoder coefficient lookup storage: values need at most 15 bits,\n\t// and categories are 1..15. Avoid 65,534 separate [value, length] arrays.\n\tvar bitcode = new Uint16Array(65535);\n\tvar category = new Uint8Array(65535);');
replaceOnce('bitcode[32767+nr] = [];\n\t\t\t\t\tbitcode[32767+nr][1] = cat;\n\t\t\t\t\tbitcode[32767+nr][0] = nr;', 'bitcode[32767+nr] = nr;');
replaceOnce('bitcode[32767+nrneg] = [];\n\t\t\t\t\tbitcode[32767+nrneg][1] = cat;\n\t\t\t\t\tbitcode[32767+nrneg][0] = nrupper-1+nrneg;', 'bitcode[32767+nrneg] = nrupper-1+nrneg;');
replaceOnce('var value = bs[0];\n\t\t\tvar posval = bs[1]-1;', 'writeBitValue(bs[0], bs[1]);\n\t\t}\n\n\t\tfunction writeBitValue(value, length)\n\t\t{\n\t\t\tvar posval = length-1;');
assert.equal(src.split('writeBits(bitcode[pos]);').length-1,2,'Pinned coefficient writer changed');
src=src.replaceAll('writeBits(bitcode[pos]);','writeBitValue(bitcode[pos], category[pos]);');
// Quantized values were already coerced with |0; DCT scratch keeps double precision.
for(const name of ['outputfDCTQuant','DU'])replaceOnce('var '+name+' = new Array(64);','var '+name+' = new Int32Array(64);');
for(const name of ['YDU','UDU','VDU'])replaceOnce('var '+name+' = new Array(64);','var '+name+' = new Float64Array(64);');
replaceOnce('var outputfDCTQuant = new Int32Array(64);','// Quantization already produces signed int32 values with |0.\n\tvar outputfDCTQuant = new Int32Array(64);');
replaceOnce('var YDU = new Float64Array(64);','// DCT updates these channel blocks in place; retain full Number precision.\n\tvar YDU = new Float64Array(64);');
const target=new URL('./jpeg-encoder.mjs',import.meta.url);
assert.ok(process.argv.length===2||(process.argv.length===3&&process.argv[2]==='--check'),'Only --check is supported');
if(process.argv[2]==='--check')assert.equal(readFileSync(target,'utf8'),src,'Generated encoder differs');
else writeFileSync(target,src);
