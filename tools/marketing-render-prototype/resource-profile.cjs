// Local workerd inspector samples, never a production memory/CPU acceptance test.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '../..');
const { build } = require(path.join(repo, 'node_modules/esbuild'));
const { Miniflare, convertV4MiniflareOptions } = require(path.join(repo, 'node_modules/miniflare'));
const output = fs.mkdtempSync('/tmp/anejo-render-resource-check-');
const targetId = 'core:user:render-check';
console.log(`Output directory: ${output}`);

function save(name, value) {
  fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n');
}
function bounded(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms); })
  ]).finally(() => clearTimeout(timer));
}

async function main() {
  fs.copyFileSync(path.join(__dirname, 'node_modules/@resvg/resvg-wasm/index_bg.wasm'), path.join(output, 'resvg.wasm'));
  const worker = fs.readFileSync(path.join(__dirname, 'worker.mjs'), 'utf8');
  assert.ok(worker.includes("'@resvg/resvg-wasm/index_bg.wasm'"), 'Expected prototype static WASM import');
  await build({
    stdin: { contents: worker.replace("'@resvg/resvg-wasm/index_bg.wasm'", "'./resvg.wasm'"), resolveDir: __dirname, sourcefile: 'resource-worker.mjs' },
    outfile: path.join(output, 'worker.mjs'), bundle: true, format: 'esm', platform: 'browser',
    external: ['./resvg.wasm'], loader: { '.jpg': 'binary', '.png': 'binary', '.ttf': 'binary' }
  });
  const mf = new Miniflare(convertV4MiniflareOptions({
    workers: [{ name: 'render-check', modulesRoot: output, modules: [
      { type: 'ESModule', path: path.join(output, 'worker.mjs') },
      { type: 'CompiledWasm', path: path.join(output, 'resvg.wasm') }
    ], compatibilityDate: '2026-05-01' }],
    cf: false, inspectorPort: 0, host: '127.0.0.1', port: 0
  }));
  let ws, sequence = 0;
  const pending = new Map();
  const evidence = {
    recordedAt: new Date().toISOString(), node: process.version,
    workerd: require(path.join(repo, 'node_modules/workerd/package.json')).version,
    inspectorTargetId: targetId,
    limitations: [
      'Post-request workerd inspector samples, not Node RSS, peak memory, or verified all-inclusive isolate accounting.',
      'Do not sum inspector fields or compare totalSize directly to a production isolate memory budget.',
      'Wall duration is local elapsed time, not billable CPU; inspector attachment may change runtime behavior.',
      'A timed-out garbage-collection command does not prove collection or post-GC retained memory.',
      'One fixed fixture only: no maximum-size, concurrent, deployed cold-start, or production-limit acceptance.',
      'Deterministic output does not establish Canvas/brand parity, photo provenance, or publication approval.'
    ], runs: []
  };
  function cdp(method) {
    return new Promise(resolve => {
      const id = ++sequence;
      const finish = result => { clearTimeout(timer); pending.delete(id); resolve(result); };
      const timer = setTimeout(() => finish({ error: 'timeout', method, timeoutMs: 3000 }), 3000);
      pending.set(id, finish);
      try { ws.send(JSON.stringify({ id, method, params: {} })); }
      catch (error) { finish({ error: error.message, method }); }
    });
  }
  try {
    await bounded(mf.ready, 15000, 'Local runtime startup');
    const inspector = await bounded(mf.getInspectorURL(), 5000, 'Inspector URL');
    inspector.protocol = 'http:';
    const response = await fetch(new URL('/json/list', inspector), { signal: AbortSignal.timeout(5000) });
    assert.equal(response.ok, true, 'Inspector target discovery must succeed');
    const targets = await response.json();
    save('inspector-targets.json', targets);
    const target = targets.find(item => item.id === targetId);
    assert.ok(target?.webSocketDebuggerUrl, `Inspector target ${targetId} is missing`);
    const socketURL = new URL(target.webSocketDebuggerUrl);
    assert.equal(socketURL.hostname, '127.0.0.1', 'Inspector must remain on loopback');
    ws = new WebSocket(socketURL);
    await bounded(new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('Inspector websocket connection failed'));
      ws.onclose = () => reject(new Error('Inspector websocket closed before connection'));
    }), 5000, 'Inspector websocket connection');
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) pending.get(message.id)(message);
    };
    ws.onclose = () => { for (const finish of [...pending.values()]) finish({ error: 'Inspector websocket closed' }); };
    evidence.baseline = await cdp('Runtime.getHeapUsage');
    assert.ok(evidence.baseline.result, 'Runtime.getHeapUsage must return measurements');
    evidence.initialGcAttempt = await cdp('HeapProfiler.collectGarbage');
    save('measurements.json', evidence);
    for (let index = 0; index < 10; index++) {
      const started = performance.now();
      const result = await bounded(mf.dispatchFetch('http://localhost/'), 15000, 'Local render');
      const bytes = new Uint8Array(await bounded(result.arrayBuffer(), 5000, 'Local JPEG body'));
      const run = { index, status: result.status, wallMs: performance.now() - started, bytes: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'), heap: await cdp('Runtime.getHeapUsage') };
      evidence.runs.push(run);
      save('measurements.json', evidence);
      assert.equal(run.status, 200);
      assert.match(result.headers.get('content-type') || '', /^image\/jpeg/);
      assert.ok(run.bytes > 0);
      assert.equal(run.sha256, evidence.runs[0].sha256, 'Repeated fixed-fixture output must match');
      assert.ok(run.heap.result, 'Each heap sample must succeed');
    }
    evidence.finalGcAttempt = await cdp('HeapProfiler.collectGarbage');
    evidence.afterGcAttempt = await cdp('Runtime.getHeapUsage');
    save('measurements.json', evidence);
    console.log(`Recorded ${evidence.runs.length} deterministic HTTP 200 renders; heap samples are not production safety proof.`);
  } finally {
    for (const finish of [...pending.values()]) finish({ error: 'Harness shutting down' });
    if (ws) ws.close();
    await bounded(mf.dispose(), 10000, 'Local runtime disposal');
  }
}

main().catch(error => {
  save('error.json', { error: error.message, stack: error.stack });
  console.error(error);
  process.exitCode = 1;
});
