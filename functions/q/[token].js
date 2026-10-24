// GET /q/<token> — the customer's own copy of their catering quote.
//
// This is the address the SMS carries and the email links back to. Three things decide its shape:
//
//   · IT MUST OPEN WITH NO LOGIN. A link in a text message that lands on a sign-in wall does not
//     get opened. The token IS the credential — 128 bits from the platform CSPRNG, unguessable,
//     and revocable by nulling one column.
//   · IT RENDERS THE SAME HTML THAT WAS EMAILED, from the same function. A second renderer would
//     drift, and the customer would end up arguing from a page that says something the email did
//     not. One artifact, served two ways.
//   · IT IS never CACHED. A quote whose deposit has since been paid, or whose price changed, must
//     not be served from an intermediary.
import { cateringQuoteEmail, longDate, clockTime } from '../_lib/catering_quote_email.js';
import { loadQuoteEmailArgs } from '../_lib/catering_quote_delivery.js';
import { customerQuoteEditor } from '../_lib/catering_customer_page.js';
import { cakeRevealHtml } from '../_lib/cake_reveal.js';

const html = (body, status = 200) => new Response(body, {
  status,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' },
});

// A page for a link that has expired, been revoked, or was mistyped. Deliberately says NOTHING
// about whether the token ever existed — "no such quote" and "that quote is gone" are the same
// sentence here, because the difference is only useful to somebody guessing.
const notFound = (lang) => html(`<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${lang === 'es' ? 'Cotización no disponible' : 'Quote unavailable'}</title>
<body style="margin:0;background:#0b1f0a;font-family:Georgia,serif;color:#e9e6dc">
<div style="max-width:420px;margin:12vh auto;padding:32px;background:#fffdf7;color:#20392e;border-radius:16px">
  <p style="margin:0 0 12px;font-size:22px;letter-spacing:3px;color:#ae8745">AÑEJO</p>
  <p style="margin:0 0 10px;font-size:19px">${lang === 'es' ? 'Esta cotización ya no está disponible.' : 'This quote is no longer available.'}</p>
  <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#5d675f">${lang === 'es'
    ? 'El enlace puede haber caducado o haber sido reemplazado por una cotización más reciente. Responda a nuestro mensaje o llámenos y se la reenviamos enseguida.'
    : 'The link may have expired or been replaced by a newer quote. Reply to our message or call us and we will send it again right away.'}</p>
  <a href="/catering" style="color:#ae8745">${lang === 'es' ? 'Solicitar una cotización nueva' : 'Request a new quote'}</a>
</div></body>`, 404);

