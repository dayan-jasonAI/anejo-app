import { afterEach, expect, it, vi } from 'vitest';
import { publishRecipeDraft } from '../../src/lib/publishRecipeDraft';

afterEach(() => vi.unstubAllGlobals());
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const draft = { name: 'Kitchen recipe', ingredients: ['ingredient'], steps: ['prepare'] };

it('retries publication using the saved ID without creating another recipe', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(response({ recipe: { id: 'recipe_1' } }))
    .mockResolvedValueOnce(response({ error: 'unavailable' }, 503))
    .mockResolvedValueOnce(response({ ok: true }));
  vi.stubGlobal('fetch', fetcher);
  const first = await publishRecipeDraft('session_1', draft, null);
  expect(first).toEqual({ ok: false, recipeId: 'recipe_1' });
  expect(await publishRecipeDraft('session_1', draft, first.recipeId)).toEqual({ ok: true, recipeId: 'recipe_1' });
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    '/api/hub/kitchen/recipe/create', '/api/hub/kitchen/recipe/publish', '/api/hub/kitchen/recipe/publish',
  ]);
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ id: 'recipe_1' });
});

it('does not attempt publication when recipe creation fails', async () => {
  const fetcher = vi.fn().mockResolvedValue(response({}, 503));
  vi.stubGlobal('fetch', fetcher);
  expect(await publishRecipeDraft('session_1', draft, null)).toEqual({ ok: false, recipeId: null });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('retains the saved ID when the publish request loses its network connection', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  expect(await publishRecipeDraft('session_1', draft, 'recipe_saved')).toEqual({ ok: false, recipeId: 'recipe_saved' });
});
