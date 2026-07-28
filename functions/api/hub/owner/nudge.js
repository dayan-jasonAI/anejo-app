// POST /api/hub/owner/nudge — send a working staff member a short, friendly reminder.
//
// Built because the owner was hand-writing these. The draft that prompted it ran eight lines and
// ended with a warning that repeated lapses would get the account disconnected — aimed at a new
// driver who simply had not been shown the routine yet. A nudge should ask for one thing, in the
// person's own language, and read like a teammate rather than a warning.
//
// So the messages here are deliberately SHORT and WARM, and there is no escalating/disciplinary
// variant. If something needs to be said sternly, that is a conversation, not a button.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { now } from '../../../_lib/hub.js';
import { sendSms } from '../../../_lib/twilio.js';
import { capture } from '../../../_lib/track.js';

// One entry per thing worth nudging about. `first` is what a NEW person gets — it explains the
// why in one clause, because someone who has never been told cannot be reminded.
const NUDGES = {
  clock_out: {
    en: {
      first: (n) => `Hi ${n}! 👋 When you're done for the day, tap Clock out in the HUB and send the End-of-day report. That's what closes your shift and gets your hours counted. Thanks!`,
      repeat: (n) => `Hi ${n}! 👋 Quick one — you're still clocked in on the HUB. Tap Clock out + End-of-day report when you get a sec. Thank you!`,
    },
    es: {
      first: (n) => `¡Hola ${n}! 👋 Cuando termines el día, dale a Clock out en el HUB y manda el Reporte de fin de día. Con eso se cierra tu jornada y cuentan tus horas. ¡Gracias!`,
      repeat: (n) => `¡Hola ${n}! 👋 Rapidito — todavía estás clocked in en el HUB. Dale a Clock out y al Reporte de fin de día cuando puedas. ¡Gracias!`,
    },
  },
  eod_report: {
    en: {
      first: (n) => `Hi ${n}! 👋 Don't forget the End-of-day report in the HUB before you head out — it's the one that tells us how the day actually went. Thanks!`,
      repeat: (n) => `Hi ${n}! 👋 Missing your End-of-day report in the HUB. Whenever you get a moment. Thank you!`,
    },
    es: {
      first: (n) => `¡Hola ${n}! 👋 No olvides el Reporte de fin de día en el HUB antes de irte — es el que nos dice cómo estuvo el día de verdad. ¡Gracias!`,
      repeat: (n) => `¡Hola ${n}! 👋 Nos falta tu Reporte de fin de día en el HUB. Cuando tengas un momento. ¡Gracias!`,
    },
  },
};

const firstName = (s) => String(s || '').trim().split(/\s+/)[0] || 'there';

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid request.'); }

  const staffId = String((b && b.staff_id) || '').trim();
  const kind = Object.prototype.hasOwnProperty.call(NUDGES, b && b.kind) ? b.kind : 'clock_out';
  if (!staffId) return bad('Missing staff_id.');

  const st = await env.DB.prepare('SELECT id, name, phone, lang, role FROM staff WHERE id = ? AND active = 1')
    .bind(staffId).first().catch(() => null);
  if (!st) return bad('Staff member not found.', 404);
  if (!st.phone) return bad(`${firstName(st.name)} has no mobile number on file — add one on their staff card first.`);

  // Their language, not the owner's. A reminder someone has to translate is a worse reminder.
  const lang = String(st.lang || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';

  // Has this person been nudged about this before? Someone hearing it for the first time gets the
  // version that explains why; after that, the short one.
  let seen = 0;
  try {
    const r = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM activity_log WHERE event = 'staff.nudged' AND properties LIKE ? AND properties LIKE ?"
    ).bind('%' + staffId + '%', '%' + kind + '%').first();
    seen = (r && r.n) || 0;
  } catch { seen = 0; }

  const body = NUDGES[kind][lang][seen > 0 ? 'repeat' : 'first'](firstName(st.name));

  const sms = await sendSms(env, { to: st.phone, body });
  if (!sms || !sms.sent) {
    return bad('Could not send the text. ' + String((sms && sms.error) || '').slice(0, 120), 502);
  }

  await capture(env, {
    event: 'staff.nudged',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { staff_id: staffId, kind, lang, first_time: seen === 0, sent_at: now() },
  });

  return json({ ok: true, sent_to: firstName(st.name), lang, first_time: seen === 0, preview: body });
};
