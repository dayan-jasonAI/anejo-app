(function () {
  'use strict';
  var token, es = false, verified = null, sent = false, attempts = 0;
  try {
    token = sessionStorage.getItem('anejo:receiptToken');
    es = localStorage.getItem('anejo:lang') === 'es';
  } catch (_) {}
  var heading = document.getElementById('paymentHeading');
  var message = document.getElementById('paymentMessage');
  var retry = document.getElementById('paymentRetry');
  function text(en, spanish) { return es ? spanish : en; }
  function measure() {
    if (!verified || sent || typeof window.gtag !== 'function') return;
    var key = 'anejo:gaPurchase:' + verified.transaction_id;
    try { if (localStorage.getItem(key)) { sent = true; return; } } catch (_) {}
    var params = { transaction_id: verified.transaction_id, currency: verified.currency };
    if (typeof verified.value === 'number' && isFinite(verified.value)) params.value = verified.value;
    // Analytics availability must never change a verified payment's UI state.
    try { window.gtag('event', 'purchase', params); } catch (_) { return; }
    sent = true;
    try { localStorage.setItem(key, '1'); } catch (_) {}
  }
  document.addEventListener('anejo:analytics-ready', measure);
  function unresolved() {
    heading.textContent = text('Payment not yet confirmed', 'Pago aún sin confirmar');
    message.textContent = text('Confirmation can take a moment. Check again or view your account. If Square issued a receipt, keep it and do not pay again.', 'La confirmación puede tardar un momento. Consulta de nuevo o revisa tu cuenta. Si Square emitió un recibo, consérvalo y no vuelvas a pagar.');
    retry.hidden = false;
    retry.disabled = false;
  }
  async function check() {
    retry.hidden = true;
    attempts++;
    try {
      var response = await fetch('/api/order-receipt', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
      if (!response.ok) throw new Error('unavailable');
      var data = await response.json();
      if (data.paid === true && typeof data.transaction_id === 'string' && data.transaction_id) {
        verified = data;
        heading.textContent = text('Payment confirmed', 'Pago confirmado');
        message.textContent = text('Your order is received. We will prepare it for your selected delivery window.', 'Recibimos tu pedido. Lo prepararemos para el horario de entrega que elegiste.');
        var mark = document.getElementById('paymentCheck');
        mark.hidden = false; mark.style.display = 'flex';
        measure();
        return;
      }
    } catch (_) {}
    if (attempts < 8) setTimeout(check, 3000);
    else unresolved();
  }
  retry.textContent = text('Check again', 'Consultar de nuevo');
  retry.addEventListener('click', function () { attempts = 0; check(); });
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    heading.textContent = text('Check your order', 'Consulta tu pedido');
    message.textContent = text('We cannot verify payment from this page. Check your Square receipt or sign in to view your order. Do not pay again if you already received a receipt.', 'No podemos verificar el pago desde esta página. Revisa tu recibo de Square o inicia sesión para consultar tu pedido. No vuelvas a pagar si ya recibiste un recibo.');
    return;
  }
  heading.textContent = text('Checking your payment', 'Verificando tu pago');
  message.textContent = text('Please wait while we confirm your order.', 'Espera mientras confirmamos tu pedido.');
  check();
})();
