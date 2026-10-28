/** Source guard for authored Hub DOM copy. It is not a browser/completeness audit. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const parser=require('espree');
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const normalize=s=>String(s).replace(/\s+/g,' ').trim();
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const PLACEHOLDER=/\{[a-zA-Z][a-zA-Z0-9_]*\}/g;
const IDENTITY=new Set(['Añejo','AÑEJO','Añejo HUB','Añejo Hub','HUB','QR','PDF','CSV','SMS','API','SKU','DBPR','R2','JPEG','PNG','MP4','UTC','ET','OK','EN','ES']);
function visit(node,fn){if(!node||typeof node!=='object')return;fn(node);for(const [key,value]of Object.entries(node)){if(['loc','range','tokens','comments'].includes(key))continue;if(Array.isArray(value))value.forEach(x=>visit(x,fn));else if(value&&typeof value==='object')visit(value,fn);}}
function literal(node){return node?.type==='Literal'&&typeof node.value==='string'?node.value:null;}
function member(node){if(node?.type!=='MemberExpression')return '';return node.computed?literal(node.property)||'':node.property?.name||'';}
function method(node){if(node?.type==='Identifier')return node.name;if(node?.type==='MemberExpression')return member(node);return '';}
function parse(source){return parser.parse(source,{ecmaVersion:'latest',sourceType:'module',loc:true,range:true,ecmaFeatures:{jsx:true}});}
export function translationIndex(root=ROOT){const exact=new Set(),patterns=[],shapes=new Set();
 const files=['public/assets/js/i18n.js','public/hub/assets/hub-i18n.js','public/hub/assets/hub-i18n-coverage.js','public/hub/assets/catering-i18n.js'];
 for(const relative of files){const full=path.join(root,relative);if(!fs.existsSync(full))continue;visit(parse(fs.readFileSync(full,'utf8')),node=>{if(node.type==='Property'&&literal(node.key)!==null&&literal(node.value)!==null){exact.add(normalize(node.key.value));exact.add(normalize(node.value.value));}if(node.type==='ObjectExpression'){const object={};for(const p of node.properties||[])if(p.type==='Property'&&literal(p.value)!==null)object[p.key.name||literal(p.key)]=p.value.value;if(object.en&&object.es){exact.add(normalize(object.en));exact.add(normalize(object.es));for(const variant of [object.en,object.es]) if(variant.match(PLACEHOLDER)){shapes.add(normalize(variant).replace(PLACEHOLDER,'{capture}'));const source=normalize(variant).split(/(\{[a-zA-Z][a-zA-Z0-9_]*\})/g).map(s=>s[0]==='{'?'.+?':escape(s)).join('');patterns.push(new RegExp('^'+source+'$'));}}}});}
 return {exact,patterns,knows(text){text=normalize(text);return exact.has(text)||shapes.has(text.replace(PLACEHOLDER,'{capture}'));}};
}
function meaningful(text){const clean=normalize(text).replace(PLACEHOLDER,'');if(!/[A-Za-zÁÉÍÓÚÑáéíóúñ]{2}/.test(clean))return false;if(IDENTITY.has(clean))return false;if(/^(?:https?:\/\/|\/|[^\s@]+@[^\s@]+\.[^\s@]+$)/.test(clean))return false;if(/^[a-z0-9_]+_[a-z0-9_]+$/.test(clean))return false;return true;}
// Inspect only actual presentation values. Do not treat API paths, CSS constants, customer
// variables, date formatter arguments, or arbitrary function arguments as visible copy.
function representations(node,index){if(!node)return [];
 const value=literal(node);if(value!==null)return [{text:value,wrapped:false}];
 if(node.type==='TemplateLiteral'){let text='';node.quasis.forEach((q,i)=>{text+=q.value.cooked||'';if(i<node.expressions.length)text+='{value'+i+'}';});return [{text,wrapped:false}];}
 if(node.type==='BinaryExpression'&&node.operator==='+'){const left=representations(node.left,index),right=representations(node.right,index);const combine=(a,b)=>({text:a.text+b.text,wrapped:a.wrapped&&b.wrapped});return (left.length?left:[{text:'{left}',wrapped:true}]).flatMap(a=>(right.length?right:[{text:'{right}',wrapped:true}]).map(b=>combine(a,b)));}
 if(node.type==='ConditionalExpression')return [...representations(node.consequent,index),...representations(node.alternate,index)];
 if(node.type==='LogicalExpression')return [...representations(node.left,index),...representations(node.right,index)];
 if(node.type==='CallExpression'){const name=method(node.callee);if(['t','tr','L','text'].includes(name)){const first=literal(node.arguments[0]),second=literal(node.arguments[1]);if(first!==null&&second!==null&&!['en','es'].includes(second)&&second.trim().length>=3)return [{text:first,wrapped:true,bilingual_pair:[first,second]}];return representations(node.arguments[0],index).map(x=>({...x,wrapped:true}));}if(['String','esc','escapeHtml','escHtml'].includes(name))return representations(node.arguments[0],index);}
 return [];
}
export function analyzeJavaScript(source,{file='fixture.js',lineOffset=0,index}={}){index=index||{knows:()=>false};const bindings=[];const ast=parse(source);const localKeys=new Set(),styleNodes=new Set();
 visit(ast,node=>{if(node.type==='Property'&&node.value?.type==='ArrayExpression'&&node.value.elements.length===2&&node.value.elements.every(x=>literal(x)!==null)){localKeys.add(node.key.name||literal(node.key));node.value.elements.forEach(x=>localKeys.add(normalize(x.value)));}if(node.type==='VariableDeclarator'&&node.init?.type==='CallExpression'&&member(node.init.callee)==='createElement'&&['style','script'].includes(literal(node.init.arguments[0])))styleNodes.add(node.id.name);});
 const shared=index;index={knows:text=>localKeys.has(normalize(text))||shared.knows(text)};
 visit(ast,node=>{let values=[],sink='';
  if(node.type==='AssignmentExpression'&&styleNodes.has(node.left?.object?.name))return;
  if(node.type==='AssignmentExpression'&&['textContent','innerText','placeholder','title'].includes(member(node.left))){sink='assignment:'+member(node.left);values=representations(node.right,index);}
  if(node.type==='CallExpression'&&member(node.callee)==='setAttribute'&&['aria-label','placeholder','title','alt'].includes(literal(node.arguments[0]))){sink='attribute:'+literal(node.arguments[0]);values=representations(node.arguments[1],index);}
  if(node.type==='CallExpression'&&['alert','confirm','prompt'].includes(method(node.callee))&&(node.callee.type==='Identifier'||node.callee.object?.name==='window')){sink='native:'+method(node.callee);values=representations(node.arguments[0],index);}
  for(const copy of values){const text=normalize(copy.text);if(!meaningful(text))continue;const known=!!copy.bilingual_pair||shared.knows(text)||(copy.wrapped&&localKeys.has(text));const reason=!known?'Visible copy has no deterministic EN/ES pair or template':null;
   bindings.push({file,line:node.loc.start.line+lineOffset,sink,text,known,explicit_bilingual:!!copy.bilingual_pair,needs_review:!!reason,reason,fingerprint:crypto.createHash('sha256').update([file,sink,text,reason||''].join('\0')).digest('hex')});}
 });return bindings;
}
function paths(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?paths(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
export function scanProject(root=ROOT){const index=translationIndex(root),bindings=[],errors=[],files=paths(path.join(root,'public/hub')).filter(p=>/\.(?:js|html)$/.test(p)&&!p.includes('/vendor/')&&!p.endsWith('/sw.js'));for(const full of files){const file=path.relative(root,full).split(path.sep).join('/');const source=fs.readFileSync(full,'utf8');let blocks=[{source,line:0}];if(full.endsWith('.html'))blocks=[...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!/(?:ld\+json|application\/json)/i.test(m[1])).map(m=>({source:m[2],line:source.slice(0,m.index).split('\n').length-1}));for(const block of blocks){if(!block.source.trim())continue;try{bindings.push(...analyzeJavaScript(block.source,{file,lineOffset:block.line,index}));}catch(e){errors.push({file,line:block.line,error:e.message});}}}
 return {scope:'Authored legacy Hub JS and inline HTML scripts: textContent/innerText/placeholder/title assignments, aria/placeholder/title/alt setAttribute and native dialogs. Not JSX, general innerHTML, network data, browser execution, or a complete bilingual audit.',files:files.length,bindings:bindings.length,covered:bindings.filter(b=>!b.needs_review).length,parse_errors:errors,unmapped:bindings.filter(b=>b.needs_review)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);const value=flag=>args.includes(flag)?args[args.indexOf(flag)+1]:null;const root=path.resolve(value('--root')||ROOT);const report=scanProject(root);if(value('--report'))fs.writeFileSync(value('--report'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({scope:report.scope,files:report.files,bindings:report.bindings,covered:report.covered,unmapped:report.unmapped,parse_errors:report.parse_errors},null,2));process.exitCode=report.parse_errors.length||report.unmapped.length?1:0;}
