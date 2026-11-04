// Turn activity_log rows into something a human reads at a glance.
//
// The owner's feed rendered the raw event key and the actor's ROLE — three consecutive rows of
// "user.signed_in / kitchen · 49d ago". That is the database talking to itself. It cannot tell you
// WHO did it, and "recipe_session.ai_assist_used" is not a sentence.
//
// Two fixes live here: a readable label per event, and a display name for the actor.

// Present tense, sentence case, no jargon. Anything unmapped falls back to a humanized key rather
// than being hidden — an unlabeled event is still information.
const LABELS = {
  'delivery.owner_confirmed':'Owner confirmed a completed delivery',
  "team_lead.message": "Sent a team-lead message",
  "sales.prospect_scored": "Scored a sales prospect",
  "social.post_scheduled": "Scheduled a social post",
  "social.post_drafted": "Drafted a social post",
  "social.post_archived": "Archived a social draft",
  "social.post_published": "Published a social post",
  "sales.outreach_drafted": "Drafted sales outreach",
  "sales.organization_enriched": "Updated a sales organization",
  'user.signed_in': 'Signed in',
  'user.invited': 'Was invited to the team',
  'dashboard.viewed': 'Opened the dashboard',
  'doc.viewed': 'Opened a document',
  'customer.viewed': 'Looked up a customer',

  'shift.clocked_in': 'Clocked in',
  'shift.clocked_out': 'Clocked out',
  'eod_report.missed': 'Missed an end-of-day report',
  'eod_report.filed': 'Filed the end-of-day report',
  'training.completed': 'Finished a training module',

  'order.received': 'New order came in',
  'order.prep_started': 'Started prepping an order',
  'order.bowl_checked': 'Checked off a bowl',
  'order.ready': 'Marked an order ready',
  'order.canceled': 'Canceled an order',
  'order.refunded': 'Refunded an order',

  'delivery.picked': 'Picked up a delivery',
  'delivery.en_route': 'Left for a delivery',
  'delivery.completed': 'Completed a delivery',
  'delivery.failed': 'Delivery failed',

  'recipe_session.started': 'Started a Creative Studio session',
  'recipe_session.ai_assist_used': 'Asked the Studio AI for help',
  'recipe_session.media_added': 'Added a photo or voice note',

  'knowledge.document_indexed': 'Added a document to the knowledge base',
  'alert.triggered': 'An alert fired',
  'alert.acknowledged': 'Acknowledged an alert',
  'automation.run': 'An automation ran',
  'agent_task.completed': 'An AI task finished',
  'message.sent': 'Sent a message',
  'staff.nudged': 'Was sent a reminder',
  'push.subscribed': 'Turned on notifications',
  'contract.billing_contact_set': 'Set an account billing contact',
};

const LABELS_ES = {
  "delivery.owner_confirmed":"El propietario confirmó una entrega realizada",
  "user.signed_in": "Inició sesión",
  "user.invited": "Recibió una invitación al equipo",
  "dashboard.viewed": "Abrió el panel",
  "doc.viewed": "Abrió un documento",
  "customer.viewed": "Consultó un cliente",
  "shift.clocked_in": "Registró su entrada",
  "shift.clocked_out": "Registró su salida",
  "eod_report.missed": "No presentó el cierre del día",
  "eod_report.filed": "Presentó el cierre del día",
  "training.completed": "Terminó un módulo de capacitación",
  "order.received": "Se recibió un pedido",
  "order.prep_started": "Comenzó a preparar un pedido",
  "order.bowl_checked": "Verificó un plato",
  "order.ready": "Marcó un pedido como listo",
  "order.canceled": "Canceló un pedido",
  "order.refunded": "Registró un reembolso de pedido",
  "delivery.picked": "Recogió una entrega",
  "delivery.en_route": "Salió a entregar",
  "delivery.completed": "Completó una entrega",
  "delivery.failed": "Falló una entrega",
  "recipe_session.started": "Inició una sesión de Creative Studio",
  "recipe_session.ai_assist_used": "Pidió ayuda a la IA de Studio",
  "recipe_session.media_added": "Agregó una foto o nota de voz",
  "knowledge.document_indexed": "Agregó un documento a la base de conocimiento",
  "alert.triggered": "Se generó una alerta",
  "alert.acknowledged": "Confirmó haber visto una alerta",
  "automation.run": "Se ejecutó una automatización",
  "agent_task.completed": "Terminó una tarea de IA",
  "message.sent": "Envió un mensaje",
  "staff.nudged": "Recibió un recordatorio",
  "push.subscribed": "Activó las notificaciones",
  "contract.billing_contact_set": "Estableció el contacto de facturación",
  "team_lead.message": "Envió un mensaje al líder del equipo",
  "sales.prospect_scored": "Evaluó un prospecto de ventas",
  "social.post_scheduled": "Programó una publicación en redes",
  "social.post_drafted": "Preparó un borrador para redes",
  "social.post_archived": "Archivó un borrador para redes",
  "social.post_published": "Publicó en redes",
  "sales.outreach_drafted": "Preparó un contacto comercial",
  "sales.organization_enriched": "Actualizó una empresa de ventas"
};

/** Readable label for an event key. Never returns an empty string. */
export function eventLabel(event, locale = 'en') {
  const key = String(event || '').trim();
  if (locale === 'es') return LABELS_ES[key] || (key ? 'Actividad registrada' : 'Actividad');
  if (!key) return 'Activity';
  if (LABELS[key]) return LABELS[key];
  // Fallback: "recipe_session.brief_generated" → "Recipe session · brief generated"
  const parts = key.split('.');
  const tail = (parts.pop() || '').replace(/_/g, ' ');
  const head = parts.join(' ').replace(/_/g, ' ');
  const s = head ? `${head} · ${tail}` : tail;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * How a person should appear in a feed: "Jorge A." — first name plus last initial.
 *
 * Full names are noise at list density and a privacy smell in a shared screen; a bare role
 * ("kitchen") does not identify anyone at all, which is what the feed used to show.
 */
export function displayName(name, fallback) {
  const full = String(name || '').trim().replace(/\s+/g, ' ');
  if (!full) return fallback || 'Someone';
  const parts = full.split(' ');
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
}

/** Who to credit when there is no staff record — never leave a row anonymous-looking. */
export function actorLabel({ actor_name, actor_type, actor_role }, locale = 'en') {
  if (actor_name) return displayName(actor_name);
  const type = String(actor_type || '').toLowerCase();
  if (locale === 'es') {
    if (type === 'system' || type === 'cron') return 'Sistema de Añejo';
    if (type === 'ai' || type === 'agent') return 'IA de Añejo';
    if (type === 'customer' || actor_role === 'client') return 'Un cliente';
    return ({owner:'Propietario',kitchen:'Cocina',driver:'Conductor',marketing:'Marketing',staff:'Personal'})[actor_role] || 'Una persona del equipo';
  }
  if (type === 'system' || type === 'cron') return 'Añejo system';
  if (type === 'ai' || type === 'agent') return 'Añejo AI';
  if (type === 'customer' || actor_role === 'client') return 'A customer';
  if (actor_role) return String(actor_role).charAt(0).toUpperCase() + String(actor_role).slice(1);
  return 'Someone';
}
