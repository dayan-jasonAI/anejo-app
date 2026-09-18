# Local-only deterministic launch renderer export server. No production access.
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json,base64,re
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/marketing/cajita-social-2026-09-17/revision-3'
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw): super().__init__(*a,directory=str(ROOT),**kw)
 def do_POST(self):
  if self.path!='/save-launch-slide' or self.headers.get('Origin')!='http://127.0.0.1:8781':self.send_error(403);return
  try:
   n=int(self.headers.get('Content-Length','0'))
   if not 0<n<10000000:raise ValueError('size')
   data=json.loads(self.rfile.read(n));name=data['file']
   if not re.fullmatch(r'slides/(gather|personal|choice)-[0-9]{2}\.jpg',name):raise ValueError('file')
   prefix='data:image/jpeg;base64,'
   if not data['data'].startswith(prefix):raise ValueError('format')
   raw=base64.b64decode(data['data'][len(prefix):],validate=True)
   if not raw.startswith(b'\xff\xd8\xff'):raise ValueError('jpeg')
   target=OUT/name;target.parent.mkdir(exist_ok=True);target.write_bytes(raw)
   target.with_suffix('.layout.json').write_text(json.dumps(data['report'],indent=2)+'\n')
   self.send_response(200);self.end_headers();self.wfile.write(b'{"ok":true}')
  except Exception as e:self.send_error(400,str(e))
ThreadingHTTPServer(('127.0.0.1',8781),Handler).serve_forever()