export const onRequestGet = async ({ params, request, env }) => {
  const url = new URL(request.url);
  const token = String(params?.token || '').trim();
  // The language the quote was SENT in wins unless the visitor explicitly asks to switch, so a
  // customer quoted in Spanish is not shown English by an English browser a week later.
  const asked = url.searchParams.get('lang');
  const override = asked === 'es' || asked === 'en' ? asked : null;

  if (!/^[a-f0-9]{32}$/.test(token)) return notFound(override || 'en');
  if (!env?.DB) return notFound(override || 'en');

  let row = null;
  try {
    row = await env.DB.prepare(
      `SELECT id, customer_name, customer_email, customer_phone, event_date, serving_time, guests,
              total_cents, deposit_pct, deposit_cents, balance_cents, deposit_status,
              balance_status, balance_due_date, payment_link_url, terms_json, quote_json,
              access_token, lang
         FROM catering_quotes WHERE access_token = ?`
    ).bind(token).first();
  } catch {
    return html('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Añejo · Payment status unavailable</title><main style="max-width:520px;margin:10vh auto;padding:24px;font:18px/1.6 Georgia,serif"><h1>Payment status temporarily unavailable</h1><p>We cannot verify the saved payment record right now. Please refresh this page or open your account. If Square issued a receipt, do not pay again.</p><p><a href="/client/dashboard?catering=1">Open my Añejo account</a></p></main>',503);
  }
  if (!row) return notFound(override || 'en');

  // Original email links remain useful after a safely completed replacement.
  const successor = await env.DB.prepare("SELECT q.access_token FROM catering_quote_revisions r JOIN catering_quotes q ON q.id=r.replacement_quote_id WHERE r.source_quote_id=? AND r.state='complete' UNION ALL SELECT q.access_token FROM catering_quote_duplicate_retirements d JOIN catering_quotes q ON q.id=d.target_quote_id WHERE d.source_quote_id=? AND d.state='complete'").bind(row.id,row.id).first().catch(() => null);
  if (successor?.access_token && /^[a-f0-9]{32}$/.test(successor.access_token)) {
    return new Response(null, {status:302,headers:{Location:'/q/'+successor.access_token+url.search,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }
  if (row.deposit_status === 'void') return notFound(override || row.lang || 'en');
  // A journal prevents an old quote from advertising payment while retirement recovers.
  try {
    const duplicate=await env.DB.prepare("SELECT source_quote_id FROM catering_quote_duplicate_retirements WHERE source_quote_id=? AND state!='complete'").bind(row.id).first();
    if(duplicate&&row.deposit_status!=='paid')return notFound(override||row.lang||'en');
    const revision = await env.DB.prepare("SELECT source_quote_id FROM catering_quote_revisions WHERE source_quote_id = ? OR (replacement_quote_id = ? AND state != 'complete')").bind(row.id, row.id).first();
    if (revision && row.deposit_status !== 'paid') {
      if (url.searchParams.get('edit') === '1') return html('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Añejo · Recover quote changes</title><body style="margin:0;background:#0b1f0a">' + customerQuoteEditor(token, override || row.lang || 'en') + '</body>');
      return notFound(override || row.lang || 'en');
    }
  } catch { return html('<p>This quote is temporarily unavailable. Please contact Añejo.</p>', 503); }

  const lang = override || (row.lang === 'es' ? 'es' : 'en');
  const args = await loadQuoteEmailArgs(env, row, { lang, baseUrl: url.origin });
  const paymentReturn=url.searchParams.get('paid')==='1';
  const paid = row.deposit_status === 'paid';
  const paidFull=paid&&row.balance_status==='paid';
  const waived=paid&&(row.balance_status==='waived'||Number(row.balance_cents)===0);
  const contradictory=!paid&&['paid','waived'].includes(row.balance_status);
  const paymentState=contradictory?'review':paidFull?'paid_in_full':waived?'waived':paid?'deposit_received':paymentReturn?'processing':null;
  // A checkout return is only a request to check confirmation; it is never evidence of payment.
  args.hostedPaymentState=paymentState;
  args.eventTime=row.serving_time||null;
  const { subject, html: body } = cateringQuoteEmail(args);

  // Once the deposit is paid the page must stop offering to take it again. The quote stays
  // readable — it is the customer's record of what they bought — but the buttons go.

  // THE GIFT REVEAL. Both gates are here, on the server, and both must hold:
  //
  //   · the BALANCE is paid — not the deposit. Dayan, 2026-09-14: "once she pays for the
  //     remaining balance, she can receive the cake gift." Only markBalancePaid() writes that
  //     status, and only from a Square webhook. Note it is 'paid' specifically: a WAIVED balance
  //     is not a paid one, and must not earn a gift.
  //   · this particular quote was given a gift, recorded in its own quote_json — a thing the
  //     owner turns on per quote and that nothing sets by default.
  //
  // A customer cannot reach either one. Anything short of both renders nothing at all — not a
  // hidden element, nothing in the document.
  const settled = paidFull;
  let gift = null;
  if (settled) {
    try {
      const blob = row.quote_json ? JSON.parse(row.quote_json) : null;
      if (blob && typeof blob.gift === 'string') gift = blob.gift;
    } catch { /* an unreadable breakdown is simply no gift */ }
  }
  const reveal = gift ? cakeRevealHtml({ gift, name: row.customer_name, lang }) : '';
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const amount=`$${(Number(row.balance_cents||0)/100).toFixed(2)}`;
  const heading=contradictory?(lang==='es'?'Su registro de pago necesita revisión':'Your payment record needs review'):paidFull?(lang==='es'?'Pagado por completo':'Paid in full'):waived?(lang==='es'?'Reserva confirmada · no hay saldo pendiente':'Booking confirmed · no balance due'):paid?(lang==='es'?'Depósito recibido':'Deposit received'):(lang==='es'?'Confirmando su pago':'Confirming your payment');
  const description=contradictory?(lang==='es'?'Los registros de depósito y pago final no coinciden. No vuelva a pagar; contáctenos para conciliar sus recibos.':'The deposit and final-payment records do not agree. Do not pay again; contact us so we can reconcile your receipts.'):paidFull?(lang==='es'?'Recibimos su pago final. Su evento está reservado y no hay saldo pendiente.':'Your final payment is recorded. Your event is booked and no balance remains.')
    :waived?(lang==='es'?'No se requiere otro pago para esta reserva.':'No further payment is required for this booking.')
    :paid?(lang==='es'?`Su fecha está reservada. Saldo registrado: ${amount}, con vencimiento el ${row.balance_due_date||'fecha por confirmar'}.`:`Your date is booked. Recorded balance: ${amount}, due ${row.balance_due_date||'date to be confirmed'}.`)
    :(lang==='es'?'Aún no se ha registrado la confirmación de pago. No vuelva a pagar mientras comprobamos el estado.':'Payment confirmation has not been recorded yet. Do not pay again while confirmation is being checked.');
  const pendingNote=paymentReturn&&paid&&!paidFull&&!waived?(lang==='es'?'Si acaba de pagar el saldo final, la confirmación puede seguir procesándose. Actualice el estado antes de intentar otro pago.':'If you just paid the final balance, confirmation may still be processing. Refresh the status before attempting another payment.'):'';
  const awaiting=paymentReturn&&!paidFull&&!waived&&!contradictory;
  const paymentRevision=encodeURIComponent(JSON.stringify([row.deposit_status,row.balance_status,row.balance_cents,row.event_date,row.serving_time]));
  const currentPath='/q/'+token+'?'+new URLSearchParams({...(paymentReturn?{paid:'1'}:{}),lang}).toString();
  const banner=paymentState?`<section id="catering-payment-state" data-payment-state="${paymentState}" data-payment-revision="${paymentRevision}" data-awaiting-confirmation="${awaiting?'true':'false'}" aria-labelledby="catering-payment-heading" style="box-sizing:border-box;max-width:640px;margin:0 auto 14px;padding:24px;background:#fbf9f3;color:#20392e;border:1px solid #ae8745;border-radius:14px;font-family:Georgia,serif;line-height:1.6">
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:.14em;color:#8b6b3e">AÑEJO · ${lang==='es'?'SU RESERVA':'YOUR BOOKING'}</p>
    <h1 id="catering-payment-heading" style="margin:0 0 12px;font-size:30px;line-height:1.15">${heading}</h1>
    <p style="margin:0 0 16px">${e(description)}</p>
    <div style="padding:14px;background:#f0ebdd;border-radius:9px;margin:0 0 16px"><strong>${e(row.event_date?longDate(row.event_date,lang):(lang==='es'?'Fecha por confirmar':'Event date to be confirmed'))}</strong><br>${row.serving_time?e((lang==='es'?'Hora de servicio confirmada: ':'Confirmed serving time: ')+clockTime(row.serving_time,lang)+' · '+(lang==='es'?'hora del Este':'Eastern Time')):e(lang==='es'?'Hora de servicio por confirmar':'Serving time to be confirmed')}</div>
    ${pendingNote?`<p style="margin:0 0 16px">${e(pendingNote)}</p>`:''}
    ${awaiting?`<a id="catering-payment-refresh" href="${e(currentPath)}" style="display:inline-flex;align-items:center;box-sizing:border-box;min-height:48px;padding:12px 18px;margin:0 8px 10px 0;border-radius:8px;background:#ae8745;color:#fff;text-decoration:none">${lang==='es'?'Actualizar estado de pago':'Refresh payment status'}</a><p id="catering-payment-progress" role="status" aria-live="polite" style="font-size:14px;margin:0 0 14px">${lang==='es'?'Comprobando la confirmación guardada.':'Checking the recorded payment confirmation.'}</p>`:''}
    <a href="/client/dashboard?catering=1" style="display:inline-flex;align-items:center;box-sizing:border-box;min-height:48px;padding:12px 18px;border:1px solid #20392e;border-radius:8px;color:#20392e;text-decoration:none">${lang==='es'?'Ver mi cuenta y actividad de pagos':'View my account and payment activity'}</a>
  </section>`:'';

  // ?edit=1 is the "Modify my order" button. It used to be read by nothing at all, so the button
  // reloaded the page and looked broken. It now opens a real form, ABOVE the quote so she does not
  // have to scroll past everything to find what she just clicked.
  const wantsEdit = url.searchParams.get('edit') === '1';
  let recommendation = null;
  try { recommendation = JSON.parse(row.quote_json || '{}').recommendations?.find((r) => r.sku === url.searchParams.get('recommendation')); } catch { /* no option */ }
  const recommendationText = recommendation ? (lang === 'es' ? 'Me interesan ' : 'I am interested in ') + recommendation.pieces + ' ' + recommendation.name + ' (+$' + (recommendation.cents / 100).toFixed(2) + '). ' + (lang === 'es' ? 'Por favor confirme antes de añadirlo.' : 'Please confirm before adding it.') : '';
  const t = lang === 'es'
    ? { head: '¿Necesita cambiar algo?',
        body: 'Escríbanos qué desea ajustar — cantidades, un plato más, o el número de invitados. Le enviaremos una cotización actualizada. No se cobra nada al enviar esto.',
        guests: 'Nuevo número de invitados (opcional)',
        msg: 'Qué desea cambiar',
        ph: 'Ejemplo: seríamos 35 personas y quisiéramos agregar una bandeja de croquetas.',
        cta: 'Enviar mi cambio', sending: 'Enviando…',
        fail: 'No se pudo enviar. Por favor responda al correo.' }
    : { head: 'Need to change something?',
        body: 'Tell us what to adjust — quantities, an extra dish, or your guest count. We will send you an updated quote. Sending this charges nothing.',
        guests: 'New guest count (optional)',
        msg: 'What you would like to change',
        ph: 'For example: we would be 35 people, and we would like to add a tray of croquetas.',
        cta: 'Send my change', sending: 'Sending…',
        fail: 'That did not send. Please reply to the email instead.' };

  const requestPanel = wantsEdit && !paid ? `<div style="max-width:520px;margin:0 auto 14px;padding:20px 22px;background:#fbf9f3;
      border-radius:10px;font-family:Georgia,serif;color:#0b1f0a">
    <p style="margin:0 0 6px;font-size:18px">${t.head}</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#6b6558">${t.body}</p>
    <form id="cqc" novalidate>
      <label style="display:block;font-size:13px;color:#6b6558;margin:0 0 4px" for="cqc-g">${t.guests}</label>
      <input id="cqc-g" type="number" min="1" step="1" inputmode="numeric"
        style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ddd6c4;border-radius:6px;font:inherit;margin:0 0 12px">
      <label style="display:block;font-size:13px;color:#6b6558;margin:0 0 4px" for="cqc-m">${t.msg}</label>
      <textarea id="cqc-m" rows="4" required placeholder="${t.ph}"
        style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ddd6c4;border-radius:6px;font:inherit;margin:0 0 12px">${recommendationText.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</textarea>
      <button type="submit" style="width:100%;padding:13px;border:0;border-radius:999px;background:#ae8745;
        color:#fff;font:inherit;font-size:15px;cursor:pointer">${t.cta}</button>
      <p id="cqc-say" style="margin:12px 0 0;font-size:14px;line-height:1.5;color:#2f6b4f"></p>
    </form>
  </div>
  <script>
  (function () {
    var f = document.getElementById('cqc'), say = document.getElementById('cqc-say');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var m = document.getElementById('cqc-m').value.trim();
      if (!m) { document.getElementById('cqc-m').focus(); return; }
      var btn = f.querySelector('button');
      btn.disabled = true; btn.textContent = ${JSON.stringify(t.sending)};
      fetch('/api/catering-quote-change', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: ${JSON.stringify(token)}, guests: document.getElementById('cqc-g').value, message: m }),
      }).then(function (r) { return r.json(); }).then(function (r) {
        if (r && r.ok) { f.innerHTML = '<p style="margin:0;font-size:15px;color:#2f6b4f">' + (r.message || 'Sent.') + '</p>'; }
        else { btn.disabled = false; btn.textContent = ${JSON.stringify(t.cta)}; say.style.color = '#a33'; say.textContent = (r && r.error) || ${JSON.stringify(t.fail)}; }
      }).catch(function () {
        btn.disabled = false; btn.textContent = ${JSON.stringify(t.cta)};
        say.style.color = '#a33'; say.textContent = ${JSON.stringify(t.fail)};
      });
    });
  })();
  </script>` : '';

  const editPanel = wantsEdit ? customerQuoteEditor(token, lang) + '<details style="max-width:640px;margin:16px auto;color:#fffdf7;padding:16px"><summary>' + (lang === 'es' ? 'Otros cambios y necesidades especiales' : 'Other changes and special requests') + '</summary>' + requestPanel + '</details>' : '';

  const page = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${subject.replace(/[<>]/g, '')}</title></head>
<body style="margin:0;background:#0b1f0a">
${reveal ? `<div style="padding:24px 16px 0">${reveal}</div>` : ''}
${banner ? `<div style="padding:24px 16px 0">${banner}</div>` : ''}
${editPanel ? `<div style="padding:24px 16px 0">${editPanel}</div>` : ''}
${body}
${awaiting?'<script src="/assets/js/catering-payment-return.js" defer></script>':''}
</body></html>`;

  return html(page);
};
