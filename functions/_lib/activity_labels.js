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

/** Readable label for an event key. Never returns an empty string. */
export function eventLabel(event) {
  const key = String(event || '').trim();
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
export function actorLabel({ actor_name, actor_type, actor_role }) {
  if (actor_name) return displayName(actor_name);
  const type = String(actor_type || '').toLowerCase();
  if (type === 'system' || type === 'cron') return 'Añejo system';
  if (type === 'ai' || type === 'agent') return 'Añejo AI';
  if (type === 'customer' || actor_role === 'client') return 'A customer';
  if (actor_role) return String(actor_role).charAt(0).toUpperCase() + String(actor_role).slice(1);
  return 'Someone';
}
