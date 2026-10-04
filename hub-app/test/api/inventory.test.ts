import { afterEach, describe, expect, it, vi } from 'vitest';
import { getInventory, getProduction, inventoryPhoto } from '../../src/lib/inventory';
afterEach(() => vi.unstubAllGlobals());
describe('Studio inventory reads', () => {
  it('uses existing authenticated inventory route and preserves unrecorded quantities', async () => {
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({items:[{id:'rice',count_quantity:null}]})));
    vi.stubGlobal('fetch',fetcher);
    expect(await getInventory()).toEqual([{id:'rice',count_quantity:null}]);
    expect(fetcher).toHaveBeenCalledWith('/api/hub/kitchen/inventory',{credentials:'include',cache:'no-store'});
  });
  it('rejects access failures rather than showing empty stock', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:403})));
    await expect(getInventory()).rejects.toThrow('access');
  });
  it('rejects malformed production payloads rather than claiming no plans', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"tasks":[]}')));
    await expect(getProduction()).rejects.toThrow('unavailable');
  });
  it('preserves blocked production reasons and disabled plans', async () => {
    const data={opportunities:[{menu_item_id:'vida',eligible:false,enabled:false,qty:null,reasons:['Fresh count needed']}],tasks:[],menu:[]};
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(data))));
    expect(await getProduction()).toEqual(data);
  });
  it('only resolves private inventory photo paths and encodes individual segments', () => {
    expect(inventoryPhoto('https://evil.test/photo')).toBeUndefined();
    expect(inventoryPhoto('kitchen/inventory/../x')).toBeUndefined();
    expect(inventoryPhoto('kitchen/inventory/a/photo one.jpg')).toBe('/api/hub/media/kitchen/inventory/a/photo%20one.jpg');
  });
});
