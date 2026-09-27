// Local QA ONLY: fictional in-memory database; binds loopback, never production.
// Run node --no-warnings scripts/qa-catering.mjs, then open the URL below.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ownerEnv,OWNER_COOKIE} from '../test/helpers/sqlite-d1.js';
import * as event from '../functions/api/hub/kitchen/event.js';
import * as execution from '../functions/api/hub/kitchen/event-execution.js';
import * as assignment from '../functions/api/hub/owner/catering-assignment.js';
import * as driver from '../functions/api/hub/driver/catering.js';
const port=Number(process.env.CATERING_QA_PORT||8768);
const env=ownerEnv(), at=Date.now();
env.DB.sqlite.prepare(`INSERT INTO catering_quotes(total_cents,deposit_pct,deposit_cents,terms_version,terms_json,id,customer_name,event_date,serving_time,address,guests,quote_json,deposit_status,balance_status,balance_cents,created_at,updated_at) VALUES(2000,0.5,1000,'qa','{}',?,?,?,?,?,?,?,?,?,?,?,?)`).run('cq_qa','LOCAL QA — fictional event',new Date(at+7*86400000).toISOString().slice(0,10),'19:00','QA venue',12,JSON.stringify({lines:[{name:'Congri',qty:'12'}]}),'paid','paid',1000,at,at);
env.DB.sqlite.prepare("INSERT INTO staff(id,name,email,role,active,available,created_at,updated_at) VALUES('qa_driver','LOCAL QA driver','qa-driver@example.test','driver',1,1,?,?)").run(at,at);
await env.SESSIONS.put('session:tok-qa-driver',JSON.stringify({type:'staff',role:'driver',uid:'qa_driver',email:'qa-driver@example.test',la:at,created:at}));
const root=fileURLToPath(new URL('../public',import.meta.url));
createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:8768');
 const route=url.pathname==='/api/hub/kitchen/event'?event:url.pathname==='/api/hub/kitchen/event-execution'?execution:url.pathname==='/api/hub/owner/catering-assignment'?assignment:url.pathname==='/api/hub/driver/catering'?driver:null;
 if(route){let body='';for await(const chunk of req)body+=chunk;const request=new Request(url,{method:req.method,headers:{Cookie:route===driver?'anejo_sess=tok-qa-driver':OWNER_COOKIE,'Content-Type':'application/json'},...(req.method==='POST'?{body}:{})});const out=await route[req.method==='POST'?'onRequestPost':'onRequestGet']({request,env});res.writeHead(out.status,{'content-type':'application/json'});res.end(await out.text());return;}
 if(url.pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,role:url.pathname.includes('driver')?'driver':'owner',staff:{id:'qa_driver',role:'driver'},user:{role:'driver'},unread:0}));return;}
 const path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+'/'))throw Error('path');
 const data=await readFile(path);res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'});res.end(data);
 }catch{res.writeHead(404);res.end('Unavailable');}}).listen(port,'127.0.0.1',()=>process.stdout.write('Local fictional catering acceptance server ready on '+port+'; in-memory DB only\n'));
