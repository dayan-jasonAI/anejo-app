import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useI18n } from '../lib/i18n';
import { getInventory, getProduction, inventoryPhoto } from '../lib/inventory';
import '../inventory-panel.css';

export function InventoryPanel({ mode, onClose }: { mode: 'inventory' | 'production'; onClose: () => void }) {
  const { lang } = useI18n();
  const es = lang === 'es';
  const [search, setSearch] = useState('');
  const stock = useQuery({ queryKey: ['studio-inventory'], queryFn: getInventory, staleTime: 0, retry: false });
  const production = useQuery({ queryKey: ['studio-production'], queryFn: getProduction, staleTime: 0, retry: false });
  const number = (value: number | null) => value == null ? (es ? 'Sin registrar' : 'Not recorded') : value.toLocaleString();
  const checkedAt = mode === 'inventory' ? stock.dataUpdatedAt : production.dataUpdatedAt;
  const error = mode === 'inventory' ? stock.error : production.error;
  const loading = mode === 'inventory' ? stock.isPending : production.isPending;
  return <section className="si-panel" aria-label={es ? 'Inventario y producción' : 'Inventory and production'}>
    <header className="si-head"><div><h2>{mode === 'inventory' ? (es ? 'Inventario de cocina' : 'Kitchen inventory') : (es ? 'Planes de producción sugeridos' : 'Suggested production plans')}</h2>
      <p>{es ? 'Datos registrados en el Hub. Las sugerencias no son comida preparada.' : 'Recorded Hub data. Suggestions are not finished food.'}</p>
    </div><button type="button" onClick={onClose} aria-label={es ? 'Cerrar inventario' : 'Close inventory'}>×</button></header>
    <div className="si-actions"><button type="button" disabled={stock.isFetching || production.isFetching} onClick={() => { void stock.refetch(); void production.refetch(); }}>{es ? 'Actualizar' : 'Refresh'}</button>
      <a href="/hub/kitchen/inventory#inventory-production">{es ? 'Revisar planes en cocina' : 'Review kitchen plans'} →</a>
      <a href="/hub/kitchen/inventory">{es ? 'Administrar inventario' : 'Manage inventory'} →</a></div>
    {checkedAt > 0 && !error ? <p className="si-time">{es ? 'Consultado' : 'Retrieved'} {new Date(checkedAt).toLocaleString(es ? 'es-US' : 'en-US')}</p> : null}
    {loading ? <p role="status">{es ? 'Cargando datos…' : 'Loading records…'}</p> : error ? <p role="alert">{error.message === 'access' ? (es ? 'Inicia sesión como propietario o personal de cocina para ver estos datos.' : 'Sign in as owner or kitchen staff to view these records.') : (es ? 'No se pudieron consultar los datos. Intenta actualizar.' : 'Records could not be loaded. Try Refresh.')}</p> :
      mode === 'inventory' ? <><label className="si-search">{es ? 'Buscar artículo' : 'Find an item'}<input value={search} onChange={e => setSearch(e.target.value)} type="search" /></label>
        <div className="si-grid">{(stock.data || []).filter(item => item.name.toLowerCase().includes(search.toLowerCase())).map(item => <article className="si-card" key={item.id}>
          <div className="si-item-head">{inventoryPhoto(item.photo_key) ? <img src={inventoryPhoto(item.photo_key)} alt={item.name} loading="lazy" /> : <span className="si-no-photo">{es ? 'Sin foto' : 'No photo'}</span>}<div><h3>{item.name}</h3><p>{es ? 'Foto' : 'Photo'}: {item.photo_status}</p></div></div>
          <dl><div><dt>{es ? 'Disponible' : 'On hand'} ({item.unit || '—'})</dt><dd>{number(item.on_hand)}</dd></div><div><dt>{es ? 'Cantidad' : 'Count'}</dt><dd>{number(item.count_quantity)}</dd></div><div><dt>{es ? 'Peso total' : 'Total weight'} (g)</dt><dd>{number(item.total_weight_grams)}</dd></div></dl>
          <p>{item.counted_at ? `${es ? 'Conteo registrado' : 'Count recorded'} ${new Date(item.counted_at).toLocaleString(es ? 'es-US' : 'en-US')}` : (es ? 'Sin fecha de conteo verificada' : 'No verified count date')}</p>{item.expires_on ? <p>{es ? 'Vence' : 'Expires'}: {item.expires_on}</p> : null}
        </article>)}</div>{!(stock.data || []).length ? <p>{es ? 'No hay artículos registrados.' : 'No inventory items recorded.'}</p> : null}</> : <>
        <div className="si-summary">{production.data?.tasks.length || 0} {es ? 'tareas abiertas' : 'open tasks'} · {production.data?.opportunities.filter(o => o.eligible).length || 0} {es ? 'planes elegibles' : 'eligible plans'}</div>
        <div className="si-grid">{production.data?.opportunities.map(o => <article className="si-card" key={o.menu_item_id}><h3>{o.name}</h3><p className="si-state">{o.eligible ? (o.enabled ? (es ? 'Elegible · plan activo' : 'Eligible · plan enabled') : (es ? 'Elegible · plan desactivado' : 'Eligible · plan off')) : (es ? 'Necesita revisión' : 'Needs attention')}</p><p>{es ? 'Lote sugerido' : 'Suggested batch'}: {number(o.qty)}</p>{o.reasons.length ? <ul>{o.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul> : null}<a href="/hub/kitchen/inventory#inventory-production">{es ? 'Revisar y aprobar' : 'Review and approve'} →</a></article>)}</div>
        {!production.data?.opportunities.length ? <p>{es ? 'Todavía no hay planes revisados. Configura las cantidades de ingredientes y empaques para calcular lotes reales.' : 'No reviewed plans yet. Set ingredient and packaging quantities to calculate real batches.'}</p> : null}
        {production.data?.tasks.map(task => <p className="si-task" key={task.id}>{production.data?.menu.find(m => m.id === task.menu_item_id)?.name || task.menu_item_id} · {task.qty} · {task.status}</p>)}
      </>}
  </section>;
}
