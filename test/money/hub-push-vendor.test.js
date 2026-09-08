import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildHubPush, outputPath } from '../../scripts/build-hub-push.mjs';

test('checked-in Hub push bundle exactly reproduces from the pinned npm dependencies', async () => {
  const result = await buildHubPush({ write: false });
  const source = await readFile(outputPath, 'utf8');
  assert.equal(result.outputFiles[0].text, source);
  assert.match(source, /@block65\/webcrypto-web-push@2\.0\.0/);
  assert.match(source, /Copyright 2024 Block65 Pte Ltd/);
  assert.match(source, /Copyright \(c\) Sindre Sorhus/);
  assert.doesNotMatch(source, /^import\s|\brequire\(/m, 'deployment must not resolve npm dependencies');
  assert.match(source, /export\s*\{\s*buildPushPayload/s);
});
