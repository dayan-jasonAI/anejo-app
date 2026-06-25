import { describe, it, expect, vi, beforeEach } from 'vitest';
import { draftRecipe, createRecipe, publishRecipe } from '../../src/lib/api';

function res(ok: boolean, data: unknown): Response {
  return { ok, json: async () => data } as unknown as Response;
}

describe('recipe draft → publish flow', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('draftRecipe returns the AI draft', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(true, { draft: { name: 'VIDA' }, demo: false })));
    const d = await draftRecipe('rsess_1');
    expect(d?.draft.name).toBe('VIDA');
  });

  it('draftRecipe returns null on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(false, {})));
    expect(await draftRecipe('rsess_1')).toBeNull();
  });

  it('createRecipe posts the session id + draft fields', async () => {
    const f = vi.fn().mockResolvedValue(res(true, { recipe: { id: 'rec_1' } }));
    vi.stubGlobal('fetch', f);
    const c = await createRecipe('rsess_1', { name: 'VIDA', ingredients: ['tuna'], steps: ['sear'] });
    expect(c?.recipe.id).toBe('rec_1');
    const [url, opts] = f.mock.calls[0];
    expect(url).toBe('/api/hub/kitchen/recipe/create');
    const body = JSON.parse(opts.body);
    expect(body.session_id).toBe('rsess_1');
    expect(body.name).toBe('VIDA');
    expect(body.ingredients).toEqual(['tuna']);
  });

  it('publishRecipe → true on ok, false otherwise', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(true, { ok: true })));
    expect(await publishRecipe('rec_1')).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(false, {})));
    expect(await publishRecipe('rec_1')).toBe(false);
  });
});
