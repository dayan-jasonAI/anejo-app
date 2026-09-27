import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { readExecution, mutateExecution } from '../../../_lib/catering_execution.js';
export async function onRequestGet({request,env}) {
  if (!env.DB) return bad('Database not configured.',500);
  const ctx = await requireRole(request,env,['owner','kitchen']);
  if (ctx instanceof Response) return ctx;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return bad('Event id required.');
  try { const r = await readExecution(env,id); return json({...r,can_write:ctx.role === 'owner'},r.status || 200); }
  catch { return bad('Could not load event execution.',500); }
}
export async function onRequestPost({request,env}) {
  if (!env.DB) return bad('Database not configured.',500);
  const ctx = await requireRole(request,env,['owner']);
  if (ctx instanceof Response) return ctx;
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  try { const r = await mutateExecution(env,b,ctx); return json({...r,can_write:ctx.role === 'owner'},r.status || 200); }
  catch { return bad('Could not save event execution. Reload before retrying.',500); }
}
