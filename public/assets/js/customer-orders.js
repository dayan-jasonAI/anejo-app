(function (global) {
  'use strict';
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(value) { return '$' + (Number(value) / 100).toFixed(2); }
  var statuses = { pending: 'Awaiting payment confirmation', paid: 'Payment confirmed', prep: 'In preparation', ready: 'Ready', fulfilled: 'Delivered / fulfilled', canceled: 'Canceled' };
  global.AnejoCustomerOrders = {
    render: function (orders) {
      if (!orders || !orders.length) return '';
      return '<section aria-label="Your orders"><h2>Your orders</h2>' + orders.map(function (order) {
        var items = (order.items || []).map(function (item) { return '<li>' + esc(item.qty) + ' × ' + esc(item.name) + '</li>'; }).join('');
        return '<article class="card"><h3>Order ' + esc(order.id) + '</h3><p><strong>' + esc(statuses[order.status] || 'Status unavailable') + '</strong></p>' +
          '<p>Delivery: ' + esc(order.delivery_date || 'To be confirmed') + ' ' + esc(order.delivery_window || '') + '</p><ul>' + items + '</ul>' +
          (order.subtotal_cents != null ? '<p>Items: ' + money(order.subtotal_cents) + '</p>' : '') +
          (order.fee_cents > 0 ? '<p>Delivery: ' + money(order.fee_cents) + '</p>' : '') +
          (order.discount_cents > 0 ? '<p>Discount: −' + money(order.discount_cents) + '</p>' : '') +
          (order.total_estimate_cents != null ? '<p>Checkout estimate: ' + money(order.total_estimate_cents) + '</p>' : '') +
          '<p class="muted">Your Square receipt contains the final charged total, including any tip. Payment status above updates after confirmation.</p></article>';
      }).join('') + '</section>';
    }
  };
})(window);
