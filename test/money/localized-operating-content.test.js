import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import {
  documentListReadingEdition, legacyRecipeReadingEdition, requestedReadingLocale,
  resolveDocumentReadingEdition, resolveRecipeReadingEdition, sha256Text,
} from '../../functions/_lib/localized_operating_content.js';
import { onRequestGet as getDoc } from '../../functions/api/hub/kitchen/docs/get.js';
import { onRequestGet as listDocs } from '../../functions/api/hub/kitchen/docs/list.js';
import { onRequestGet as getRecipes } from '../../functions/api/hub/kitchen/recipes.js';

const docSource = { id: 'doc_synthetic', version: 4, title: 'Synthetic source title', body: 'Synthetic source body\n' };
const docPayload = { title: 'Título sintético', body: 'Texto sintético' };
const recipeSource = {
  id: 'recipe_synthetic', name: 'Synthetic recipe', ingredients: '["2 oz sample item"]', steps: '["Stir for 2 min"]',
};
const recipePayload = { name: 'Receta sintética', ingredients: ['2 oz de muestra'], steps: ['Mezcla durante 2 min'] };

function request(path, cookie = OWNER_COOKIE) {
  return new Request(`https://test.example${path}`, { headers: { cookie } });
}

async function insertDoc(env, doc = docSource, scope = '["owner","kitchen"]', payload = docPayload) {
  const now = Date.now();
  await env.DB.prepare('INSERT INTO docs(id,doc_type,title,body,role_scope,version,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(doc.id, 'manual', doc.title, doc.body, scope, doc.version, 1, now, now).run();
  await env.DB.prepare(`INSERT INTO operating_reading_editions
    (entity_kind,entity_id,locale,source_version,source_hash,source_title,payload_json,created_at)
    VALUES('document',?,'es',?,?,?,?,?)`)
    .bind(doc.id, String(doc.version), await sha256Text(doc.body), doc.title, JSON.stringify(payload), now).run();
}

async function insertRecipe(env, recipe = recipeSource, payload = recipePayload) {
  const now = Date.now();
  await env.DB.prepare('INSERT INTO recipes(id,name,ingredients,steps,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .bind(recipe.id, recipe.name, recipe.ingredients, recipe.steps, 'published', now, now).run();
  const sourceHash = await sha256Text(JSON.stringify({ name: recipe.name, ingredients: recipe.ingredients, steps: recipe.steps }));
  await env.DB.prepare(`INSERT INTO operating_reading_editions
    (entity_kind,entity_id,locale,source_version,source_hash,source_title,payload_json,created_at)
    VALUES('recipe',?,'es','legacy',?,NULL,?,?)`)
    .bind(recipe.id, sourceHash, JSON.stringify(payload), now).run();
}

test('locale parsing, synthetic digest binding and stale/missing payload behavior', async () => {
  assert.equal(requestedReadingLocale(request('/route?lang=ES')), 'es');
  assert.equal(requestedReadingLocale(request('/route?lang=en')), 'en');
  assert.equal(requestedReadingLocale(request('/route')), 'en');

  const entry = {
    source_version: String(docSource.version), source_hash: await sha256Text(docSource.body),
    source_title: docSource.title, payload: docPayload,
  };
  const current = resolveDocumentReadingEdition(docSource, entry, entry.source_hash);
  assert.equal(current.status, 'current');
  assert.equal(current.title, docPayload.title);
  assert.equal(current.body, docPayload.body);
  assert.equal(resolveDocumentReadingEdition({ ...docSource, version: 5 }, entry, entry.source_hash).status, 'stale');
  assert.equal(resolveDocumentReadingEdition({ ...docSource, title: 'Retitled source' }, entry, entry.source_hash).status, 'stale');
  assert.equal(resolveDocumentReadingEdition(docSource, entry, '0'.repeat(64)).status, 'stale');
  assert.equal(resolveDocumentReadingEdition(docSource, null, null).status, 'unavailable');
  assert.equal(resolveDocumentReadingEdition(docSource, entry, entry.source_hash, 'en'), null);

  const recipeEntry = { source_version: 'legacy', source_hash: await sha256Text(JSON.stringify({
    name: recipeSource.name, ingredients: recipeSource.ingredients, steps: recipeSource.steps,
  })), payload: recipePayload };
  const translated = await resolveRecipeReadingEdition(recipeSource, recipeEntry, false, recipeEntry.source_hash);
  assert.equal(translated.status, 'current');
  assert.deepEqual(translated.ingredients, recipePayload.ingredients);
  assert.deepEqual(translated.steps, recipePayload.steps);
  assert.equal(resolveRecipeReadingEdition(recipeSource, recipeEntry, true, recipeEntry.source_hash).status, 'stale');
  assert.equal(resolveRecipeReadingEdition(recipeSource, recipeEntry, null, recipeEntry.source_hash).status, 'unavailable');
  assert.equal(resolveRecipeReadingEdition(recipeSource, null, false, recipeEntry.source_hash).status, 'unavailable');
  assert.equal(resolveRecipeReadingEdition(recipeSource, recipeEntry, false, recipeEntry.source_hash, 'en'), null);
});

test('authenticated document endpoints keep source fields intact and use only hash/version-bound synthetic rows', async () => {
  const env = ownerEnv();
  await insertDoc(env);
  const before = env.DB.one('SELECT title,body,version,updated_at FROM docs WHERE id=?', docSource.id);

  const esResponse = await getDoc({ request: request(`/api/hub/kitchen/docs/get?id=${docSource.id}&lang=es`), env });
  const esBody = await esResponse.json();
  assert.deepEqual(esBody.doc, { id: docSource.id, doc_type: 'manual', title: docSource.title, body: docSource.body, version: docSource.version, updated_at: before.updated_at, recipe_id: null, image_key: null });
  assert.equal(esBody.reading_edition_es.status, 'current');
  assert.equal(esBody.reading_edition_es.title, docPayload.title);
  assert.equal(esBody.reading_edition_es.body, docPayload.body);

  const listResponse = await listDocs({ request: request(`/api/hub/kitchen/docs/list?lang=es&q=${encodeURIComponent(docPayload.title)}`), env });
  const listed = (await listResponse.json()).docs.find((doc) => doc.id === docSource.id);
  assert.equal(listed.title, docPayload.title);
  assert.equal(listed.source_title, docSource.title);
  assert.equal(listed.localization.status, 'current');

  const enResponse = await getDoc({ request: request(`/api/hub/kitchen/docs/get?id=${docSource.id}`), env });
  const enBody = await enResponse.json();
  assert.equal(enBody.doc.title, docSource.title);
  assert.equal('reading_edition_es' in enBody, false);

  const changed = { ...docSource, version: 5, body: 'Changed synthetic body' };
  await env.DB.prepare('UPDATE docs SET version=?, body=? WHERE id=?').bind(changed.version, changed.body, changed.id).run();
  const staleResponse = await getDoc({ request: request(`/api/hub/kitchen/docs/get?id=${docSource.id}&lang=es`), env });
  const stale = await staleResponse.json();
  assert.equal(stale.reading_edition_es.status, 'stale');
  assert.equal('body' in stale.reading_edition_es, false);
  assert.deepEqual({ ...env.DB.one('SELECT title,body,version FROM docs WHERE id=?', docSource.id) }, { title: docSource.title, body: changed.body, version: changed.version });
});

test('document visibility and role checks stay ahead of localized row lookup', async () => {
  const env = ownerEnv();
  await insertDoc(env, { ...docSource, id: 'doc_owner_only' }, '["owner"]');
  const denied = await getDoc({ request: request('/api/hub/kitchen/docs/get?id=doc_owner_only&lang=es', 'anejo_sess=tok-marketing'), env });
  assert.equal(denied.status, 403);

  const before = env.DB.calls.length;
  const hiddenList = await listDocs({ request: request('/api/hub/kitchen/docs/list?lang=es', 'anejo_sess=tok-kitchen'), env });
  assert.equal((await hiddenList.json()).docs.some((doc) => doc.id === 'doc_owner_only'), false);
  const calls = env.DB.calls.slice(before).map((x) => x.sql);
  assert.equal(calls.some((sql) => sql.includes('FROM operating_reading_editions')), false);
});

test('recipe read edition is separate from the source/editor and stale once a revision exists', async () => {
  const env = ownerEnv();
  await insertRecipe(env);
  const before = env.DB.one('SELECT name,ingredients,steps,status,updated_at FROM recipes WHERE id=?', recipeSource.id);
  const response = await getRecipes({ request: request(`/api/hub/kitchen/recipes?id=${recipeSource.id}&lang=es`), env });
  const body = await response.json();
  assert.equal(body.recipe.name, recipeSource.name);
  assert.equal(body.reading_edition_es.status, 'current');
  assert.equal(body.reading_edition_es.name, recipePayload.name);
  assert.deepEqual(body.reading_edition_es.ingredients, recipePayload.ingredients);
  assert.deepEqual(body.reading_edition_es.steps, recipePayload.steps);
  assert.deepEqual(env.DB.one('SELECT name,ingredients,steps,status,updated_at FROM recipes WHERE id=?', recipeSource.id), before);

  await env.DB.prepare(`INSERT INTO recipe_revisions
    (id,recipe_id,version,based_on_updated_at,payload_json,content_hash,status,created_by,created_at)
    VALUES('revision_synthetic',?,1,?,'{}','hash','draft','owner',?)`)
    .bind(recipeSource.id, before.updated_at, Date.now()).run();
  const stale = await legacyRecipeReadingEdition(env, recipeSource.id, 'es');
  assert.equal(stale.status, 'stale');
  assert.equal('steps' in stale, false);
});

test('invalid JSON payloads and missing edition rows fail closed without translated fields', async () => {
  const env = ownerEnv();
  await insertDoc(env);
  await env.DB.prepare('UPDATE operating_reading_editions SET payload_json=? WHERE entity_kind=? AND entity_id=?')
    .bind('{invalid', 'document', docSource.id).run();
  const response = await getDoc({ request: request(`/api/hub/kitchen/docs/get?id=${docSource.id}&lang=es`), env });
  const body = await response.json();
  assert.equal(body.reading_edition_es.status, 'unavailable');
  assert.equal('body' in body.reading_edition_es, false);

  const absent = await documentListReadingEdition(env, { ...docSource, id: 'doc_missing' }, 'es');
  assert.equal(absent.localization.status, 'unavailable');
  assert.equal(absent.title, docSource.title);
});

test('recipe selector names are read-only, source-bound and excluded once edited', async () => {
  const env = ownerEnv();
  await insertRecipe(env);
  const before = env.DB.one('SELECT name,ingredients,steps,status FROM recipes WHERE id=?', recipeSource.id);
  let response = await getRecipes({ request: request('/api/hub/kitchen/recipes?lang=es'), env });
  let body = await response.json();
  assert.equal(body.recipe_name_editions_es[recipeSource.id], recipePayload.name);
  assert.equal(body.recipes.find((r) => r.id === recipeSource.id).name, recipeSource.name);
  assert.equal(JSON.stringify(body.recipe_name_editions_es).includes('ingredients'), false);
  response = await getRecipes({ request: request('/api/hub/kitchen/recipes?lang=en'), env });
  assert.equal('recipe_name_editions_es' in await response.json(), false);
  assert.deepEqual(env.DB.one('SELECT name,ingredients,steps,status FROM recipes WHERE id=?', recipeSource.id), before);
  await env.DB.prepare('UPDATE recipes SET steps=? WHERE id=?').bind('["Changed source"]', recipeSource.id).run();
  response = await getRecipes({ request: request('/api/hub/kitchen/recipes?lang=es'), env });
  body = await response.json();
  assert.equal(body.recipe_name_editions_es[recipeSource.id], undefined);
});
