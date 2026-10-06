// Operational staff read-only inventory. No receipts, costs, contacts or write capability.
import { requireRole, STAFF_ROLES } from '../../_lib/roles.js';
import { json, bad } from '../../_lib/util.js';
import { productionStatus } from '../../_lib/inventory_production.js';

const headers = { 'Cache-Control': 'private, no-store' };
const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
function evidence(value, countedAt, at) {
  const quantity = number(value), date = number(countedAt);
  const valid = date != null && date > 0 && date <= at;
  return { quantity: valid ? quantity : null, counted_at: date,
    status: !date || quantity == null ? 'unknown' : date > at ? 'invalid_future_count' : 'recorded',
    age_hours: valid ? Math.round((at - date) / 36000) / 100 : null };
}
export async function onRequestGet({ request, env }) {
  const ctx = await requireRole(request, env, STAFF_ROLES);
  if (ctx instanceof Response) return ctx;
  const url = new URL(request.url), q = (url.searchParams.get('q') || '').trim();
  const section = url.searchParams.get('section') || 'ingredients';
  const limit = Number(url.searchParams.get('limit') || 30), offset = Number(url.searchParams.get('offset') || 0);
  if (q.length > 100 || !['ingredients','finished','plans'].includes(section) || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) return bad('Invalid inventory search or page.');
  const at = Date.now();
  try {
    let items, more;
    if (section === 'ingredients') {
      // Escape LIKE metacharacters so input is a literal substring, never a wildcard query.
      const pattern = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
      const res = await env.DB.prepare("SELECT i.id,i.name,i.unit,i.on_hand,i.count_quantity,i.total_weight_grams,i.counted_at,i.expires_on,i.photo_status FROM inventory_items i LEFT JOIN staff v ON v.id=i.vendor_id LEFT JOIN inventory_suppliers s ON s.id=i.supplier_id WHERE i.active=1 AND (i.name LIKE ? ESCAPE '\\' OR COALESCE(s.name,v.name,'') LIKE ? ESCAPE '\\') ORDER BY i.name,i.id LIMIT ? OFFSET ?").bind(pattern,pattern,limit+1,offset).all();
      if (!res || res.success === false || !Array.isArray(res.results)) throw Error('inventory_read_failed');
      more = res.results.length > limit;
      items = res.results.slice(0,limit).map(item => ({ id:item.id,name:item.name,unit:item.unit,
        on_hand:evidence(item.on_hand,item.counted_at,at), count_quantity:evidence(item.count_quantity,item.counted_at,at),
        total_weight_grams:evidence(item.total_weight_grams,item.counted_at,at), expires_on:item.expires_on || null,
        photo_status:item.photo_status }));
    } else {
      const status = await productionStatus(env);
      const rows = (section === 'finished' ? status.menu : status.opportunities).filter(item => String(item.name || '').toLowerCase().includes(q.toLowerCase())).sort((a,b) => String(a.name).localeCompare(String(b.name)) || String(a.id || a.menu_item_id).localeCompare(String(b.id || b.menu_item_id)));
      more = rows.length > offset + limit;
      items = rows.slice(offset,offset+limit).map(item => section === 'finished' ? {
        id:item.id,name:item.name,active:!!item.active,availability:item.availability,
        count:evidence(item.stock_count,item.stock_counted_at,at),committed_today:number(item.committed)
      } : { menu_item_id:item.menu_item_id,name:item.name,eligible:!!item.eligible,
        suggested_qty:item.eligible ? item.qty : null,enabled:!!item.enabled,
        // Internal reasons can contain mapped stock IDs; no mappings or recipe data are shared.
        attention_required:!item.eligible });
    }
    return json({ ok:true,access:'read_only',read_at:at,section,q,limit,offset,next_offset:more ? offset+limit : null,items,
      evidence_note:'Saved records at read_at. Counts are recorded measurements, not physical verification; plans are proposals, not sellable stock.' },200,headers);
  } catch { return json({ok:false,error:'Inventory availability is temporarily unavailable.',read_at:at,section,items:null},503,headers); }
}
