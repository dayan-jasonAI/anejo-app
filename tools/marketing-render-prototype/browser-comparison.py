"""Loopback-only actual Canvas comparison; copies only named public fixtures to a temp dir."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import tempfile, json, base64, hashlib
root = Path(__file__).resolve().parents[2]
out = Path(tempfile.mkdtemp(prefix='anejo-browser-comparison-'))
fixtures = {
 'marketing-branding.js':'public/hub/owner/assets/marketing-branding.js',
 'marketing-editorial-plan.js':'public/hub/owner/assets/marketing-editorial-plan.js',
 'source.jpg':'tools/marketing-render-prototype/assets/source.jpg',
 'assets/img/emblem.png':'public/assets/img/emblem.png',
 'serif.ttf':'tools/cardgen/fonts/CormorantGaramond.ttf',
 'sans.ttf':'tools/cardgen/fonts/JosefinSans.ttf',
 'wasm-cajita.jpg':'docs/marketing/evidence-2026-09-28/reposado-cajita-fixed-font-preview.jpg',
 'wasm-wide.jpg':'docs/marketing/evidence-2026-09-28/reposado-wide-fixed-font-preview.jpg'}
for name, source in fixtures.items():
 target=out/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((root/source).read_bytes())
(out/'source-hashes.json').write_text(json.dumps({name:hashlib.sha256((out/name).read_bytes()).hexdigest() for name in fixtures},indent=2))
(out/'index.html').write_text('''<!doctype html><meta charset="utf-8"><title>Añejo private renderer comparison</title>
<style>@font-face{font-family:"Cormorant Garamond";src:url(serif.ttf);font-weight:300 700}@font-face{font-family:"Josefin Sans";src:url(sans.ttf);font-weight:100 700}body{background:#eee;font:16px system-ui;margin:24px}section{display:grid;grid-template-columns:1fr 1fr;gap:16px}img{width:100%}pre{white-space:pre-wrap}</style>
<h1>Private Canvas / WASM comparison</h1><p>No publishing or live Hub write. Existing website theme fixture; not documentary photo proof.</p><p id="status">Rendering locally…</p><div id="results"></div>
<script src="marketing-editorial-plan.js"></script><script src="marketing-branding.js"></script>
<script>
(async()=>{try{for(const [preset,title,file] of [['reposado-wide','Catering, beautifully.','wide'],['reposado-cajita','Your Cajita.','cajita']]){
 let layout;const data=await AnejoBranding.compose('/source.jpg',{preset,text:title,kicker:'AÑEJO CATERING',onLayout:r=>layout=r});
 const response=await fetch('/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file,data,layout})});if(!response.ok)throw Error('Evidence save failed');
 const heading=document.createElement('h2');heading.textContent=preset;results.append(heading);const section=document.createElement('section');
 for(const [label,src] of [['Actual browser Canvas',data],['WASM prototype','wasm-'+file+'.jpg']]){const box=document.createElement('div');const p=document.createElement('p');p.textContent=label;const image=document.createElement('img');image.src=src;image.alt=label+' '+preset;box.append(p,image);section.append(box);}results.append(section);
 }document.querySelector('#status').textContent='Both Canvas outputs rendered and saved locally.';}catch(error){document.querySelector('#status').textContent='FAILED: '+error.message;}})();
</script>''')
class Handler(SimpleHTTPRequestHandler):
 def do_POST(self):
  if self.path!='/save':self.send_error(404);return
  try:
   length=int(self.headers.get('Content-Length','0'))
   if not 0<length<5*1024*1024:raise ValueError('body bound')
   body=json.loads(self.rfile.read(length));name=body['name'];data=body['data']
   if name not in ('wide','cajita') or not data.startswith('data:image/jpeg;base64,'):raise ValueError('format')
   image=base64.b64decode(data.split(',',1)[1],validate=True)
   if not image.startswith(b'\xff\xd8'):raise ValueError('jpeg')
   (out/('canvas-'+name+'.jpg')).write_bytes(image)
   (out/('canvas-'+name+'.json')).write_text(json.dumps({'layout':body['layout'],'sha256':hashlib.sha256(image).hexdigest()},indent=2))
   self.send_response(200);self.end_headers();self.wfile.write(b'ok')
  except (ValueError,KeyError):self.send_error(400)
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(out)))
print(json.dumps({'url':'http://127.0.0.1:'+str(server.server_port)+'/','output':str(out)}),flush=True)
try:server.serve_forever()
except KeyboardInterrupt:pass
finally:server.server_close()
