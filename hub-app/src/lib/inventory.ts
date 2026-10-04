export interface InventoryItem {
  id: string; name: string; unit: string; on_hand: number | null;
  count_quantity: number | null; total_weight_grams: number | null;
  counted_at: number | null; expires_on: string | null;
  photo_key: string | null; photo_status: string;
}
export interface Opportunity {
  menu_item_id: string; name: string; qty: number | null; eligible: boolean;
  enabled: boolean; reasons: string[];
}
export interface ProductionView {
  opportunities: Opportunity[];
  tasks: { id: string; menu_item_id: string; qty: number; status: string }[];
  menu: { id: string; name: string }[];
}
async function read(path: string) {
  const response = await fetch(path, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'access' : 'unavailable');
  return response.json();
}
export async function getInventory(): Promise<InventoryItem[]> {
  const data = await read('/api/hub/kitchen/inventory');
  if (!Array.isArray(data.items)) throw new Error('unavailable');
  return data.items;
}
export async function getProduction(): Promise<ProductionView> {
  const data = await read('/api/hub/kitchen/inventory-production');
  if (!Array.isArray(data.opportunities) || !Array.isArray(data.tasks) || !Array.isArray(data.menu)) throw new Error('unavailable');
  return data;
}
export function inventoryPhoto(key: string | null): string | undefined {
  if (!key || !key.startsWith('kitchen/inventory/') || key.split('/').some(p => p === '..')) return undefined;
  return '/api/hub/media/' + key.split('/').map(encodeURIComponent).join('/');
}
