import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { BUNDLED_EMBLEM_REFERENCE as bundled } from '../../functions/_lib/generated_emblem_reference.js';
import { loadEmblemReference, EMBLEM_REFERENCE_SHA256 } from '../../functions/_lib/governance.js';
test('generated bundle reproduces canonical source exactly and deterministic check passes',()=>{
 const original=readFileSync(new URL('../../public/assets/img/emblem.png',import.meta.url));
 assert.equal(original.length,163850);assert.deepEqual(Buffer.from(bundled.data,'base64'),original);
 assert.equal(createHash('sha256').update(original).digest('hex'),EMBLEM_REFERENCE_SHA256);
 const result=execFileSync(process.execPath,[fileURLToPath(new URL('../../scripts/build-emblem-reference.mjs',import.meta.url)),'--check'],{encoding:'utf8'});assert.match(result,/matches: 163850 bytes/);
});
test('corrupt bytes, incorrect identity, invalid encoding and oversize bundles fail locally without fetch',async()=>{
 const fetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('network forbidden');};
 try {
  const changed=Buffer.from(bundled.data,'base64');changed[100]^=1;
  for(const invalid of [null,{...bundled,data:changed.toString('base64')},{...bundled,data:'!'.repeat(bundled.data.length)}, {...bundled,data:'A'.repeat(400000)},{...bundled,source:'another.png'},{...bundled,byte_length:163849},{...bundled,sha256:'a'.repeat(64)},{...bundled,canonical_url:'https://other.test/image.png'}])assert.equal(await loadEmblemReference({},invalid),null);
  assert.equal(calls,0);
 } finally {globalThis.fetch=fetch;}
});
