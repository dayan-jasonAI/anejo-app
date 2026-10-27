// Local, synthetic browser fixture for the real public/login.html language flow.
// Run from the repo root with: node test/fixtures/staff-language-browser-server.mjs
// It binds only to loopback and accepts only a fake identifier/PIN. Never use production credentials.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const hubFixture = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Staff language fixture</title></head><body>
<header><button id="lang-toggle" type="button">ES</button></header>
<main><h1 data-i18n>Overview</h1><p id="language-state"></p></main>
<script src="/assets/js/i18n.js"></script><script src="/hub/assets/hub-i18n.js"></script>
<script>
  var button=document.getElementById('lang-toggle');
  function sync(){button.textContent=window.AnejoLang.get()==='es'?'EN':'ES';document.getElementById('language-state').textContent=window.AnejoLang.get();}
  sync();button.addEventListener('click',function(){window.AnejoLang.set(window.AnejoLang.get()==='es'?'en':'es');sync();});
  document.addEventListener('DOMContentLoaded',sync);
</script></body></html>`;

function send(res, status, body, type='application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (req.method === 'POST' && url.pathname === '/api/auth/identify') {
    let body=''; for await (const chunk of req) body += chunk;
    const data=JSON.parse(body || '{}');
    return send(res, 200, JSON.stringify(data.identifier === 'fixture-staff'
      ? { ok:true, method:'pin', name:'Fixture staff' }
      : { ok:false, error:'Fixture only.' }));
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/pin-login') {
    let body=''; for await (const chunk of req) body += chunk;
    const data=JSON.parse(body || '{}');
    if (data.identifier !== 'fixture-staff' || data.pin !== '2468') return send(res, 401, JSON.stringify({ ok:false, error:'Incorrect login or PIN.' }));
    return send(res, 200, JSON.stringify({ ok:true, redirect:'/hub/', must_change_pin:false, lang:'es' }));
  }
  if (req.method !== 'GET') return send(res, 405, JSON.stringify({ error:'Method not allowed.' }));
  if (url.pathname === '/' || url.pathname === '/login' || url.pathname === '/login.html') {
    return send(res, 200, await readFile(resolve(root, 'public/login.html'), 'utf8'), 'text/html; charset=utf-8');
  }
  if (url.pathname === '/hub/' || url.pathname === '/hub') return send(res, 200, hubFixture, 'text/html; charset=utf-8');
  if (url.pathname === '/assets/js/announce.js' || url.pathname === '/assets/js/consent.js') return send(res, 200, '// no-op in isolated language fixture\n', 'text/javascript; charset=utf-8');
  const allowed = new Map([
    ['/assets/js/i18n.js', 'public/assets/js/i18n.js'],
    ['/hub/assets/hub-i18n.js', 'public/hub/assets/hub-i18n.js'],
  ]);
  if (allowed.has(url.pathname)) return send(res, 200, await readFile(resolve(root, allowed.get(url.pathname))), 'text/javascript; charset=utf-8');
  if (url.pathname.startsWith('/assets/img/')) {
    try {
      const path=resolve(root, 'public', url.pathname.slice(1));
      if (!path.startsWith(resolve(root, 'public') + '/')) throw new Error('path');
      const bytes=await readFile(path); return send(res, 200, bytes, extname(path)==='.png'?'image/png':'application/octet-stream');
    } catch { return send(res, 404, ''); }
  }
  return send(res, 404, JSON.stringify({ error:'Not found.' }));
});

server.listen(8769, '127.0.0.1', () => process.stdout.write('Synthetic staff-language fixture at http://127.0.0.1:8769/login\n'));
