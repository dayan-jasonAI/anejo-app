import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { ownerQuoteCatalog } from '../../../_lib/catering_quote_catalog.js';
export async function onRequestGet({request,env}) {
  const auth=await requireRole(request,env,['owner']);
  if(auth instanceof Response)return auth;
  try {const result=await ownerQuoteCatalog(env);return json(result,result.ok?200:503,{'Cache-Control':'no-store'});}
  catch {return bad('Cannot load the live menu. No prices were changed.',503);}
}
