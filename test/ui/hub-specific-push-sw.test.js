import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../public/hub/sw.js', import.meta.url), 'utf8');
function worker({ lang = 'en', peek, fail = false } = {}) {
  const listeners = {}; const notifications = []; const deleted = []; const values = new Map(); let fetches = 0;
  const caches = {
    open: async () => ({ match: async (key) => values.get(key)?.clone(), put: async (key, value) => values.set(key, value) }),
    keys: async () => ['anejo-hub-v7', 'anejo-hub-v8', 'anejo-hub-preferences', 'storefront-v1', 'other-app'],
    delete: async (key) => deleted.push(key),
  };
  const self = {
    addEventListener: (type, handler) => { listeners[type] = handler; },
    navigator: { language: lang }, location: { origin: 'https://anejocateringco.com' },
    registration: { showNotification: async (title, opts) => { notifications.push({ title, ...opts }); } },
    clients: { claim: async () => {} },
  };
  vm.runInNewContext(source, { self, caches, URL, Response, Date, fetch: async () => {
    fetches++; if (fail) throw Error('offline'); return { ok: true, json: async () => peek };
  } });
  const fire = async (type, data = {}) => {
    let promise; listeners[type]({ ...data, waitUntil(p) { promise = p; } }); await promise;
  };
  return { fire, notifications, deleted, fetches: () => fetches };
}

test('specific data payload works offline without peek and chooses Spanish saved by the Hub', async () => {
  const sw = worker({ fail: true });
  await sw.fire('message', { source: { url: 'https://anejocateringco.com/hub/owner/' }, data: { type: 'HUB_PUSH_LANGUAGE', lang: 'es' } });
  await sw.fire('push', { data: { json: () => ({ title: 'New paid order', body: 'Payment received.', title_es: 'Nuevo pedido pagado', body_es: 'Pago recibido.', tag: 'anejo-hub-order1', url: '/hub/owner/orders.html' }) } });
  assert.equal(sw.fetches(), 0); assert.equal(sw.notifications[0].title, 'Nuevo pedido pagado');
  assert.equal(sw.notifications[0].body, 'Pago recibido.');
  assert.equal(sw.notifications[0].tag, 'anejo-hub-order1');
  assert.equal(sw.notifications[0].data.url, '/hub/owner/orders.html');
});

test('legacy empty push with zero pending events does not invent a new message', async () => {
  const sw = worker({ peek: { ok: true, notify: false, unread: 0 } });
  await sw.fire('push'); assert.equal(sw.fetches(), 1); assert.equal(sw.notifications.length, 0);
});

test('legacy failure explains missing details, rather than falsely claiming a new order', async () => {
  const sw = worker({ fail: true, lang: 'es-MX' }); await sw.fire('push');
  assert.equal(sw.notifications[0].title, 'Detalles de notificación no disponibles');
  assert.doesNotMatch(sw.notifications[0].body, /you have a new update|pedido nuevo/i);
});

test('activation deletes only old Hub shell caches and preserves language and other apps', async () => {
  const sw = worker(); await sw.fire('activate'); assert.deepEqual(sw.deleted, ['anejo-hub-v7']);
});

test('unsafe deep links cannot leave Hub and cross-origin language messages are ignored', async () => {
  const sw = worker();
  await sw.fire('message', { source: { url: 'https://evil.test/hub/' }, data: { type: 'HUB_PUSH_LANGUAGE', lang: 'es' } });
  await sw.fire('push', { data: { json: () => ({ title: 'New order', body: 'Review order', title_es: 'Pedido nuevo', body_es: 'Revisa el pedido', url: 'https://evil.test', tag: 'anejo-hub-order2' }) } });
  assert.equal(sw.notifications[0].title, 'New order'); assert.equal(sw.notifications[0].data.url, '/hub/');
});
