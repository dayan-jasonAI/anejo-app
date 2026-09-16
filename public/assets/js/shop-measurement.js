(function () {
  'use strict';
  var previous = new Map();
  function normalize(rows) {
    var grouped = new Map();
    (rows || []).forEach(function (row) {
      var id = String(row.item_id || '');
      var price = Number(row.price), quantity = Number(row.quantity);
      if (!/^[a-z0-9_-]{1,100}$/i.test(id) || !Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1) return;
      var key = id + ':' + price;
      var item = grouped.get(key) || { item_id: id, price: price, quantity: 0 };
      item.quantity += quantity;
      grouped.set(key, item);
    });
    return grouped;
  }
  function emit(event, items) {
    if (typeof window.gtag !== 'function') return;
    try {
      window.gtag('event', event, {
        currency: 'USD',
        value: Math.round(items.reduce(function (sum, item) { return sum + item.price * item.quantity; }, 0) * 100) / 100,
        items: items,
      });
    } catch (_) { /* Analytics must never interrupt ordering. */ }
  }
  window.AnejoShopMeasurement = {
    update: function (rows) {
      var next = normalize(rows), added = [], removed = [];
      next.forEach(function (item, key) {
        var delta = item.quantity - (previous.get(key)?.quantity || 0);
        if (delta > 0) added.push({ item_id: item.item_id, price: item.price, quantity: delta });
      });
      previous.forEach(function (item, key) {
        var delta = item.quantity - (next.get(key)?.quantity || 0);
        if (delta > 0) removed.push({ item_id: item.item_id, price: item.price, quantity: delta });
      });
      previous = next;
      if (added.length) emit('add_to_cart', added);
      if (removed.length) emit('remove_from_cart', removed);
    },
    step: function (name) {
      if (!['view_cart', 'begin_checkout', 'checkout_redirect', 'checkout_error'].includes(name)) return;
      var items = Array.from(previous.values());
      if (items.length) emit(name, items);
    },
  };
})();
