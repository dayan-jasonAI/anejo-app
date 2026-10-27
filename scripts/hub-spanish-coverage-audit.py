#!/usr/bin/env python3
"""Conservative source inventory, not proof that every runtime string is translated."""
import ast,collections,html,json,re,sys,subprocess
from pathlib import Path
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parents[1]
STR=re.compile(r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`''',re.S)
def unquote(s):
 try:return json.loads(s) if s[0]=='"' else ast.literal_eval(s) if s[0]=="'" else s[1:-1]
 except Exception:return s[1:-1]
def words(s):
 s=html.unescape(re.sub(r'\s+',' ',s)).strip()
 return s if 2<len(s)<1200 and re.search('[A-Za-z]',s) and not re.search(r'^(?:https?://|/|#[\da-fA-F]{3,8}$|[a-zA-Z0-9_.:-]+$)',s) and not any(x in s for x in ['=>','function(','document.','window.','SELECT ','INSERT ','UPDATE ','const ','var ','return ','{margin','{display']) else None
class Text(HTMLParser):
 def __init__(self):super().__init__();self.skip=0;self.rows=[]
 def handle_starttag(self,t,a):
  if t in ['script','style']:self.skip+=1
  if not self.skip:
   for k,v in a:
    if k in ['placeholder','aria-label','title','alt'] and v:self.rows.append((k,v,self.getpos()[0]))
 def handle_endtag(self,t):
  if t in ['script','style']:self.skip=max(0,self.skip-1)
 def handle_data(self,s):
  if not self.skip and s.strip():self.rows.append(('visible',s,self.getpos()[0]))
known=set()
# Parse dictionary AST keys; regex over comments/apostrophes can silently undercount.
dict_files=[ROOT/'public/assets/js/i18n.js',ROOT/'public/hub/assets/hub-i18n.js',ROOT/'public/hub/assets/catering-i18n.js',ROOT/'public/hub/assets/hub-i18n-coverage.js']
key_program="""const fs=require('fs');const p=require(require.resolve('espree',{paths:[process.cwd()+'/node_modules','/Users/aiagent/Dayan Workspace/Aether/anejo-app/node_modules']}));let keys=[];function walk(n){if(!n||typeof n!=='object')return;if(n.type==='Property'&&n.key?.type==='Literal'&&typeof n.key.value==='string'&&n.value?.type==='Literal'&&typeof n.value.value==='string')keys.push(n.key.value);for(const [k,v]of Object.entries(n)){if(k==='loc')continue;if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}}for(const f of JSON.parse(fs.readFileSync(0,'utf8')))if(fs.existsSync(f))walk(p.parse(fs.readFileSync(f,'utf8'),{ecmaVersion:'latest',sourceType:'module'}));process.stdout.write(JSON.stringify(keys));"""
known.update(json.loads(subprocess.check_output(['node','-e',key_program],input=json.dumps([str(p) for p in dict_files]).encode(),cwd=ROOT)))
records=[];source_known=[];routes=[];paths=sorted(list((ROOT/'public/hub').rglob('*.html'))+list((ROOT/'public/hub').rglob('*.js'))+list((ROOT/'hub-app/src').rglob('*.tsx')))
literal_result=json.loads(subprocess.check_output(['node',str(ROOT/'scripts/hub-spanish-coverage-extract.cjs')],input=json.dumps([str(p) for p in paths if not p.name.startswith('hub-i18n')]).encode()))
literal_rows=collections.defaultdict(list)
for x in literal_result['rows']:literal_rows[x['file']].append(x)
for p in paths:
 if p.name.startswith('hub-i18n') or 'vendor' in p.parts or p.name in ['sw.js']:continue
 s=p.read_text();relative=str(p.relative_to(ROOT));rows=[]
 if p.suffix=='.html':
  parser=Text();parser.feed(s);rows.extend(parser.rows);routes.append({'file':relative,'direct_i18n':bool(re.search(r'<script[^>]+src=["\'][^"\']*i18n',s)),'loads_shared_hub':bool(re.search(r'<script[^>]+src=["\'][^"\']*(?:assets/)?hub\.js',s)),'redirect':bool(re.search(r'(?:http-equiv=["\']refresh|location\.replace)',s))})
 for literal in literal_rows[str(p)]:
  value=literal['value'];line=literal['line']
  if '<' in value and '>' in value:
   parser=Text()
   try:parser.feed(value)
   except Exception:continue
   rows.extend(('fragment_'+kind,t,line) for kind,t,_ in parser.rows)
  elif words(value):rows.append(('literal_candidate',value,line))
 for kind,value,line in rows:
  value=words(value)
  if value in known:source_known.append({'file':relative,'line':line,'text':value,'kind':kind})
  if value and value not in known:records.append({'file':relative,'line':line,'kind':kind,'text':value})
by=collections.defaultdict(list)
for x in records:by[x['text']].append({k:x[k] for k in ['file','line','kind']})
result={'scope':'LegacyHubHTML/JS + ReactStudioTSX; static source inventory, not runtime or semantic completeness','source_files':len(paths),'html_routes':len(routes),'known_exact_keys':len(known),'source_exact_covered_unique':len({x['text'] for x in source_known}),'source_exact_covered_occurrences':len(source_known),'candidate_unique_missing':len(by),'candidate_occurrences':len(records),'parse_errors':literal_result['errors'],'route_loading':routes,'candidates':[{'text':k,'occurrences':v} for k,v in sorted(by.items(),key=lambda kv:(-len(kv[1]),kv[0]))]}
if '--json' in sys.argv:print(json.dumps(result,ensure_ascii=False,indent=2))
else:
 print(json.dumps({k:v for k,v in result.items() if k not in ['candidates','route_loading','parse_errors']},indent=2))
 for x in result['candidates'][:int(sys.argv[1] if len(sys.argv)>1 else 180)]:print(json.dumps(x,ensure_ascii=False))
