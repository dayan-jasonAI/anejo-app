/** Strict authored HTML/UI copy guard. Stored/user/provider content is outside this source boundary. */
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {translationIndex} from './i18n-visible-copy-policy.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const normalize=s=>s.replace(/\s+/g,' ').trim();
const variables=/\{[a-zA-Z][a-zA-Z0-9_]*\}/g;
const uiKinds=new Set(['array_label','object_label','message_label']);
const identities=new Set(['Añejo','AÑEJO','HUB','Añejo HUB','Añejo Hub','Añejo Catering Co.','Añejo Catering Co. LLC','Aña','Ana','Añejo Fit','La Cajita','Vital','Thriving','Legend','Immortal','vital','thriving','legend','immortal','Video','Palm Beach','Square','QuickBooks','Resend','Instagram','Meta','Google','WhatsApp','Facebook','ElevenLabs','YouTube','TikTok','Drive','Canva','Pinterest','STOP']);
export function invariantReason(text,occurrences=[],index={knows:()=>false}){
 const value=normalize(text);
 if(value==='Pernil, arroz, VIDA…')return 'Spanish catalog-name examples';
 if(/^(?:[^\s@]+@[^\s@]+\.[^\s@]+)(?:,\s*[^\s@]+@[^\s@]+\.[^\s@]+)*$/.test(value))return 'email-address examples, not UI prose';
 if(/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp|mp4|mov|pdf|json)$/.test(value))return 'file or object-key example';
 if(/^[a-z0-9.-]+\.[a-z]{2,}$/.test(value))return 'domain-name example';
 if(occurrences.every(o=>o.kind==='fragment_placeholder')&&/^\d+ .+\b[A-Z]{2} \d{5}(?:-\d{4})?$/.test(value))return 'postal-address example';
 if(occurrences.every(o=>o.kind==='fragment_placeholder')&&/^[A-Z][A-Z0-9]*\d[A-Z0-9]*$/.test(value))return 'exact promotional-code example';
 if(occurrences.every(o=>o.kind==='fragment_placeholder')&&/^[a-z]+_[a-z0-9_]+$/.test(value))return 'catalog ID example';
 if(occurrences.length&&occurrences.every(o=>o.kind==='fragment_placeholder')&&/^[A-Z][a-z]+(?: [A-Z][a-z]+)+$/.test(value)&&!/^(?:Choose|Select|Enter|Type|Find|Search|Save|Open|Add|Edit|Remove|Create|Customer|Client|Full|First|Last|Your|Contact|Person|Name)\b/.test(value)){
  const isNameExample=occurrences.every(o=>{
   try{return [...readFileSync(path.join(ROOT,o.file),'utf8').matchAll(/<input\b[^>]*>/gi)].some(m=>m[0].includes('placeholder="'+value+'"')&&/(?:id|class|name)="[^"]*\b(?:name|contact|person)\b[^"]*"/.test(m[0]));}catch{return false;}
  });if(isNameExample)return 'person-name example in an explicitly named contact field';
 }
 if(identities.has(value))return 'brand, software name or exact opt-out keyword';
 // Quantities, nutritional abbreviations and time-zone labels remain data. No prose is allowed.
 const remainder=value.replace(variables,'').replace(/\bSHA-256\b/g,'').replace(/[\d¼½¾]+/g,' ').replace(/\b(?:VIDA|FUEGO|LIGERO|MAR|COCO|CONGREEN|RAÍZ|Bowl|bowls?|kcal|oz|lb|qt|gal|min|ET|AM|PM|P|C|F|No|HTML|SHA-256)\b/g,'').replace(/[\d¼½¾\s~·/.,:%()⊘+−–—-]/g,'');
 if(!remainder)return 'measurement, time or brand-format data only';
 // Historical training mocks include a sample name alongside a generic translated item label.
 // Treat the name as data only when the remaining label has a registered language template.
 if(occurrences.length&&occurrences.every(o=>o.file==='public/hub/training.html')){
  const scaffold=value.replace(/^[A-Z][a-z]+ [A-Z]\./,'{value}').replace(/\b\d+\b/g,'{value}');
  if(/^\{value\} · \{value\} bowls$/.test(scaffold))return 'training mock name and bowl count data';
  if(index.knows(scaffold))return 'training mock data with a registered label template';
  if(value==='Pernil, arroz, VIDA…')return 'Spanish catalog-name examples in a training mock';
 }
 return null;
}
export function evaluateReport(report,{index=translationIndex()}={}){
 const candidates=report.candidates.filter(row=>row.occurrences.some(o=>o.kind.startsWith('fragment_')||uiKinds.has(o.kind)));
 const preserved=[],unmapped=[];
 for(const row of candidates){const reason=invariantReason(row.text,row.occurrences,index);if(reason)preserved.push({...row,reason});else unmapped.push(row);}
 return {scope:'Authored Hub HTML fragments, visible accessibility attributes, display label tuples/maps, and toast/custom-validity messages; not stored/user/provider content or browser behavior.',source_files:report.source_files,parse_errors:report.parse_errors,preserved,unmapped,ok:report.parse_errors.length===0&&unmapped.length===0};
}
export function scanHTMLCopy(root=ROOT){const report=JSON.parse(execFileSync('python3',['scripts/hub-spanish-coverage-audit.py','--json'],{cwd:root,maxBuffer:30*1024*1024}));return evaluateReport(report,{index:translationIndex(root)});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const result=scanHTMLCopy();console.log(JSON.stringify(result,null,2));process.exitCode=result.ok?0:1;}
