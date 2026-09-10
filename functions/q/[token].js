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
import { cateringQuoteEmail } from '../_lib/catering_quote_email.js';
import { quoteEmailArgs } from '../_lib/catering_quote_delivery.js';

const html = (body, status = 200) => new Response(body, {
  status,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
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
      `SELECT id, customer_name, customer_email, customer_phone, event_date, guests,
              total_cents, deposit_pct, deposit_cents, balance_cents, deposit_status,
              balance_due_date, payment_link_url, terms_json, quote_json, access_token, lang
         FROM catering_quotes WHERE access_token = ?`
    ).bind(token).first();
  } catch {
    return notFound(override || 'en');
  }
  if (!row) return notFound(override || 'en');

  const lang = override || (row.lang === 'es' ? 'es' : 'en');
  const args = quoteEmailArgs(row, { lang, baseUrl: url.origin });
  const { subject, html: body } = cateringQuoteEmail(args);

  // Once the deposit is paid the page must stop offering to take it again. The quote stays
  // readable — it is the customer's record of what they bought — but the buttons go.
  const paid = row.deposit_status === 'paid';
  const banner = paid
    ? `<div style="max-width:520px;margin:0 auto 14px;padding:14px 18px;background:#e8f1eb;color:#2f6b4f;
         border-radius:10px;font-family:Georgia,serif;font-size:15px;text-align:center">
         ${lang === 'es'
           ? `Depósito recibido. Su fecha está reservada — saldo de ${(row.balance_cents / 100).toFixed(2)} USD pendiente.`
           : `Deposit received. Your date is booked — $${(row.balance_cents / 100).toFixed(2)} balance to come.`}
       </div>`
    : '';

  // ?edit=1 is the "Modify my order" button. It used to be read by nothing at all, so the button
  // reloaded the page and looked broken. It now opens a real form, ABOVE the quote so she does not
  // have to scroll past everything to find what she just clicked.
  const wantsEdit = url.searchParams.get('edit') === '1' && !paid;
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

  const editPanel = wantsEdit ? `<div style="max-width:520px;margin:0 auto 14px;padding:20px 22px;background:#fbf9f3;
      border-radius:10px;font-family:Georgia,serif;color:#0b1f0a">
    <p style="margin:0 0 6px;font-size:18px">${t.head}</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#6b6558">${t.body}</p>
    <form id="cqc" novalidate>
      <label style="display:block;font-size:13px;color:#6b6558;margin:0 0 4px" for="cqc-g">${t.guests}</label>
      <input id="cqc-g" type="number" min="1" step="1" inputmode="numeric"
        style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ddd6c4;border-radius:6px;font:inherit;margin:0 0 12px">
      <label style="display:block;font-size:13px;color:#6b6558;margin:0 0 4px" for="cqc-m">${t.msg}</label>
      <textarea id="cqc-m" rows="4" required placeholder="${t.ph}"
        style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ddd6c4;border-radius:6px;font:inherit;margin:0 0 12px"></textarea>
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

  const page = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${subject.replace(/[<>]/g, '')}</title>
<body style="margin:0;background:#0b1f0a">
${banner ? `<div style="padding:24px 16px 0">${banner}</div>` : ''}
${editPanel ? `<div style="padding:24px 16px 0">${editPanel}</div>` : ''}
${paid ? body.replace(/<table role="presentation"[^>]*>\s*<tr><td style="padding:0 0 10px">[\s\S]*?<\/table>\s*(?=<p style="margin:0 0 28px)/, '') : body}
</body>`;

  return html(page);
};
