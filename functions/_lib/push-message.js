// Lock-screen copy is an allowlist, never customer names, notes, addresses or alert bodies.
// Both languages travel in the encrypted event so an offline iPhone need not fetch a session.
const COPY = {
  kitchen_ready_delivery: ['Kitchen update — order ready for delivery', 'Assign an available driver in the Hub.', 'Actualización de cocina — pedido listo para entregar', 'Asigna un conductor disponible en el Hub.', '/hub/owner/orders.html'],
  kitchen_ready_pickup: ['Kitchen update — order ready for pickup', 'The kitchen has finished preparing an order.', 'Actualización de cocina — pedido listo para recoger', 'La cocina terminó de preparar un pedido.', '/hub/owner/orders.html'],
  new_order: ['You have a new order', 'Open the Hub to review the new order.', 'Tienes un pedido nuevo', 'Abre el Hub para revisar el pedido nuevo.', '/hub/owner/orders.html'],
  new_paid_order: ['New paid order', 'Payment received. Open the Hub to review the order.', 'Nuevo pedido pagado', 'Pago recibido. Abre el Hub para revisar el pedido.', '/hub/owner/orders.html'],
  catering_deposit_paid: ['Catering deposit paid', 'Open Catering to review the confirmed booking.', 'Depósito de catering pagado', 'Abre Catering para revisar la reserva confirmada.', '/hub/owner/catering.html'],
  contract_invoice_paid: ['Contract invoice paid', 'A contract payment was received. Review it in the Hub.', 'Factura de contrato pagada', 'Se recibió un pago de contrato. Revísalo en el Hub.', '/hub/owner/'],
  catering_request: ['New catering quote request', 'A customer submitted an event request. Review it in Catering.', 'Nueva solicitud de cotización de catering', 'Un cliente envió una solicitud para un evento. Revísala en Catering.', '/hub/owner/catering.html'],
  catering_email_failed: ['Catering request — email needs attention', 'The request is saved in the Hub. Review its email delivery status.', 'Solicitud de catering — revisa el correo', 'La solicitud está guardada en el Hub. Revisa el estado de su correo.', '/hub/owner/catering.html'],
  partner_application: ['New partner application', 'Review the new partnership request in the Hub.', 'Nueva solicitud de colaboración', 'Revisa la nueva solicitud de colaboración en el Hub.', '/hub/owner/partners.html'],
  new_message: ['New Hub message', 'You have a new message. Open the Hub to read it.', 'Nuevo mensaje del Hub', 'Tienes un mensaje nuevo. Abre el Hub para leerlo.', '/hub/comms.html'],
  delivery_offer: ['New delivery assignment', 'A delivery route is waiting for your response.', 'Nueva asignación de entrega', 'Una ruta de entrega espera tu respuesta.', '/hub/driver/route.html'],
  shift_reminder: ['Shift check-in reminder', 'Your scheduled shift needs a check-in. Open the Hub.', 'Recordatorio de entrada al turno', 'Tu turno programado requiere registrar la entrada. Abre el Hub.', '/hub/'],
  marketing_decision: ['Marketing request decision', 'A request status changed. Open the Hub to review it.', 'Decisión sobre solicitud de marketing', 'Cambió el estado de una solicitud. Abre el Hub para revisarla.', '/hub/marketing/'],
  social_inbox: ['New social inbox activity', 'A social conversation needs attention in the Hub.', 'Nueva actividad en la bandeja social', 'Una conversación en redes necesita atención en el Hub.', '/hub/owner/'],
};

const ALERT_LABELS = {
  eod_missing: ['End-of-day report missing', 'Falta el informe de cierre'],
  temp_excursion: ['Kitchen temperature alert', 'Alerta de temperatura de cocina'],
  delivery_failed: ['Delivery needs attention', 'Una entrega necesita atención'],
  late_clock_in: ['Late staff check-in', 'Entrada tardía del personal'],
  expense_pending: ['Expense awaiting review', 'Gasto pendiente de revisión'],
  low_stock: ['Low inventory alert', 'Alerta de inventario bajo'],
  negative_sentiment: ['Customer feedback needs attention', 'Comentarios de un cliente requieren atención'],
  social_underperform: ['Social performance alert', 'Alerta de rendimiento en redes'],
  social_commercial_lead: ['New social sales inquiry', 'Nueva consulta comercial en redes'],
  ana_offline: ['Social assistant needs attention', 'El asistente de redes necesita atención'],
  special_request: ['New special food request', 'Nueva solicitud especial de comida'],
  backup_failed: ['Backup failed', 'Falló la copia de seguridad'],
  autopay_refused: ['Automatic payment blocked', 'Pago automático bloqueado'],
  marketing_feedback: ['New marketing feedback', 'Nuevos comentarios de marketing'],
  marketing_session_report: ['New marketing session report', 'Nuevo informe de sesión de marketing'],
  improvement_request: ['New improvement request', 'Nueva solicitud de mejora'],
  trust_lane_eligible: ['Publishing permission review', 'Revisión de permisos de publicación'],
  marketing_review_ready: ['Marketing work ready for review', 'Trabajo de marketing listo para revisar'],
};

export function safeHubPushUrl(value, fallback = '/hub/') {
  if (typeof value !== 'string' || !value.startsWith('/hub/') || /[\\\r\n]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, 'https://hub.invalid');
    return parsed.origin === 'https://hub.invalid' && parsed.pathname.startsWith('/hub/')
      ? parsed.pathname + parsed.search + parsed.hash : fallback;
  } catch { return fallback; }
}

export function createHubPushMessage(input = {}) {
  const type = String(input.type || 'hub_notice');
  const labels = ALERT_LABELS[type];
  const copy = COPY[type] || (labels && [labels[0], 'Open the Hub to review this alert.', labels[1], 'Abre el Hub para revisar esta alerta.', '/hub/owner/'])
    || ['Hub notification', 'Open the Hub to review the notification details.', 'Notificación del Hub', 'Abre el Hub para revisar los detalles de la notificación.', '/hub/'];
  const id = String(input.id || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  return {
    version: 1, type: Object.hasOwn(COPY, type) || Object.hasOwn(ALERT_LABELS, type) ? type : 'hub_notice',
    title: copy[0], body: copy[1], title_es: copy[2], body_es: copy[3],
    url: safeHubPushUrl(input.url, copy[4]), tag: `anejo-hub-${id}`,
  };
}
