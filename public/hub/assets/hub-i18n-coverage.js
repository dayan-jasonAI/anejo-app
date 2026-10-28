/* Curated deterministic Hub UI coverage. Never send user content to a translator. */
(function () {
  "use strict";
  var dictionary = {
    'Check or retry the same reviewed request for': 'Consulta o reintenta la misma solicitud revisada para',
    'Send this exact text as a': 'Envía este texto exacto como',
    'PUBLIC Instagram comment reply': 'Respuesta PÚBLICA a un comentario de Instagram',
    'Instagram direct message': 'Mensaje directo de Instagram',
    'Vendor · Añejo HUB': 'Proveedor · Añejo HUB',
    'Switch language to English': 'Cambiar idioma a inglés',
    'Añejo Hub · Operations guide': 'Añejo Hub · Guía de operaciones',
    'Owner navigation': 'Navegación de dueña',
    'Enable JavaScript to open the guide and verify your access.': 'Activa JavaScript para abrir la guía y verificar tu acceso.',
    'Loading operations guide…': 'Cargando guía de operaciones…',
  "Sign in again": "Iniciar sesión de nuevo",
  "You have been signed out": "Tu sesión se ha cerrado",
  "Could not load.": "No se pudo cargar.",
  "Could not load. Pull to refresh.": "No se pudo cargar. Desliza hacia abajo para actualizar.",
  "Enter your PIN": "Ingresa tu PIN",
  "Language / Idioma": "Idioma",
  "Change language": "Cambiar idioma",
  "Owner navigation": "Navegación del propietario",
  "← Command": "← Centro de control",
  "← Kitchen orders": "← Pedidos de cocina",
  "Event date": "Fecha del evento",
  "Paid in full": "Pagado en su totalidad",
  "New message": "Nuevo mensaje",
  "Message sent": "Mensaje enviado",
  "Could not send": "No se pudo enviar",
  "Next action": "Próxima acción",
  "Next action:": "Próxima acción:",
  "New catering quote": "Nueva cotización de catering",
  "Customer requests": "Solicitudes de clientes",
  "No recommendation": "Sin recomendación",
  "Create deposit checkout": "Crear enlace para pagar el depósito",
  "Open deposit checkout": "Abrir pago del depósito",
  "Open final-payment checkout": "Abrir pago del saldo final",
  "Collect final balance": "Cobrar saldo final",
  "Check payment status": "Consultar estado del pago",
  "Messages & follow-up": "Mensajes y seguimiento",
  "Email customer · branded": "Enviar correo al cliente · con identidad de Añejo",
  "Cancel · keep unchanged": "Cancelar · conservar sin cambios",
  "Confirm change": "Confirmar cambio",
  "Add this dish / pack": "Agregar este plato o paquete",
  "Custom dish name": "Nombre del plato personalizado",
  "Service check-in & after-delivery feedback": "Consulta del servicio y opiniones después de la entrega",
  "Actual quote reminder email preview": "Vista previa del correo real para recordar la cotización",
  "Plain-text email": "Correo en texto sin formato",
  "Loading the rendered email…": "Cargando la vista previa del correo…",
  "No reminder send evidence recorded.": "No hay constancia registrada de envío del recordatorio.",
  "Review quote · first reminder": "Revisar cotización · primer recordatorio",
  "Clarify questions · second reminder": "Aclarar dudas · segundo recordatorio",
  "Final check-in · third reminder": "Último contacto · tercer recordatorio",
  "Call calendar": "Calendario de llamadas",
  "Catering follow-up": "Seguimiento de catering",
  "Catering conversion records": "Registros de conversión de catering",
  "Catering follow-up tasks": "Tareas de seguimiento de catering",
  "English acknowledgement preview": "Vista previa del acuse de recibo en inglés",
  "Spanish acknowledgement preview": "Vista previa del acuse de recibo en español",
  "Call tasks appear after 15 minutes without contact, or 24 hours after a quote without a deposit. Reminders repeat hourly until you record an action or a future follow-up.": "Las tareas de llamada aparecen tras 15 minutos sin contacto, o 24 horas después de una cotización sin depósito. Los recordatorios se repiten cada hora hasta que registres una acción o un seguimiento futuro.",
  "A conversation, thoughtfully arranged.": "Una conversación bien organizada.",
  "Callback calendar agenda": "Agenda de llamadas solicitadas",
  "Call planning settings": "Ajustes de planificación de llamadas",
  "Availability notes (internal)": "Notas de disponibilidad (internas)",
  "Checking booking configuration…": "Revisando la configuración de reservas…",
  ". Saving these internal preferences does not offer bookable slots or activate messages.": ". Guardar estas preferencias internas no ofrece horarios reservables ni activa mensajes.",
  "Needs review": "Requiere revisión",
  "not set": "Sin definir",
  "Commissary visits": "Visitas a la cocina compartida",
  "Month · Eastern time": "Mes · hora del Este",
  "Form details": "Datos del formulario",
  "Open commissary sign-in": "Abrir registro de uso de la cocina",
  "Record actual use here. Planned kitchen hours stay in the event’s reservation plan.": "Registra aquí el uso real. Las horas previstas de cocina permanecen en el plan de reserva del evento.",
  "This opens the kitchen’s Google Form. Submission is timestamped there; it does not reserve hours. Keep the emailed response copy.": "Se abrirá el formulario de Google de la cocina. El envío queda registrado con fecha y hora; no reserva horas. Conserva la copia de la respuesta que recibas por correo.",
  "An update needs reconciliation. Retry the saved request before recording anything else.": "Una actualización necesita conciliación. Reintenta la solicitud guardada antes de registrar otra cosa.",
  "Retry saved update": "Reintentar actualización guardada",
  "Save record": "Guardar registro",
  "Usage history": "Historial de uso",
  "Clear records.": "Registros claros.",
  "Commissary visits & monthly staff-hours / Visitas y horas-persona": "Visitas a la cocina y horas-persona mensuales",
  "Inventory items": "Artículos de inventario",
  "Add inventory item": "Agregar artículo de inventario",
  "Add an inventory item": "Agregar un artículo de inventario",
  "Add item": "Agregar artículo",
  "Search ingredients, packaging or vendor…": "Buscar ingredientes, envases o proveedor…",
  "No inventory photo": "Sin foto de inventario",
  "No photo": "Sin foto",
  "No vendor selected": "Ningún proveedor seleccionado",
  "On hand": "Existencias",
  "Count quantity": "Cantidad de unidades",
  "Total weight (grams)": "Peso total (gramos)",
  "Actual finished quantity": "Cantidad final producida",
  "Exact on-hand unit": "Unidad exacta de las existencias",
  "Amount per finished item": "Cantidad por artículo terminado",
  "Inventory item": "Artículo de inventario",
  "Required when yield is below plan": "Obligatorio si el rendimiento es inferior al previsto",
  "Select item unit exactly": "Selecciona la unidad exacta del artículo",
  "Maximum batch": "Lote máximo",
  "Minimum batch": "Lote mínimo",
  "Production plans": "Planes de producción",
  "Suggested production plans": "Planes de producción sugeridos",
  "Approve this batch": "Aprobar este lote",
  "Cancel reservation": "Cancelar reserva",
  "Approve photo": "Aprobar foto",
  "Archive item": "Archivar artículo",
  "Take photo": "Tomar foto",
  "Upload photo": "Subir foto",
  "Pending photo approval": "Foto pendiente de aprobación",
  "Photo approval": "Aprobación de foto",
  "Item photo": "Foto del artículo",
  "Ingredients & packaging": "Ingredientes y envases",
  "Batch preparation": "Preparación por lotes",
  "Assign kitchen staff": "Asignar personal de cocina",
  "Reserve ingredients": "Reservar ingredientes",
  "Record production": "Registrar producción",
  "Available ingredients": "Ingredientes disponibles",
  "Production opportunities": "Oportunidades de producción",
  "Needs attention": "Requiere atención",
  "An empty field does not mean allergen-free.": "Un campo vacío no significa que no haya alérgenos.",
  "State cooked weight, count and included sides; do not equate cups with ounces.": "Indica el peso cocido, la cantidad y las guarniciones incluidas; no equipares tazas con onzas.",
  "Who taught it, recipe source/version, and where the method was verified.": "Quién la enseñó, la fuente y versión de la receta, y dónde se verificó el método.",
  "Use verified operating guidance; explain if no cooking applies.": "Usa instrucciones operativas verificadas; explica si no requiere cocción.",
  "Dish, SKU or filling": "Plato, SKU o relleno",
  "Existing recipe": "Receta existente",
  "New recipe / Nueva receta": "Nueva receta",
  "Active menu": "Menú activo",
  "All catalog items": "Todos los artículos del catálogo",
  "Batch yield / Rendimiento": "Rendimiento del lote",
  "portions / servings / pieces": "porciones / raciones / unidades",
  "Allergens & cross-contact / Alérgenos": "Alérgenos y contacto cruzado",
  "Cook minutes / Cocción": "Minutos de cocción",
  "Cook temperature & doneness verification / Temperatura y punto": "Temperatura de cocción y verificación del punto",
  "Cooling & reheating / Enfriamiento y recalentamiento": "Enfriamiento y recalentamiento",
  "Approve exact version / Aprobar versión": "Aprobar versión exacta",
  "+ Ingredient / Ingrediente": "+ Ingrediente",
  "+ Menu link / Relacionar producto": "+ Relacionar producto del menú",
  "01 · The dish / El plato": "01 · El plato",
  "02 · Ingredients / Ingredientes": "02 · Ingredientes",
  "03 · Method & training / Método y capacitación": "03 · Método y capacitación",
  "04 · Evidence / Evidencia": "04 · Evidencia",
  "05 · Exact menu links / Relación exacta con el menú": "05 · Relación exacta con el menú",
  "Choose the SKU and how many recipe portions one sale unit contains. A 25-piece pack is not one portion. No automatic mapping or default conversion is assumed.": "Elige el SKU e indica cuántas porciones de receta contiene una unidad de venta. Un paquete de 25 unidades no es una porción. No se supone ninguna relación automática ni conversión predeterminada.",
  "Full recipe standard / Receta completa": "Receta completa estandarizada",
  "Needs Dayan confirmation: …": "Necesita confirmación de Dayan: …",
  "Optional exact ID": "ID exacto opcional",
  "Recipe source": "Fuente de la receta",
  "Owner approval": "Aprobación del propietario",
  "Submit for review": "Enviar a revisión",
  "Save recipe draft": "Guardar borrador de receta",
  "Ingredients per batch": "Ingredientes por lote",
  "Preparation steps": "Pasos de preparación",
  "Serving instructions": "Instrucciones para servir",
  "Storage instructions": "Instrucciones de conservación",
  "Shelf life": "Vida útil",
  "Cross-contact prevention": "Prevención de contacto cruzado",
  "Purchase list": "Lista de compras",
  "Shopping list": "Lista de compras",
  "Event details": "Detalles del evento",
  "All events": "Todos los eventos",
  "Kitchen timing": "Tiempos de cocina",
  "Handed off today": "Entregados al conductor hoy",
  "Got it": "Entendido",
  "Hand off ✓": "Entregar al conductor ✓",
  "Could not open this recipe.": "No se pudo abrir esta receta.",
  "Report an issue": "Reportar un problema",
  "Report a problem": "Reportar un problema",
  "Kitchen pickup": "Recogida en cocina",
  "Tap each bowl as you load it. This confirms every bowl left the kitchen.": "Toca cada bowl al cargarlo. Así confirmas que cada bowl salió de la cocina.",
  "Proof photo (take at the door)": "Foto de comprobante (tomar en la puerta)",
  "Couldn't take a photo (left at door / contactless)": "No pude tomar foto (dejado en la puerta / entrega sin contacto)",
  "Upcoming stops": "Próximas paradas",
  "Start deliveries →": "Iniciar entregas →",
  "Start deliveries": "Iniciar entregas",
  "Complete route": "Completar ruta",
  "Confirm pickup": "Confirmar recogida",
  "Driver home": "Inicio del conductor",
  "New delivery order": "Nuevo pedido para entregar",
  "At the door": "En la puerta",
  "🧭 Navigate": "🧭 Navegar",
  "✅ Accept order": "✅ Aceptar pedido",
  "📷 Mark delivered": "📷 Marcar entregado",
  "My pay": "Mis pagos",
  "Upcoming shifts": "Próximos turnos",
  "Back to today": "Volver a hoy",
  "Already paid": "Ya pagado",
  "awaiting driver": "En espera de conductor",
  "not mapped": "Sin ubicación en el mapa",
  "Add a driver in Staff": "Agregar un conductor en Personal",
  "⚡ Suggest efficient route(s)": "⚡ Sugerir rutas eficientes",
  "$10 Daily Lunch": "Almuerzo diario de $10",
  "Add a meal": "Agregar comida",
  "Add a service date": "Agregar fecha de servicio",
  "Add missing dates from template": "Agregar fechas faltantes desde la plantilla",
  "Add weekday": "Agregar día de la semana",
  "Add weekday template": "Agregar plantilla semanal",
  "Save ordering settings": "Guardar ajustes de pedidos",
  "Manage $10 Daily Lunch · meals, dates, cutoffs and sold-out controls →": "Gestionar almuerzo diario de $10 · comidas, fechas, horas límite y agotados →",
  "Customers see": "Los clientes ven",
  "Photo file": "Archivo de foto",
  "Loading menu…": "Cargando menú…",
  "$ / lunch": "$ por almuerzo",
  "Cut-off (ET)": "Hora límite (hora del Este)",
  "Lunch subscription": "Suscripción de almuerzos",
  "Catering (per head)": "Catering (por persona)",
  "Delivery days": "Días de entrega",
  "Billing email": "Correo de facturación",
  "Billing contact": "Contacto de facturación",
  "This week": "Esta semana",
  "Account offboarded": "Cuenta dada de baja",
  "I confirm offboarding all locations on this account.": "Confirmo la baja de todas las ubicaciones de esta cuenta.",
  "➕ Add a location": "➕ Agregar ubicación",
  "Back to office accounts": "Volver a cuentas de oficinas",
  "Add trainer": "Agregar entrenador",
  "Affiliate code": "Código de afiliado",
  "Email (their login)": "Correo (para iniciar sesión)",
  "Email them a sign-in invite now": "Enviar ahora una invitación para iniciar sesión",
  "Gym / studio": "Gimnasio o estudio",
  "Gym city": "Ciudad del gimnasio",
  "Mobile (optional)": "Celular (opcional)",
  "Trainer name": "Nombre del entrenador",
  "Approve & onboard": "Aprobar y dar de alta",
  "Onboard to client": "Dar de alta como cliente",
  "Order history": "Historial de pedidos",
  "Save profile": "Guardar perfil",
  "Phone (optional)": "Teléfono (opcional)",
  "no contact info": "Sin datos de contacto",
  "no card on file": "Sin tarjeta registrada",
  "No data.": "Sin datos.",
  "Not set up yet.": "Aún no está configurado.",
  "Run the business": "Gestionar el negocio",
  "Train the team": "Capacitar al equipo",
  "Seven practical operating stops, in English and Spanish.": "Siete secciones prácticas de operación, en inglés y español.",
  "Choose your training": "Elige tu capacitación",
  "Play narrated tour": "Reproducir recorrido narrado",
  "All training": "Toda la capacitación",
  "Print / Save PDF": "Imprimir o guardar PDF",
  "Print all-roles binder (PDF)": "Imprimir manual de todos los roles (PDF)",
  "Pick your role. Tutorials introduce screens and routines. The Owner operations guide links to current Hub workflows; the older narrated tour remains reference material.": "Elige tu rol. Los tutoriales presentan pantallas y rutinas. La guía operativa del propietario enlaza los procesos actuales del Hub; el recorrido narrado anterior se conserva como referencia.",
  ". Clocking out ends a break you forgot.": ". Marcar la salida termina cualquier descanso que hayas olvidado cerrar.",
  "EOD compliance today": "Cumplimiento del cierre de hoy",
  "Your activity": "Tu actividad",
  "Load older": "Cargar anteriores",
  "Request erasure": "Solicitar eliminación de datos",
  "Ask for your data to be erased": "Solicitar la eliminación de tus datos",
  "Preview and execute": "Ver vista previa y ejecutar",
  "Nothing is deleted until you retype the staff id. Preview first — it shows exactly what would go and what would stay.": "No se elimina nada hasta que vuelvas a escribir el ID del empleado. Revisa primero la vista previa: muestra exactamente qué se eliminaría y qué se conservaría.",
  "Add a document": "Agregar documento",
  "Drop files here or tap to choose": "Suelta archivos aquí o toca para elegir",
  "Use in Ana customer answers (website and Instagram)": "Usar en respuestas de Ana a clientes (web e Instagram)",
  "Enabled for customer answer context": "Habilitado para el contexto de respuestas a clientes",
  "Ask a question the way a chef would. This shows the exact passages the Studio would be given — before you rely on it for a real answer.": "Haz una pregunta como la haría un chef. Se mostrarán los pasajes exactos que recibiría el Estudio, antes de confiar en una respuesta real.",
  "Anything marked DBPR / regulatory outranks internal SOPs when they disagree, and the AI is told to say so rather than quietly following house preference.": "Cuando haya diferencias, lo marcado como DBPR o normativa tiene prioridad sobre los procedimientos internos. La IA recibe instrucciones de señalarlo, en lugar de seguir silenciosamente la preferencia interna.",
  "e.g. DBPR Food Service Inspection Guide": "p. ej., Guía de inspección de servicios de alimentos del DBPR",
  "e.g. What holding temperature does DBPR require for hot food?": "p. ej., ¿Qué temperatura de mantenimiento exige el DBPR para alimentos calientes?",
  "No documents yet.": "Aún no hay documentos.",
  "Google review drafts": "Borradores de respuestas a reseñas de Google",
  "Performance watch": "Seguimiento del rendimiento",
  "Reach by cause": "Alcance por causa",
  "Not enough data yet": "Aún no hay suficientes datos",
  "Nothing yet.": "Aún no hay nada.",
  "Tracked links": "Enlaces con seguimiento",
  "Trust ledger": "Registro de confianza",
  "Campaign briefs": "Briefs de campaña",
  "Brand & Standards Brief": "Brief de marca y estándares",
  "Aña’s inbox": "Bandeja de Aña",
  "Made by": "Creado por",
  "Call to action": "Llamada a la acción",
  "Counting the audience…": "Contando la audiencia…",
  "Use this — replace selected slide": "Usar esto · reemplazar diapositiva seleccionada",
  "Preview branded photo": "Ver vista previa de foto con marca",
  "Photo selected · Foto seleccionada": "Foto seleccionada",
  "🧭 Campaign context": "🧭 Contexto de campaña",
  ". Still a draft; add it or discard it.": ". Sigue siendo un borrador; agrégalo o descártalo.",
  "Ready for review": "Listo para revisión",
  "Owner review required before scheduling": "Se requiere revisión del propietario antes de programar",
  "Next cycle start": "Inicio del próximo ciclo",
  "Review & schedule": "Revisar y programar",
  "Add / replace media": "Agregar o reemplazar contenido multimedia",
  "Attach media batch": "Adjuntar lote multimedia",
  "A month at the table.": "Un mes en la mesa.",
  "Save caption": "Guardar texto de la publicación",
  "Caption": "Texto de la publicación",
  "Private draft": "Borrador privado",
  "Draft plan": "Plan en borrador",
  "Import draft plan": "Importar plan en borrador",
  "Export review": "Exportar revisión",
  "Validate media": "Validar contenido multimedia",
  "Resume validation": "Reanudar validación",
  "Pause campaign": "Pausar campaña",
  "Next cycle": "Próximo ciclo",
  "Manifest version": "Versión del manifiesto",
  "Source changed": "La fuente cambió",
  "Stale validation": "Validación desactualizada",
  "No media": "Sin contenido multimedia",
  "No upcoming reminders.": "No hay próximos recordatorios.",
  "Schedule reminder": "Programar recordatorio",
  "Run forecast now": "Ejecutar pronóstico ahora",
  "Run now": "Ejecutar ahora",
  "no API key": "Sin clave de API",
  "How it appears": "Cómo se muestra",
  "Legal pages": "Páginas legales",
  "once per person": "Una vez por persona",
  "A little feedback.": "Un poco de opinión.",
  "A better next lunch.": "Un próximo almuerzo mejor.",
  "Scan to rate today's lunch": "Escanea para calificar el almuerzo de hoy",
  "A score or a mood. Would you eat it again? Your menu ideas.": "Una puntuación o un emoji. ¿Lo comerías otra vez? Tus ideas para el menú.",
  "No names or medical details. Voluntary feedback.": "Sin nombres ni información médica. Participación voluntaria.",
  "Open the survey": "Abrir encuesta",
  "Print office sign": "Imprimir cartel de oficina",
  "Review period": "Período de revisión",
  "Last 30 days": "Últimos 30 días",
  "Last 90 days": "Últimos 90 días",
  "Menu requests": "Solicitudes de menú",
  "Delivery survey reminders": "Recordatorios de encuesta tras la entrega",
  "Anonymous staff-recorded responses. Scores average only numerical answers; moods remain separate. Responses are not verified unique patients. No feedback is not a positive rating.": "Respuestas anónimas registradas por el personal. El promedio incluye solo puntuaciones numéricas; los estados de ánimo se mantienen separados. No se verifica que cada respuesta corresponda a un paciente distinto. La ausencia de opiniones no equivale a una calificación positiva.",
  "Sent means accepted by the SMS provider, not confirmed delivery to the phone. Missed reminders are not sent late. Unconfirmed sends need review and are never automatically repeated.": "Enviado significa aceptado por el proveedor de SMS, no entrega confirmada al teléfono. Los recordatorios omitidos no se envían tarde. Los envíos sin confirmar necesitan revisión y nunca se repiten automáticamente.",
  "Time range": "Período",
  "By role": "Por rol",
  "Who is using it": "Quién lo usa",
  "What they do most": "Qué hacen con más frecuencia",
  "Staff active in the HUB": "Personal activo en el HUB",
  "Reports filed vs shifts ended": "Reportes enviados frente a turnos terminados",
  "Why these numbers are humans-only": "Por qué estas cifras incluyen solo personas",
  "people who did real work · humans only": "Personas que hicieron trabajo real · solo humanos",
  "EOD compliance": "Cumplimiento del cierre de día",
  "7 days": "7 días",
  "30 days": "30 días",
  "60 days": "60 días",
  "90 days": "90 días",
  "Enable notifications": "Activar notificaciones",
  "Provider reference:": "Referencia del proveedor:",
  "AÑEJO · AFFILIATE": "AÑEJO · AFILIADOS",
  "AÑEJO · AI OPS": "AÑEJO · OPERACIONES DE IA",
  "AÑEJO · BRIEF PROPOSALS": "AÑEJO · PROPUESTAS DE BRIEF",
  "AÑEJO · CALL CALENDAR": "AÑEJO · CALENDARIO DE LLAMADAS",
  "AÑEJO · CATERING": "AÑEJO · CATERING",
  "AÑEJO · CONTENT": "AÑEJO · CONTENIDO",
  "AÑEJO · CONTRACTS": "AÑEJO · CUENTAS DE OFICINAS",
  "AÑEJO · CUSTOMERS": "AÑEJO · CLIENTES",
  "AÑEJO · DAILY LUNCH": "AÑEJO · ALMUERZO DIARIO",
  "AÑEJO · DATA REQUESTS": "AÑEJO · SOLICITUDES DE DATOS",
  "AÑEJO · EVENT": "AÑEJO · EVENTO",
  "AÑEJO · HUB": "AÑEJO · HUB",
  "AÑEJO · INVENTORY": "AÑEJO · INVENTARIO",
  "AÑEJO · KITCHEN STANDARD": "AÑEJO · ESTÁNDARES DE COCINA",
  "AÑEJO · LEADS": "AÑEJO · PROSPECTOS",
  "AÑEJO · MARKETING": "AÑEJO · MARKETING",
  "AÑEJO · MARKETING SETTINGS": "AÑEJO · AJUSTES DE MARKETING",
  "AÑEJO · MY PAY": "AÑEJO · MIS PAGOS",
  "AÑEJO · ORDER HISTORY": "AÑEJO · HISTORIAL DE PEDIDOS",
  "AÑEJO · PAYOUTS": "AÑEJO · PAGOS",
  "AÑEJO · PRICING": "AÑEJO · PRECIOS",
  "AÑEJO · PROGRAM": "AÑEJO · PROGRAMA",
  "AÑEJO · REWARDS": "AÑEJO · RECOMPENSAS",
  "AÑEJO · SALES": "AÑEJO · VENTAS",
  "AÑEJO · SCHEDULE": "AÑEJO · HORARIO",
  "AÑEJO · SITE COPY": "AÑEJO · TEXTOS DEL SITIO",
  "AÑEJO · SMS TEST": "AÑEJO · PRUEBA DE SMS",
  "AÑEJO · TEAM": "AÑEJO · EQUIPO",
  "AÑEJO · TIMESHEET": "AÑEJO · HOJA DE HORAS",
  "AÑEJO · TRAFFIC": "AÑEJO · TRÁFICO",
  "AÑEJO · TRAINERS": "AÑEJO · ENTRENADORES",
  "AÑEJO · TRAINING": "AÑEJO · CAPACITACIÓN",
  "Añejo HUB · AI Ops": "Añejo HUB · Operaciones de IA",
  "Añejo HUB · Adoption": "Añejo HUB · Adopción",
  "Añejo HUB · Affiliate Program": "Añejo HUB · Programa de afiliados",
  "Añejo HUB · Brief Proposals": "Añejo HUB · Propuestas de brief",
  "Añejo HUB · Catering & Quotes": "Añejo HUB · Catering y cotizaciones",
  "Añejo HUB · Content": "Añejo HUB · Contenido",
  "Añejo HUB · Contract Accounts": "Añejo HUB · Cuentas de oficinas",
  "Añejo HUB · Customers": "Añejo HUB · Clientes",
  "Añejo HUB · Data requests": "Añejo HUB · Solicitudes de datos",
  "Añejo HUB · Driver Payouts": "Añejo HUB · Pagos a conductores",
  "Añejo HUB · Event production": "Añejo HUB · Producción de eventos",
  "Añejo HUB · Instagram campaign": "Añejo HUB · Campaña de Instagram",
  "Añejo HUB · Inventory": "Añejo HUB · Inventario",
  "Añejo HUB · Leads": "Añejo HUB · Prospectos",
  "Añejo HUB · Marketing": "Añejo HUB · Marketing",
  "Añejo HUB · Marketing Settings": "Añejo HUB · Ajustes de marketing",
  "Añejo HUB · Marketing Studio": "Añejo HUB · Estudio de marketing",
  "Añejo HUB · Menu & Prices": "Añejo HUB · Menú y precios",
  "Añejo HUB · My data": "Añejo HUB · Mis datos",
  "Añejo HUB · Order History": "Añejo HUB · Historial de pedidos",
  "Añejo HUB · Pricing Model": "Añejo HUB · Modelo de precios",
  "Añejo HUB · Program meals": "Añejo HUB · Comidas del programa",
  "Añejo HUB · Report an Issue": "Añejo HUB · Reportar un problema",
  "Añejo HUB · Rewards": "Añejo HUB · Recompensas",
  "Añejo HUB · SMS Test": "Añejo HUB · Prueba de SMS",
  "Añejo HUB · Sales": "Añejo HUB · Ventas",
  "Añejo HUB · Schedule": "Añejo HUB · Horario",
  "Añejo HUB · Site copy": "Añejo HUB · Textos del sitio",
  "Añejo HUB · Team": "Añejo HUB · Equipo",
  "Añejo HUB · Timesheet": "Añejo HUB · Hoja de horas",
  "Añejo HUB · Traffic": "Añejo HUB · Tráfico",
  "Añejo HUB · Trainer Partners": "Añejo HUB · Entrenadores asociados",
  "Añejo HUB · Training Compliance": "Añejo HUB · Cumplimiento de capacitación",
  "Añejo Hub · Daily Lunch": "Añejo Hub · Almuerzo diario",
  "Añejo Hub · Google review drafts": "Añejo Hub · Borradores de reseñas de Google",
  "Añejo Hub · Owner operations guide": "Añejo Hub · Guía operativa del propietario",
  "Añejo · Callback calendar": "Añejo · Calendario de llamadas",
  "Añejo · Catering follow-up": "Añejo · Seguimiento de catering",
  "Añejo · Commissary visits": "Añejo · Visitas a la cocina compartida",
  "Añejo · Invoice": "Añejo · Factura",
  "Añejo · Recipe standards": "Añejo · Estándares de recetas",
  "Añejo — Quick Card": "Añejo — Guía rápida",
  "Añejo HUB — Training": "Añejo HUB — Capacitación",
  "Catering · Añejo Driver": "Catering · Conductor de Añejo",
  "Local recovery storage is unavailable. No action was sent. Enable session storage and refresh.": "El almacenamiento de recuperación local no está disponible. No se envió ninguna acción. Habilita el almacenamiento de sesión y actualiza.",
  "Save outcome is unconfirmed. Resolve the previous request before recording another action.": "El resultado del guardado no está confirmado. Resuelve la solicitud anterior antes de registrar otra acción.",
  "Progress saved.": "Progreso guardado.",
  "Eastern time": "Hora del Este",
  "Not recorded": "Sin registrar",
  "Open Hub sign-in": "Abrir inicio de sesión del Hub",
  "Recipe standards": "Estándares de recetas",
  "Record arrival": "Registrar llegada",
  "Record departure": "Registrar salida",
  "Carrier / container": "Contenedor de transporte",
  "Handling note": "Nota de manipulación",
  "Catering event": "Evento de catering",
  "Customer pickup": "Recogida por el cliente",
  "Event progress": "Progreso del evento",
  "Final payment waived": "Saldo final exonerado",
  "Guest count": "Cantidad de invitados",
  "Packed and ready": "Empacado y listo",
  "Reopen preparation": "Reabrir preparación",
  "Resolve previous save": "Resolver guardado anterior",
  "Serving time": "Hora de servicio",
  "Staff driver": "Conductor del equipo",
  "Unit / suite": "Unidad o suite",
  "A composer save or resolution is still in progress. Wait for its result.": "Todavía se está guardando o conciliando un cambio del editor. Espera el resultado.",
  "A previous save has no confirmed outcome. Retry that same request to resolve it before recording another step.": "Un guardado anterior no tiene resultado confirmado. Reintenta esa misma solicitud para resolverla antes de registrar otro paso.",
  "Accept assignment": "Aceptar asignación",
  "Decline assignment": "Rechazar asignación",
  "Back to assignments": "Volver a asignaciones",
  "Allergies / dietary": "Alergias o necesidades alimentarias",
  "Branding overlaps a protected food or packaging area.": "La marca se superpone a una zona protegida del alimento o del envase.",
  "Browser storage is unavailable. No change was sent. Enable storage before continuing.": "El almacenamiento del navegador no está disponible. No se envió ningún cambio. Habilita el almacenamiento antes de continuar.",
  "Check every listed package and quantity before confirming pickup.": "Revisa cada paquete y cantidad de la lista antes de confirmar la recogida.",
  "Check saved status": "Consultar estado guardado",
  "Checkpoint media bytes changed.": "Los archivos multimedia cambiaron respecto al punto de recuperación.",
  "Choose fulfillment below": "Elige abajo el tipo de entrega",
  "Choose mode": "Elige el modo",
  "Choose natural, bright or warm polish.": "Elige un acabado natural, luminoso o cálido.",
  "Complete delivery": "Completar entrega",
  "Complete handoff": "Completar entrega al destinatario",
  "Confirm all food and packaging are ready.": "Confirma que toda la comida y los envases estén listos.",
  "Confirm all packages picked up": "Confirmar recogida de todos los paquetes",
  "Confirm every package before pickup.": "Confirma cada paquete antes de recoger.",
  "Confirm and save": "Confirmar y guardar",
  "Confirm execution plan": "Confirmar plan de ejecución",
  "Confirm pickup completed": "Confirmar recogida completada",
  "Confirm the delivery address.": "Confirma la dirección de entrega.",
  "Confirm the physical handoff first.": "Confirma primero la entrega física.",
  "Confirmed address": "Dirección confirmada",
  "Contact mobile (optional)": "Celular de contacto (opcional)",
  "Cooling/reheating": "Enfriamiento y recalentamiento",
  "Copy this link": "Copiar este enlace",
  "Could not approve": "No se pudo aprobar",
  "Could not read that file.": "No se pudo leer ese archivo.",
  "Could not save that": "No se pudo guardar eso",
  "Could not assign route": "No se pudo asignar la ruta",
  "Could not cancel": "No se pudo cancelar",
  "Could not delete": "No se pudo eliminar",
  "Could not do that": "No se pudo realizar esa acción",
  "Could not generate a variant": "No se pudo generar una variante",
  "Could not generate the carousel": "No se pudo generar el carrusel",
  "Could not load document": "No se pudo cargar el documento",
  "Could not load the menu.": "No se pudo cargar el menú.",
  "Could not log": "No se pudo registrar",
  "Could not mark paid": "No se pudo marcar como pagado",
  "Could not offboard.": "No se pudo dar de baja.",
  "Could not prepare this photo.": "No se pudo preparar esta foto.",
  "Could not save eligibility.": "No se pudo guardar la elegibilidad.",
  "Could not schedule": "No se pudo programar",
  "Could not send the reminder": "No se pudo enviar el recordatorio",
  "Could not send.": "No se pudo enviar.",
  "Could not update": "No se pudo actualizar",
  "Could not verify assignments. Refresh to try again.": "No se pudieron verificar las asignaciones. Actualiza para volver a intentarlo.",
  "Could not verify saved event progress. Reload to try again.": "No se pudo verificar el progreso guardado del evento. Recarga para volver a intentarlo.",
  "Date not recorded": "Fecha sin registrar",
  "Date not set": "Fecha sin definir",
  "Due date is required.": "La fecha de vencimiento es obligatoria.",
  "Edit draft": "Editar borrador",
  "Eligible · plan off": "Elegible · plan desactivado",
  "End of day": "Fin de día",
  "Enter a reason first.": "Ingresa primero un motivo.",
  "Enter a valid delivery / setup fee, or leave it blank until confirmed.": "Ingresa un cargo válido de entrega o montaje, o déjalo en blanco hasta confirmarlo.",
  "Enter the agreed total, or add a line": "Ingresa el total acordado o agrega un concepto",
  "Enter your 4–8 digit PIN.": "Ingresa tu PIN de 4 a 8 dígitos.",
  "Event not found.": "Evento no encontrado.",
  "Execution is read only until the conditions above are resolved. Past events remain archived.": "La ejecución es de solo lectura hasta resolver las condiciones anteriores. Los eventos pasados permanecen archivados.",
  "Explain why this event must be reopened.": "Explica por qué es necesario reabrir este evento.",
  "Final payment": "Pago final",
  "Food, quantities and all packaging are checked and ready.": "La comida, las cantidades y todos los envases están revisados y listos.",
  "Format unset": "Formato sin definir",
  "Generate proposed strategy": "Generar propuesta de estrategia",
  "Handed off": "Entregado al conductor",
  "Handling mode": "Modo de manipulación",
  "Holding/service": "Mantenimiento y servicio",
  "I am delivering": "Yo haré la entrega",
  "I confirmed food handling for every dish and these travel/setup times.": "Confirmé la manipulación de cada plato y estos tiempos de transporte y montaje.",
  "I physically handed over the complete catering order.": "Entregué físicamente el pedido completo de catering.",
  "In progress": "En curso",
  "JPEG copy — source history retained": "Copia JPEG · historial de origen conservado",
  "Live food handling": "Registro de manipulación en curso",
  "Loading photos…": "Cargando fotos…",
  "Look for a “You have been signed out” card. If it is there, press Sign in again.": "Busca el aviso «Tu sesión se ha cerrado». Si aparece, pulsa «Iniciar sesión de nuevo».",
  "Manual total: changing quantity does not change this amount.": "Total manual: cambiar la cantidad no modifica este importe.",
  "Mark packed and ready": "Marcar empacado y listo",
  "Marketing expert": "Especialista de marketing",
  "Measured temperature °F": "Temperatura medida en °F",
  "Menu and package pickup": "Menú y recogida de paquetes",
  "My catering assignments": "Mis asignaciones de catering",
  "Name is required.": "El nombre es obligatorio.",
  "No actions are available. Contact the owner about any blockers.": "No hay acciones disponibles. Consulta con el propietario los obstáculos pendientes.",
  "No catering assignments found.": "No se encontraron asignaciones de catering.",
  "No execution steps recorded.": "No hay pasos de ejecución registrados.",
  "No route assigned for today.": "No hay ruta asignada para hoy.",
  "No unconfirmed save in this tab.": "No hay guardados sin confirmar en esta pestaña.",
  "Not provided": "No proporcionado",
  "Not specified": "Sin especificar",
  "Not started": "Sin iniciar",
  "Nothing was sent by opening this screen.": "Abrir esta pantalla no envió nada.",
  "Nothing was sent.": "No se envió nada.",
  "Office contact (optional)": "Contacto de la oficina (opcional)",
  "On track": "Según lo previsto",
  "One last thing: file your end-of-day report": "Una última cosa: envía tu reporte de fin de día",
  "Operation rejected by the server:": "Operación rechazada por el servidor:",
  "Order sound off": "Sonido de pedidos desactivado",
  "Order sound on": "Sonido de pedidos activado",
  "Owner access required.": "Se requiere acceso del propietario.",
  "Owner delivery": "Entrega a cargo del propietario",
  "PIN not recognized.": "PIN no reconocido.",
  "Photographic polish — original preserved": "Acabado fotográfico · original conservado",
  "Pick a date and time.": "Elige una fecha y una hora.",
  "Pick a template first.": "Elige primero una plantilla.",
  "Plan confirmed": "Plan confirmado",
  "Prepared quote · review and send": "Cotización preparada · revisar y enviar",
  "Preparing photo…": "Preparando foto…",
  "Preview unavailable": "Vista previa no disponible",
  "Preview unavailable:": "Vista previa no disponible:",
  "Progress saved, but the local recovery record could not be cleared. Refresh before another action.": "El progreso se guardó, pero no se pudo borrar el registro local de recuperación. Actualiza antes de realizar otra acción.",
  "Progress saved, but the planning timeline could not refresh. Reload this page before relying on its times.": "El progreso se guardó, pero la cronología del plan no se actualizó. Recarga esta página antes de confiar en sus horarios.",
  "Protected photo areas must fit inside the original image.": "Las zonas protegidas de la foto deben quedar dentro de la imagen original.",
  "Provider accepted · delivery unverified": "Aceptado por el proveedor · entrega sin verificar",
  "Publishing…": "Publicando…",
  "Ready for delivery": "Listo para entregar",
  "Reason for declining (optional)": "Motivo del rechazo (opcional)",
  "Reason for reopening": "Motivo para reabrir",
  "Record a measured temperature and carrier, or explain ambient handling.": "Registra una temperatura medida y el contenedor, o explica la manipulación a temperatura ambiente.",
  "Record actual readings and carrier at this stage. These records do not automatically certify food safety.": "Registra las mediciones reales y el contenedor en esta etapa. Estos registros no certifican automáticamente la seguridad alimentaria.",
  "Recorded error:": "Error registrado:",
  "Refresh saved progress": "Actualizar progreso guardado",
  "Refresh saved status": "Actualizar estado guardado",
  "Reload progress": "Recargar progreso",
  "Resolve the pending kitchen operation first.": "Resuelve primero la operación de cocina pendiente.",
  "Retry previous request": "Reintentar solicitud anterior",
  "Running…": "Ejecutando…",
  "SMS consent": "Consentimiento para SMS",
  "Save changes": "Guardar cambios",
  "Save handling record": "Guardar registro de manipulación",
  "Save not verified": "Guardado sin verificar",
  "Save outcome is unconfirmed. Resolve the previous save before continuing.": "El resultado del guardado no está confirmado. Resuelve el guardado anterior antes de continuar.",
  "Save outcome unconfirmed. Refresh the board before retrying.": "Resultado del guardado sin confirmar. Actualiza el panel antes de reintentar.",
  "Save private draft": "Guardar borrador privado",
  "Save private revision": "Guardar revisión privada",
  "Save rejected. Refresh before continuing.": "Guardado rechazado. Actualiza antes de continuar.",
  "Save rejected. Refresh progress before continuing.": "Guardado rechazado. Actualiza el progreso antes de continuar.",
  "Saved history": "Historial guardado",
  "Scheduled for": "Programado para",
  "Guest count required": "Cantidad de invitados obligatoria",
  "Assign driver": "Asignar conductor",
  "Refresh assignment": "Actualizar asignación",
  "Start preparation": "Iniciar preparación",
  "Begin packing": "Comenzar empaque",
  "Ready to hand off": "Listo para entregar al conductor",
  "Delivery completed": "Entrega completada",
  "Total count": "Cantidad total",
  "Purchase quantity": "Cantidad a comprar",
  "Edit purchase list": "Editar lista de compras",
  "Kitchen reservation": "Reserva de cocina",
  "Reserve kitchen hours": "Reservar horas de cocina",
  "Actual hours": "Horas reales",
  "Planned hours": "Horas previstas",
  "Recorded progress": "Progreso registrado",
  "Upcoming events": "Próximos eventos",
  "Print labels": "Imprimir etiquetas",
  "Generate labels": "Generar etiquetas",
  "Food labels": "Etiquetas de alimentos",
  "Packing checklist": "Lista de empaque",
  "Temperature record": "Registro de temperatura",
  "Driver assignment": "Asignación de conductor",
  "Takeover": "Asumir operación",
  "Refresh status": "Actualizar estado",
  "Add ingredient": "Agregar ingrediente",
  "Remove ingredient": "Quitar ingrediente",
  "Save draft changes": "Guardar cambios del borrador",
  "No changes saved": "No se guardaron cambios",
  "Last saved": "Último guardado",
  "Unsaved changes": "Cambios sin guardar",
  "Upload failed": "Error al subir archivo",
  "Upload complete": "Carga completada",
  "Could not load photos.": "No se pudieron cargar las fotos.",
  "Could not read this photo.": "No se pudo leer esta foto.",
  "Choose from your photos": "Elige entre tus fotos",
  "Cancel": "Cancelar",
  "Search loaded photos by name or event": "Buscar fotos cargadas por nombre o evento",
  "Search covers loaded photos only. Load more to see older photos. Selection does not publish or schedule a post.": "La búsqueda incluye solo fotos cargadas. Carga más para ver fotos anteriores. Seleccionar no publica ni programa una publicación.",
  "Load more": "Cargar más",
  "Retry loading": "Reintentar carga",
  "AI-enhanced copy: have you compared the food, quantities, packaging and printed text with the original? Use this reviewed copy?": "Copia mejorada con IA: ¿comparaste comida, cantidades, empaque y texto impreso con el original? ¿Usar esta copia revisada?",
  "Could not select the photo.": "No se pudo seleccionar la foto.",
  "Event photo": "Foto de evento",
  "Use photo": "Usar foto",
  "Use JPEG copy": "Usar copia JPEG",
  "Photo": "Foto",
  "Unfiled": "Sin carpeta",
  "AI-enhanced · Review required": "Mejorada con IA · Requiere revisión",
  "Source for comparison": "Fuente para comparar",
  "Original for comparison": "Original para comparar",
  "Compare with source": "Comparar con la fuente",
  "Compare with original": "Comparar con el original",
  "Creates a private JPEG copy on white; preserves the original.": "Crea una copia JPEG privada sobre blanco; conserva el original.",
  "Enhance a copy": "Mejorar una copia",
  "No matches in loaded photos.": "Sin coincidencias entre las fotos cargadas.",
  "No photos saved yet. Add photos in Photos / Fotos.": "Aún no hay fotos guardadas. Agrega fotos en Photos / Fotos.",
  " photos loaded.": " fotos cargadas.",
  "Polish your real photo": "Mejora tu foto real",
  "Photo polish adjusts the original pixels without inventing food or packaging. Optional AI retouch can change details and framing: compare both images carefully.": "El ajuste fotográfico modifica los píxeles originales sin inventar comida ni empaque. El retoque opcional con IA puede cambiar detalles y encuadre: compara ambas imágenes.",
  "Open full size": "Abrir tamaño completo",
  "Original — preserved": "Original — conservado",
  "Method": "Método",
  "Photo method": "Método de foto",
  "Finish": "Acabado",
  "Photo finish": "Acabado de foto",
  "Generate a preview": "Generar vista previa",
  "Photo polish uses no AI credits. AI retouch uses the existing AI budget. Both save a separate labeled copy in Photos and preserve the original. Neither publishes a post. JPEG, PNG and WebP only; export camera RAW/HEIC first.": "El ajuste fotográfico no usa créditos de IA. El retoque IA usa el presupuesto existente. Ambos guardan una copia identificada en Fotos y conservan el original. Ninguno publica. Solo JPEG, PNG y WebP; exporta RAW/HEIC primero.",
  " I checked the food, quantities, packaging and printed text against the original.": " Comparé comida, cantidades, empaque y textos impresos con el original.",
  "Use this copy": "Usar esta copia",
  "Close": "Cerrar",
  "Preparing a separate preview. This can take a minute…": "Preparando una vista previa aparte. Puede tardar un minuto…",
  "Could not enhance this photo.": "No se pudo mejorar esta foto.",
  "AI-enhanced copy — review required": "Copia mejorada con IA — requiere revisión",
  "Photo polish — original composition": "Ajuste fotográfico — composición original",
  "Copy saved in Photos. Inspect both at full size before using it.": "Copia guardada en Fotos. Revisa ambas antes de usarla.",
  "Could not read this file.": "No se pudo leer este archivo.",
  "Could not complete the request.": "No se pudo completar la solicitud.",
  "Use JPEG, PNG or WebP up to 5 MB.": "Usa JPEG, PNG o WebP de hasta 5 MB.",
  "Uploading ": "Subiendo ",
  " photo(s) saved. ": " foto(s) guardada(s). ",
  "Could not open the photo.": "No se pudo abrir la foto.",
  "AI-enhanced copy: have you checked the food, packaging and printed text against the original?": "Copia con IA: ¿comparaste comida, empaque y textos con el original?",
  "Preparing your draft…": "Preparando tu borrador…",
  "Photo opened in Create. Review it and write your caption before saving a draft.": "Foto abierta en Crear. Revísala y escribe el texto antes de guardar el borrador.",
  "Review for team reuse": "Revisar para uso del equipo",
  "Loading saved review…": "Cargando revisión guardada…",
  "Photo under review": "Foto en revisión",
  "Permission to select this photo for draft posts only. This does not approve a public post, caption or schedule.": "Permiso para seleccionar esta foto solo en borradores. No aprueba publicaciones, textos ni horarios.",
  "Reload saved review": "Recargar revisión",
  "Reuse registry unavailable. Approval status is unknown; no permission has been changed. ": "Registro no disponible. El estado es desconocido; no se cambió ningún permiso. ",
  "The registry response is incomplete. Current review status cannot be confirmed for this photo.": "La respuesta del registro está incompleta. No se puede confirmar la revisión de esta foto.",
  "Allowed in draft selection": "Permitida para borradores",
  "Not allowed in draft selection": "No permitida para borradores",
  "revision ": "revisión ",
  "Not registered. Uploading a photo never enables reuse automatically.": "Sin registrar. Subir una foto nunca permite su reutilización automáticamente.",
  "Saved content hash: ": "Hash del contenido guardado: ",
  "Reviewed by ": "Revisada por ",
  "Not saved. Reload the review before retrying. ": "No se guardó. Recarga la revisión antes de reintentar. ",
  "Stop team reuse": "Detener reutilización",
  "Live catalog unavailable. New approval is disabled; an existing permission can still be revoked.": "Catálogo en vivo no disponible. No se pueden dar nuevos permisos; los existentes sí se pueden revocar.",
  "Reuse requires a JPEG. Prepare a JPEG draft copy, then review that copy separately.": "Se necesita un JPEG. Prepara una copia JPEG y revísala por separado.",
  "Exactly which menu items appear?": "¿Qué productos del menú aparecen?",
  "Find menu items": "Buscar productos del menú",
  "Name or item ID": "Nombre o ID del producto",
  "Previously selected products are absent from the current catalog: ": "Productos anteriores ausentes del catálogo actual: ",
  "Theme (optional; use consistent wording)": "Tema (opcional; usa el mismo nombre)",
  "Signature, birthday, custom…": "Signature, cumpleaños, personalizado…",
  "What does the image show?": "¿Qué muestra la imagen?",
  "Allow team to reuse in draft posts": "Permitir al equipo reutilizar en borradores",
  "Save reuse review": "Guardar revisión",
  "Select one to twelve actual products shown in this image.": "Selecciona de uno a doce productos que aparezcan en esta imagen.",
  " shown of ": " visibles de ",
  " loaded photos. Search covers loaded photos only; use Load more for older photos.": " fotos cargadas. La búsqueda solo incluye fotos cargadas; usa Ver más para las anteriores.",
  "Uploaded event photo": "Foto de evento subida",
  "Start a post": "Crear publicación",
  "Prepare JPEG draft": "Preparar borrador JPEG",
  "Creates a JPEG copy for Instagram. The original stays here.": "Crea una copia JPEG para Instagram. El original se conserva aquí.",
  "AI-enhanced copy — review against original": "Copia con IA — comparar con original",
  "Enhance photo": "Mejorar foto",
  "YOUR PHOTOS": "TUS FOTOS",
  "From your table to your next post": "De tu mesa a tu próxima publicación",
  "Drop your real food and event photos here. Keep them together, then choose a favorite to start a draft.": "Sube aquí tus fotos reales de comida y eventos. Organízalas y elige una para empezar un borrador.",
  "Event or folder (optional)": "Evento o carpeta (opcional)",
  "e.g. Pink birthday catering": "Ej. Catering de cumpleaños rosa",
  "Choose photos": "Elegir fotos",
  "Or drop files here · JPEG, PNG, WebP · up to 5 MB each": "O arrastra archivos aquí · JPEG, PNG, WebP · hasta 5 MB cada uno",
  "Saved privately for the Hub and marketing team. Uploading does not publish or schedule anything.": "Guardadas de forma privada para el Hub y el equipo de marketing. Subir no publica ni programa nada.",
  "Your photo collection": "Tu colección de fotos",
  "Refresh": "Actualizar",
  "Before publishing, review names, people, menu accuracy and your final caption.": "Antes de publicar, revisa nombres, personas, el menú y el texto final.",
  "Find in loaded photos": "Buscar en fotos cargadas",
  "File name or event folder": "Nombre de archivo o carpeta",
  "No photos yet. Add your first event above.": "Aún no hay fotos. Agrega tu primer evento arriba.",
  "Edit event purchase": "Editar compra del evento",
  "Record food and carrier conditions": "Registrar condiciones de comida y transporte",
  "Start event preparation": "Iniciar preparación del evento",
  "Mark event ready": "Marcar evento listo",
  "Record dish progress": "Registrar progreso del plato",
  "Saving…": "Guardando…",
  "The operator account could not be verified. Refresh the event.": "No se pudo verificar la cuenta. Actualiza el evento.",
  "The previous save is unconfirmed. Re-enter your PIN to resolve that exact operation.": "El guardado anterior no está confirmado. Ingresa tu PIN para resolver esa misma operación.",
  "The saved action and quantities are locked. No second operation will be created.": "La acción y las cantidades guardadas están bloqueadas. No se creará otra operación.",
  "Item": "Artículo",
  "Quantity to purchase · include unit": "Cantidad a comprar · incluye unidad",
  "Purchase status": "Estado de compra",
  "Still needed": "Pendiente",
  "Purchased": "Comprado",
  "Not needed for this event": "No se necesita para este evento",
  "Event-specific note": "Nota para este evento",
  "Only this event’s purchase list changes. Inventory and the master recipe are not changed.": "Solo cambia la lista de este evento. No cambia el inventario ni la receta maestra.",
  "Holding method": "Método de conservación",
  "Hot": "Caliente",
  "Cold": "Frío",
  "Ambient · explain handling": "Ambiente · explicar manejo",
  "Actual measured temperature · °F": "Temperatura real medida · °F",
  "Record the actual reading and equipment used. This record is not an automatic food-safety approval.": "Registra la medición real y el equipo utilizado. Este registro no es una aprobación automática de seguridad alimentaria.",
  "ordered": "pedidos",
  "Actual quantity completed": "Cantidad real completada",
  "Confirm that the recorded dish progress, quantities and packing conditions are complete. The server checks every requirement before the event becomes ready.": "Confirma el progreso de los platos, las cantidades y las condiciones de empaque. El sistema verifica cada requisito antes de marcar listo.",
  "Start actual preparation for this catering booking.": "Inicia la preparación real de esta reserva de catering.",
  "Your staff PIN": "Tu PIN del equipo",
  "Enter your 4–8 digit staff PIN.": "Ingresa tu PIN de 4–8 dígitos.",
  "No request was sent.": "No se envió ninguna solicitud.",
  "Saving the recorded operation…": "Guardando la operación registrada…",
  "The operation was saved, but the local recovery record could not be cleared. Resolve this same save before another action.": "La operación se guardó, pero no se pudo limpiar el registro local. Resuelve este guardado antes de otra acción.",
  "Saved. Refreshing current event…": "Guardado. Actualizando el evento…",
  "This operation was rejected. Refresh before continuing.": "La operación fue rechazada. Actualiza antes de continuar.",
  "The save outcome is unconfirmed. Close and resolve the same saved operation before doing anything else.": "No se confirmó el resultado. Cierra y resuelve esa misma operación antes de continuar.",
  "Connection interrupted. The save outcome is unconfirmed. Resolve the saved operation before continuing.": "Conexión interrumpida. Resuelve la operación guardada antes de continuar.",
  "Resolve this same save": "Resolver este guardado",
  "Before departure": "Antes de salir",
  "At delivery": "En la entrega",
  "Record each dish’s actual temperature and carrier for this stage. Readings from packing do not substitute for a new reading.": "Registra la temperatura real y el transportador de cada plato para esta etapa. La medición al empacar no sustituye una medición nueva.",
  "New reading needed": "Se requiere medición nueva",
  "Record": "Registrar",
  "A kitchen save has an unconfirmed outcome. Resolve it before recording another action.": "Hay un guardado sin confirmar. Resuélvelo antes de registrar otra acción.",
  "Resolve saved operation": "Resolver operación guardada",
  "What starts your work": "Qué inicia tu trabajo",
  "Your steps": "Tus pasos",
  "Remember": "Recuerda",
  "What's new": "Lo nuevo",
  "Añejo Catering Co. · Quick reference · anejocateringco.com/hub": "Añejo Catering Co. · Referencia rápida · anejocateringco.com/hub",
  "Owner": "Dueño",
  "Owner — daily playbook": "Dueño — guía diaria",
  "Most of the HUB runs itself. Your job is the few human decisions: approvals, assignments, and the calls only an owner makes.": "Casi todo el HUB se ejecuta solo. Tu trabajo son las pocas decisiones humanas: aprobaciones, asignaciones y lo que solo el dueño decide.",
  "You sign in with your PIN; the forecast, prep sheet, and any alerts are already waiting.": "Inicias sesión con tu PIN; el pronóstico, la hoja de preparación y las alertas ya están listas.",
  "Kitchen": "Cocina",
  "Kitchen — quick card": "Cocina — tarjeta rápida",
  "Marking an order ready changed: two photos are now required, and every order has a prep clock.": "Marcar un pedido como listo cambió: ahora se requieren dos fotos, y cada pedido tiene un reloj de preparación.",
  "Make exactly what each card shows. Your PIN is your signature.": "Haz exactamente lo que muestra cada tarjeta. Tu PIN es tu firma.",
  "An order is paid, a subscriber’s daily bowl is created, or the owner adds a manual order — it appears on your board and chimes.": "Se paga un pedido, se crea el bowl diario de un suscriptor, o el dueño agrega un pedido manual — aparece en tu tablero y suena.",
  "Driver": "Conductor",
  "Driver — quick card": "Conductor — tarjeta rápida",
  "No offer, nothing to do yet. Be reliable — your accepts and denies are tracked.": "Sin oferta, nada que hacer aún. Sé confiable — tus aceptaciones y rechazos se registran.",
  "The owner assigns you a route — you get a push notification + a text.": "El dueño te asigna una ruta — recibes una notificación + un texto.",
  "Marketing — quick card": "Marketing — tarjeta rápida",
  "You run the marketing system daily and tell Dayan what needs changing.": "Manejas el sistema de marketing a diario y le dices a Dayan qué hay que cambiar.",
  "A new day — open Today and work the seven checks.": "Un día nuevo — abre Hoy y trabaja las siete revisiones.",
  "Vendor": "Proveedor",
  "Vendor — quick card": "Proveedor — tarjeta rápida",
  "You only see your own purchase orders and what to deliver.": "Solo ves tus propias órdenes de compra y qué entregar.",
  "The owner approves an order and the kitchen submits a purchase order — it lands in your portal.": "El dueño aprueba un pedido y la cocina envía una orden de compra — llega a tu portal.",
  "All": "Todo",
  "Card": "Tarjeta",
  "Back": "Atrás",
  "Next": "Siguiente",
  "Pause narration": "Pausar narración",
  "Step": "Paso",
  "of": "de",
  "Current owner operations guide": "Guía actual de operaciones de la dueña",
  "The bilingual guide links to current Hub screens. The older narrated owner module below is English-only reference material.": "La guía bilingüe enlaza a pantallas actuales del Hub. El módulo narrado anterior de abajo está solo en inglés y queda como referencia.",
  "Open bilingual guide": "Abrir guía bilingüe",
  "Trigger": "Qué lo inicia",
  "You do": "Tú haces",
  "Then (automatic)": "Luego (automático)",
  "✓ Completed": "✓ Completado",
  "Read this first — it changed since you last trained.": "Lee esto primero — cambió desde tu última capacitación.",
  "✓ You are up to date on this training.": "✓ Estás al día con esta capacitación.",
  "Training completed — thank you! Your owner can see this in the compliance view.": "Capacitación completada — ¡gracias! Tu dueño puede verlo en el panel de cumplimiento.",
  "Owner — operations guide + narrated tour": "Dueña — guía de operaciones + tour narrado",
  "Post status unavailable": "Estado de publicaciones no disponible",
  "We could not verify your posts or Instagram connection. Refresh to check again.": "No pudimos verificar tus publicaciones ni la conexión de Instagram. Actualiza para volver a comprobar.",
  "Open Create": "Abrir Crear",
  "A post is awaiting publication confirmation": "Una publicación espera confirmación",
  "Its saved status is publishing. Check the result before trying again.": "Su estado guardado es publicando. Comprueba el resultado antes de volver a intentarlo.",
  "Check publication": "Comprobar publicación",
  "A post needs your attention": "Una publicación necesita atención",
  "The latest list includes a failed post. Review its error and preview before retrying.": "La lista reciente incluye una publicación fallida. Revisa el error y la vista previa antes de reintentar.",
  "Review failed posts": "Revisar publicaciones fallidas",
  "Finish your next post": "Termina tu próxima publicación",
  " saved draft(s) in the latest list. Choose one, review its photo and caption, then decide when to publish.": " borrador(es) guardado(s) en la lista reciente. Elige uno, revisa la foto y el texto y decide cuándo publicar.",
  "Review drafts": "Revisar borradores",
  "Your next saved schedule": "Tu próxima programación guardada",
  "Saved for ": "Guardada para ",
  "Publication is not yet verified.": "La publicación aún no está verificada.",
  "A scheduled post is recorded, but its date is unavailable.": "Hay una publicación programada, pero la fecha no está disponible.",
  "Review schedule": "Revisar programación",
  "Start with a photo of your food": "Empieza con una foto de tu comida",
  "Choose a real food or event photo, then write or generate a caption preview.": "Elige una foto real de comida o un evento y después escribe o genera un texto de prueba.",
  "Choose a photo": "Elegir una foto",
  "Instagram: unverified": "Instagram: sin verificar",
  "Instagram: not configured": "Instagram: sin configurar",
  "Instagram connection checked": "Conexión de Instagram comprobada",
  "Instagram connection check failed": "Falló la comprobación de Instagram",
  "Automatic publisher: no verified heartbeat.": "Publicador automático: sin actividad verificada.",
  "Manual check recorded; automatic publisher remains unverified.": "Comprobación manual registrada; el publicador automático sigue sin verificar.",
  "Automatic publisher: last heartbeat is stale.": "Publicador automático: el último registro está desactualizado.",
  "Automatic publisher: a run has started; completion unverified.": "Publicador automático: ejecución iniciada; finalización sin verificar.",
  "Automatic publisher: last run reported an error.": "Publicador automático: la última ejecución informó un error.",
  "Automatic publisher: recent run completed.": "Publicador automático: ejecución reciente finalizada.",
  "Recorded: ": "Registro: ",
  "Last recorded successful run: ": "Última ejecución satisfactoria registrada: ",
  "Last run counts (checked/published/failed/missed): ": "Últimos conteos (revisados/publicados/fallidos/omitidos): ",
  "Recorded connection expiry: ": "Vencimiento registrado de la conexión: ",
  " (recorded date has passed; verify current access)": " (la fecha registrada ya pasó; verifica el acceso actual)",
  "Connection expiry is not recorded.": "El vencimiento de la conexión no está registrado.",
  "Checked: ": "Comprobado: ",
  "not yet": "aún no",
  "Based on the latest 60 posts returned. A saved schedule is not proof of a running publisher or a live post.": "Basado en las últimas 60 publicaciones devueltas. Una programación guardada no prueba que el publicador esté activo ni que la publicación esté en línea.",
  "Current saved booking": "Reserva guardada actual",
  "Current saved quote": "Cotización guardada actual",
  "View saved booking details": "Ver detalles de la reserva guardada",
  "Original request menu suggestion · not the agreed quote": "Menú sugerido en la solicitud original · no es la cotización acordada",
  "Original request · Birthday party": "Solicitud original · Fiesta de cumpleaños",
  "Original request · Event": "Solicitud original · Evento",
  "Edit existing quote": "Editar cotización existente",
  "Choose existing quote": "Elegir cotización existente",
  "Extra Signature Sauce": "Salsa de la casa adicional",
  "Saved drafts & prepared quotes": "Borradores guardados y cotizaciones preparadas",
  "Check whether this draft already has a checkout": "Comprobar si este borrador ya tiene un enlace de pago",
  "Save unfinished work without creating a checkout or sending anything.": "Guarda el trabajo pendiente sin crear un enlace de pago ni enviar nada.",
  "For a new event only. Use Edit existing quote to change an offer already created.": "Solo para un evento nuevo. Usa «Editar cotización existente» para modificar una oferta ya creada.",
  "Loading published dishes…": "Cargando platos publicados…",
  "View prepared quote": "Ver cotización preparada",
  "Open draft": "Abrir borrador",
  "No saved drafts.": "No hay borradores guardados.",
  "Unfinished event": "Evento pendiente",
  "Unsaved quote changes": "Cambios de cotización sin guardar",
  "Your unsaved edits will be replaced. Save a draft first if you want to keep them. No checkout or message will be created.": "Se reemplazarán tus cambios sin guardar. Guarda primero un borrador si quieres conservarlos. No se creará ningún enlace de pago ni mensaje.",
  "Discard unsaved edits": "Descartar cambios sin guardar",
  "Could not open the confirmation. Nothing was changed.": "No se pudo abrir la confirmación. No cambió nada.",
  "Plain-text copy": "Copia en texto sin formato",
  "Plain-text copy unavailable; the rendered email must load before approval.": "Copia en texto sin formato no disponible; la vista previa del correo debe cargar antes de aprobar.",
  "The rendered email did not load.": "La vista previa del correo no cargó.",
  "The rendered email failed to load.": "No se pudo cargar la vista previa del correo.",
  "Preview failed. Retry before approving or sending.": "Falló la vista previa. Reintenta antes de aprobar o enviar.",
  "Rendered email loaded. Read the complete preview before approval.": "Vista previa cargada. Léela completa antes de aprobar.",
  "The email she would receive": "El correo que recibiría el cliente",
  "View quoted menu": "Ver menú cotizado",
  "Booked · deposit received": "Reservado · depósito recibido",
  "Final balance": "Saldo final",
  "Continue to Marketing → Teach": "Continuar a Marketing → Capacitar",
  "Continue to Marketing → Create → Email": "Continuar a Marketing → Crear → Correo",
  "Continue to Marketing → Create → Instagram": "Continuar a Marketing → Crear → Instagram",
  "Cook to these portions exactly. They are the portions the dietitian signed and the center keeps on file.": "Cocina siguiendo exactamente estas porciones. Son las porciones firmadas por el dietista que el centro conserva en sus registros.",
  "Creative Studio has moved.": "El Estudio Creativo se ha trasladado.",
  "Customer preferences appear here in Eastern time. Confirmed labels require saved Google Calendar verification. Each receipt shows when it was verified; this page does not poll Google Calendar live.": "Las preferencias del cliente aparecen aquí en hora del Este. Las etiquetas de confirmación requieren una verificación guardada de Google Calendar. Cada comprobante indica cuándo se verificó; esta página no consulta Google Calendar en tiempo real.",
  "DBPR / regulatory": "DBPR o normativa",
  "Dated service menu": "Menú de servicio por fecha",
  "Day-before free-delivery cutoff": "Hora límite del día anterior para entrega gratis",
  "Disable automatic acknowledgement": "Desactivar acuse de recibo automático",
  "Do not invent proprietary ingredients or missing safety instructions. Unknowns remain open until verified.": "No inventes ingredientes de recetas privadas ni instrucciones de seguridad faltantes. Lo desconocido queda pendiente hasta verificarse.",
  "Document the kitchen’s real method. Save incomplete work as a draft; Dayan reviews the exact version before it becomes an approved recipe.": "Documenta el método real de la cocina. Guarda el trabajo incompleto como borrador; Dayan revisa la versión exacta antes de aprobar la receta.",
  "E.164 format with country code (e.g. +1 for US).": "Formato E.164 con código de país (p. ej., +1 para Estados Unidos).",
  "Each catalog size and filling is a SKU. A name match is a reference, not approval. Published legacy recipes remain in the library and are marked unconfirmed.": "Cada tamaño y relleno del catálogo es un SKU. La coincidencia de nombre es una referencia, no una aprobación. Las recetas antiguas publicadas permanecen en la biblioteca marcadas como no confirmadas.",
  "Each step needs its own preview and approval. The server checks prior outcomes and waiting periods. Selecting a step never sends it.": "Cada paso necesita su propia vista previa y aprobación. El servidor comprueba los resultados anteriores y los períodos de espera. Seleccionar un paso nunca lo envía.",
  "Enable for new inquiries": "Activar para nuevas solicitudes",
  "Enter quantities for the full batch above. Mark raw, cooked or as purchased; include every ingredient and packaging requirement. Link inventory only when the ingredient really matches.": "Ingresa cantidades para el lote completo indicado arriba. Señala si son crudas, cocidas o tal como se compraron; incluye cada ingrediente y envase necesario. Relaciona el inventario solo cuando el ingrediente coincida realmente.",
  "Equipment, one per line / Equipo": "Equipo, uno por línea",
  "Every inquiry, a clear next step.": "Cada solicitud, un próximo paso claro.",
  "Every single time.": "Siempre.",
  "Existing dates are preserved. Disable a date or mark it sold out to stop new orders. Past dates stay visible as history.": "Las fechas existentes se conservan. Desactiva una fecha o márcala como agotada para detener nuevos pedidos. Las fechas pasadas siguen visibles como historial.",
  "Find an item or vendor": "Buscar un artículo o proveedor",
  "From the first ingredient to the final plate": "Del primer ingrediente al plato terminado",
  "High, urgent, and safety issues alert the owner right away.": "Los problemas de prioridad alta, urgentes o de seguridad avisan al propietario de inmediato.",
  "Historical receipt prices help cost recipes. They do not confirm stock on hand today. Per-unit rates exclude receipt tax unless the original line includes it.": "Los precios históricos de recibos ayudan a calcular costos de recetas. No confirman las existencias actuales. Los precios unitarios excluyen el impuesto del recibo, salvo que el concepto original lo incluya.",
  "I reviewed both previews and approve this template for future inquiries.": "Revisé ambas vistas previas y apruebo esta plantilla para futuras solicitudes.",
  "I reviewed the recipient, subject and rendered email, and approve sending this reminder.": "Revisé el destinatario, el asunto y la vista previa del correo, y apruebo enviar este recordatorio.",
  "I reviewed this saved version, including portions, safety, allergens and menu unit conversions.": "Revisé esta versión guardada, incluidas las porciones, la seguridad, los alérgenos y las conversiones de unidades del menú.",
  "I verified the recipe source and the method taught to staff.": "Verifiqué la fuente de la receta y el método que se enseña al personal.",
  "Immediate acknowledgement · review and activation": "Acuse de recibo inmediato · revisión y activación",
  "Import / update plan": "Importar o actualizar plan",
  "Improve the next lunch.": "Mejorar el próximo almuerzo.",
  "Internal training media paths, one per line / Videos internos": "Rutas de videos internos de capacitación, una por línea",
  "Item name": "Nombre del artículo",
  "Keep item counts current. Photos are reported inventory snapshots and are not proof of delivery or receipt.": "Mantén las cantidades actualizadas. Las fotos son registros declarados del inventario y no prueban una entrega o recepción.",
  "Knowledge Base": "Base de conocimientos",
  "Library / Biblioteca": "Biblioteca",
  "Loading Sales…": "Cargando ventas…",
  "Loading affiliate program…": "Cargando programa de afiliados…",
  "Loading callback requests…": "Cargando solicitudes de llamada…",
  "Loading campaign…": "Cargando campaña…",
  "Loading contract accounts…": "Cargando cuentas de oficinas…",
  "Loading inquiries…": "Cargando solicitudes…",
  "Loading inventory…": "Cargando inventario…",
  "Loading invoice…": "Cargando factura…",
  "Loading orders…": "Cargando pedidos…",
  "Loading owner guide…": "Cargando guía del propietario…",
  "Loading paid receipt costs…": "Cargando costos de compras pagadas…",
  "Loading payouts…": "Cargando pagos…",
  "Loading proposals…": "Cargando propuestas…",
  "Loading quotes…": "Cargando cotizaciones…",
  "Loading recipe records…": "Cargando registros de recetas…",
  "Loading rewards…": "Cargando recompensas…",
  "Loading today’s counts…": "Cargando cantidades de hoy…",
  "Loading trainer partners…": "Cargando entrenadores asociados…",
  "Lunch feedback & menu requests": "Opiniones sobre almuerzos y solicitudes de menú",
  "MY DATA": "MIS DATOS",
  "Manual reminder step": "Paso de recordatorio manual",
  "Manuals, SOPs and DBPR documents the Creative Studio can answer from. Uploaded documents are split into passages and searched per question — so the library can be any size without anything being silently dropped.": "Manuales, procedimientos y documentos del DBPR que el Estudio Creativo puede consultar para responder. Los documentos subidos se dividen en pasajes y se buscan según cada pregunta, sin omitir contenido silenciosamente por el tamaño de la biblioteca.",
  "Meals are $10 each. Same-day delivery uses the existing checkout fee; preorders before the prior-day cutoff have free delivery. A sold-out flag closes new checkout attempts; it does not cancel a previously issued payment link.": "Cada comida cuesta $10. La entrega el mismo día usa el cargo existente del checkout; las preórdenes antes de la hora límite del día anterior tienen entrega gratis. Marcar como agotado impide nuevos intentos de pago; no cancela un enlace de pago emitido anteriormente.",
  "Menu desk": "Gestión del menú",
  "Message (optional)": "Mensaje (opcional)",
  "Name / Nombre": "Nombre",
  "ORGANIC INSTAGRAM": "INSTAGRAM ORGÁNICO",
  "OWNER · SERVICE INTELLIGENCE": "PROPIETARIO · ANÁLISIS DEL SERVICIO",
  "On-hand unit": "Unidad de existencias",
  "One action per line, in the exact order a new cook should follow. Include doneness checks and plating steps.": "Una acción por línea, en el orden exacto que debe seguir un cocinero nuevo. Incluye la verificación del punto de cocción y los pasos de presentación.",
  "One kitchen production run, two sales channels. Dated retail lunches appear in the normal kitchen workflow after payment. Match these meals with the office menu you are producing; editing this desk does not change office contracts.": "Una producción de cocina, dos canales de venta. Los almuerzos individuales por fecha entran en el proceso habitual de cocina después del pago. Coordina estas comidas con el menú de oficina que preparas; editar este panel no modifica los contratos de oficinas.",
  "One sign. A fresh lunch every day.": "Un cartel. Un almuerzo fresco cada día.",
  "Open an existing recipe / Abrir una receta existente": "Abrir una receta existente",
  "Open erasure requests": "Abrir solicitudes de eliminación de datos",
  "Open the Studio →": "Abrir el Estudio →",
  "Ordering cutoffs · Eastern time": "Horas límite de pedidos · hora del Este",
  "Organic search": "Búsqueda orgánica",
  "Owed to you": "Pendiente de pago a tu favor",
  "Owner-only. Fire a one-off text to confirm Twilio works end-to-end. Use your own mobile.": "Solo para el propietario. Envía un SMS de prueba para comprobar Twilio de principio a fin. Usa tu propio celular.",
  "PDF, Word, scans, spreadsheets, text. 20MB each. Select a whole folder at once — each file is titled from its filename.": "PDF, Word, escaneos, hojas de cálculo o texto. Hasta 20 MB por archivo. Puedes seleccionar una carpeta completa; cada archivo toma su nombre como título.",
  "Paid purchase costs": "Costos de compras pagadas",
  "Prepare this office’s QR sign": "Preparar cartel QR de esta oficina",
  "Preview customer menu →": "Ver menú del cliente →",
  "Procedure / SOP": "Procedimiento operativo",
  "Ready to sell today": "Listo para vender hoy",
  "Real visits.": "Visitas reales.",
  "Recipe draft": "Borrador de receta",
  "Recipe standards & missing recipes / Recetas y pendientes": "Estándares de recetas y recetas pendientes",
  "Reload saved menu": "Recargar menú guardado",
  "Retry email preview": "Reintentar vista previa del correo",
  "Reusable meals": "Comidas reutilizables",
  "Review both email previews. Enabling sends this fixed acknowledgement only for future website requests. It confirms receipt; it does not promise availability or a price. Pending older inquiries are never emailed by activation.": "Revisa ambas vistas previas. Al activarlo, este acuse de recibo se enviará solo para futuras solicitudes web. Confirma recepción; no promete disponibilidad ni precio. La activación nunca envía correos a solicitudes anteriores pendientes.",
  "Review quote reminder": "Revisar recordatorio de cotización",
  "Review the change": "Revisar el cambio",
  "Review the saved version below. Approval publishes this version to the kitchen library and makes its exact menu mappings available to planning. Unsaved edits are never approved.": "Revisa la versión guardada que aparece abajo. Al aprobarla, se publica en la biblioteca de cocina y sus relaciones exactas con el menú quedan disponibles para planificación. Los cambios sin guardar nunca se aprueban.",
  "Sales sections": "Secciones de ventas",
  "Same-day cutoff": "Hora límite para el mismo día",
  "Save daily lunch menu": "Guardar menú de almuerzo diario",
  "Save draft / Guardar borrador": "Guardar borrador",
  "Save preferences": "Guardar preferencias",
  "Save updates the public menu. Existing paid order snapshots remain unchanged.": "Guardar actualiza el menú público. Los registros de pedidos ya pagados no cambian.",
  "Saving or submitting does not change the recipe the kitchen uses.": "Guardar o enviar no modifica la receta que usa la cocina.",
  "Scan with your phone to rate today's lunch.": "Escanea con tu teléfono para calificar el almuerzo de hoy.",
  "Search / Buscar": "Buscar",
  "Send reviewed reminder once": "Enviar una vez el recordatorio revisado",
  "Send test SMS": "Enviar SMS de prueba",
  "Set how many finished bowls and drinks you made today. This stored count persists; today’s paid orders reduce the remaining quantity. Recount finished portions daily before planning prep. Blank means no limit.": "Indica cuántos bowls y bebidas terminados preparaste hoy. Esta cantidad se conserva; los pedidos pagados de hoy reducen lo disponible. Cuenta las porciones terminadas cada día antes de planificar. En blanco significa sin límite.",
  "Show / Ver": "Ver",
  "Skip to campaign": "Saltar a la campaña",
  "Staff ask from their own": "El personal solicita desde su propia",
  "Start with a name. Counts, weight, and on-hand quantity are tracked separately.": "Empieza con un nombre. Las unidades, el peso y las existencias se registran por separado.",
  "Steps / Pasos": "Pasos",
  "Stock expires on": "Fecha de vencimiento de existencias",
  "Storage / Almacenamiento": "Conservación",
  "Submit to Dayan / Enviar a Dayan": "Enviar a Dayan",
  "Summary / Resumen": "Resumen",
  "Take or upload reference photos / Fotos": "Tomar o subir fotos de referencia",
  "Templates only. They do not open sales until you assign a week below. Add Friday here whenever it is part of production.": "Solo son plantillas. No habilitan ventas hasta que asignes una semana abajo. Agrega el viernes cuando forme parte de la producción.",
  "Test what the AI can actually find": "Probar qué puede encontrar realmente la IA",
  "The food, the story, and the next reason to order.": "La comida, la historia y el próximo motivo para pedir.",
  "The way we make it.": "Así lo preparamos.",
  "This is one manual email to the quote recipient. Opening this preview does not send it. Your notes and response status stay private.": "Este es un correo manual al destinatario de la cotización. Abrir la vista previa no lo envía. Tus notas y el estado de respuesta permanecen privados.",
  "This office's QR opens today's delivered lunch. Print once; patients use their own phones.": "El QR de esta oficina abre el almuerzo entregado hoy. Imprímelo una vez; los pacientes usan sus propios teléfonos.",
  "Today's program meals": "Comidas del programa de hoy",
  "Top pages": "Páginas principales",
  "Traffic sources": "Fuentes de tráfico",
  "Typical call duration (minutes, optional)": "Duración habitual de llamada (minutos, opcional)",
  "Unconfirmed reference": "Referencia sin confirmar",
  "Unit cost (USD, optional)": "Costo unitario (USD, opcional)",
  "Unknowns, one per line / Pendiente de confirmar": "Pendientes de confirmar, uno por línea",
  "Upload & index": "Subir e indexar",
  "Use an approved local /assets/img/ path. Leave blank until the correct photo is available. Do not replace a dish with a different dish’s image.": "Usa una ruta local aprobada de /assets/img/. Déjala vacía hasta tener la foto correcta. No sustituyas un plato por la imagen de otro.",
  "Verified recipe source / Fuente de la receta": "Fuente verificada de la receta",
  "Week starting Monday": "Semana que comienza el lunes",
  "Weekday starting menu": "Menú inicial por día de la semana",
  "What the HUB has recorded about you": "Lo que el HUB ha registrado sobre ti",
  "Write a deliberate Instagram follow-up": "Redactar un seguimiento de Instagram con intención clara",
  "YOUR LUNCH · YOUR VOICE": "TU ALMUERZO · TU OPINIÓN",
  "Yield unit / Unidad": "Unidad del rendimiento",
  "Your request goes to the owner, who carries it out. Money, food-safety and contract records stay — those are the business's books, not a record of how you used the app.": "Tu solicitud llega al propietario, quien la ejecuta. Se conservan los registros de dinero, seguridad alimentaria y contratos: son los libros del negocio, no el registro de tu uso de la aplicación.",
  "Your routes": "Tus rutas",
  "can be erased if you ask": "Se puede eliminar si lo solicitas",
  "kept as business records": "Se conserva como registro del negocio",
  "last 30 days · first-party, cookieless": "Últimos 30 días · datos propios, sin cookies",
  "lb, each, case": "lb, unidad, caja",
  "screen. You carry it out here. Money, food-safety and contract records are never erased — they are the business's books, and the record of the erasure itself is kept too.": "pantalla. Lo ejecutas aquí. Los registros de dinero, seguridad alimentaria y contratos nunca se eliminan: son los libros del negocio, y también se conserva el registro de la propia eliminación.",
  "staff id, e.g. usr_…": "ID del empleado, p. ej., usr_…",
  "← Contracts": "← Cuentas de oficinas",
  "← Hub": "← Hub",
  "↩︎ Contracts": "↩︎ Cuentas de oficinas",
  "🖨 Print / Save PDF": "🖨 Imprimir o guardar PDF",
  "Bocadito — Hawaiian roll with ham spread tray — 25 pieces": "Bocadito — pan hawaiano con pasta de jamón tray — 25 unidades",
  "Bocadito — Hawaiian roll with ham spread tray — 50 pieces": "Bocadito — pan hawaiano con pasta de jamón tray — 50 unidades",
  "Tuna bocadito — 10 pieces": "Bocadito de atún — 10 unidades",
  "Tuna bocadito — 25 pieces": "Bocadito de atún — 25 unidades",
  "Tuna bocadito — 50 pieces": "Bocadito de atún — 50 unidades",
  "Ham bocadito — 10 pieces": "Bocadito de jamón — 10 unidades",
  "Ham bocadito — 25 pieces": "Bocadito de jamón — 25 unidades",
  "Ham bocadito — 50 pieces": "Bocadito de jamón — 50 unidades",
  "La Bomba Tropical — 10 pieces": "La Bomba Tropical — 10 unidades",
  "La Bomba Tropical — 25 pieces": "La Bomba Tropical — 25 unidades",
  "La Bomba Tropical — 50 pieces": "La Bomba Tropical — 50 unidades",
  "Chocolate tres leches — 10-inch cake": "Tres leches de chocolate — pastel de 10 pulgadas",
  "Strawberry tres leches — 10-inch cake": "Tres leches de fresa — pastel de 10 pulgadas",
  "Congrí — 10 servings": "Congrí — 10 porciones",
  "Congrí — 25 servings": "Congrí — 25 porciones",
  "Congrí — 30 servings": "Congrí — 30 porciones",
  "Congrí — 50 servings": "Congrí — 50 porciones",
  "Chorizo croqueta — 10 pieces (box — no sauce)": "Croqueta de chorizo — 10 unidades",
  "Ham croqueta — 10 pieces (box — no sauce)": "Croqueta de jamón — 10 unidades",
  "Chicken croqueta — 10 pieces (box — no sauce)": "Croqueta de pollo — 10 unidades",
  "Beef croqueta — 10 pieces (box — no sauce)": "Croqueta de res — 10 unidades",
  "Sausage croqueta — 10 pieces (box — no sauce)": "Croqueta de salchicha — 10 unidades",
  "Tuna croqueta — 10 pieces (box — no sauce)": "Croqueta de atún — 10 unidades",
  "Chocolate tres leches — 10 cups": "Tres leches de chocolate — 10 vasitos",
  "Chocolate tres leches — 25 cups": "Tres leches de chocolate — 25 vasitos",
  "Chocolate tres leches — 50 cups": "Tres leches de chocolate — 50 vasitos",
  "Strawberry tres leches — 10 cups": "Tres leches de fresa — 10 vasitos",
  "Strawberry tres leches — 25 cups": "Tres leches de fresa — 25 vasitos",
  "Strawberry tres leches — 50 cups": "Tres leches de fresa — 50 vasitos",
  "Ajo Cítrico — 8 servings": "Ajo Cítrico — 8 porciones",
  "Aguacate Cilantro — 8 servings": "Aguacate Cilantro — 8 porciones",
  "Chimichurri Vital — 8 servings": "Chimichurri Vital — 8 porciones",
  "Cilantro Lime Crema — 8 servings": "Cilantro Lime Crema — 8 porciones",
  "Coconut Dressing — 8 servings": "Coconut Dressing — 8 porciones",
  "Golden Turmeric — 8 servings": "Golden Turmeric — 8 porciones",
  "Añejo Light Dressing — 8 servings": "Añejo Light Dressing — 8 porciones",
  "Mango Omega — 8 servings": "Mango Omega — 8 porciones",
  "Pineapple Chile — 8 servings": "Pineapple Chile — 8 porciones",
  "Añejo Signature Sauce — 8 servings": "Añejo Signature Sauce — 8 porciones",
  "Spicy Añejo Aioli — 8 servings": "Spicy Añejo Aioli — 8 porciones",
  "Spinach Goodness — 8 servings": "Spinach Goodness — 8 porciones",
  "Dressed croqueta platter — 30 pieces": "Bandeja de croquetas preparadas — 30 unidades",
  "Dressed croqueta platter — 60 pieces": "Bandeja de croquetas preparadas — 60 unidades",
  "Dressed croqueta platter — 90 pieces": "Bandeja de croquetas preparadas — 90 unidades",
  "Cheese empanada — 10 pieces": "Empanada de queso — 10 unidades",
  "Cheese empanada — 25 pieces": "Empanada de queso — 25 unidades",
  "Cheese empanada — 50 pieces": "Empanada de queso — 50 unidades",
  "Dulce de leche empanada — 10 pieces": "Empanada de dulce de leche — 10 unidades",
  "Dulce de leche empanada — 25 pieces": "Empanada de dulce de leche — 25 unidades",
  "Dulce de leche empanada — 50 pieces": "Empanada de dulce de leche — 50 unidades",
  "Guava & cheese empanada — 10 pieces": "Empanada de guayaba y queso — 10 unidades",
  "Guava & cheese empanada — 25 pieces": "Empanada de guayaba y queso — 25 unidades",
  "Guava & cheese empanada — 50 pieces": "Empanada de guayaba y queso — 50 unidades",
  "Guava empanada — 10 pieces": "Empanada de guayaba — 10 unidades",
  "Guava empanada — 25 pieces": "Empanada de guayaba — 25 unidades",
  "Guava empanada — 50 pieces": "Empanada de guayaba — 50 unidades",
  "Ham empanada — 10 pieces": "Empanada de jamón — 10 unidades",
  "Ham empanada — 25 pieces": "Empanada de jamón — 25 unidades",
  "Ham empanada — 50 pieces": "Empanada de jamón — 50 unidades",
  "Ham & cheese empanada — 10 pieces": "Empanada de jamón y queso — 10 unidades",
  "Ham & cheese empanada — 25 pieces": "Empanada de jamón y queso — 25 unidades",
  "Ham & cheese empanada — 50 pieces": "Empanada de jamón y queso — 50 unidades",
  "Chicken empanada — 10 pieces": "Empanada de pollo — 10 unidades",
  "Chicken empanada — 25 pieces": "Empanada de pollo — 25 unidades",
  "Chicken empanada — 50 pieces": "Empanada de pollo — 50 unidades",
  "Pulled pork empanada — 10 pieces": "Empanada de lechón — 10 unidades",
  "Pulled pork empanada — 25 pieces": "Empanada de lechón — 25 unidades",
  "Pulled pork empanada — 50 pieces": "Empanada de lechón — 50 unidades",
  "Beef empanada — 10 pieces": "Empanada de res — 10 unidades",
  "Beef empanada — 25 pieces": "Empanada de res — 25 unidades",
  "Beef empanada — 50 pieces": "Empanada de res — 50 unidades",
  "Ropa vieja empanada — 25 pieces": "Empanada de ropa vieja — 25 unidades",
  "Ropa vieja empanada — 50 pieces": "Empanada de ropa vieja — 50 unidades",
  "Tuna empanada — 10 pieces": "Empanada de atún — 10 unidades",
  "Tuna empanada — 25 pieces": "Empanada de atún — 25 unidades",
  "Tuna empanada — 50 pieces": "Empanada de atún — 50 unidades",
  "Cold macaroni salad — 10 servings": "Ensalada fría de coditos — 10 porciones",
  "Cold macaroni salad — 25 servings": "Ensalada fría de coditos — 25 porciones",
  "Cold macaroni salad — 50 servings": "Ensalada fría de coditos — 50 porciones",
  "Lechón asado — 10 servings": "Lechón asado — 10 porciones",
  "Lechón asado — 25 servings": "Lechón asado — 25 porciones",
  "Lechón asado — 50 servings": "Lechón asado — 50 porciones",
  "Chorizo papa rellena — 10 pieces": "Papa rellena de chorizo — 10 unidades",
  "Chorizo papa rellena — 25 pieces": "Papa rellena de chorizo — 25 unidades",
  "Chorizo papa rellena — 50 pieces": "Papa rellena de chorizo — 50 unidades",
  "Ham papa rellena — 10 pieces": "Papa rellena de jamón — 10 unidades",
  "Ham papa rellena — 25 pieces": "Papa rellena de jamón — 25 unidades",
  "Ham papa rellena — 50 pieces": "Papa rellena de jamón — 50 unidades",
  "Ham & cheese papa rellena — 10 pieces": "Papa rellena de jamón y queso — 10 unidades",
  "Ham & cheese papa rellena — 25 pieces": "Papa rellena de jamón y queso — 25 unidades",
  "Ham & cheese papa rellena — 50 pieces": "Papa rellena de jamón y queso — 50 unidades",
  "Hot dog papa rellena — 10 pieces": "Papa rellena de perro caliente — 10 unidades",
  "Hot dog papa rellena — 25 pieces": "Papa rellena de perro caliente — 25 unidades",
  "Hot dog papa rellena — 50 pieces": "Papa rellena de perro caliente — 50 unidades",
  "Chicken papa rellena — 10 pieces": "Papa rellena de pollo — 10 unidades",
  "Chicken papa rellena — 25 pieces": "Papa rellena de pollo — 25 unidades",
  "Chicken papa rellena — 50 pieces": "Papa rellena de pollo — 50 unidades",
  "Cheese papa rellena — 10 pieces": "Papa rellena de queso — 10 unidades",
  "Cheese papa rellena — 25 pieces": "Papa rellena de queso — 25 unidades",
  "Cheese papa rellena — 50 pieces": "Papa rellena de queso — 50 unidades",
  "Beef papa rellena — 10 pieces": "Papa rellena de res — 10 unidades",
  "Beef papa rellena — 25 pieces": "Papa rellena de res — 25 unidades",
  "Beef papa rellena — 50 pieces": "Papa rellena de res — 50 unidades",
  "Chorizo croqueta platter — 30 pieces (plated with sauces)": "Bandeja de croquetas de chorizo — 30 unidades",
  "Chorizo croqueta platter — 60 pieces (plated with sauces)": "Bandeja de croquetas de chorizo — 60 unidades",
  "Chorizo croqueta platter — 90 pieces (plated with sauces)": "Bandeja de croquetas de chorizo — 90 unidades",
  "Ham croqueta platter — 30 pieces (plated with sauces)": "Bandeja de croquetas de jamón — 30 unidades",
  "Ham croqueta platter — 60 pieces (plated with sauces)": "Bandeja de croquetas de jamón — 60 unidades",
  "Ham croqueta platter — 90 pieces (plated with sauces)": "Bandeja de croquetas de jamón — 90 unidades",
  "Chicken croqueta platter — 30 pieces (plated with sauces)": "Bandeja de croquetas de pollo — 30 unidades",
  "Chicken croqueta platter — 60 pieces (plated with sauces)": "Bandeja de croquetas de pollo — 60 unidades",
  "Chicken croqueta platter — 90 pieces (plated with sauces)": "Bandeja de croquetas de pollo — 90 unidades",
  "Beef croqueta platter — 30 pieces (plated with sauces)": "Bandeja de croquetas de res — 30 unidades",
  "Beef croqueta platter — 60 pieces (plated with sauces)": "Bandeja de croquetas de res — 60 unidades",
  "Beef croqueta platter — 90 pieces (plated with sauces)": "Bandeja de croquetas de res — 90 unidades",
  "Sausage croqueta platter — 30 pieces (plated with sauces)": "Bandeja de croquetas de salchicha — 30 unidades",
  "Sausage croqueta platter — 60 pieces (plated with sauces)": "Bandeja de croquetas de salchicha — 60 unidades",
  "Sausage croqueta platter — 90 pieces (plated with sauces)": "Bandeja de croquetas de salchicha — 90 unidades",
  "Tuna croqueta platter — 30 pieces (plated with sauces)": "Bandeja de croquetas de atún — 30 unidades",
  "Tuna croqueta platter — 60 pieces (plated with sauces)": "Bandeja de croquetas de atún — 60 unidades",
  "Tuna croqueta platter — 90 pieces (plated with sauces)": "Bandeja de croquetas de atún — 90 unidades",
  "Skewers — 10 pieces": "Pinchos — 10 unidades",
  "Skewers — 25 pieces": "Pinchos — 25 unidades",
  "Skewers — 50 pieces": "Pinchos — 50 unidades",
  "Cuban tamal — 10 servings": "Tamal cubano — 10 porciones",
  "Cuban tamal — 25 servings": "Tamal cubano — 25 porciones",
  "Cuban tamal — 50 servings": "Tamal cubano — 50 porciones",
  "Fresh salad — 10 servings": "Ensalada fresca — 10 porciones",
  "Fresh salad — 25 servings": "Ensalada fresca — 25 porciones",
  "Fresh salad — 50 servings": "Ensalada fresca — 50 porciones",
  "Yuca with onion & chicharrones — 10 servings": "Yuca con cebolla y chicharrones — 10 porciones",
  "Yuca with onion & chicharrones — 25 servings": "Yuca con cebolla y chicharrones — 25 porciones",
  "Yuca with onion & chicharrones — 30 servings": "Yuca con cebolla y chicharrones — 30 porciones",
  "Yuca with onion & chicharrones — 50 servings": "Yuca con cebolla y chicharrones — 50 porciones",
  "White rice — 8 oz": "Arroz blanco — 8 oz",
  "Fried rice — 6 oz": "Arroz frito — 6 oz",
  "Bocadito — Hawaiian roll with ham spread": "Bocadito — pan hawaiano con pasta de jamón",
  "Tuna bocadito": "Bocadito de atún",
  "Ham bocadito": "Bocadito de jamón",
  "Lechón plate": "Plato de lechón",
  "Chorizo croqueta": "Croqueta de chorizo",
  "Ham croqueta": "Croqueta de jamón",
  "Chicken croqueta": "Croqueta de pollo",
  "Beef croqueta": "Croqueta de res",
  "Sausage croqueta": "Croqueta de salchicha",
  "Tuna croqueta": "Croqueta de atún",
  "Chocolate tres leches cup": "Vasito de tres leches de chocolate",
  "Strawberry tres leches cup": "Vasito de tres leches de fresa",
  "Dressed croqueta": "Croqueta preparada",
  "Cheese empanada": "Empanada de queso",
  "Dulce de leche empanada": "Empanada de dulce de leche",
  "Guava & cheese empanada": "Empanada de guayaba y queso",
  "Guava empanada": "Empanada de guayaba",
  "Ham empanada": "Empanada de jamón",
  "Ham & cheese empanada": "Empanada de jamón y queso",
  "Chicken empanada": "Empanada de pollo",
  "Pulled pork empanada": "Empanada de lechón",
  "Beef empanada": "Empanada de res",
  "Ropa vieja empanada": "Empanada de ropa vieja",
  "Tuna empanada": "Empanada de atún",
  "Cold macaroni salad": "Ensalada fría de coditos",
  "Garbanzos fritos — side": "Garbanzos fritos — acompañamiento",
  "Cuban fried rice": "Arroz frito cubano",
  "Potato & tuna lasagna": "Lasaña de papa y atún",
  "Chicken sandwich": "Sándwich de pollo",
  "Three lechón tacos": "3 tacos de lechon",
  "Three chicken tacos": "3 tacos de pollo",
  "Bistec uruguayo — 8 oz white rice and 4 oz black beans": "Bistec uruguayo — 8 oz de arroz blanco y 4 oz de frijoles negros",
  "Bistec uruguayo — 8 oz congrí": "Bistec uruguayo — 8 oz de congrí",
  "Chorizo papa rellena": "Papa rellena de chorizo",
  "Ham papa rellena": "Papa rellena de jamón",
  "Ham & cheese papa rellena": "Papa rellena de jamón y queso",
  "Hot dog papa rellena": "Papa rellena de perro caliente",
  "Chicken papa rellena": "Papa rellena de pollo",
  "Cheese papa rellena": "Papa rellena de queso",
  "Beef papa rellena": "Papa rellena de res",
  "Cuban pizza with toppings": "Pizza cubana con ingredientes",
  "Ropa vieja plate": "Plato de ropa vieja",
  "Grape, salami, guava, cheese & pineapple skewer": "Pincho de uva, salami, guayaba, queso y piña",
  "Cuban tamal — 3 slices": "Tamal cubano — 3 rodajas",
  "Whole tamal — 6 slices": "Tamal entero — 6 rodajas",
  "Tostones rellenos — Ham & cheese": "Tostones rellenos — Jamón y queso",
  "Tostones rellenos — Shrimp": "Tostones rellenos — Camarones",
  "Fresh salad": "Ensalada fresca",
  "Yuca with onion & chicharrones": "Yuca con cebolla y chicharrones",
  "1 guests": "1 invitado",
  "Message": "Mensaje",
  "Language": "Idioma",
  "Selected photo": "Foto seleccionada",
  "Send outcome unconfirmed. Check message history before retrying.": "Resultado del envío sin confirmar. Revisa el historial de mensajes antes de reintentar.",
  "Sent to Dayan": "Enviado a Dayan",
  "Show assignments": "Mostrar asignaciones",
  "Sign in as owner": "Iniciar sesión como propietario",
  "Sold out": "Agotado",
  "The emblem and wording need separate areas.": "El emblema y el texto necesitan zonas separadas.",
  "The recorded balance must be paid or waived before completion.": "El saldo registrado debe estar pagado o exonerado antes de completar.",
  "The send outcome is unverified.": "El resultado del envío no está verificado.",
  "Time not set": "Hora sin definir",
  "Training media": "Material multimedia de capacitación",
  "Upload a photo": "Subir una foto",
  "Uploading…": "Subiendo…",
  "View only. An owner records fulfillment progress.": "Solo lectura. El propietario registra el progreso del pedido.",
  "What starts your job": "Qué inicia tu trabajo",
  "Who you are": "Quién eres",
  "Your actions update the event. Approved customer messages follow recorded departure and delivery. Catering compensation is managed separately.": "Tus acciones actualizan el evento. Los mensajes aprobados al cliente se envían tras registrar la salida y la entrega. La compensación de catering se gestiona por separado.",
  "Apply eligibility": "Aplicar elegibilidad",
  "Open media": "Abrir archivo multimedia",
  "Collect": "Cobrar",
  "Request & quote": "Solicitud y cotización",
  "Review / send this quote": "Revisar o enviar esta cotización",
  "Retire duplicate checkout": "Retirar enlace de pago duplicado",
  "View booking and payment record": "Ver reserva y registro de pago",
  "Draft brief + receipt": "Crear borrador de brief y comprobante",
  "View in CRM →": "Ver en CRM →",
  "Choose from library / Elegir de biblioteca": "Elegir de la biblioteca",
  "Confirm terms —": "Confirmar condiciones —",
  "Convert to Contract Account —": "Convertir en cuenta de oficina —",
  "Don’t email": "No enviar correo",
  "Draft first email": "Crear borrador del primer correo",
  "Draft follow-up": "Crear borrador de seguimiento",
  "Erase": "Eliminar datos",
  "Link this opportunity to the existing account": "Relacionar esta oportunidad con la cuenta existente",
  "Open recipe standard / Revisar receta": "Abrir receta estandarizada",
  "Primary": "Principal",
  "Reject photo": "Rechazar foto",
  "Remove card": "Quitar tarjeta",
  "Remove draft": "Retirar borrador",
  "Requirement type": "Tipo de requisito",
  "Restore draft": "Restaurar borrador",
  "Restore shipped version": "Restaurar versión original",
  "Review plan": "Revisar plan",
  "Review post": "Revisar publicación",
  "Save counts": "Guardar cantidades",
  "Save visit": "Guardar visita",
  "Save what they said": "Guardar lo que respondieron",
  "Service ended on": "Fecha de finalización del servicio",
  "Set": "Establecer",
  "Shortfall or completion note": "Nota de faltante o finalización",
  "Slide": "Diapositiva",
  "Start prep": "Iniciar preparación",
  "Start prep · PIN": "Iniciar preparación · PIN",
  "Start production": "Iniciar producción",
  "Stock quantity to use": "Cantidad de existencias que se usará",
  "Sync quote text receipt": "Sincronizar comprobante del SMS de cotización",
  "Take or upload photo": "Tomar o subir foto",
  "Test Instagram upload (no publish)": "Probar carga de Instagram (sin publicar)",
  "This office’s lunch feedback": "Opiniones sobre almuerzos de esta oficina",
  "Total weight (g)": "Peso total (g)",
  "Un-approve": "Retirar aprobación",
  "Re-offer": "Volver a ofrecer",
  "Release stops": "Liberar paradas",
  "Activate account": "Activar cuenta",
  "Add location & mint its link": "Agregar ubicación y crear su enlace",
  "Generate invoice for this period": "Generar factura de este período",
  "Revoke": "Revocar",
  "Save billing contact": "Guardar contacto de facturación",
  "Save weekly menu": "Guardar menú semanal",
  "Void": "Anular",
  "Approve & update Brief": "Aprobar y actualizar brief",
  "Request more info": "Solicitar más información",
  "Offboard account": "Dar de baja la cuenta",
  "Restore this version": "Restaurar esta versión",
  "Allow": "Permitir",
  "Assign this route": "Asignar esta ruta",
  "Allow this reviewed plan to queue eligible production work": "Permitir que este plan revisado ponga en cola el trabajo de producción elegible",
  "Current automated audits": "Auditorías automáticas actuales",
  "Owner reviewed media & warnings": "Contenido y advertencias revisados por el propietario",
  "Relist the menu item after a completed batch": "Volver a ofrecer el artículo del menú después de completar un lote",
  "Set a negotiated / custom line total": "Establecer un total negociado o personalizado para el concepto",
  "Anonymous": "Anónimo",
  "Attach media to this draft": "Adjuntar contenido multimedia a este borrador",
  "Choose a response status": "Elige un estado de respuesta",
  "Discard selection": "Descartar selección",
  "Earlier": "Anterior",
  "Feed photo or carousel": "Foto o carrusel del feed",
  "Ingredient": "Ingrediente",
  "Later": "Posterior",
  "Named (needs the customer’s permission)": "Con nombre (requiere permiso del cliente)",
  "No gift": "Sin regalo",
  "On request only": "Solo por solicitud",
  "On — I will do tastings": "Activado · haré degustaciones",
  "Packaging": "Envases",
  "Reel (video)": "Reel (video)",
  "Refresh saved post": "Actualizar publicación guardada",
  "Review / send quote reminder": "Revisar o enviar recordatorio de cotización",
  "Show a “from” price": "Mostrar precio «desde»",
  "Story (photo or video)": "Historia (foto o video)",
  "Strawberry tres leches — free, on the house": "Tres leches de fresa · cortesía de la casa",
  "Upload selected files": "Subir archivos seleccionados",
  "Use a designed HTML template": "Usar una plantilla HTML diseñada",
  "Write it here (plain text)": "Escribir aquí (texto sin formato)",
  "A Reel is one video, and Instagram has no carousel for it.": "Un Reel es un video; Instagram no permite un carrusel en este formato.",
  "A Reel needs one MP4 video.": "Un Reel necesita un video MP4.",
  "A Story is one photo or video, live for 24 hours — no carousel.": "Una historia es una foto o un video que dura 24 horas; no admite carrusel.",
  "A campaign code is shareable by anyone. Use it for seasonal promos or a one-off partnership.": "Cualquiera puede compartir un código de campaña. Úsalo para promociones de temporada o una colaboración puntual.",
  "A caption changed since this file was prepared. Refresh its source before replacing it.": "El texto de una publicación cambió desde que se preparó este archivo. Actualiza su fuente antes de reemplazarlo.",
  "A caption or media revision changed during review. No caption overwrite was made.": "El texto o la versión multimedia cambió durante la revisión. No se sobrescribió ningún texto.",
  "A caption revision changed. Refresh and reconcile before continuing.": "Cambió una versión del texto. Actualiza y concilia antes de continuar.",
  "A complete itemized menu and guest count are required.": "Se requiere un menú completo desglosado y la cantidad de invitados.",
  "A complete saved preview is required. Nothing can send from this card.": "Se requiere una vista previa completa guardada. Desde esta tarjeta no se puede enviar nada.",
  "A deposit is recorded. This quote cannot be replaced through the unpaid revision editor.": "Hay un depósito registrado. Esta cotización no puede reemplazarse desde el editor de cotizaciones sin pagar.",
  "A location needs a street and a city.": "La ubicación necesita calle y ciudad.",
  "A new follow-up will be reviewed separately. Prior provider acceptance is not delivery or read confirmation.": "Un nuevo seguimiento se revisará por separado. La aceptación anterior del proveedor no confirma entrega ni lectura.",
  "A paid non-void deposit is required.": "Se requiere un depósito pagado y no anulado.",
  "A paid, non-void deposit is required.": "Se requiere un depósito pagado y no anulado.",
  "A previous save needs confirmation. Retry unchanged, recover that save, or resolve without retry before creating another.": "Un guardado anterior necesita confirmación. Reintenta sin cambios, recupera ese guardado o resuélvelo sin reintentar antes de crear otro.",
  "A previously attached post changed.": "Cambió una publicación adjuntada anteriormente.",
  "A previously attached post changed. Do not overwrite it with an old checkpoint.": "Cambió una publicación adjuntada anteriormente. No la sobrescribas con un punto de recuperación antiguo.",
  "A previously imported caption was changed. Use the current saved campaign instead.": "Se modificó un texto importado anteriormente. Usa la campaña guardada actual.",
  "A provider acknowledgment was saved. Check whether local records can be repaired without resending.": "Se guardó un acuse del proveedor. Comprueba si los registros locales pueden repararse sin reenviar.",
  "A reminder request is in progress. Wait for its recorded outcome.": "Hay una solicitud de recordatorio en curso. Espera a que se registre su resultado.",
  "A reply, call, text or visit stops any automated sequence for this prospect. Nothing keeps talking over a person who answered.": "Una respuesta, llamada, mensaje o visita detiene cualquier secuencia automática de este prospecto. La secuencia no sigue enviando mensajes después de que una persona responda.",
  "Location name": "Nombre de la ubicación",
  "Pick at least one delivery day.": "Elige al menos un día de entrega.",
  "Before sending, check the recipient and preview.": "Antes de enviar, revisa el destinatario y la vista previa.",
  "Compressed image exceeds 5 MiB": "La imagen comprimida supera los 5 MiB",
  "Invalid fitted photo geometry.": "Las dimensiones de la foto ajustada no son válidas.",
  "Invalid protected photo areas.": "Las zonas protegidas de la foto no son válidas.",
  "Invalid saved proposal response": "La respuesta de la propuesta guardada no es válida",
  "Meals per day": "Comidas al día",
  "Meetings / tastings": "Reuniones o degustaciones",
  "Mondays 10:00 UTC": "Lunes a las 10:00 UTC",
  "Mark Ready": "Marcar listo",
  "Ask the HUB": "Preguntar al HUB",
  "Production status could not be loaded. Saved inventory remains unchanged.": "No se pudo cargar el estado de producción. El inventario guardado no cambió.",
  "No inventory items yet. Use “Add inventory item” to create the first one.": "Aún no hay artículos de inventario. Usa «Agregar artículo de inventario» para crear el primero.",
  "Paid receipt costs are unavailable. Your inventory counts are unchanged.": "Los costos de compras pagadas no están disponibles. Las cantidades de inventario no cambiaron.",
  "Today’s finished-item counts are unavailable right now. No count values are being shown.": "Las cantidades de productos terminados de hoy no están disponibles. No se muestra ninguna cantidad.",
  "Deposits unpaid": "Depósitos sin pagar",
  "View and collect final payments →": "Ver y cobrar pagos finales →",
  "Final payments to collect": "Pagos finales por cobrar",
  "Booked events with a recorded deposit and an outstanding final balance. Dates and amounts come from the saved booking.": "Eventos reservados con depósito registrado y saldo final pendiente. Las fechas y los importes provienen de la reserva guardada.",
  "No final balances currently due on deposit-paid bookings.": "No hay saldos finales pendientes en reservas con depósito pagado.",
  "No customers have asked for changes.": "Ningún cliente ha solicitado cambios.",
  "Customer name": "Nombre del cliente",
  "Build from the Añejo menu": "Crear desde el menú de Añejo",
  "Search dishes or packs": "Buscar platos o paquetes",
  "(what she reads — leave empty to quote a bare total)": "(lo que lee el cliente; déjalo vacío para cotizar solo un total)",
  "Add a custom line": "Agregar concepto personalizado",
  "Delivery / setup fee (dollars)": "Cargo de entrega y montaje (dólares)",
  "Delivery only. Enter the combined delivery / setup fee you approved for this event. Blank means unconfirmed, not free. Enter 0 only when you approve free delivery.": "Solo entrega. Ingresa el cargo conjunto de entrega y montaje que aprobaste para este evento. En blanco significa sin confirmar, no gratis. Ingresa 0 solo si apruebas la entrega gratuita.",
  "Delivery / setup fee unconfirmed; not included in the food subtotal.": "Cargo de entrega y montaje sin confirmar; no está incluido en el subtotal de comida.",
  "Choose a published pack for this party. Excluded from the quote total and deposit; the customer can ask about it before you add it.": "Elige un paquete publicado para este evento. Se excluye del total cotizado y del depósito; el cliente puede consultar antes de que lo agregues.",
  "Pack and filling": "Paquete y relleno",
  "Number of packs": "Cantidad de paquetes",
  "Exit revision · return to quote list": "Salir de revisión · volver a cotizaciones",
  "Up to 500 characters. Included in your saved quote terms.": "Hasta 500 caracteres. Se incluye en las condiciones guardadas de la cotización.",
  "Send the quote in": "Idioma de la cotización",
  "Read the email she would get": "Leer el correo que recibiría el cliente",
  "Creating the checkout mints a Square payment link for the deposit only and stores the terms as they stand today.": "Crear el pago genera un enlace de Square solo para el depósito y guarda las condiciones tal como están hoy.",
  "Nothing reaches the customer until you press Send below the preview.": "No se envía nada al cliente hasta que pulses Enviar debajo de la vista previa.",
  "Who the event is for": "Para quién es el evento",
  "For the deposit link": "Para el enlace del depósito",
  "Search the published catering menu": "Buscar en el menú de catering publicado",
  "Days": "Días",
  "💵 Driver payouts — who’s owed what →": "💵 Pagos a conductores · cuánto se debe a cada uno →",
  "OFF": "DESACTIVADO",
  "ON": "ACTIVADO",
  "Turn ON": "Activar",
  "Turn OFF": "Desactivar",
  "When ON, an approved invoice is charged to that account’s card on file. When OFF, nothing is ever charged automatically — invoices still generate and send.": "Al activarlo, una factura aprobada se cobra a la tarjeta registrada de esa cuenta. Al desactivarlo, nunca se cobra automáticamente; las facturas siguen generándose y enviándose.",
  "Allow payouts to be marked paid —": "Permitir marcar pagos como pagados —",
  "When OFF, driver and partner payouts cannot be marked paid at all. When ON, each payout still needs its exact amount approved first.": "Al desactivarlo, no se pueden marcar como pagados los pagos a conductores y socios. Al activarlo, cada pago sigue necesitando aprobación previa de su importe exacto.",
  "Let clients add a card on file —": "Permitir que los clientes registren una tarjeta —",
  "When ON, the card link below works and a client can authorize a card. When OFF, the page refuses. This never charges anything — it only stores the card and the authorization they agreed to.": "Al activarlo, el enlace de abajo permite que el cliente autorice una tarjeta. Al desactivarlo, la página no lo permite. Esto nunca cobra nada; solo guarda la tarjeta y la autorización aceptada por el cliente.",
  "A charge needs the switch ON": "Para cobrar, el interruptor debe estar activado",
  "and": "y",
  "the exact amount approved. Change the invoice total after approving and the charge refuses instead of charging the new number.": "el importe exacto aprobado. Si cambias el total después de aprobar, el cobro se rechaza en lugar de cobrar el nuevo importe.",
  "Send a client their card link and they authorize it themselves. Añejo never sees the card number — only the brand and last four.": "Envía al cliente su enlace de tarjeta para que la autorice personalmente. Añejo nunca ve el número completo; solo la marca y los últimos cuatro dígitos.",
  "No open contract invoices.": "No hay facturas pendientes de cuentas de oficinas.",
  "Invoices still generate, send and mark paid without it — QuickBooks is an extra copy for the books, not where the money lives.": "Las facturas siguen generándose, enviándose y marcándose como pagadas sin QuickBooks; es una copia adicional para la contabilidad, no donde se administra el dinero.",
  "Export report": "Exportar reporte",
  "Report type": "Tipo de reporte",
  "Downloads a CSV of the selected report.": "Descarga un CSV del reporte seleccionado.",
  "No open alerts. All clear.": "No hay alertas abiertas. Sin pendientes.",
  "Unverified — we could not read /api/menu": "Sin verificar · no se pudo consultar /api/menu",
  "The check that confirms customers are priced from these rows did not answer. That is not the same as a problem, but it is not an all-clear either: reload before you change a price.": "No respondió la comprobación que confirma que los precios al cliente provienen de estas filas. Eso no confirma un problema, pero tampoco que todo esté bien: recarga antes de cambiar un precio.",
  "Unverified — we could not read the order page": "Sin verificar · no se pudo consultar la página de pedidos",
  "We could not fetch /order to confirm it shows these prices to customers. Reload; if this keeps showing, tell your developer.": "No se pudo consultar /order para confirmar que muestra estos precios a los clientes. Recarga; si el aviso persiste, avisa al desarrollador.",
  "Add-ons": "Complementos",
  "+ New item": "+ Nuevo artículo",
  "Nothing in this group yet — use “+ New item”.": "Aún no hay artículos en este grupo; usa «+ Nuevo artículo».",
  "All-roles binder (print)": "Manual de todos los roles (imprimir)",
  "Scheduled": "Programado",
  "No routes in this period.": "No hay rutas en este período.",
  "Unpaid checkouts": "Pagos pendientes",
  "Data requests": "Solicitudes de datos",
  "Owner-reviewed recipes turn fresh, explicitly counted stock into a queued kitchen task.": "Las recetas revisadas por el propietario convierten existencias frescas y contadas expresamente en tareas de cocina en cola.",
  "Check stock and queue eligible work": "Revisar existencias y poner en cola el trabajo elegible",
  "Plans start disabled. Review real ingredient and packaging quantities before enabling any plan. A queued reservation is not a finished item.": "Los planes comienzan desactivados. Revisa las cantidades reales de ingredientes y envases antes de habilitar un plan. Una reserva en cola no es un producto terminado.",
  "Open kitchen tasks": "Tareas de cocina abiertas",
  "No open production tasks.": "No hay tareas de producción abiertas.",
  "No restock orders yet.": "Aún no hay pedidos de reabastecimiento.",
  "Remove": "Quitar",
  "No orders.": "No hay pedidos.",
  "What you found": "Lo que encontraste",
  "Short and plain": "Breve y claro",
  "Nothing recorded about you yet.": "Aún no hay registros sobre ti.",
  "last 30 days · people who did real work · humans only": "Últimos 30 días · personas que hicieron trabajo real · solo humanos",
  "No shifts ended in this window, so there is nothing to comply with yet.": "No terminó ningún turno en este período, por lo que aún no hay cierres que comprobar.",
  "No activity yet in this window.": "Aún no hay actividad en este período.",
  "No events recorded in this window.": "No hay eventos registrados en este período.",
  "💬 Ask the HUB": "💬 Preguntar al HUB",
  "Reads the live database and answers from it. It cannot change anything — if the answer implies an action, it is filed in AI Suggestions below for you to approve.": "Consulta la base de datos actual y responde a partir de ella. No puede modificar nada; si la respuesta implica una acción, se registra abajo en Sugerencias de IA para que la apruebes.",
  "🗞️ Reports & insights": "🗞️ Reportes y análisis",
  "Schedule health": "Estado de las tareas programadas",
  "“Run again” runs the job fresh on today’s data — it does not replay the original input.": "«Ejecutar de nuevo» inicia una tarea nueva con los datos de hoy; no repite la entrada original.",
  "How much contract work is sitting un-invoiced?": "¿Cuánto trabajo de cuentas de oficinas está pendiente de facturar?",
  "No pending Brief proposals. The Brand & Standards Brief is unchanged.": "No hay propuestas de brief pendientes. El brief de marca y estándares no cambió.",
  "Every approval, every restore, and every edit from Content snapshots the Brief before overwriting it. Restoring puts an older wording back — and snapshots the current one first, so a restore is itself reversible.": "Cada aprobación, restauración o edición desde Contenido guarda una copia del brief antes de sobrescribirlo. Restaurar recupera una versión anterior y primero guarda la actual, por lo que la restauración también es reversible.",
  "The Brand & Standards Brief has not been created yet.": "Aún no se ha creado el brief de marca y estándares.",
  "No earlier versions saved yet. The first snapshot is written the next time a proposal is approved.": "Aún no hay versiones anteriores guardadas. La primera copia se creará la próxima vez que se apruebe una propuesta.",
  "Booking readiness cannot be verified. Customer confirmation and reminder emails are disabled.": "No se puede verificar que las reservas estén listas. Las confirmaciones y los recordatorios por correo al cliente están desactivados.",
  "Create & schedule": "Crear y programar",
  "One loop, not six pages: what worked shows up here on Today, you teach the team in Teach, drafts get made and approved in Create — then the results come back to Today.": "Un solo ciclo: los resultados aparecen aquí en Hoy, capacitas al equipo en Capacitar y los borradores se crean y aprueban en Crear. Después, los resultados vuelven a Hoy.",
  "Review 30-day Instagram campaign →": "Revisar campaña de Instagram de 30 días →",
  "Different channels, different rules — Instagram posting and email campaigns keep their own compose form and their own send button, so one can never go out thinking it was the other.": "Cada canal tiene sus reglas: las publicaciones de Instagram y las campañas por correo conservan su propio editor y botón de envío para evitar confundirlos.",
  "+ New campaign": "+ Nueva campaña",
  "No campaigns yet. “+ New campaign” drafts one — you will see exactly who it reaches, and who it does not, before anything sends.": "Aún no hay campañas. «+ Nueva campaña» crea un borrador; antes de enviar, verás exactamente a quién llega y a quién no.",
  "Conversion summary unavailable — current evidence not loaded.": "Resumen de conversión no disponible; no se cargaron las evidencias actuales.",
  "When Aña may send replies herself. Off means she only drafts replies for you to review and send. Currently:": "Cuándo puede Aña enviar respuestas por sí misma. Desactivado significa que solo prepara borradores para que los revises y envíes. Actualmente:",
  "Off — draft replies only": "Desactivado · solo borradores de respuesta",
  "Ana’s Instagram review": "Revisión de Instagram de Ana",
  "Saved drafts and reply receipts. This view does not send or enable automatic replies.": "Borradores y comprobantes de respuesta guardados. Esta vista no envía ni activa respuestas automáticas.",
  "Draft lookup unavailable; an empty list does not mean no pending drafts.": "Consulta de borradores no disponible; una lista vacía no significa que no haya borradores pendientes.",
  "Escalation lookup unavailable.": "Consulta de casos escalados no disponible.",
  "Reply receipts unavailable. Delivery cannot be verified here.": "Comprobantes de respuesta no disponibles. Aquí no se puede verificar la entrega.",
  "No Instagram conversations returned in this snapshot.": "Este registro no devolvió conversaciones de Instagram.",
  "All alerts": "Todas las alertas",
  "🏢 Onboard a new account": "🏢 Dar de alta una cuenta nueva",
  "Company name": "Nombre de la empresa",
  "First delivery location": "Primera ubicación de entrega",
  "with no price set. You set the negotiated terms and press Activate — that is what turns their ordering link on.": "sin precio establecido. Define las condiciones negociadas y pulsa Activar para habilitar el enlace de pedidos.",
  "Create account": "Crear cuenta",
  "Leave blank only for pickup — an order with no address can’t be routed.": "Déjalo vacío solo para recogida; un pedido sin dirección no puede incluirse en una ruta.",
  "Gate code / drop-off notes (optional)": "Código de acceso o notas de entrega (opcional)",
  "Groups the date’s unassigned orders into the most efficient route(s) — minimizing driven miles & time — and shows stops, miles, finish time, and what each route pays the driver.": "Agrupa los pedidos sin asignar de la fecha en rutas eficientes, reduciendo millas y tiempo de conducción. Muestra paradas, millas, hora de finalización y pago al conductor por ruta.",
  "💵 Driver pay settings": "💵 Ajustes de pago a conductores",
  "Pay = base + (per-stop × stops) + (per-mile × miles), with a route minimum. Set per-stop & per-mile to 0 for a flat per-route rate.": "Pago = base + (tarifa por parada × paradas) + (tarifa por milla × millas), con un mínimo por ruta. Pon las tarifas por parada y por milla en 0 para usar una tarifa fija por ruta.",
  "Save pay settings": "Guardar ajustes de pago",
  "When on, the HUB runs through each delivery window (lunch + dinner, never mixed) and batches orders into efficient routes — only dispatching once a route is big enough to protect your margin and be worth the driver’s trip. It offers each route to a driver automatically. You don’t lift a finger.": "Al activarlo, el HUB revisa cada franja de entrega (almuerzo y cena por separado) y agrupa pedidos en rutas eficientes. Despacha cuando la ruta alcanza un tamaño suficiente para proteger el margen y justificar el viaje del conductor. Ofrece automáticamente cada ruta a un conductor, sin intervención manual.",
  "Min stops before sending (ROI)": "Mínimo de paradas antes de despachar (rentabilidad)",
  "Start batching (min before open)": "Comenzar a agrupar (minutos antes de abrir)",
  "A route ships when it hits": "Una ruta sale al alcanzar",
  "— or when an order has waited": "— o cuando un pedido ha esperado",
  "(so nothing gets cold), or when the window’s closing.": "(para que no se enfríe la comida), o cuando está por cerrar la franja de entrega.",
  "Save auto-dispatch settings": "Guardar ajustes de despacho automático",
  "⚡ Auto-build today’s routes now": "⚡ Crear automáticamente las rutas de hoy",
  "Routes today": "Rutas de hoy",
  "Driver pay (scheduled)": "Pago a conductores (programado)",
  "Google review syncing and reply publishing are unavailable. Paste a review you have independently checked and prepare a private reply below. Saved text is not approved, published, or verified against Google.": "La sincronización de reseñas de Google y la publicación de respuestas no están disponibles. Pega una reseña que hayas comprobado por separado y prepara una respuesta privada abajo. El texto guardado no está aprobado, publicado ni verificado con Google.",
  "Before any future reply is sent, the Google connection, correct business/review, and exact final text need separate verification.": "Antes de enviar una respuesta, deben verificarse por separado la conexión de Google, la empresa y reseña correctas, y el texto final exacto.",
  "Private draft storage available · latest 100 local drafts.": "Almacenamiento de borradores privados disponible · últimos 100 borradores locales.",
  "Manually supplied review text": "Texto de reseña proporcionado manualmente",
  "Google Maps/review link (optional; not verified)": "Enlace de Google Maps o reseña (opcional; sin verificar)",
  "Proposed reply — private draft": "Respuesta propuesta · borrador privado",
  "Refresh saved drafts": "Actualizar borradores guardados",
  "No private drafts saved yet. This is not a live Google review inbox.": "Aún no hay borradores privados guardados. Esto no es una bandeja de reseñas de Google en tiempo real.",
  "Recipe standards & owner review / Recetas y revisión": "Estándares de recetas y revisión del propietario",
  "🧾 Order history & PIN trail →": "🧾 Historial de pedidos y registro de PIN →",
  "Search": "Buscar",
  "Search index is not connected — nothing uploaded here is answerable yet.": "El índice de búsqueda no está conectado; el contenido subido aquí aún no está disponible para responder.",
  "PDF reading is degraded — the accurate reader is not configured, so scanned or font-subset PDFs may be rejected.": "La lectura de PDF está limitada: el lector preciso no está configurado, por lo que algunos PDF escaneados o con fuentes parciales pueden rechazarse.",
  "Search name, email, or company…": "Buscar nombre, correo o empresa…",
  "No recorded responses in this period.": "No hay respuestas registradas en este período.",
  "No reminder records in this period.": "No hay recordatorios registrados en este período.",
  "No menu requests recorded.": "No hay solicitudes de menú registradas.",
  "Save posting times": "Guardar horarios de publicación",
  "The Creative Studio tries providers in this order for every plate photo it generates, skipping any that are disabled — the first one that succeeds wins, and the rest never run.": "El Estudio Creativo prueba los proveedores en este orden para cada foto de plato, omitiendo los desactivados. Usa el primero que funciona y no ejecuta los demás.",
  "is skipped on every call and the chain falls through to the next one — it cannot produce an image no matter where you rank it.": "se omite en cada llamada y se prueba el siguiente; no puede producir una imagen, sin importar su posición.",
  "Save order": "Guardar orden",
  "Research the intel bench has produced — a standing local-competitor sweep, a recurring Instagram platform pulse, and questions you file yourself. Every answer cites the URLs it used, so nothing here is an opinion you cannot check.": "Investigaciones del área de análisis: revisión de competidores locales, seguimiento periódico de Instagram y preguntas que tú registras. Cada respuesta cita las URL utilizadas para que puedas comprobarla.",
  "Run the queue now": "Ejecutar la cola ahora",
  "No competitor sweep yet. Runs automatically on the weekly tick when the question queue is empty and the last sweep is 3+ weeks old, or tap \"Run the queue now\" below.": "Aún no hay revisión de competidores. Se ejecuta en la tarea semanal si no hay preguntas pendientes y han pasado al menos 3 semanas desde la última revisión; también puedes pulsar «Ejecutar la cola ahora».",
  "Nothing here yet — and nothing in the product currently generates a \"market\" brief. This kind exists in the schema but no sweep or workflow writes to it yet.": "Aún no hay contenido y actualmente ningún proceso del producto genera un brief de «mercado». Ese tipo existe en la estructura de datos, pero todavía ningún proceso lo escribe.",
  "No platform pulse yet. Runs the same way the competitor sweep does, or tap \"Run the queue now\" below.": "Aún no hay seguimiento de la plataforma. Se ejecuta igual que la revisión de competidores; también puedes pulsar «Ejecutar la cola ahora».",
  "Filed now, answered on the next intel run — this does real web research and never runs inline in a page load.": "Se registra ahora y se responde en la próxima ronda de análisis. Hace investigación web real y no se ejecuta al cargar una página.",
  "e.g. What are competitors in Delray Beach charging for a weekly bowl subscription?": "p. ej., ¿Cuánto cobran los competidores de Delray Beach por una suscripción semanal de bowls?",
  "More marketing details / Más detalles de marketing": "Más detalles de marketing",
  "What happened since last time": "Qué pasó desde la última vez",
  "Could not load the meter.": "No se pudo cargar el indicador.",
  "Orders are attributed by campaign — the same tag the /l/ redirect stamps on the visit.": "Los pedidos se atribuyen por campaña usando la misma etiqueta que el redireccionamiento /l/ asigna a la visita.",
  "Some inbox evidence is unavailable; an empty view does not mean the queue is clear.": "Parte de la información de la bandeja no está disponible; una vista vacía no significa que no haya pendientes.",
  "No pending work returned in this bounded snapshot.": "Este registro limitado no devolvió trabajo pendiente.",
  "A lane earns auto-publish after 5 drafts in a row approved without an edit. One edit resets its streak. The switch is yours — nothing flips it for you.": "Un canal alcanza elegibilidad de publicación automática tras 5 borradores consecutivos aprobados sin cambios. Una edición reinicia la racha. Tú controlas el interruptor; no se activa por sí solo.",
  "No published posts with measured reach yet — this fills in once the daily Instagram sweep has something to compare.": "Aún no hay publicaciones con alcance medido; aparecerán cuando la revisión diaria de Instagram tenga datos para comparar.",
  "Latest recorded post": "Última publicación registrada",
  "Last 3 posts": "Últimas 3 publicaciones",
  "Recorded posting activity": "Actividad de publicación registrada",
  "Reach: read unavailable. Followers: read unavailable. These saved measurements do not establish current Instagram performance or a complete posting history.": "Alcance: lectura no disponible. Seguidores: lectura no disponible. Estas mediciones guardadas no demuestran el rendimiento actual de Instagram ni un historial completo de publicaciones.",
  "No recorded weak-run signal clears the sample threshold. This card does not prove whether the planner has acted. Below the sample floor, this stays silent rather than guess — a false \"it’s not working\" is worse than no answer.": "Ninguna señal registrada de bajo rendimiento supera el mínimo de muestra. Esta tarjeta no demuestra si actuó el planificador. Por debajo de ese mínimo no hace suposiciones: es preferible no concluir a afirmar erróneamente que no funciona.",
  "From": "Desde",
  "No orders in this range.": "No hay pedidos en este período.",
  "Search name, email, or order id…": "Buscar nombre, correo o ID de pedido…",
  "+ New partner": "+ Nuevo socio",
  "+ New code": "+ Nuevo código",
  "No creator partners yet. Use “+ New partner” to onboard your first one — they get a live code and an onboarding email immediately.": "Aún no hay creadores asociados. Usa «+ Nuevo socio» para dar de alta al primero; recibe un código activo y un correo de bienvenida de inmediato.",
  "💵 Owed now (completed, unpaid)": "💵 Pendiente ahora (completado, sin pagar)",
  "📅 Scheduled (not yet run)": "📅 Programado (aún sin realizar)",
  "✓ Paid this period": "✓ Pagado en este período",
  "No driver routes in this period.": "No hay rutas de conductores en este período.",
  "Your real costs": "Tus costos reales",
  "Every quote is built from these. ⚠ marks a figure that is still a placeholder, not something you measured — change it and it becomes yours.": "Estos datos sirven para cada cotización. ⚠ marca una cifra provisional que aún no has medido; reemplázala con tu dato real.",
  "Food cost per head": "Costo de comida por persona",
  "supplier cost of what one guest eats": "Costo de proveedor de lo que come una persona",
  "Staff pay rate / hour": "Tarifa del personal por hora",
  "your actual rate": "Tu tarifa real",
  "Hours per event": "Horas por evento",
  "Guests per staff member": "Invitados por miembro del personal",
  "Packaging per head": "Envases por persona",
  "Overhead per event": "Gastos generales por evento",
  "equipment wear + kitchen share + admin": "Desgaste de equipo, parte de cocina y administración",
  "Target food cost": "Costo objetivo de comida",
  "blank = travel not charged": "En blanco = no se cobra traslado",
  "What that prices out to": "Precio resultante",
  "Live, from the same engine that will quote a real event.": "En directo, con el mismo sistema que cotiza un evento real.",
  "No quote possible yet — missing:": "Aún no se puede cotizar; falta:",
  "The engine refuses to invent a price.": "El sistema no inventa precios.",
  "No open requests.": "No hay solicitudes abiertas.",
  "Settings": "Ajustes",
  "Points per $1 spent": "Puntos por cada $1 gastado",
  "Points per $1 redeemed": "Puntos para canjear $1",
  "Free delivery from tier": "Entrega gratis a partir del nivel",
  "Save settings": "Guardar ajustes",
  "Launch review": "Revisión de lanzamiento",
  "No active drivers yet — there is nobody to schedule.": "Aún no hay conductores activos para programar.",
  "A saved 30-day plan will appear here with its captions, media, suggested times, and review details.": "Un plan de 30 días guardado aparecerá aquí con sus textos, contenido multimedia, horarios sugeridos y detalles de revisión.",
  "Open Marketing": "Abrir Marketing",
  "Token expiry not recorded.": "Vencimiento del token sin registrar.",
  "Verify the current token in Meta and record its expiry date if one is provided. This reminder does not check publishing, inbox or insights access.": "Verifica el token actual en Meta y registra su fecha de vencimiento si aparece. Este recordatorio no comprueba el acceso a publicaciones, bandeja ni estadísticas.",
  "Record expiry date": "Registrar fecha de vencimiento",
  "A feed post: one photo, or a 2-10 photo carousel added after saving.": "Una publicación del feed: una foto o un carrusel de 2 a 10 fotos agregado después de guardar.",
  "JPEG from your phone or computer. Instagram rejects PNG and WebP; iPhone HEIC needs sharing as JPEG first.": "JPEG de tu teléfono o computadora. Instagram rechaza PNG y WebP; comparte primero los HEIC del iPhone como JPEG.",
  "Factual notes (optional) / Datos (opcional)": "Datos verificados (opcional)",
  "Uses the existing AI budget. Review the preview before using it. / Usa el presupuesto de IA. Revisa el texto antes de usarlo.": "Usa el presupuesto de IA existente. Revisa la vista previa antes de usarla.",
  "Up to 2,200 characters. Hashtags count toward it.": "Hasta 2.200 caracteres, incluidos los hashtags.",
  "Schedule (optional)": "Programación (opcional)",
  "Leave empty to save as a draft you publish by hand.": "Déjalo vacío para guardar un borrador que publicarás manualmente.",
  "Save post": "Guardar publicación",
  "Recover previous save": "Recuperar guardado anterior",
  "Scheduled / Programadas": "Programadas",
  "All / Todas": "Todas",
  "No matching posts in this loaded list. / No hay publicaciones coincidentes en esta lista.": "No hay publicaciones coincidentes en esta lista cargada.",
  "Reload the composer to verify your account before saving.": "Recarga el editor para verificar tu cuenta antes de guardar.",
  "What is shown? / ¿Qué muestra la foto?": "¿Qué muestra la foto?",
  "Write the caption…": "Escribe el texto de la publicación…",
  "Add staff": "Agregar personal",
  "Talk strategy. The Lead proposes and drafts — you approve, schedule and publish in Create.": "Conversa sobre estrategia. El líder propone y prepara borradores; tú apruebas, programas y publicas en Crear.",
  "No conversation yet. Ask the Lead where marketing should go next.": "Aún no hay conversación. Pregunta al líder cuál debe ser el próximo rumbo de marketing.",
  "No briefs yet — ask the Lead to propose a campaign.": "Aún no hay briefs; pide al líder que proponga una campaña.",
  "Plain-language rules and reference photos — the Lead and planner use a shared 16,000-character training cap. Other tools may use different context limits.": "Reglas claras y fotos de referencia. El líder y el planificador comparten un límite de capacitación de 16.000 caracteres. Otras herramientas pueden tener límites distintos.",
  "Teach the marketing team without touching a file or a deploy. Write plain-language rules and mark up photo examples — the Lead and planner use a shared 16,000-character training cap. Other tools may use different context limits.": "Capacita al equipo de marketing sin editar archivos ni desplegar. Escribe reglas claras y anota ejemplos fotográficos; el líder y el planificador comparten un límite de 16.000 caracteres. Otras herramientas pueden tener límites distintos.",
  "What the team currently believes": "Lo que el equipo tiene registrado actualmente",
  "Current Lead/planner training preview. Actual inference receipts show what each completed call received.": "Vista previa actual de la capacitación del líder y planificador. Los comprobantes de inferencia muestran qué recibió cada llamada completada.",
  "The team has not been trained yet.": "El equipo aún no ha sido capacitado.",
  "Nothing below is being sent to the marketing team's AI. Add a rule or a reference photo and it will appear here — in the shared Lead/planner preview.": "Nada de lo que aparece abajo se envía a la IA del equipo de marketing. Agrega una regla o foto de referencia para que aparezca en la vista previa compartida del líder y planificador.",
  "Plain language. e.g. \"Always show food in the first slide\" or \"Never use stock-looking plates.\" Rules stay internal unless you explicitly enable customer answer use below.": "Usa lenguaje claro. Por ejemplo: «Muestra comida en la primera diapositiva» o «No uses platos que parezcan fotos de catálogo». Las reglas son internas salvo que habilites expresamente su uso en respuestas a clientes abajo.",
  "Add rule": "Agregar regla",
  "Upload a photo and explain it in your own words — \"this is the look I want\" or \"never do this.\"": "Sube una foto y explícalo con tus palabras: «Este es el estilo que quiero» o «Nunca hagas esto».",
  "Drop a photo here or tap to choose": "Suelta una foto aquí o toca para elegir",
  "Ask for a plan, a brief, a read on the numbers…": "Pide un plan, un brief o un análisis de las cifras…",
  "Write a rule the team should always follow…": "Escribe una regla que el equipo deba seguir siempre…",
  "No active staff yet.": "Aún no hay personal activo.",
  "Creative Studio — Añejo": "Estudio Creativo — Añejo",
  "Dayan’s final review / Revisión final": "Revisión final de Dayan",
  "Holding and service / Conservación para servicio": "Conservación para el servicio",
  "Knowledge Base — Añejo HUB": "Base de conocimientos — Añejo HUB",
  "Lunch feedback · Añejo": "Opiniones sobre almuerzos · Añejo",
  "Menu coverage / Cobertura del menú": "Cobertura del menú",
  "My Pay · Añejo Driver": "Mis pagos · Conductor de Añejo",
  "Packaging, count and plating / Envases y presentación": "Envases, cantidad y presentación",
  "Prep minutes / Preparación": "Minutos de preparación",
  "Ready-to-serve portion / Porción lista para servir": "Porción lista para servir",
  "Shelf life / Vida útil": "Vida útil",
  "Spanish name / Nombre en español": "Nombre en español",
  "AÑEJO · ADOPTION": "AÑEJO · ADOPCIÓN",
  "AÑEJO · MENU": "AÑEJO · MENÚ",
  "Añejo HUB test — your Twilio SMS is working.": "Prueba de Añejo HUB: tu SMS de Twilio funciona.",
  "Four things that used to only be changeable with curl: how often the feed posts, when posts go out, which AI draws the plate photos, and what the research bench has found. Everything below reads and writes the same settings the automations already use — nothing here needs a redeploy to take effect.": "Cuatro ajustes que antes requerían comandos: frecuencia del feed, horarios de publicación, IA que genera fotos de platos y resultados de investigación. Este panel lee y guarda los mismos ajustes que usan las automatizaciones; los cambios no requieren un nuevo despliegue.",
  "How many NEW feed (grid) posts the planner tops up to each week. 2026 research on food accounts: 3-5 posts/week is the sweet spot — average reach PER POST starts falling once an account crosses roughly 5/week, so posting more can mean fewer people see each one.": "Cantidad de publicaciones NUEVAS del feed que el planificador procura completar cada semana. Según la investigación de 2026 sobre cuentas de comida citada por este panel, el intervalo recomendado es de 3 a 5 publicaciones semanales; al superar aproximadamente 5, el alcance medio POR PUBLICACIÓN comienza a bajar, por lo que publicar más puede reducir la audiencia de cada una.",
  "Default hour(s), Eastern Time, the planner snaps a drafted post onto for each weekday. Research behind these: the weekday lunch-decision window, 11:00–13:00 ET, is the strongest slot — it lands while someone is deciding what to eat TODAY. A secondary evening window, 17:00–19:00 ET, catches the dinner-decision crowd the same way. Friday out-performs every other day; Tuesday–Thursday are strong; weekends are the weakest days for FEED reach specifically — even so, evening is still the best hour of a weak weekend day. Hours must be 8–19 (8 AM–7 PM); anything outside that range is dropped, and a day left with none reverts to its researched default.": "Horarios predeterminados, en hora del Este, que el planificador asigna a los borradores por día de la semana. La investigación citada aquí favorece la franja de decisión del almuerzo entre semana, de 11:00 a 13:00 ET, cuando la gente decide qué comer HOY. La franja secundaria de 17:00 a 19:00 ET busca la decisión de cena. El viernes obtiene mejores resultados; de martes a jueves también son fuertes. Los fines de semana tienen menor alcance del FEED, aunque se prefiere la tarde-noche. Las horas deben estar entre 8 y 19; se descartan las demás. Si un día queda sin horarios, recupera el valor predeterminado basado en esa investigación.",
  "owner · lead · kitchen": "propietario · líder · cocina",
  ": kitchen": ": cocina",
  "No paid receipt costs imported yet.": "Aún no se han importado costos de compras pagadas.",
  "No prepared menu items were returned.": "No se recibieron artículos preparados del menú.",
  "Create production plan": "Crear plan de producción",
  "Enter and confirm actual recipe quantities and packaging for one finished item. A photo does not set these amounts.": "Ingresa y confirma las cantidades reales de receta y envases para un producto terminado. Una foto no determina estas cantidades.",
  "Menu item": "Artículo del menú",
  "Ingredient and packaging amounts": "Cantidades de ingredientes y envases",
  "Add at least one of each. Values are required and have no suggested quantity.": "Agrega al menos uno de cada tipo. Los valores son obligatorios y no tienen una cantidad sugerida.",
  "Add requirement": "Agregar requisito",
  "Stock count freshness (hours)": "Vigencia del conteo de existencias (horas)",
  "Assign kitchen staff (optional)": "Asignar personal de cocina (opcional)",
  "I reviewed the recipe, packaging, exact units, current count basis, target, and batch limits.": "Revisé la receta, los envases, las unidades exactas, la base del conteo actual, el objetivo y los límites del lote.",
  "Save reviewed plan": "Guardar plan revisado",
  "Meal name": "Nombre de la comida",
  "Description": "Descripción",
  "Add a menu item": "Agregar artículo al menú",
  "Drinks and add-ons work the moment you save them — they are priced straight from this row.": "Las bebidas y los complementos quedan disponibles al guardarlos; sus precios se toman directamente de esta fila.",
  "Price ($)": "Precio ($)",
  "Show on the website right away": "Mostrar en la web de inmediato",
  "Ids are permanent — they are how orders, receipts and the kitchen refer to this item. Lowercase letters, numbers and underscores.": "Los ID son permanentes: identifican este artículo en pedidos, recibos y cocina. Usa letras minúsculas, números y guiones bajos.",
  "Menu & prices": "Menú y precios",
  "Disabled — awaiting your template review.": "Desactivado · pendiente de tu revisión de la plantilla.",
  "On-time": "A tiempo",
  "No routes today.": "No hay rutas hoy.",
  "No deliveries today.": "No hay entregas hoy.",
  "Feed posts per week": "Publicaciones del feed por semana",
  "0 pauses the planner. 14 is a hard ceiling. Shipped default: 3/week.": "0 pausa el planificador. El máximo es 14. Valor predeterminado: 3 por semana.",
  "Recorded, not automated.": "Registrado, no automatizado.",
  "These numbers record your Story targets; changing them does not create drafts or publish. Prepare Stories in Marketing or the campaign workspace, review the exact media, then schedule or publish. Check the saved result for provider acceptance.": "Estas cifras registran tus objetivos de historias; cambiarlas no crea borradores ni publica. Prepara las historias en Marketing o en el espacio de campañas, revisa el contenido exacto y después programa o publica. Consulta el resultado guardado para comprobar la aceptación del proveedor.",
  "Stories per day — min": "Historias al día · mínimo",
  "Stories per day — max": "Historias al día · máximo",
  "Save cadence": "Guardar frecuencia",
  "Why nothing will send yet:": "Por qué todavía no se enviará nada:",
  "Discovered (7 days)": "Descubiertos (7 días)",
  "Awaiting your approval": "Pendiente de tu aprobación",
  "Sent today": "Enviados hoy",
  "With a valid contact": "Con un contacto válido",
  "Each runs once, inside its caps. Switch the scheduled versions on in Settings.": "Cada tarea se ejecuta una vez, dentro de sus límites. Activa las versiones programadas en Ajustes.",
  "Automated discovery: no approved source in this release — load organizations with": "Búsqueda automática: esta versión no tiene una fuente aprobada; carga organizaciones con",
  "Research next batch": "Investigar próximo lote",
  "Draft due follow-ups": "Crear borradores de seguimientos pendientes",
  "Send approved emails now": "Enviar ahora los correos aprobados",
  "Terms, Privacy and Refund. Leave one empty to keep the version that ships with the site — clearing your text restores it rather than publishing a blank page.": "Términos, Privacidad y Reembolsos. Deja un campo vacío para conservar la versión original del sitio; borrar tu texto la restaura en lugar de publicar una página vacía.",
  "Reports filed": "Reportes enviados"
};
  if (window.AnejoI18n && typeof window.AnejoI18n.extend === "function") window.AnejoI18n.extend(dictionary);
  else (window.__hubI18nQueue = window.__hubI18nQueue || []).push(dictionary);
  // Anchored templates preserve all variable values; no remote translation or input rewriting.
  var patterns = [
  {
    "en": "Snapshot checked: {time}. Latest 100 conversations and 200 reply attempts; this is not complete history.",
    "es": "Registro consultado: {time}. Últimas 100 conversaciones y 200 intentos de respuesta; no es el historial completo."
  },
  {
    "en": "Delivery / setup: unconfirmed · not included in food subtotal",
    "es": "Entrega y montaje: sin confirmar · no incluido en el subtotal de comida"
  },
  {
    "en": "Records observed {time}. Approval requires a version receipt.",
    "es": "Registros consultados {time}. La aprobación requiere un comprobante de versión."
  },
  {
    "en": "{count} callback requests · {verified} with saved calendar verification.",
    "es": "{count} solicitudes de llamada · {verified} con verificación guardada del calendario."
  },
  {
    "en": "Unpaid contract invoices ({approved} approved · {waiting} waiting)",
    "es": "Facturas pendientes de oficinas ({approved} aprobadas · {waiting} en espera)"
  },
  {
    "en": "Added one {unit}. Set the quantity on its line.",
    "es": "Se agregó una {unit}. Ajusta la cantidad en su línea."
  },
  {
    "en": "Final balance {amount} · due date not recorded",
    "es": "Saldo final {amount} · fecha de vencimiento sin registrar"
  },
  {
    "en": "{completed} completed · {stops} stops · {miles} mi · last {days} days",
    "es": "{completed} completadas · {stops} paradas · {miles} millas · últimos {days} días"
  },
  {
    "en": "{count} catalog SKUs · {active} active · {confirmed} confirmed",
    "es": "{count} SKU del catálogo · {active} activos · {confirmed} confirmados"
  },
  {
    "en": "1st + 15th, {time} UTC · no run on record",
    "es": "Días 1 y 15 a las {time} UTC · sin ejecución registrada"
  },
  {
    "en": "Recorded Instagram token expiry: {date}",
    "es": "Vencimiento registrado del token de Instagram: {date}"
  },
  {
    "en": "Google event verified {time} Eastern · {id}",
    "es": "Evento de Google verificado {time} en hora del Este · {id}"
  },
  {
    "en": "Mondays {time} UTC · no run on record",
    "es": "Lunes a las {time} UTC · sin ejecución registrada"
  },
  {
    "en": "Delivery / setup: {amount} · confirmed",
    "es": "Entrega y montaje: {amount} · confirmado"
  },
  {
    "en": "Cards on file ({count} of {total} accounts)",
    "es": "Tarjetas registradas ({count} de {total} cuentas)"
  },
  {
    "en": "{time} UTC daily · no run on record",
    "es": "Cada día a las {time} UTC · sin ejecución registrada"
  },
  {
    "en": "{count} ready · {pending} awaiting a driver",
    "es": "{count} listos · {pending} en espera de conductor"
  },
  {
    "en": "Collect final balance · {amount}",
    "es": "Cobrar saldo final · {amount}"
  },
  {
    "en": "Draft list unavailable: {error}",
    "es": "Lista de borradores no disponible: {error}"
  },
  {
    "en": "{count} guests · no event date",
    "es": "{count} invitados · sin fecha del evento"
  },
  {
    "en": "{amount} · Final payment waived",
    "es": "{amount} · Saldo final exonerado"
  },
  {
    "en": "Final balance {amount} · due {date}",
    "es": "Saldo final {amount} · vence {date}"
  },
  {
    "en": "Provider reference: {id}",
    "es": "Referencia del proveedor: {id}"
  },
  {
    "en": "{count} guests · event {date} · {contact}",
    "es": "{count} invitados · evento {date} · {contact}"
  },
  {
    "en": "Provider receipt: {id}",
    "es": "Comprobante del proveedor: {id}"
  },
  {
    "en": "{amount} · deposit unpaid",
    "es": "{amount} · depósito sin pagar"
  },
  {
    "en": "{shown} of {total} items shown.",
    "es": "Se muestran {shown} de {total} artículos."
  },
  {
    "en": "{count} guests · event {date}",
    "es": "{count} invitados · evento {date}"
  },
  {
    "en": "Recorded error: {error}",
    "es": "Error registrado: {error}"
  },
  {
    "en": "Saved · version {version}",
    "es": "Guardado · versión {version}"
  },
  {
    "en": "{amount} · Paid in full",
    "es": "{amount} · Pagado en su totalidad"
  },
  {
    "en": "{amount} · deposit paid",
    "es": "{amount} · depósito pagado"
  },
  {
    "en": "Loading {count} items…",
    "es": "Cargando {count} artículos…"
  },
  {
    "en": "deposit unpaid",
    "es": "depósito sin pagar"
  },
  {
    "en": "Last checked: {time}",
    "es": "Última comprobación: {time}"
  },
  {
    "en": "Next action: {action}",
    "es": "Próxima acción: {action}"
  },
  {
    "en": "Revised from {id}",
    "es": "Revisado a partir de {id}"
  },
  {
    "en": "deposit paid",
    "es": "depósito pagado"
  },
  {
    "en": "Last saved: {time}",
    "es": "Último guardado: {time}"
  },
  {
    "en": "Receipt: {id} · {time}",
    "es": "Comprobante: {id} · {time}"
  },
  {
    "en": "{date} · {count} guests",
    "es": "{date} · {count} invitados"
  },
  {
    "en": "{count} guests · {location}",
    "es": "{count} invitados · {location}"
  },
  {
    "en": "Version {version}",
    "es": "Versión {version}"
  },
  {
    "en": "{count} guests",
    "es": "{count} invitados"
  },
  {
    "en": "{count} meals",
    "es": "{count} comidas"
  },
  {
    "en": "{count} items",
    "es": "{count} artículos"
  },
  {
    "en": "{count} ready",
    "es": "{count} listos"
  },
  {
    "en": "Since {time}",
    "es": "Desde {time}"
  },
  {
    "en": "{count} open",
    "es": "{count} abiertos"
  }
];
  if (window.AnejoI18n && typeof window.AnejoI18n.extendPatterns === "function") window.AnejoI18n.extendPatterns(patterns);
  else window.__anejoI18nPatterns = (window.__anejoI18nPatterns || []).concat(patterns);

  // Additional source-bound UI/dialog coverage; variable values remain exact.
  var boundaryDictionary = {
  "Switch language to English": "Cambiar idioma a inglés",
  "Deny this delivery order? It will be offered to another driver.": "¿Rechazar este pedido de entrega? Se ofrecerá a otro conductor.",
  "Cancel this queued reservation? No stock has been consumed.": "¿Cancelar esta reserva en cola? No se han consumido existencias.",
  "Archive this inventory item?": "¿Archivar este artículo de inventario?",
  "Discard unsaved recipe changes? / ¿Descartar los cambios sin guardar?": "¿Descartar los cambios de receta sin guardar?",
  "Why not? (she sees this)": "¿Por qué no? (El cliente lo verá)",
  "Send an erasure request to the owner? Your money, food-safety and contract records will be kept.": "¿Enviar una solicitud de eliminación al propietario? Se conservarán los registros de dinero, seguridad alimentaria y contratos.",
  "Discard your unsaved edits and reload?": "¿Descartar los cambios sin guardar y recargar?",
  "Replace the current proposed text?": "¿Reemplazar el texto propuesto actual?",
  "Open this workspace and leave unsaved changes on this page?": "¿Abrir este espacio y dejar en esta página los cambios sin guardar?",
  "Mark this balance paid? This records the money as received — it does not charge anybody.": "¿Marcar este saldo como pagado? Esto registra el dinero como recibido; no cobra a nadie.",
  "What should change in “this file”? Dayan sees this and decides.": "¿Qué debe cambiar en «este archivo»? Dayan lo verá y decidirá.",
  "Offboard this account and all its locations now? Existing orders and invoices will stay unchanged.": "¿Dar de baja ahora esta cuenta y todas sus ubicaciones? Los pedidos y las facturas existentes no cambiarán.",
  "Pause this location? Their head-count link will stop accepting counts until you switch it back on.": "¿Pausar esta ubicación? Su enlace de cantidades dejará de aceptar registros hasta que vuelvas a activarla.",
  "Revoke this device? They will need to verify again with a code next time.": "¿Revocar este dispositivo? La próxima vez tendrán que verificarse de nuevo con un código.",
  "Void this invoice? Its days go back to un-invoiced so you can re-generate the correct period. This cannot be used on a paid invoice.": "¿Anular esta factura? Sus días volverán a quedar sin facturar para que puedas generar el período correcto. No se puede hacer con una factura pagada.",
  "Cancel this route and put its stops back in the unassigned list?": "¿Cancelar esta ruta y devolver sus paradas a la lista sin asignar?",
  "Disconnect QuickBooks? Invoices already sent there stay where they are.": "¿Desconectar QuickBooks? Las facturas ya enviadas allí permanecerán donde están.",
  "Remove this card and withdraw the authorization? Automatic charging for this account will refuse until a new card is added.": "¿Quitar esta tarjeta y retirar la autorización? Los cobros automáticos de esta cuenta se rechazarán hasta agregar una tarjeta nueva.",
  "Remove this document from the knowledge base?": "¿Quitar este documento de la base de conocimientos?",
  "Remove this rule? The team will stop seeing it.": "¿Quitar esta regla? El equipo dejará de verla.",
  "Remove this example? The team will stop seeing it.": "¿Quitar este ejemplo? El equipo dejará de verlo.",
  "Start a new photo draft? Unsaved composer changes will be replaced. / ¿Empezar un borrador nuevo? Se reemplazarán los cambios sin guardar.": "¿Crear un borrador nuevo de foto? Se reemplazarán los cambios del editor que no hayas guardado.",
  "Clear the recorded expiry date? The HUB will show it as unknown until you record it again.": "¿Borrar la fecha de vencimiento registrada? El HUB la mostrará como desconocida hasta que vuelvas a registrarla.",
  "Replace your current caption with this preview? / ¿Reemplazar tu texto con esta vista previa?": "¿Reemplazar el texto actual de tu publicación con esta vista previa?",
  "Save this as a template called:": "Guardar esta plantilla con el nombre:",
  "Cancel this order? This stops the order but does NOT return any money — refund separately if the customer paid.": "¿Cancelar este pedido? Esto detiene el pedido, pero NO devuelve dinero. Si el cliente pagó, tramita el reembolso por separado.",
  "Decline this application? We’ll send a warm decline email.": "¿Rechazar esta solicitud? Enviaremos un correo cordial de rechazo.",
  "Mark this driver’s completed routes as paid for the selected period? This records the payout.": "¿Marcar como pagadas las rutas completadas de este conductor en el período seleccionado? Esto registra el pago.",
  "The confirmation must match the staff id exactly.": "La confirmación debe coincidir exactamente con el ID del empleado.",
  "Mark this organization do-not-contact? Every sequence stops and nothing will be sent.": "¿Marcar esta organización como «no contactar»? Se detendrán todas las secuencias y no se enviará nada.",
  "Stop emailing this address, everywhere?": "¿Dejar de enviar correos a esta dirección en todos los canales?",
  "Why reject this email? (It stops this prospect’s sequence.)": "¿Por qué rechazar este correo? (Se detiene la secuencia de este prospecto.)",
  "Delete this message? This cannot be undone.": "¿Eliminar este mensaje? No se puede deshacer.",
  "Anything showing behind this is empty because the HUB could not load it — not because there is nothing there.": "Lo que aparece detrás está vacío porque el HUB no pudo cargarlo, no porque no haya datos.",
  "Reply context unavailable; sending is paused.": "El contexto de respuesta no está disponible; el envío está pausado.",
  "Send customer text": "Enviar texto al cliente",
  "Instagram reply history unavailable. Sending is paused; no outcome is assumed.": "El historial de respuestas de Instagram no está disponible. El envío está pausado; no se supone ningún resultado.",
  "Instagram reply outcome pending or unknown. New replies and follow-ups are blocked until its outcome is resolved.": "El resultado de la respuesta de Instagram está pendiente o es desconocido. Las respuestas y los seguimientos nuevos están bloqueados hasta resolverlo.",
  "Check or retry exact reviewed reply": "Consultar o reintentar la respuesta revisada exacta",
  "Reply outcome not verified. Only this exact request can be checked or retried; no new message is enabled.": "El resultado de la respuesta no está verificado. Solo se puede consultar o reintentar esta solicitud exacta; no se habilita ningún mensaje nuevo.",
  "Latest reply was not accepted or its outcome is unavailable. Sending remains blocked; review its saved receipt.": "La última respuesta no fue aceptada o su resultado no está disponible. El envío sigue bloqueado; revisa su comprobante guardado.",
  "Review and send Instagram reply": "Revisar y enviar respuesta de Instagram",
  "This reply will be public under the Instagram comment. Review the exact text before sending.": "Esta respuesta será pública debajo del comentario de Instagram. Revisa el texto exacto antes de enviar.",
  "This reply goes to the Instagram DM. Review the exact text before sending.": "Esta respuesta irá al mensaje directo de Instagram. Revisa el texto exacto antes de enviar.",
  "Could not load your pay.": "No se pudieron cargar tus pagos.",
  "Could not load your totals right now — the routes below are still accurate.": "No se pudieron cargar tus totales ahora; las rutas de abajo siguen siendo correctas.",
  "Editing today's submitted report": "Editando el reporte enviado de hoy",
  "Checking freshness, stock, and reservations…": "Revisando vigencia del conteo, existencias y reservas…",
  "No eligible batches were queued.": "No se puso en cola ningún lote elegible.",
  "Choose a menu item and a published recipe.": "Elige un artículo del menú y una receta publicada.",
  "Review the quantities and check the confirmation before saving.": "Revisa las cantidades y marca la confirmación antes de guardar.",
  "Saving owner-reviewed plan…": "Guardando plan revisado por el propietario…",
  "Plan saved and review recorded. Refreshing opportunities…": "Plan guardado y revisión registrada. Actualizando oportunidades…",
  "Explain the shortfall before recording completion.": "Explica el faltante antes de registrar la finalización.",
  "Recording completed yield and stock use…": "Registrando rendimiento final y uso de existencias…",
  "Completion recorded.": "Finalización registrada.",
  "Style": "Estilo",
  "Open and review all three layouts, then confirm the checkbox.": "Abre y revisa los tres formatos; después marca la casilla de confirmación.",
  "Review the loaded previews and SMS text before enabling.": "Revisa las vistas previas cargadas y el texto SMS antes de activar.",
  "Photo unavailable": "Foto no disponible",
  "Inventory photo unavailable": "Foto de inventario no disponible",
  "Saving counts…": "Guardando cantidades…",
  "Counts saved.": "Cantidades guardadas.",
  "Could not save counts.": "No se pudieron guardar las cantidades.",
  "Uploading private inventory snapshot…": "Subiendo foto privada del inventario…",
  "Photo uploaded and waiting for owner review.": "Foto subida y pendiente de revisión del propietario.",
  "Photo upload failed. Your inventory counts are unchanged.": "Falló la carga de la foto. Las cantidades de inventario no cambiaron.",
  "Saving owner review…": "Guardando revisión del propietario…",
  "Photo review saved.": "Revisión de foto guardada.",
  "Could not save photo review.": "No se pudo guardar la revisión de la foto.",
  "Enter an item name.": "Ingresa un nombre de artículo.",
  "Adding item…": "Agregando artículo…",
  "Item added.": "Artículo agregado.",
  "Unsaved draft": "Borrador sin guardar",
  "Reference only. No current exact-version owner receipt. Legacy library access remains available.": "Solo referencia. No hay comprobante del propietario para la versión exacta actual. El acceso a la biblioteca anterior sigue disponible.",
  "New draft. No operational recipe is changed.": "Borrador nuevo. No cambia ninguna receta operativa.",
  "Unsaved edits. Save a new draft before submitting or approving.": "Cambios sin guardar. Guarda un borrador nuevo antes de enviarlo o aprobarlo.",
  "Required structured fields supplied. Dayan still must verify their accuracy.": "Se proporcionaron los campos estructurados obligatorios. Dayan aún debe verificar su exactitud.",
  "Saved reference photos decoded for review.": "Fotos de referencia guardadas y cargadas para revisión.",
  "A saved photo could not be displayed. Replace or repair it before approval.": "No se pudo mostrar una foto guardada. Reemplázala o repárala antes de aprobar.",
  "Waiting for saved reference photos to load before approval.": "Esperando que carguen las fotos de referencia guardadas antes de aprobar.",
  "Request already sent": "Solicitud ya enviada",
  "Sending…": "Enviando…",
  "Request sent": "Solicitud enviada",
  "Asking…": "Consultando…",
  "Checking the saved acknowledgment; no reply is being sent…": "Consultando el acuse guardado; no se está enviando ninguna respuesta…",
  "Provider acceptance recorded locally. Recipient delivery remains unverified; no reply was resent.": "La aceptación del proveedor quedó registrada localmente. La entrega al destinatario sigue sin verificar; no se reenvió ninguna respuesta.",
  "Recovery remains unverified. No reply was resent. Refresh saved status before further action.": "La recuperación sigue sin verificar. No se reenvió ninguna respuesta. Actualiza el estado guardado antes de otra acción.",
  "Recovery could not be verified. No reply was resent. Refresh saved status before further action.": "No se pudo verificar la recuperación. No se reenvió ninguna respuesta. Actualiza el estado guardado antes de otra acción.",
  "Could not load callback requests.": "No se pudieron cargar las solicitudes de llamada.",
  "Booking configuration is ready. Each appointment still requires Google verification. Customer email activation is configured; individual provider receipts appear below.": "La configuración de reservas está lista. Cada cita aún requiere verificación de Google. El correo al cliente está configurado; abajo aparecen los comprobantes individuales del proveedor.",
  "Booking configuration is ready. Each appointment still requires Google verification. Customer confirmation and reminder emails are disabled.": "La configuración de reservas está lista. Cada cita aún requiere verificación de Google. Las confirmaciones y los recordatorios por correo al cliente están desactivados.",
  "Booking readiness cannot be verified. Customer email activation is configured; individual provider receipts appear below.": "No se puede verificar que las reservas estén listas. El correo al cliente está configurado; abajo aparecen los comprobantes individuales del proveedor.",
  "Unverified. Provider accepted; delivery and reading are not verified.": "Sin verificar. El proveedor aceptó el envío; entrega y lectura sin verificar.",
  "Unverified. No provider acceptance verified.": "Sin verificar. No se verificó la aceptación del proveedor.",
  "Catering client · event date not recorded": "Cliente de catering · fecha del evento sin registrar",
  "To: No email recorded · Due date not recorded": "Para: correo sin registrar · fecha de vencimiento sin registrar",
  "Deposit: not recorded · Final payment: not recorded": "Depósito: sin registrar · pago final: sin registrar",
  "Actual branded Añejo final-payment email": "Correo real de Añejo para el pago final",
  "Rendered saved reminder loaded. Sending remains blocked; review the receipt history.": "El recordatorio guardado cargó. El envío sigue bloqueado; revisa el historial de comprobantes.",
  "Rendered email loaded. Review it, then approve the recipient and one send.": "La vista previa del correo cargó. Revísala y después aprueba el destinatario y un único envío.",
  "The email preview did not load. Sending stays disabled. Close and reopen to retry.": "La vista previa del correo no cargó. El envío sigue desactivado. Cierra y vuelve a abrir para reintentar.",
  "Checking the saved payment and reminder evidence…": "Consultando las pruebas guardadas de pago y recordatorios…",
  "Staging the branded final-payment email…": "Preparando el correo de Añejo para el pago final…",
  "Automatic reminders enabled for Spanish using the approved template.": "Recordatorios automáticos activados en español con la plantilla aprobada.",
  "Automatic reminders enabled for English using the approved template.": "Recordatorios automáticos activados en inglés con la plantilla aprobada.",
  "The template changed. Review this version before enabling automatic reminders.": "La plantilla cambió. Revisa esta versión antes de activar los recordatorios automáticos.",
  "Automatic reminders are disabled until this rendered template is approved.": "Los recordatorios automáticos están desactivados hasta aprobar la vista previa de esta plantilla.",
  "Enable future Spanish final-payment reminders": "Activar futuros recordatorios de pago final en español",
  "Enable future English final-payment reminders": "Activar futuros recordatorios de pago final en inglés",
  "No sendable reminder is staged. Payment and reminder evidence is shown above.": "No hay un recordatorio preparado para enviar. Arriba se muestran las pruebas de pago y recordatorios.",
  "The recipient, rendered email or review identity is missing. Sending is disabled.": "Falta el destinatario, la vista previa del correo o la identidad de revisión. El envío está desactivado.",
  "This reminder is already accepted or its sending outcome is unresolved. Another send is blocked. Review the saved activity below.": "Este recordatorio ya fue aceptado o su resultado está pendiente de resolver. Otro envío está bloqueado. Revisa la actividad guardada abajo.",
  "Sending the reviewed reminder once. Keep this screen open while the result is checked…": "Enviando una vez el recordatorio revisado. Mantén esta pantalla abierta mientras se comprueba el resultado…",
  "Resend accepted the email. Delivery and reading are not verified. No payment has been recorded by this email send.": "Resend aceptó el correo. Entrega y lectura sin verificar. Este envío no registró ningún pago.",
  "The send outcome could not be confirmed. Sending is locked. Refresh the receipt history before taking another action; do not send a second reminder.": "No se pudo confirmar el resultado del envío. El envío está bloqueado. Actualiza el historial de comprobantes antes de otra acción; no envíes un segundo recordatorio.",
  "The send outcome is unverified. Sending is locked to prevent a duplicate. Refresh the receipt history before taking another action.": "El resultado del envío no está verificado. Se bloqueó el envío para evitar duplicados. Actualiza el historial de comprobantes antes de otra acción.",
  "Saving the reviewed reminder template…": "Guardando la plantilla de recordatorio revisada…",
  "Automatic final-payment reminders enabled for Spanish using this approved template. This approval did not send an email.": "Recordatorios automáticos de pago final activados en español con esta plantilla aprobada. Esta aprobación no envió ningún correo.",
  "Automatic final-payment reminders enabled for English using this approved template. This approval did not send an email.": "Recordatorios automáticos de pago final activados en inglés con esta plantilla aprobada. Esta aprobación no envió ningún correo.",
  "Message changed. Preview the updated email before approval.": "El mensaje cambió. Revisa la vista previa actualizada antes de aprobar.",
  "Loading the saved client email…": "Cargando el correo guardado del cliente…",
  "Unverified. Provider acceptance does not establish delivery or reading.": "Sin verificar. La aceptación del proveedor no confirma entrega ni lectura.",
  "No email activity recorded.": "No hay actividad de correo registrada.",
  "Write the message, then preview the actual branded email.": "Escribe el mensaje y después revisa la vista previa real del correo de Añejo.",
  "Add a subject and message before previewing.": "Agrega asunto y mensaje antes de ver la vista previa.",
  "Staging the branded preview. Nothing is being sent…": "Preparando la vista previa de Añejo. No se está enviando nada…",
  "Actual branded Añejo client email": "Correo real de Añejo para el cliente",
  "Rendered email loaded. Read it, then approve this one send.": "La vista previa del correo cargó. Léela y después aprueba este único envío.",
  "The rendered preview did not load. Sending stays disabled; retry Preview branded email.": "La vista previa no cargó. El envío sigue desactivado; reintenta «Ver vista previa del correo de Añejo».",
  "Loading the rendered email. Approval stays disabled until it loads.": "Cargando la vista previa del correo. La aprobación sigue desactivada hasta que termine de cargar.",
  "Sending the reviewed email once…": "Enviando una vez el correo revisado…",
  "Resend accepted the branded email. Delivery and reading are not verified.": "Resend aceptó el correo de Añejo. Entrega y lectura sin verificar.",
  "The send outcome is unverified. Another send is blocked; close and reopen to inspect the saved receipt.": "El resultado del envío no está verificado. Otro envío está bloqueado; cierra y vuelve a abrir para consultar el comprobante guardado.",
  "Rendered email loaded. Review it before enabling a trigger or sending.": "La vista previa del correo cargó. Revísala antes de activar un disparador o enviar.",
  "The preview could not load. Approval and sending remain disabled.": "No se pudo cargar la vista previa. La aprobación y el envío siguen desactivados.",
  "Saved catering booking · Event date not recorded · Recipient shown on each email below": "Reserva de catering guardada · fecha del evento sin registrar · el destinatario aparece en cada correo abajo",
  "Reading saved event-care status…": "Consultando el estado guardado de atención del evento…",
  "Staging event-care email previews. Nothing is being sent…": "Preparando vistas previas de los correos del evento. No se está enviando nada…",
  "These are saved previews and statuses. Opening this screen did not send an email.": "Estas son vistas previas y estados guardados. Abrir esta pantalla no envió ningún correo.",
  "Sending this reviewed email once…": "Enviando una vez este correo revisado…",
  "Saving the reviewed future-trigger approval…": "Guardando la aprobación revisada para el futuro disparador…",
  "The email provider accepted this message. Delivery and reading are not verified.": "El proveedor de correo aceptó este mensaje. Entrega y lectura sin verificar.",
  "The send outcome is unverified. Sending stays locked. Refresh the saved receipt before any further action.": "El resultado del envío no está verificado. El envío sigue bloqueado. Actualiza el comprobante guardado antes de otra acción.",
  "Future trigger approved": "Disparador futuro aprobado",
  "This event’s future trigger is approved. This approval did not send an email.": "El futuro disparador de este evento está aprobado. Esta aprobación no envió ningún correo.",
  "The send outcome is unverified. Sending stays locked; refresh the saved receipt.": "El resultado del envío no está verificado. El envío sigue bloqueado; actualiza el comprobante guardado.",
  "Customer response not recorded": "Respuesta del cliente sin registrar",
  "Choose a customer response status first.": "Elige primero un estado de respuesta del cliente.",
  "Saving customer response…": "Guardando respuesta del cliente…",
  "Customer response saved. No message was sent.": "Respuesta del cliente guardada. No se envió ningún mensaje.",
  "Could not save customer response.": "No se pudo guardar la respuesta del cliente.",
  "Loading recipient…": "Cargando destinatario…",
  "Retrieving the current quote reminder. No message has been sent.": "Consultando el recordatorio actual de cotización. No se ha enviado ningún mensaje.",
  "This reminder cannot be sent right now.": "Este recordatorio no puede enviarse ahora.",
  "Recipient unavailable": "Destinatario no disponible",
  "Recipient or rendered preview is missing. Sending is disabled.": "Falta el destinatario o la vista previa. El envío está desactivado.",
  "The rendered email preview could not be confirmed. Sending stays disabled. Plain text is available above; use Retry email preview to review the HTML before approving.": "No se pudo confirmar la vista previa del correo. El envío sigue desactivado. Arriba está el texto sin formato; usa «Reintentar vista previa del correo» para revisar el HTML antes de aprobar.",
  "Email preview loaded. Review the actual recipient, subject and rendered email, then check the approval box for one manual send.": "La vista previa del correo cargó. Revisa el destinatario, el asunto y el correo real; después marca la aprobación de un único envío manual.",
  "Loading the actual email preview. Approval stays disabled until this preview finishes loading.": "Cargando la vista previa real del correo. La aprobación sigue desactivada hasta que termine de cargar.",
  "Submitting this reviewed reminder once…": "Enviando una vez este recordatorio revisado…",
  "Send outcome not verified. Refresh history before taking another action. · Existing outcome returned; no second send.": "Resultado del envío sin verificar. Actualiza el historial antes de otra acción. · Se devolvió el resultado existente; no hubo segundo envío.",
  "Send outcome not verified. Refresh history before taking another action.": "Resultado del envío sin verificar. Actualiza el historial antes de otra acción.",
  "Could not load follow-up records.": "No se pudieron cargar los registros de seguimiento.",
  "Review both previews and check the approval box first.": "Revisa ambas vistas previas y marca primero la casilla de aprobación.",
  "That weekday already has a template.": "Ese día de la semana ya tiene una plantilla.",
  "Choose a Monday.": "Elige un lunes.",
  "Change language to Spanish": "Cambiar idioma a español",
  "Proposed strategy": "Estrategia propuesta",
  "Saved proposed strategy · used as team planning direction": "Estrategia propuesta guardada · usada como dirección de planificación del equipo",
  "Saved proposed strategy · historical planning receipt recorded": "Estrategia propuesta guardada · comprobante histórico de planificación registrado",
  "Saved proposed strategy · planning status unavailable": "Estrategia propuesta guardada · estado de planificación no disponible",
  "Prior planning use could not be verified. Reload saved strategy before using this proposal; unavailable does not mean no prior planning use.": "No se pudo verificar el uso anterior en planificación. Recarga la estrategia guardada antes de usar esta propuesta; no disponible no significa que no se haya usado antes.",
  "I reviewed this exact proposal, including its assumptions and open questions. Unresolved facts remain unverified; I am allowing team planning only.": "Revisé esta propuesta exacta, incluidos sus supuestos y preguntas pendientes. Los datos sin resolver siguen sin verificar; autorizo solo planificación del equipo.",
  "Saving reviewed planning direction…": "Guardando dirección de planificación revisada…",
  "Saved as team planning brief": "Guardado como brief de planificación del equipo",
  "Planning use not verified. Reload saved strategy or retry this same request; no duplicate brief will be requested.": "Uso en planificación sin verificar. Recarga la estrategia guardada o reintenta esta misma solicitud; no se solicitará un brief duplicado.",
  "Saving a separate private revision…": "Guardando una revisión privada separada…",
  "Revision save not verified. Retry this same save; no planning action was requested.": "Guardado de revisión sin verificar. Reintenta este mismo guardado; no se solicitó ninguna acción de planificación.",
  "Retry same save": "Reintentar el mismo guardado",
  "No saved proposal returned for this idea.": "No se devolvió una propuesta guardada para esta idea.",
  "Generation is recorded as in progress or awaiting an outcome. Completion is not verified. Check saved status; do not start another generation.": "La generación está registrada como en curso o pendiente de resultado. Su finalización no está verificada. Consulta el estado guardado; no inicies otra generación.",
  "Generation outcome is uncertain. No completed proposal is verified.": "El resultado de la generación es incierto. No se verifica una propuesta completada.",
  "No completed proposal was saved.": "No se guardó ninguna propuesta completada.",
  "Saved proposed strategy · private · review required · not active": "Estrategia propuesta guardada · privada · requiere revisión · no está activa",
  "Original generation and revision evidence": "Pruebas originales de generación y revisión",
  "Generation evidence": "Pruebas de generación",
  "Checking saved outcome…": "Consultando resultado guardado…",
  "Generating private proposal…": "Generando propuesta privada…",
  "Generation request in progress. You can check this same saved request while the response is pending.": "Solicitud de generación en curso. Puedes consultar esta misma solicitud guardada mientras esperas la respuesta.",
  "Reading the saved outcome for this same request…": "Consultando el resultado guardado de esta misma solicitud…",
  "Loading saved private proposal…": "Cargando propuesta privada guardada…",
  "Saved private idea": "Idea privada guardada",
  "Añejo voice operator — one tap to talk, two to type": "Operador de voz de Añejo: un toque para hablar, dos para escribir",
  "Preview unavailable · review media before approval": "Vista previa no disponible · revisa el contenido antes de aprobar",
  "New review required for caption suggestions": "Se requiere una revisión nueva para las sugerencias de texto",
  "Owner approval recorded for this preview": "Aprobación del propietario registrada para esta vista previa",
  "Save caption changes before adding media.": "Guarda los cambios de texto antes de agregar contenido multimedia.",
  "Finish or discard the active media selection first.": "Termina o descarta primero la selección multimedia activa.",
  "Refresh the saved campaign before adding media.": "Actualiza la campaña guardada antes de agregar contenido multimedia.",
  "Review the full captions and every media asset, then give explicit approval for this exact version. Scheduling and provider acceptance require separate evidence.": "Revisa los textos completos y cada archivo; después aprueba expresamente esta versión exacta. La programación y la aceptación del proveedor requieren pruebas separadas.",
  "Save caption changes": "Guardar cambios de texto",
  "Discard edits & reload saved version": "Descartar cambios y recargar versión guardada",
  "Checking the next assets…": "Comprobando los próximos archivos…",
  "Pausing remaining campaign posts…": "Pausando las publicaciones restantes de la campaña…",
  "Submitting exact version for owner approval and scheduling…": "Enviando la versión exacta para aprobación del propietario y programación…",
  "Campaign changed. Refresh and review the current version before trying again. The request may have reached the server.": "La campaña cambió. Actualiza y revisa la versión actual antes de reintentar. La solicitud pudo haber llegado al servidor.",
  "The action could not be confirmed. Refresh before retrying. The request may have reached the server.": "No se pudo confirmar la acción. Actualiza antes de reintentar. La solicitud pudo haber llegado al servidor.",
  "The action could not be confirmed. Refresh before retrying; the server may have received it.": "No se pudo confirmar la acción. Actualiza antes de reintentar; el servidor pudo haberla recibido.",
  "Could not load this version.": "No se pudo cargar esta versión.",
  "Saved draft · no checkout yet": "Borrador guardado · aún sin enlace de pago",
  "Open a saved draft first. No checkout has been created by this check.": "Abre primero un borrador guardado. Esta consulta no ha creado ningún enlace de pago.",
  "Existing prepared quote found. No duplicate checkout created. Reload the quote list to open it.": "Se encontró una cotización ya preparada. No se creó un enlace de pago duplicado. Recarga la lista para abrirla.",
  "Draft linked to the prepared quote. Nothing sent.": "Borrador relacionado con la cotización preparada. No se envió nada.",
  "Loading the exact saved quote email…": "Cargando el correo exacto de la cotización guardada…",
  "Checking the current Square order and recorded payment statuses…": "Consultando el pedido actual de Square y los estados de pago registrados…",
  "Payment status could not be verified. Try the read-only lookup again when the connection is available.": "No se pudo verificar el estado del pago. Reintenta la consulta de solo lectura cuando haya conexión.",
  "Payment status could not be verified. No quote, checkout or message was changed.": "No se pudo verificar el estado del pago. No cambió ninguna cotización, enlace de pago ni mensaje.",
  "Checking and retiring only the selected obsolete checkout…": "Comprobando y retirando solo el enlace de pago obsoleto seleccionado…",
  "Retirement not verified. Refresh the quote evidence before retrying.": "Retirada sin verificar. Actualiza las pruebas de la cotización antes de reintentar.",
  "Choose the existing quote to edit": "Elige la cotización existente para editar",
  "An active quote already exists. A revision replaces its checkout; creating another quote would duplicate the offer.": "Ya existe una cotización activa. Una revisión reemplaza su enlace de pago; crear otra cotización duplicaría la oferta.",
  "Enter a non-negative delivery / setup amount with no more than two decimals.": "Ingresa un importe no negativo de entrega y montaje con un máximo de dos decimales.",
  "Price scales with quantity using this line’s agreed rate.": "El precio cambia proporcionalmente con la cantidad según la tarifa acordada de este concepto.",
  "Submitting the reviewed quote. Waiting for provider evidence…": "Enviando la cotización revisada. Esperando pruebas del proveedor…",
  "Outcome unverified · check receipt": "Resultado sin verificar · consultar comprobante",
  "Try again": "Reintentar",
  "Preparing the current email preview…": "Preparando la vista previa del correo actual…",
  "Current preview loaded. Read it before creating or replacing the checkout. Nothing has been sent.": "Vista previa actual cargada. Léela antes de crear o reemplazar el enlace de pago. No se ha enviado nada.",
  "Changes saved. The old checkout was retired and this replacement is ready. Nothing has been sent.": "Cambios guardados. El enlace de pago anterior se retiró y su reemplazo está listo. No se ha enviado nada.",
  "New quote saved. Nothing has been sent.": "Nueva cotización guardada. No se ha enviado nada.",
  "Existing quote lookup is unavailable. Refresh before creating a checkout for this request.": "La búsqueda de cotizaciones existentes no está disponible. Actualiza antes de crear un enlace de pago para esta solicitud.",
  "Refreshing existing quote records before any new checkout can be created…": "Actualizando las cotizaciones existentes antes de permitir un nuevo enlace de pago…",
  "This quote has a recorded deposit and is read-only here. Review the booked order before making any money changes.": "Esta cotización tiene un depósito registrado y aquí es de solo lectura. Revisa el pedido reservado antes de hacer cambios monetarios.",
  "Checking the current quote and any saved revision…": "Consultando la cotización actual y cualquier revisión guardada…",
  "Edit existing catering quote": "Editar cotización de catering existente",
  "The itemized menu is unavailable. Reload the quotes before editing; the confirmed delivery / setup fee has been preserved. No replacement can be saved.": "El menú desglosado no está disponible. Recarga las cotizaciones antes de editar; se conservó el cargo confirmado de entrega y montaje. No se puede guardar un reemplazo.",
  "Recover the saved revision. Its approved values stay locked while the old checkout is retired and the replacement recovered.": "Recupera la revisión guardada. Sus valores aprobados permanecen bloqueados mientras se retira el enlace de pago anterior y se recupera su reemplazo.",
  "Recover saved revision": "Recuperar revisión guardada",
  "Save changes · replace old checkout": "Guardar cambios · reemplazar enlace de pago anterior",
  "Enter the service end date and reason, then confirm all locations.": "Ingresa la fecha de fin de servicio y el motivo; luego confirma todas las ubicaciones.",
  "Offboarding…": "Dando de baja…",
  "Copied ✓": "Copiado ✓",
  "Copy": "Copiar",
  "Planning…": "Planificando…",
  "Could not reload the library. Saved eligibility is unverified; refresh before making another change.": "No se pudo recargar la biblioteca. La elegibilidad guardada está sin verificar; actualiza antes de hacer otro cambio.",
  "Preparing…": "Preparando…",
  "Ready. This QR is reused every day.": "Listo. Este QR se reutiliza todos los días.",
  "Nothing to do — queue is empty and sweeps are fresh.": "No hay nada pendiente: la cola está vacía y las revisiones están al día.",
  "Could not run.": "No se pudo ejecutar.",
  "Filing…": "Archivando…",
  "Could not queue.": "No se pudo poner en cola.",
  "Write an answer first.": "Primero escribe una respuesta.",
  "Compositing…": "Componiendo…",
  "Testing saved media with Instagram…": "Probando los archivos guardados con Instagram…",
  "Upload test failed: HTTP unknown": "La prueba de carga falló: HTTP desconocido",
  "🍽️ Generating a food photo…": "🍽️ Generando una foto de comida…",
  "🍽️ Generate a food photo": "🍽️ Generar una foto de comida",
  "Generating preview… / Generando vista previa…": "Generando vista previa…",
  "Preview only. Review food, names and claims. / Vista previa. Revisa comida, nombres y afirmaciones.": "Solo vista previa. Revisa la comida, los nombres y las afirmaciones.",
  "Draft saved.": "Borrador guardado.",
  "Give the campaign a name.": "Dale un nombre a la campaña.",
  "Write the message.": "Escribe el mensaje.",
  "An email campaign needs a subject line.": "Una campaña de correo necesita un asunto.",
  "Could not count the audience.": "No se pudo contar la audiencia.",
  "Nobody in that segment is reachable on this channel.": "No se puede contactar a nadie de ese segmento por este canal.",
  "Send stopped.": "Envío detenido.",
  "Starting…": "Iniciando…",
  "Checking… / Comprobando…": "Comprobando…",
  "A new BOWL is not orderable from this form alone. Its recipe (ingredients + macros) lives in code, and checkout refuses any bowl it does not have a recipe for — the customer would build a cart and get an error at payment. Add it here, then have the recipe added and deployed. Leave “show on the website” off until then.": "Un BOWL nuevo no se puede pedir solo con este formulario. Su receta (ingredientes y macros) está en el código, y el pago rechaza cualquier bowl sin receta: el cliente crearía un carrito y recibiría un error al pagar. Agrégalo aquí y luego solicita que se agregue y publique la receta. Deja desactivado «mostrar en el sitio web» hasta entonces.",
  "Refund": "Reembolsar",
  "Name and email are required.": "El nombre y el correo son obligatorios.",
  "Enter a code.": "Ingresa un código.",
  "✓ Onboarded · code (welcome email not sent)": "✓ Incorporado · código (correo de bienvenida sin enviar)",
  "✓ Onboarded · code · welcome sent": "✓ Incorporado · código · bienvenida enviada",
  "✓ Declined": "✓ Rechazado",
  "✓ Declined · email sent": "✓ Rechazado · correo enviado",
  "saving…": "guardando…",
  "saved ✓": "guardado ✓",
  "Erasing…": "Borrando…",
  "Saved. New rates apply to the next order.": "Guardado. Las nuevas tarifas se aplican al próximo pedido.",
  "Nothing in the list to work on.": "No hay nada en la lista para procesar.",
  "Could not do that.": "No se pudo realizar esa acción.",
  "Nothing needed doing.": "No había nada pendiente.",
  "Could not start": "No se pudo iniciar",
  "Write what they said first.": "Primero escribe lo que dijeron.",
  "Writing…": "Redactando…",
  "Could not draft it.": "No se pudo redactar.",
  "Nothing to save yet — a name on its own is enough.": "Aún no hay nada que guardar: basta con un nombre.",
  "Could not save that visit.": "No se pudo guardar esa visita."
};
  var boundaryPatterns = [
  {
    "en": "Restore the Brief to v{v0} (saved {v1})? This replaces the live Brand & Standards Brief and re-grounds every future Creative Studio session. The current Brief is snapshotted first, so you can undo this the same way.",
    "es": "¿Restaurar el brief a la versión {v0} (guardada el {v1})? Esto reemplaza el brief de marca y estándares actual y cambia la base de todas las futuras sesiones del Estudio Creativo. Primero se guarda una copia del brief actual, para que puedas deshacerlo del mismo modo."
  },
  {
    "en": "Historical team planning receipt {v0} · brief {v1}. Current brief status: unavailable. Current brief is missing or differs from the reviewed proposal. This receipt does not prove active execution or publication.",
    "es": "Comprobante histórico de planificación {v0} · brief {v1}. Estado actual del brief: no disponible. El brief actual falta o difiere de la propuesta revisada. Este comprobante no prueba ejecución activa ni publicación."
  },
  {
    "en": "Historical team planning receipt {v0} · brief {v1}. Current brief status: unavailable. Current saved brief matches the reviewed proposal. This receipt does not prove active execution or publication.",
    "es": "Comprobante histórico de planificación {v0} · brief {v1}. Estado actual del brief: no disponible. El brief guardado actual coincide con la propuesta revisada. Este comprobante no prueba ejecución activa ni publicación."
  },
  {
    "en": "{v0} is a spreadsheet, not a text file. In Excel or Sheets choose File → Save as / Download → CSV, then pick that. (Or just copy the rows and paste them in the box — tab-separated works.)",
    "es": "{v0} es una hoja de cálculo, no un archivo de texto. En Excel o Sheets elige Archivo → Guardar como / Descargar → CSV y selecciona ese archivo. (También puedes copiar las filas y pegarlas en el cuadro: se aceptan tabulaciones.)"
  },
  {
    "en": "{v0} of {v1} events in this window were automation (actor_type=system) and are excluded from every number above. Counting them would make adoption look healthy even if nobody signed in.",
    "es": "{v0} de {v1} eventos de este período fueron automáticos (actor_type=system) y se excluyen de todas las cifras anteriores. Contarlos haría parecer que se usa el sistema aunque nadie hubiera iniciado sesión."
  },
  {
    "en": "Planning use was not verified: {v0}. The proposal or its authority has changed. A new current proposal must be reviewed before planning use; no override was applied.",
    "es": "Uso en planificación sin verificar: {v0}. La propuesta o su autoridad cambió. Una nueva propuesta actual debe revisarse antes de usarla para planificar; no se aplicó ninguna excepción."
  },
  {
    "en": "Create an ACTIVE contract account for \"{v0}\" on the confirmed terms ({v1}/month)? Their headcount links start working immediately. Nothing is texted or emailed.",
    "es": "¿Crear una cuenta de oficina ACTIVA para «{v0}» con las condiciones confirmadas ({v1} al mes)? Sus enlaces de cantidades funcionarán de inmediato. No se enviarán SMS ni correos."
  },
  {
    "en": "Editing existing quote {v0}. 1. Make changes. 2. Read the updated email preview. 3. Save changes to replace the old checkout. Sending is a separate step.",
    "es": "Editando la cotización existente {v0}. 1. Haz los cambios. 2. Lee la vista previa del correo actualizado. 3. Guarda los cambios para reemplazar el enlace de pago anterior. El envío es un paso aparte."
  },
  {
    "en": "Historical Instagram provider acceptance recorded · attempt {v0}. This is not delivery or read confirmation. Review a deliberate follow-up separately.",
    "es": "Aceptación anterior del proveedor de Instagram registrada · intento {v0}. Esto no confirma entrega ni lectura. Revisa por separado un nuevo seguimiento."
  },
  {
    "en": "Send outcome not verified. Refresh history before taking another action. · Provider receipt: {v0} · Existing outcome returned; no second send. · {v1}",
    "es": "Resultado del envío sin verificar. Actualiza el historial antes de otra acción. · Comprobante del proveedor: {v0} · Se devolvió el resultado existente; no hubo segundo envío. · {v1}"
  },
  {
    "en": "Send outcome not verified. Refresh history before taking another action. · Provider receipt: {v0} · Existing outcome returned; no second send.",
    "es": "Resultado del envío sin verificar. Actualiza el historial antes de otra acción. · Comprobante del proveedor: {v0} · Se devolvió el resultado existente; no hubo segundo envío."
  },
  {
    "en": "Read-only check · {v0} {v1} {v2} This lookup does not charge, cancel, revise or send a message. Order state alone does not establish payment.",
    "es": "Consulta de solo lectura · {v0} {v1} {v2} Esta consulta no cobra, cancela, modifica ni envía mensajes. El estado del pedido por sí solo no demuestra el pago."
  },
  {
    "en": "Preview unavailable: {v0} No photo was saved. If the preserved source cannot be verified, choose the original from the photo library.",
    "es": "Vista previa no disponible: {v0} No se guardó ninguna foto. Si no se puede verificar la fuente conservada, elige el original de la biblioteca de fotos."
  },
  {
    "en": "Read-only check · {v0} {v1} This lookup does not charge, cancel, revise or send a message. Order state alone does not establish payment.",
    "es": "Consulta de solo lectura · {v0} {v1} Esta consulta no cobra, cancela, modifica ni envía mensajes. El estado del pedido por sí solo no demuestra el pago."
  },
  {
    "en": "Turn on Aña auto-reply ({v0})? She will send replies to real customers on your behalf. You can switch this back to Off at any time.",
    "es": "¿Activar la respuesta automática de Aña ({v0})? Enviará respuestas a clientes reales en tu nombre. Puedes volver a desactivarla cuando quieras."
  },
  {
    "en": "Saved for team planning · brief {v0} · receipt {v1}. This confirms planning direction only, not publication or that a planner has run.",
    "es": "Guardado para la planificación del equipo · brief {v0} · comprobante {v1}. Esto confirma solo la dirección de planificación, no una publicación ni que se haya ejecutado el planificador."
  },
  {
    "en": "Resend accepted the email · receipt {v0}. Delivery and reading are not verified. No payment has been recorded by this email send.",
    "es": "Resend aceptó el correo · comprobante {v0}. Entrega y lectura sin verificar. Este envío no registró ningún pago."
  },
  {
    "en": "Send outcome not verified. Refresh history before taking another action. · Existing outcome returned; no second send. · {v0}",
    "es": "Resultado del envío sin verificar. Actualiza el historial antes de otra acción. · Se devolvió el resultado existente; no hubo segundo envío. · {v0}"
  },
  {
    "en": "Planning use not verified: {v0}. Reload saved strategy or retry this same request; no duplicate brief will be requested.",
    "es": "Uso en planificación sin verificar: {v0}. Recarga la estrategia guardada o reintenta esta misma solicitud; no se solicitará un brief duplicado."
  },
  {
    "en": "Set {v0}’s prep time to {v1} minutes? That is the median of {v2} timings of a single one, replacing your estimate of {v3} minutes.",
    "es": "¿Establecer el tiempo de preparación de {v0} en {v1} minutos? Es la mediana de {v2} mediciones de una unidad y reemplaza tu estimación de {v3} minutos."
  },
  {
    "en": "Set {v0}’s prep time to {v1} minutes? That is the median of {v2} timing of a single one, replacing your estimate of {v3} minutes.",
    "es": "¿Establecer el tiempo de preparación de {v0} en {v1} minutos? Es la mediana de {v2} medición de una unidad y reemplaza tu estimación de {v3} minutos."
  },
  {
    "en": "{v0} Anything showing behind this is empty because the HUB could not load it — not because there is nothing there.",
    "es": "{v0} Lo que aparece detrás está vacío porque el HUB no pudo cargarlo, no porque no haya datos."
  },
  {
    "en": "Checkout outcome could not be confirmed. Reload the quote list or recover the saved draft before retrying. {v0}",
    "es": "No se pudo confirmar el resultado del enlace de pago. Recarga las cotizaciones o recupera el borrador guardado antes de reintentar. {v0}"
  },
  {
    "en": "Save not verified. Your edits remain here. {v0} Reload saved data before retrying a conflicting revision.",
    "es": "Guardado sin verificar. Tus cambios siguen aquí. {v0} Recarga los datos guardados antes de reintentar una revisión en conflicto."
  },
  {
    "en": "{v0} characters (~{v1} with the opt-out line). Over 160 sends as multiple segments and is billed per segment.",
    "es": "{v0} caracteres (~{v1} con la línea para cancelar la suscripción). Más de 160 se envían en varios segmentos y se cobra por segmento."
  },
  {
    "en": "{v0}. Outcome not verified. Check or retry this same request; no duplicate generation will be requested.",
    "es": "{v0}. Resultado sin verificar. Consulta o reintenta esta misma solicitud; no se solicitará una generación duplicada."
  },
  {
    "en": "Unverified · {v0} · Provider receipt: {v1} · {v2}. Provider accepted; delivery and reading are not verified.",
    "es": "Sin verificar · {v0} · Comprobante del proveedor: {v1} · {v2}. El proveedor aceptó el envío; entrega y lectura sin verificar."
  },
  {
    "en": "Send outcome not verified. Refresh history before taking another action. · Provider receipt: {v0} · {v1}",
    "es": "Resultado del envío sin verificar. Actualiza el historial antes de otra acción. · Comprobante del proveedor: {v0} · {v1}"
  },
  {
    "en": "Unverified · {v0} · Provider receipt: {v1}. Provider acceptance does not establish delivery or reading.",
    "es": "Sin verificar · {v0} · Comprobante del proveedor: {v1}. La aceptación del proveedor no confirma entrega ni lectura."
  },
  {
    "en": "Refund {v0} (partial) through Square now? This moves real money and cannot be undone from the HUB.",
    "es": "¿Reembolsar ahora {v0} (parcialmente) a través de Square? Esto mueve dinero real y no puede deshacerse desde el HUB."
  },
  {
    "en": "Unverified · {v0} · Provider receipt: {v1}. Provider accepted; delivery and reading are not verified.",
    "es": "Sin verificar · {v0} · Comprobante del proveedor: {v1}. El proveedor aceptó el envío; entrega y lectura sin verificar."
  },
  {
    "en": "Unverified · Provider receipt: {v0} · {v1}. Provider accepted; delivery and reading are not verified.",
    "es": "Sin verificar · Comprobante del proveedor: {v0} · {v1}. El proveedor aceptó el envío; entrega y lectura sin verificar."
  },
  {
    "en": "Send outcome not verified. Refresh history before taking another action. · Provider receipt: {v0}",
    "es": "Resultado del envío sin verificar. Actualiza el historial antes de otra acción. · Comprobante del proveedor: {v0}"
  },
  {
    "en": "Saved outcome not verified: {v0}. No new generation was requested; check this same request again.",
    "es": "Resultado guardado sin verificar: {v0}. No se solicitó una generación nueva; consulta de nuevo esta misma solicitud."
  },
  {
    "en": "{v0} dish price(s) change. Orders from the next head count on are billed at the new price. Save?",
    "es": "Cambian los precios de {v0} plato(s). Los pedidos a partir del próximo registro de cantidades se facturarán con el nuevo precio. ¿Guardar?"
  },
  {
    "en": "Schedule this to post automatically at {v0}? It goes on the public profile without asking again.",
    "es": "¿Programar la publicación automática para {v0}? Se publicará en el perfil público sin volver a preguntar."
  },
  {
    "en": "Unverified · Provider receipt: {v0}. Provider acceptance does not establish delivery or reading.",
    "es": "Sin verificar · Comprobante del proveedor: {v0}. La aceptación del proveedor no confirma entrega ni lectura."
  },
  {
    "en": "Refund {v0} (full) through Square now? This moves real money and cannot be undone from the HUB.",
    "es": "¿Reembolsar ahora {v0} (totalmente) a través de Square? Esto mueve dinero real y no puede deshacerse desde el HUB."
  },
  {
    "en": "The email provider accepted this message · receipt {v0}. Delivery and reading are not verified.",
    "es": "El proveedor de correo aceptó este mensaje · comprobante {v0}. Entrega y lectura sin verificar."
  },
  {
    "en": "{v0} shown of {v1} loaded photos. Search covers loaded photos only; use Load more for older photos.",
    "es": "Se muestran {v0} de {v1} fotos cargadas. La búsqueda incluye solo las fotos cargadas; usa «Cargar más» para las anteriores."
  },
  {
    "en": "Let {v0} posts schedule themselves once the audit clears them? You can turn this off any time.",
    "es": "¿Permitir que las publicaciones de {v0} se programen cuando la auditoría las apruebe? Puedes desactivarlo cuando quieras."
  },
  {
    "en": "Mark {v0} as \"{v1}\"? It stays on the site but nobody can order it, starting within about a minute.",
    "es": "¿Marcar {v0} como «{v1}»? Permanecerá en el sitio, pero nadie podrá pedirlo, con efecto en aproximadamente un minuto."
  },
  {
    "en": "Unverified · Provider receipt: {v0}. Provider accepted; delivery and reading are not verified.",
    "es": "Sin verificar · Comprobante del proveedor: {v0}. El proveedor aceptó el envío; entrega y lectura sin verificar."
  },
  {
    "en": "{v0} unsaved caption change(s). Save changes before leaving; the saved campaign is unchanged.",
    "es": "{v0} cambio(s) de texto sin guardar. Guarda antes de salir; la campaña guardada no cambió."
  },
  {
    "en": "Menu unavailable. Retry by reloading this page, or use an explicitly priced custom line. {v0}",
    "es": "Menú no disponible. Recarga esta página o usa un concepto personalizado con precio explícito. {v0}"
  },
  {
    "en": "Current kitchen standard: owner-approved v{v0}. Further edits remain drafts until approved.",
    "es": "Estándar actual de cocina: versión {v0} aprobada por el propietario. Las nuevas ediciones siguen siendo borradores hasta aprobarse."
  },
  {
    "en": "Resend accepted the branded email · receipt {v0}. Delivery and reading are not verified.",
    "es": "Resend aceptó el correo de Añejo · comprobante {v0}. Entrega y lectura sin verificar."
  },
  {
    "en": "Checkout exists, but the draft link is unconfirmed. Do not create another checkout. {v0}",
    "es": "El enlace de pago existe, pero su relación con el borrador no está confirmada. No crees otro enlace de pago. {v0}"
  },
  {
    "en": "Instagram processed the saved media. Nothing was published or scheduled. Container: {v0}",
    "es": "Instagram procesó los archivos guardados. No se publicó ni programó nada. Contenedor: {v0}"
  },
  {
    "en": "{v0} bowl(s) are not checked — they will be flagged missing to the kitchen. Continue?",
    "es": "Hay {v0} bowl(s) sin comprobar; se notificarán como faltantes a la cocina. ¿Continuar?"
  },
  {
    "en": "Change their email to {v0}? Their orders, points and founding benefit move with them.",
    "es": "¿Cambiar su correo a {v0}? Sus pedidos, puntos y beneficio de fundador se trasladarán con la cuenta."
  },
  {
    "en": "Schedule this photo and caption for {v0}? It will post publicly without asking again.",
    "es": "¿Programar esta foto y este texto para {v0}? Se publicarán sin volver a preguntar."
  },
  {
    "en": "Turn {v0} automatic payments ON? Approved amounts will then be able to move money.",
    "es": "¿ACTIVAR los pagos automáticos de {v0}? Después podrán cobrarse los importes aprobados."
  },
  {
    "en": "Set {v0}’s prep time to {v1} minutes? That is the median of {v2} timings of a single one.",
    "es": "¿Establecer el tiempo de preparación de {v0} en {v1} minutos? Es la mediana de {v2} mediciones de una unidad."
  },
  {
    "en": "Revision was not saved: {v0}. Correct the wording or list lengths and save again.",
    "es": "No se guardó la revisión: {v0}. Corrige el texto o la cantidad de elementos de las listas y vuelve a guardar."
  },
  {
    "en": "Set {v0}’s prep time to {v1} minutes? That is the median of {v2} timing of a single one.",
    "es": "¿Establecer el tiempo de preparación de {v0} en {v1} minutos? Es la mediana de {v2} medición de una unidad."
  },
  {
    "en": "Approve {v0} for this driver? This authorises one payout of exactly that amount.",
    "es": "¿Aprobar {v0} para este conductor? Esto autoriza un único pago por ese importe exacto."
  },
  {
    "en": "Confirm these terms? Monthly estimate {v0}. Editing them later un-confirms them.",
    "es": "¿Confirmar estas condiciones? Estimación mensual: {v0}. Editarlas después retirará su confirmación."
  },
  {
    "en": "Unverified · {v0} · {v1}. Provider accepted; delivery and reading are not verified.",
    "es": "Sin verificar · {v0} · {v1}. El proveedor aceptó el envío; entrega y lectura sin verificar."
  },
  {
    "en": "Send outcome not verified. Refresh history before taking another action. · {v0}",
    "es": "Resultado del envío sin verificar. Actualiza el historial antes de otra acción. · {v0}"
  },
  {
    "en": "Unverified · {v0}. Provider acceptance does not establish delivery or reading.",
    "es": "Sin verificar · {v0}. La aceptación del proveedor no confirma entrega ni lectura."
  },
  {
    "en": "Change {v0} from {v1} to {v2}? This is what customers are charged on the next order.",
    "es": "¿Cambiar el precio de {v0} de {v1} a {v2}? Este será el importe que se cobrará al cliente en el próximo pedido."
  },
  {
    "en": "Unverified · {v0}. Provider accepted; delivery and reading are not verified.",
    "es": "Sin verificar · {v0}. El proveedor aceptó el envío; entrega y lectura sin verificar."
  },
  {
    "en": "Unverified · {v0} · Provider receipt: {v1} · {v2}. No provider acceptance verified.",
    "es": "Sin verificar · {v0} · Comprobante del proveedor: {v1} · {v2}. No se verificó la aceptación del proveedor."
  },
  {
    "en": "Confirm the full {v0} for invoice {v1} was received. Reference: {v2}. Mark paid?",
    "es": "Confirma que se recibió el importe completo de {v0} para la factura {v1}. Referencia: {v2}. ¿Marcar como pagada?"
  },
  {
    "en": "Unverified · {v0} · Provider receipt: {v1}. No provider acceptance verified.",
    "es": "Sin verificar · {v0} · Comprobante del proveedor: {v1}. No se verificó la aceptación del proveedor."
  },
  {
    "en": "Unverified · Provider receipt: {v0} · {v1}. No provider acceptance verified.",
    "es": "Sin verificar · Comprobante del proveedor: {v0} · {v1}. No se verificó la aceptación del proveedor."
  },
  {
    "en": "{v0} Showing saved history only. New approvals and sends stay disabled.",
    "es": "{v0} Se muestra solo el historial guardado. Las nuevas aprobaciones y los envíos siguen desactivados."
  },
  {
    "en": "Cannot approve this email: {v0} Use Review / send this quote to retry.",
    "es": "No se puede aprobar este correo: {v0} Usa «Revisar o enviar esta cotización» para reintentar."
  },
  {
    "en": "Unverified · Provider receipt: {v0}. No provider acceptance verified.",
    "es": "Sin verificar · Comprobante del proveedor: {v0}. No se verificó la aceptación del proveedor."
  },
  {
    "en": "Send outcome unconfirmed. Check message history before retrying. {v0}",
    "es": "Resultado del envío sin confirmar. Consulta el historial de mensajes antes de reintentar. {v0}"
  },
  {
    "en": "Weeks after week {v0} have {v1} dish(es). Saving removes them. Continue?",
    "es": "Las semanas posteriores a la semana {v0} tienen {v1} plato(s). Guardar los eliminará. ¿Continuar?"
  },
  {
    "en": "Delete the template “{v0}”? Campaigns already sent are not affected.",
    "es": "¿Eliminar la plantilla «{v0}»? No afecta las campañas ya enviadas."
  },
  {
    "en": "{v0} Do not create another checkout until the quote list is checked.",
    "es": "{v0} No crees otro enlace de pago hasta revisar la lista de cotizaciones."
  },
  {
    "en": "Opened saved draft · version {v0}. No checkout or message created.",
    "es": "Borrador guardado abierto · versión {v0}. No se creó enlace de pago ni mensaje."
  },
  {
    "en": "Approve {v0} to be charged automatically to this account’s card?",
    "es": "¿Aprobar el cobro automático de {v0} a la tarjeta registrada de esta cuenta?"
  },
  {
    "en": "Restore the shipped {v0} page? Your edited text will be removed.",
    "es": "¿Restaurar la versión original de la página {v0}? Se eliminará tu texto editado."
  },
  {
    "en": "Set the hourly rate for {v0} to none? This change is recorded.",
    "es": "¿Quitar la tarifa por hora de {v0}? Este cambio queda registrado."
  },
  {
    "en": "Unsent reviewed text retained (not sent by this request): {v0}",
    "es": "Se conservó el texto revisado sin enviar (esta solicitud no lo envió): {v0}"
  },
  {
    "en": "Draft saved · version {v0}. No checkout created; nothing sent.",
    "es": "Borrador guardado · versión {v0}. No se creó enlace de pago ni se envió nada."
  },
  {
    "en": "Preview unavailable: {v0} Retry the preview before continuing.",
    "es": "Vista previa no disponible: {v0} Vuelve a cargarla antes de continuar."
  },
  {
    "en": "{v0} dates added to this unsaved draft. Review before saving.",
    "es": "Se agregaron {v0} fechas a este borrador sin guardar. Revisa antes de guardar."
  },
  {
    "en": "Auto-build and offer the most efficient routes for {v0} now?",
    "es": "¿Crear y ofrecer ahora las rutas más eficientes para {v0}?"
  },
  {
    "en": "Set the hourly rate for {v0} to ${v1}? This change is recorded.",
    "es": "¿Establecer la tarifa por hora de {v0} en ${v1}? Este cambio queda registrado."
  },
  {
    "en": "Reset PIN for {v0}? They'll set a new one on next sign-in.",
    "es": "¿Restablecer el PIN de {v0}? Configurará uno nuevo al volver a iniciar sesión."
  },
  {
    "en": "{v0} callback request · {v1} with saved calendar verification.",
    "es": "{v0} solicitud de llamada · {v1} con verificación guardada del calendario."
  },
  {
    "en": "Only {v0} day(s) with activity — too few to plot a trend.",
    "es": "Solo hay {v0} día(s) con actividad; no bastan para trazar una tendencia."
  },
  {
    "en": "{v0} Nothing was sent. The saved activity is shown below.",
    "es": "{v0} No se envió nada. La actividad guardada aparece abajo."
  },
  {
    "en": "Saved revision {v0}. Public menu now uses these settings.",
    "es": "Revisión {v0} guardada. El menú público ya usa estos ajustes."
  },
  {
    "en": "last {v0} days · people who did real work · humans only",
    "es": "Últimos {v0} días · personas que hicieron trabajo real · solo humanos"
  },
  {
    "en": "Enter a whole finished quantity between zero and {v0}.",
    "es": "Ingresa una cantidad entera de productos terminados entre cero y {v0}."
  },
  {
    "en": "Unverified · {v0} · {v1}. No provider acceptance verified.",
    "es": "Sin verificar · {v0} · {v1}. No se verificó la aceptación del proveedor."
  },
  {
    "en": "{v0} characters. A blank line starts a new paragraph.",
    "es": "{v0} caracteres. Una línea vacía inicia un párrafo nuevo."
  },
  {
    "en": "Daily active staff · peak {v0} · {v1} days with activity",
    "es": "Personal activo por día · máximo {v0} · {v1} días con actividad"
  },
  {
    "en": "Check or retry the same reviewed request for {v0}? {v1}",
    "es": "¿Consultar o reintentar la misma solicitud revisada para {v0}?\n\n{v1}"
  },
  {
    "en": "Unverified · {v0}. No provider acceptance verified.",
    "es": "Sin verificar · {v0}. No se verificó la aceptación del proveedor."
  },
  {
    "en": "{v0} of {v1} items shown · Unsaved edits stay visible.",
    "es": "Se muestran {v0} de {v1} artículos · Los cambios sin guardar siguen visibles."
  },
  {
    "en": "{v0} Refresh to verify the saved automation state.",
    "es": "{v0} Actualiza para verificar el estado guardado de la automatización."
  },
  {
    "en": "Not saved. Reload the review before retrying. {v0}",
    "es": "No se guardó. Recarga la revisión antes de reintentar. {v0}"
  },
  {
    "en": "{v0} lines · {v1} · {v2} still needs a name and a price",
    "es": "{v0} conceptos · {v1} · a {v2} todavía le falta nombre y precio"
  },
  {
    "en": "Deactivate {v0}? They lose access immediately.",
    "es": "¿Desactivar a {v0}? Perderá el acceso inmediatamente."
  },
  {
    "en": "{v0} line · {v1} · {v2} still needs a name and a price",
    "es": "{v0} concepto · {v1} · a {v2} todavía le falta nombre y precio"
  },
  {
    "en": "Send this text to the catering customer? {v0}",
    "es": "¿Enviar este texto al cliente de catering? {v0}"
  },
  {
    "en": "{v0} Nothing was sent by opening this screen.",
    "es": "{v0} Abrir esta pantalla no envió nada."
  },
  {
    "en": "Food {v0} + delivery / setup {v1} = quote total {v2}.",
    "es": "Comida {v0} + entrega y montaje {v1} = total de la cotización {v2}."
  },
  {
    "en": "{v0} / {v1} loaded posts · publicaciones cargadas",
    "es": "{v0} / {v1} publicaciones cargadas"
  },
  {
    "en": "{v0} rows · {v1} new · {v2} already known · {v3} contacts{v4}{v5}",
    "es": "{v0} filas · {v1} nuevas · {v2} ya conocidas · {v3} contactos{v4}{v5}"
  },
  {
    "en": "Enter a valid non-negative value for {v0}.",
    "es": "Ingresa un valor válido y no negativo para {v0}."
  },
  {
    "en": "{v0} loaded — {v1} data row(s). Press Import.",
    "es": "{v0} cargado — {v1} filas de datos. Pulsa Importar."
  },
  {
    "en": "Enabled for requests received after {v0}",
    "es": "Activado para solicitudes recibidas después de {v0}"
  },
  {
    "en": "last {v0} days · first-party, cookieless",
    "es": "últimos {v0} días · datos propios, sin cookies"
  },
  {
    "en": "{v0} pieces · optional +{v1} · not included",
    "es": "{v0} piezas · opcional +{v1} · no incluido"
  },
  {
    "en": "{v0} enrolled{v1} — drafts are in Approvals",
    "es": "{v0} inscritos{v1} — los borradores están en Aprobaciones"
  },
  {
    "en": "Replace the message below with “{v0}”?",
    "es": "¿Reemplazar el mensaje de abajo por «{v0}»?"
  },
  {
    "en": "{v0} Your current edits remain here.",
    "es": "{v0} Tus cambios actuales siguen aquí."
  },
  {
    "en": "Done — {v0} sent, {v1} failed, {v2} skipped.",
    "es": "Finalizado: {v0} enviados, {v1} fallidos, {v2} omitidos."
  },
  {
    "en": "{v0} eligible batch task(s) queued.",
    "es": "Se pusieron en cola {v0} tarea(s) de lote elegibles."
  },
  {
    "en": "“{v0}” already exists. Replace it?",
    "es": "«{v0}» ya existe. ¿Reemplazarlo?"
  },
  {
    "en": "Saved proposals unavailable: {v0}",
    "es": "Propuestas guardadas no disponibles: {v0}"
  },
  {
    "en": "{v0} of {v1} planned items · {v2} days · {v3}",
    "es": "{v0} de {v1} elementos planificados · {v2} días · {v3}"
  },
  {
    "en": "Send this exact text as a {v0}? {v1}",
    "es": "¿Enviar este texto exacto como {v0}?\n\n{v1}"
  },
  {
    "en": "Send invoice {v0} to QuickBooks?",
    "es": "¿Enviar la factura {v0} a QuickBooks?"
  },
  {
    "en": "Throw away {v0} unsaved changes?",
    "es": "¿Descartar {v0} cambios sin guardar?"
  },
  {
    "en": "{v0} follow-ups due · refreshed {v1}",
    "es": "{v0} seguimientos pendientes · actualizado {v1}"
  },
  {
    "en": "Throw away {v0} unsaved change?",
    "es": "¿Descartar {v0} cambio sin guardar?"
  },
  {
    "en": "Actual branded Añejo {v0} email",
    "es": "Correo real de Añejo: {v0}"
  },
  {
    "en": "Needs Dayan confirmation: {v0}",
    "es": "Necesita confirmación de Dayan: {v0}"
  },
  {
    "en": "Show {v0} saved audit details",
    "es": "Mostrar {v0} detalles guardados de auditoría"
  },
  {
    "en": "Loose box · {v0} · {v1} pieces · {v2}",
    "es": "Caja sin montaje · {v0} · {v1} piezas · {v2}"
  },
  {
    "en": "Nothing needed doing. — {v0}",
    "es": "No había nada pendiente. — {v0}"
  },
  {
    "en": "{v0} {v1} branded email preview",
    "es": "Vista previa de correo de Añejo: {v0} {v1}"
  },
  {
    "en": "Loaded saved revision {v0}.",
    "es": "Se cargó la revisión guardada {v0}."
  },
  {
    "en": "Platter · {v0} · {v1} pieces · {v2}",
    "es": "Bandeja · {v0} · {v1} piezas · {v2}"
  },
  {
    "en": "Sending… {v0} sent, {v1} to go.",
    "es": "Enviando… {v0} enviados, {v1} pendientes."
  },
  {
    "en": "Current {v0} label artwork",
    "es": "Diseño actual de etiqueta {v0}"
  },
  {
    "en": "Backup created · {v0} rows",
    "es": "Respaldo creado · {v0} filas"
  },
  {
    "en": "{v0} of {v1} shown · {v2} selected",
    "es": "Se muestran {v0} de {v1} · {v2} seleccionados"
  },
  {
    "en": "{v0} · delivery unverified",
    "es": "{v0} · entrega sin verificar"
  },
  {
    "en": "Staff member created. {v0}",
    "es": "Miembro del personal creado. {v0}"
  },
  {
    "en": "{v0} No request was sent.",
    "es": "{v0} No se envió ninguna solicitud."
  },
  {
    "en": "{v0} — one item per line",
    "es": "{v0} · un elemento por línea"
  },
  {
    "en": "Email invoice {v0} to {v1}?",
    "es": "¿Enviar por correo la factura {v0} a {v1}?"
  },
  {
    "en": "1 unsaved change — {v0}",
    "es": "1 cambio sin guardar — {v0}"
  },
  {
    "en": "{v0} unsaved changes — {v1}",
    "es": "{v0} cambios sin guardar — {v1}"
  },
  {
    "en": "Mark {v0} as paid to {v1}?",
    "es": "¿Marcar {v0} como pagado a {v1}?"
  },
  {
    "en": "{v0} Nothing was sent.",
    "es": "{v0} No se envió nada."
  },
  {
    "en": "👥 Who can order ({v0})",
    "es": "👥 Quién puede pedir ({v0})"
  },
  {
    "en": "Saved {v0}, failed {v1}: {v2}",
    "es": "Guardados {v0}, fallidos {v1}: {v2}"
  },
  {
    "en": "{v0} (email not sent)",
    "es": "{v0} (correo sin enviar)"
  },
  {
    "en": "now {v0} · not saved",
    "es": "ahora {v0} · sin guardar"
  },
  {
    "en": "Persona creada. {v0}",
    "es": "Persona creada. {v0}"
  },
  {
    "en": "{v0} photos loaded.",
    "es": "Se cargaron {v0} fotos."
  },
  {
    "en": "Submitted for {v0}",
    "es": "Enviado para {v0}"
  },
  {
    "en": "🔔 {v0} new orders!",
    "es": "🔔 ¡{v0} pedidos nuevos!"
  },
  {
    "en": "🔔 {v0} new order!",
    "es": "🔔 ¡{v0} pedido nuevo!"
  },
  {
    "en": "{v0} KB of HTML.",
    "es": "{v0} KB de HTML."
  },
  {
    "en": "Saved all {v0}.",
    "es": "Se guardaron los {v0}."
  },
  {
    "en": "saving 0/{v0}…",
    "es": "guardando 0/{v0}…"
  },
  {
    "en": "Subject: {v0}",
    "es": "Asunto: {v0}"
  },
  {
    "en": "{v0} lines · {v1}",
    "es": "{v0} conceptos · {v1}"
  },
  {
    "en": "saving {v0}{v1}/{v2}…",
    "es": "guardando {v0}{v1}/{v2}…"
  },
  {
    "en": "{v0} approved{v1}",
    "es": "{v0} aprobados{v1}"
  },
  {
    "en": "{v0} line · {v1}",
    "es": "{v0} concepto · {v1}"
  },
  {
    "en": "Saved · {v0}",
    "es": "Guardado · {v0}"
  },
  {
    "en": "To: {v0} · {v1}",
    "es": "Para: {v0} · {v1}"
  },
  {
    "en": "Refund {v0}",
    "es": "Reembolsar {v0}"
  },
  {
    "en": "To: {v0}",
    "es": "Para: {v0}"
  },
  {
    "en": "now {v0}",
    "es": "ahora {v0}"
  }
];
  if (window.AnejoI18n && typeof window.AnejoI18n.extend === "function") window.AnejoI18n.extend(boundaryDictionary);
  else (window.__hubI18nQueue = window.__hubI18nQueue || []).push(boundaryDictionary);
  if (window.AnejoI18n && typeof window.AnejoI18n.extendPatterns === "function") window.AnejoI18n.extendPatterns(boundaryPatterns);
  else window.__anejoI18nPatterns = (window.__anejoI18nPatterns || []).concat(boundaryPatterns);

  // Authored HTML fragments and populated record labels; stored customer text is never translated.
  var fragmentDictionary = {
  "Next follow-up:": "Próximo seguimiento:",
  "· Submitted entry page:": "· Página de entrada enviada:",
  "· Browsing path not recorded": "· Recorrido de navegación sin registrar",
  "brand": "marca",
  "A customer": "Un cliente",
  "The library could not be loaded.": "No se pudo cargar la biblioteca.",
  "Provider accepted; local receipt needs reconciliation": "Aceptado por el proveedor; el comprobante local necesita conciliación",
  "Text accepted by provider; delivery unverified": "Texto aceptado por el proveedor; entrega sin verificar",
  "A saved prep request belongs to another signed-in operator. Reconcile it before starting again.": "Una solicitud de preparación guardada pertenece a otro operador con sesión iniciada. Concíliala antes de volver a empezar.",
  "Arriving-soon sent": "Aviso de próxima llegada enviado",
  "Batch timer stopped · Cronómetro detenido": "Cronómetro del lote detenido",
  "Confirmed ✓": "Confirmado ✓",
  "Could not archive the item.": "No se pudo archivar el artículo.",
  "Could not close the run": "No se pudo cerrar la ronda",
  "Could not file that": "No se pudo registrar",
  "Could not save today’s count.": "No se pudo guardar el conteo de hoy.",
  "Customer notified — on the way": "Cliente avisado: en camino",
  "Delivered — customer notified": "Entregado: cliente avisado",
  "Deliveries started": "Entregas iniciadas",
  "Enter valid non-negative amounts.": "Ingresa importes válidos que no sean negativos.",
  "Give it a title": "Ponle un título",
  "Instagram provider acceptance recorded. Delivery and read status are not verified.": "Aceptación del proveedor de Instagram registrada. La entrega y la lectura no están verificadas.",
  "Marked unavailable": "Marcado como no disponible",
  "Navigation opened": "Navegación abierta",
  "No new reply was sent by your request. Your text is retained; review a new request separately.": "Tu solicitud no envió ninguna respuesta nueva. El texto se conserva; revisa una solicitud nueva por separado.",
  "Order accepted": "Pedido aceptado",
  "Order denied — passing to another driver": "Pedido rechazado: se ofrece a otro conductor",
  "Photo saved · Foto guardada": "Foto guardada",
  "Recovery storage unavailable. No preparation change was sent.": "Almacenamiento de recuperación no disponible. No se envió ningún cambio de preparación.",
  "Reply history unavailable; sending paused.": "Historial de respuestas no disponible; envío pausado.",
  "Saved — missing bowls flagged": "Guardado: bowls faltantes señalados",
  "Say what you found": "Indica qué encontraste",
  "Submitted + vendor notified": "Enviado y proveedor avisado",
  "Take a photo, or check “couldn’t take a photo”.": "Toma una foto o marca «no pude tomar una foto».",
  "The photo could not be read. Please retake it. · No se pudo leer la foto.": "No se pudo leer la foto. Vuelve a tomarla.",
  "Today’s run is already closed": "La ronda de hoy ya está cerrada",
  "Use 1–1,000 characters with no leading or trailing whitespace. The reviewed text will be sent exactly.": "Usa de 1 a 1,000 caracteres, sin espacios al inicio ni al final. El texto revisado se enviará exactamente como aparece.",
  "Write at least one line": "Escribe al menos una línea",
  "You’re available for orders": "Estás disponible para pedidos",
  "Say what you are starting. · ¿Qué vas a empezar?": "Indica qué vas a empezar.",
  "🔔 New order — Order": "🔔 Nuevo pedido: Pedido",
  "+ ½ avocado": "+ ½ aguacate",
  "Continue prep & packing": "Continuar preparación y empaque",
  "Driver handoff": "Entrega al conductor",
  "Fresh stock, recipe, and target checks allow this batch.": "La vigencia del conteo de existencias, la receta y el objetivo permiten este lote.",
  "Stock checks pass; this plan remains off until an owner enables it.": "Las comprobaciones de existencias pasan; este plan sigue desactivado hasta que un propietario lo active.",
  "About notifications and progress": "Sobre los avisos y este progreso",
  "Address confirmed by the customer but not verified": "Dirección confirmada por el cliente, pero sin verificar",
  "Adjust cooking duration": "Ajustar tiempo de cocción",
  "As purchased": "Tal como se compra",
  "At the kitchen": "En la cocina",
  "Below par": "Por debajo del mínimo",
  "Change your PIN": "Cambiar tu PIN",
  "Close editor": "Cerrar editor",
  "Confirm count": "Confirmar conteo",
  "Cook temperature": "Temperatura de cocción",
  "Cooked / Cocido": "Cocido",
  "Cooking & doneness": "Cocción y punto",
  "Count / Unidades": "Unidades",
  "Create draft": "Crear borrador",
  "Draft recipe": "Borrador de receta",
  "Eastern time. Cooking and packing reflect the saved actions above. Purchases are recorded per item. Other checkboxes are planning reminders.": "Hora del Este. Cocina y empaque reflejan las acciones guardadas arriba. Las compras se registran por artículo. Las demás casillas son recordatorios de planificación.",
  "Edit event quantity / note": "Editar cantidad / nota",
  "Equipment cleaned + off": "Equipo limpio y apagado",
  "Equipment powered + checked": "Equipo encendido y revisado",
  "Estimated kitchen hours": "Horas de cocina estimadas",
  "Event workspace": "Espacio del evento",
  "Event-specific adjustment": "Ajustado para este evento",
  "Expired stock": "Existencias vencidas",
  "Loading saved event progress…": "Cargando progreso guardado del evento…",
  "Mark purchased": "Marcar comprado",
  "Needs confirmation": "Necesita confirmación",
  "No count timestamp recorded": "Fecha y hora del conteo sin registrar",
  "No documents found.": "No se encontraron documentos.",
  "No ingredients calculated. Confirm recipes or add items for this event.": "No hay ingredientes calculados. Confirma las recetas o agrega artículos para este evento.",
  "No items yet.": "Aún no hay artículos.",
  "No reviewed production plans yet.": "Aún no hay planes de producción revisados.",
  "Not needed": "No se necesita",
  "Not supplied": "No proporcionado",
  "Not today": "Hoy no",
  "Open / edit master recipe": "Ver / editar receta maestra",
  "Open reference": "Abrir referencia",
  "Ordered quantities. Each dish keeps its own saved progress.": "Cantidades del pedido. Cada plato conserva su progreso guardado.",
  "Packaging & plating": "Empaque y presentación",
  "Packaging/plating": "Empaque/presentación",
  "Production plans are reviewed and enabled by an owner. You can work queued kitchen tasks below.": "Los planes de producción los revisa y activa un propietario. Puedes trabajar en las tareas de cocina en cola que aparecen abajo.",
  "Quantities for this event. Edits do not change the master recipe.": "Cantidades para este evento. Los cambios no alteran la receta maestra.",
  "Raw / Crudo": "Crudo",
  "Reconfirm changed menu": "Reconfirmar cambio de menú",
  "Recorded yield: Unavailable": "Rendimiento registrado: no disponible",
  "Remove from needed purchases": "Quitar de compras pendientes",
  "Review production plan": "Revisar plan de producción",
  "Review standard": "Revisar estándar",
  "Sauces prepped + labeled": "Salsas preparadas y etiquetadas",
  "Schedule and task checklist": "Cronograma y lista de tareas",
  "Serving time is when the food must be ready at the event. Travel and setup are separate durations.": "La hora de servicio es cuando la comida debe estar lista en el evento. Viaje y montaje son duraciones distintas.",
  "Serving time needed": "Falta hora de servicio",
  "Setup duration · minutes": "Duración del montaje · minutos",
  "Source: event recipes": "Fuente: recetas del evento",
  "Temperature and carrier": "Temperatura y transporte",
  "These are durations, not clock times. Change the event serving time under Details.": "Estas son duraciones, no horas del reloj. Cambia la hora de servicio del evento en Detalles.",
  "Travel duration · minutes": "Duración del viaje · minutos",
  "Unconfirmed legacy reference — Needs Dayan confirmation. Publication alone is not owner approval.": "Referencia heredada sin confirmar — Necesita confirmación de Dayan. Publicarla por sí solo no equivale a la aprobación del propietario.",
  "Unresolved questions": "Preguntas pendientes",
  "Vegetables washed + cut": "Vegetales lavados y cortados",
  "Verified source": "Fuente verificada",
  "View action": "Ver acción",
  "in range": "dentro del rango",
  "out of range": "fuera del rango",
  "⚠️ Customer confirmed this address, but we couldn't verify it — double-check on arrival.": "⚠️ El cliente confirmó esta dirección, pero no pudimos verificarla; compruébala al llegar.",
  "⚠️ Unverified": "⚠️ Sin verificar",
  "📍 Arriving soon": "📍 Próxima llegada",
  "🧭 Navigate (notify customer)": "🧭 Navegar (avisar al cliente)",
  "🧭 Re-open navigation": "🧭 Volver a abrir navegación",
  "(reduce other fats to hold target)": "(reducir otras grasas para mantener el objetivo)",
  "(reduce other fats to keep target)": "(reducir otras grasas para mantener el objetivo)",
  "0/7 checked": "0/7 revisados",
  "1 · Inside · 2 · Closed & packed": "1 · Interior · 2 · Cerrado y empacado",
  "28 bowls today (16 lunch / 12 dinner) · ⚠ 2 low": "28 bowls hoy (16 almuerzo / 12 cena) · ⚠ 2 bajos",
  "3 lb / 30 pieces": "3 lb / 30 piezas",
  "4 stops on today": "4 paradas hoy",
  "A reservation is a planning record. Stock is not consumed and finished food is not counted until completion is recorded.": "Una reserva es un registro de planificación. Las existencias no se consumen y los productos terminados no se contabilizan hasta registrar la finalización.",
  "All stops handled 🎉": "Todas las paradas atendidas 🎉",
  "Approved recipe reference": "Referencia de receta aprobada",
  "Ask the owner to assign you a role (kitchen, driver, marketing, or vendor).": "Pídele al propietario que te asigne un rol (cocina, conductor, marketing o proveedor).",
  "Batch yield:": "Rendimiento del lote:",
  "Catalog SKU": "SKU del catálogo",
  "Choose exact menu item": "Elige el artículo exacto del menú",
  "Choose item": "Elige artículo",
  "Choose measure": "Elige medida",
  "Choose menu item": "Elige artículo del menú",
  "Choose published recipe": "Elige receta publicada",
  "Choose type": "Elige tipo",
  "Confirm date · Confirm serving time": "Confirmar fecha · Confirmar hora de servicio",
  "ETA 7:38": "Llegada estimada 7:38",
  "End of session report": "Reporte de fin de sesión",
  "Event date · Eastern time": "Fecha del evento · Hora del Este",
  "Exact menu unit conversions": "Conversiones exactas de unidades del menú",
  "Historical paid cost · current stock unknown from receipt": "Costo pagado histórico · existencias actuales desconocidas según el recibo",
  "Ingredient amounts are reserved for the planned batch. Any shortfall must be explained.": "Las cantidades de ingredientes se reservan para el lote planificado. Debe explicarse cualquier faltante.",
  "Inventory ID": "ID de inventario",
  "Item / Ingrediente": "Ingrediente",
  "Loading production plans, recipes, and tasks…": "Cargando planes de producción, recetas y tareas…",
  "Make me available for more orders": "Hacerme disponible para más pedidos",
  "Measured now": "Medido ahora",
  "My quick card": "Mi tarjeta rápida",
  "No bowls to load.": "No hay bowls que cargar.",
  "No matching catalog items.": "No hay artículos del catálogo que coincidan.",
  "No specific assignee": "Sin persona asignada específica",
  "Nothing to show.": "No hay nada que mostrar.",
  "Nutrition (approx)": "Nutrición (aproximada)",
  "One line": "Una línea",
  "Please sign in to use the Añejo HUB.": "Inicia sesión para usar Añejo HUB.",
  "Portion & batch yield": "Porción y rendimiento del lote",
  "Prep / cook:": "Preparación / cocción:",
  "Recipe portions per sale unit": "Porciones de receta por unidad de venta",
  "Record completion": "Registrar finalización",
  "Remove catalog link": "Quitar enlace del catálogo",
  "Reserved requirements": "Requisitos reservados",
  "Reviewed requirements and stock basis": "Requisitos revisados y base de existencias",
  "Run this once a day": "Ejecuta esto una vez al día",
  "Saved recipe reference": "Referencia de receta guardada",
  "Saving any count stamps the current time automatically; it cannot be backdated here.": "Guardar cualquier conteo registra automáticamente la hora actual; aquí no puede fecharse retroactivamente.",
  "Steak 5.6oz · Quinoa 3.4oz…": "Bistec 5.6oz · Quinoa 3.4oz…",
  "Submit to vendor": "Enviar al proveedor",
  "Suggested batch: Unavailable · Plan enabled": "Lote sugerido: no disponible · Plan activado",
  "Suggested batch: Unavailable · Plan off": "Lote sugerido: no disponible · Plan desactivado",
  "Tap “Complete route” above, then make yourself available for more orders.": "Toca «Completar ruta» arriba y luego ponte disponible para más pedidos.",
  "Training & tutorials": "Capacitación y tutoriales",
  "Unit / Unidad": "Unidad",
  "Waiting for the owner to carry it out.": "Esperando que el propietario lo ejecute.",
  "Weight basis": "Base del peso",
  "Your account is signed in but has no HUB role yet.": "Tu cuenta inició sesión, pero aún no tiene un rol del HUB.",
  "on hand 3 · par 12 · $0.90/ea": "disponibles 3 · mínimo 12 · $0.90/unidad",
  "oz / lb / each": "oz / lb / unidad",
  "per bowl": "por bowl",
  "· 45 min · Ready by": "· 45 min · Listo para",
  "· ordered": "· pedidos",
  "½ avocado": "½ aguacate",
  "− no pickled onion": "− sin cebolla encurtida",
  "⏱ 12:40 left": "⏱ Quedan 12:40",
  "☀️ Good morning": "☀️ Buenos días",
  "☀️ Morning briefing": "☀️ Resumen matutino",
  "⚡ RUSH": "⚡ URGENTE",
  "✓ confirmed": "✓ confirmado",
  "📷 Photos / Fotos — Upload & start a post": "📷 Fotos · Cargar e iniciar una publicación",
  "🧭 Navigate full route": "🧭 Navegar por la ruta completa",
  "Publish Reel": "Publicar Reel",
  "Publish now": "Publicar ahora",
  "Publish to Story": "Publicar en historia",
  "This makes the saved content available for answers; it does not send or publish anything.": "Esto permite usar el contenido guardado para responder; no envía ni publica nada.",
  "📊 Stories report different metrics (views, replies, exits) that this HUB does not fetch yet — check them in the Instagram app.": "📊 Las historias tienen métricas distintas (visualizaciones, respuestas, salidas) que este HUB aún no consulta; revísalas en Instagram.",
  "📷 Upload a photo": "📷 Subir una foto",
  "Checks saved media processing at Meta. Does not publish or schedule.": "Consulta el procesamiento de los archivos guardados en Meta. No publica ni programa.",
  "One photo or video — Instagram allows only one on a Story.": "Una foto o un video: Instagram solo permite uno por historia.",
  "One video — Instagram allows only one on a Reel.": "Un video: Instagram solo permite uno por Reel.",
  "Paste the key of an MP4/MOV already staged in R2 below — video upload from this screen is not available yet.": "Pega abajo la clave de un MP4/MOV ya almacenado en R2; esta pantalla aún no permite subir videos.",
  "Post it at": "Publicarlo a las",
  "Review saved source design": "Revisar el diseño de origen guardado",
  "itself, in which case the design is left alone.": "por sí misma; en ese caso, el diseño no se modifica.",
  "or paste a Studio image key": "o pega una clave de imagen de Studio",
  "or paste a Studio image/video key": "o pega una clave de imagen/video de Studio",
  "📊 No performance data yet — the daily sweep collects it.": "📊 Aún no hay datos de rendimiento; la revisión diaria los recopila.",
  "(no caption)": "(sin texto)",
  "AI retouch — experimental preview / Retoque IA experimental": "Retoque con IA · vista previa experimental",
  "Advanced creative tools / Herramientas creativas avanzadas": "Herramientas creativas avanzadas",
  "Attention / Atención": "Atención",
  "Audit saved draft": "Auditar borrador guardado",
  "Auto-publish ON": "Publicación automática ACTIVADA",
  "Blank line starts a new paragraph.": "Una línea en blanco inicia un párrafo nuevo.",
  "Bright and clean / Luminoso y limpio": "Luminoso y limpio",
  "Category is inferred from the provider diagnostic; it does not prove the underlying cause. Raw provider content is not stored.": "La categoría se deduce del diagnóstico del proveedor; no demuestra la causa subyacente. No se guarda el contenido sin procesar del proveedor.",
  "Comma-separated, max 5. Only these addresses receive it — no customer is touched. Consent is not checked here (you do not need your own permission to email yourself), but a bounced address is still skipped.": "Separadas por comas, máximo 5. Solo estas direcciones lo reciben; no se contacta a ningún cliente. Aquí no se comprueba el consentimiento (no necesitas darte permiso para enviarte un correo), pero se omiten las direcciones que hayan rebotado.",
  "Could not count that segment.": "No se pudo contar ese segmento.",
  "Dates to confirm": "Fechas por confirmar",
  "Drafts / Borradores": "Borradores",
  "Editorial design": "Diseño editorial",
  "Event or lifestyle": "Evento o ambiente",
  "Every text ends with “Reply STOP to opt out.” — added automatically if you don’t write it. Only people who gave express consent for": "Cada mensaje termina con «Reply STOP to opt out.»; se agrega automáticamente si no lo escribes. Solo se incluye a las personas que dieron consentimiento expreso para",
  "Evidence gate: structured claim review. Original model judgment (unverified): —": "Control de evidencia: revisión estructurada de afirmaciones. Evaluación original del modelo (sin verificar): —",
  "Generated by AI — replace with a real photo when you have one": "Generada con IA: reemplázala por una foto real cuando tengas una",
  "JPEG from your phone/computer uploads here; an MP4/MOV Story needs a key already staged in R2, pasted above — video upload from this screen is not available yet.": "Aquí puedes subir un JPEG desde tu teléfono o computadora; una historia MP4/MOV necesita una clave ya almacenada en R2, pegada arriba. Esta pantalla aún no permite subir videos.",
  "Live / Publicadas": "Publicadas",
  "MP4 or MOV, already staged in R2 — video upload from this screen is not available yet, paste the key above.": "MP4 o MOV ya almacenado en R2; esta pantalla aún no permite subir videos. Pega la clave arriba.",
  "Made by the image provider — still just a preview.": "Creada por el proveedor de imágenes; sigue siendo una vista previa.",
  "Message format": "Formato del mensaje",
  "Natural polish / Mejora natural": "Mejora natural",
  "No CTA link specified": "No se especificó un enlace de llamada a la acción",
  "No links yet.": "Aún no hay enlaces.",
  "No reference photos yet.": "Aún no hay fotos de referencia.",
  "No rules yet.": "Aún no hay reglas.",
  "Nothing has been attributed to a rule, brief, category or format yet.": "Aún no se ha atribuido nada a una regla, un brief, una categoría o un formato.",
  "Off — internal HUB guidance only": "Desactivado: solo orientación interna del HUB",
  "Only an owner can enable an active saved rule with a current update timestamp.": "Solo un propietario puede habilitar una regla guardada activa con una fecha de actualización vigente.",
  "PO Box": "Apartado postal",
  "Paste the full HTML document, or pick a file above.": "Pega el documento HTML completo o elige un archivo arriba.",
  "Photo polish — original pixels / Ajuste fotográfico": "Ajuste fotográfico · píxeles originales",
  "Photo to make:": "Foto que se creará:",
  "Pick a .html file and it loads into the box below. Nothing is uploaded — the file is read here in the browser.": "Elige un archivo .html para cargarlo en el cuadro de abajo. No se sube nada: el archivo se lee aquí, en el navegador.",
  "Postal address on marketing email": "Dirección postal en los correos de marketing",
  "Preview it": "Ver vista previa",
  "Previous audit details": "Detalles de la auditoría anterior",
  "Recheck assets": "Volver a comprobar archivos",
  "Removed / Eliminadas": "Eliminadas",
  "Resume sending": "Reanudar envío",
  "Review covers the saved Hub source design, not independent verification of Instagram pixels. It does not change the live post.": "La revisión abarca el diseño de origen guardado en Hub, sin verificar por separado los píxeles de Instagram. No modifica la publicación en vivo.",
  "Review findings": "Hallazgos de la revisión",
  "Review the actual food, packaging, emblem and wording before using. Template placement is not automatic food recognition.": "Revisa la comida, el empaque, el emblema y el texto reales antes de usarlo. La posición en la plantilla no reconoce automáticamente los alimentos.",
  "Review the files and their order, then upload. Uploading alone does not attach them.": "Revisa los archivos y su orden antes de subirlos. Subirlos no los adjunta.",
  "Send test to": "Enviar prueba a",
  "Several products together": "Varios productos juntos",
  "Single product": "Un producto",
  "Still queued": "Sigue en cola",
  "Template file": "Archivo de plantilla",
  "The center is protected geometrically. Review the actual food, packaging, emblem and wording before using. Template placement is not automatic food recognition.": "El centro se protege geométricamente. Revisa la comida, el empaque, el emblema y el texto reales antes de usarlo. La posición en la plantilla no reconoce automáticamente los alimentos.",
  "The scheduler is not configured yet, so a scheduled campaign would not send.": "El programador aún no está configurado, por lo que una campaña programada no se enviaría.",
  "The scheduler is not configured, so this will": "El programador no está configurado, así que esto",
  "The upload outcome is unknown. No media attachment was requested. Refresh the saved post before starting a new selection.": "Se desconoce el resultado de la subida. No se solicitó adjuntar archivos. Actualiza la publicación guardada antes de iniciar una nueva selección.",
  "There is a": "Hay una",
  "This is a rejected auditor observation, not a verified defect in your design.": "Esta es una observación rechazada del auditor, no un defecto verificado de tu diseño.",
  "This is a rejected review request, not a verified defect in your design.": "Esta es una solicitud de revisión rechazada, no un defecto verificado de tu diseño.",
  "Training rules": "Reglas de capacitación",
  "Try refreshing. Your campaign status has not been verified.": "Intenta actualizar. El estado de tu campaña no se ha verificado.",
  "Turn on": "Activar",
  "Validate assets": "Validar archivos",
  "View on Instagram →": "Ver en Instagram →",
  "Warm editorial / Editorial cálido": "Editorial cálido",
  "Your local time. The audience is worked out when it fires, not now — so anyone who joins between now and then is included.": "Tu hora local. La audiencia se calcula cuando se ejecuta, no ahora; incluye a quienes se sumen entre este momento y el envío.",
  "both satisfy it; you do not have to publish your home address. Fine to leave while you are only testing yourself.": "ambos cumplen este requisito; no tienes que publicar la dirección de tu casa. Puedes dejarlo así mientras solo haces pruebas contigo misma.",
  "by email": "por correo",
  "by text": "por mensaje de texto",
  "item(s)": "artículo(s)",
  "left to send": "pendientes de enviar",
  "or a": "o un",
  "or upload a real one with 📷 below": "o sube una foto real con 📷 abajo",
  "recorded, but no brief, intel, or rules were attributed to it.": "registrado, pero no se le atribuyeron un brief, información de mercado ni reglas.",
  "send on its own. Use “Send now” instead.": "se enviará por sí solo. Usa «Enviar ahora».",
  "texts are included.": "mensajes de texto de marketing.",
  "virtual mailbox": "buzón virtual",
  "— a county is not a postal address, so marketing email does not yet meet CAN-SPAM. A": "; un condado no es una dirección postal, por lo que los correos de marketing aún no cumplen CAN-SPAM. Un",
  "✍️ Drafted for you — review before it goes anywhere": "✍️ Borrador preparado: revísalo antes de enviarlo a cualquier destino",
  "(paste into branding):": "(pegar en identidad de marca):",
  "A compliance footer will be": "Se agregará un pie de cumplimiento",
  "A designed template gets that footer added underneath it — unless the template places": "Ese pie se agrega debajo de una plantilla diseñada, salvo que la plantilla incluya",
  "AI budget": "Presupuesto de IA",
  "AI budget unavailable": "Presupuesto de IA no disponible",
  "Accent line — poster only (optional)": "Línea de acento · solo en póster (opcional)",
  "Adaptive — one brand colour": "Adaptable · un color de marca",
  "All posts": "Todas las publicaciones",
  "Approval is recorded only after the server accepts this exact version. It does not prove Instagram delivery.": "La aprobación solo queda registrada cuando el servidor acepta esta versión exacta. No demuestra la entrega en Instagram.",
  "Approve this version & schedule": "Aprobar esta versión y programar",
  "Asset validation:": "Validación de archivos:",
  "Attaching replaces this post’s saved media in the shown order and requires a fresh audit and review. Caption edits stay separate. Discarding does not delete staged uploads.": "Al adjuntar, se reemplazan los archivos guardados de esta publicación en el orden mostrado y se requiere una auditoría y revisión nuevas. Los cambios de texto se guardan aparte. Descartar no elimina las subidas almacenadas.",
  "Auto — calmest spot": "Automático · zona más despejada",
  "Auto — read the photo": "Automático · analizar la foto",
  "Available training also exceeded the 16,000-character cap; some rows were omitted.": "La capacitación disponible también superó el límite de 16.000 caracteres; se omitieron algunas filas.",
  "AÑEJO · YOUR PHOTOS": "AÑEJO · TUS FOTOS",
  "Background, surface, camera angle, lighting, theme — whatever this campaign needs. The food never changes.": "Fondo, superficie, ángulo de cámara, iluminación, tema: lo que necesite esta campaña. La comida nunca cambia.",
  "Before you send": "Antes de enviar",
  "Bottom centre": "Abajo, al centro",
  "Bottom left": "Abajo, a la izquierda",
  "Bottom right": "Abajo, a la derecha",
  "Brand Auditor · not scored yet": "Auditor de marca · aún sin evaluar",
  "Campaign could not load": "No se pudo cargar la campaña",
  "Campaign look": "Estilo de campaña",
  "Campaign post counts": "Recuento de publicaciones de la campaña",
  "Campaign view": "Vista de campaña",
  "Cancel schedule": "Cancelar programación",
  "Caption — lower left": "Texto · abajo, a la izquierda",
  "Checked: not yet": "Comprobado: aún no",
  "Closing line — poster only (optional)": "Línea de cierre · solo en póster (opcional)",
  "Copies the plan structure only. New copy, media and review are required.": "Copia solo la estructura del plan. Se necesitan texto y archivos nuevos, además de una nueva revisión.",
  "Could not load links.": "No se pudieron cargar los enlaces.",
  "Could not load the inbox.": "No se pudo cargar la bandeja de entrada.",
  "Could not load the ledger.": "No se pudo cargar el registro.",
  "Could not load the performance watch.": "No se pudo cargar el seguimiento de rendimiento.",
  "Could not load the rollup.": "No se pudo cargar el resumen.",
  "Create next draft cycle": "Crear el próximo ciclo en borrador",
  "Current automated audits · unavailable": "Auditorías automáticas actuales · no disponibles",
  "Dates marked suggested have not been scheduled.": "Las fechas sugeridas no se han programado.",
  "EXACT VERSION REVIEW": "REVISIÓN DE LA VERSIÓN EXACTA",
  "Each post must have a current audit and the exact caption, assets, and time reviewed before scheduling.": "Antes de programar, cada publicación debe tener una auditoría vigente y una revisión de su texto, archivos y hora exactos.",
  "Editorial — lower centre": "Editorial · abajo, al centro",
  "Emblem — tree only": "Emblema · solo el árbol",
  "English + Español": "Inglés + español",
  "Enhance photo / Mejorar foto": "Mejorar foto",
  "Exact saved-image hashes and registered render declarations. These do not prove public Instagram pixels, food ingredients, readability, or owner approval. Audit explanations above remain model judgments.": "Hashes exactos de las imágenes guardadas y declaraciones de renderizado registradas. No demuestran los píxeles públicos de Instagram, los ingredientes de la comida, la legibilidad ni la aprobación del propietario. Las explicaciones de auditoría anteriores siguen siendo evaluaciones del modelo.",
  "Explain the example in plain language…": "Explica el ejemplo con palabras sencillas…",
  "Export review manifest": "Exportar manifiesto de revisión",
  "Filter posts / Filtrar publicaciones": "Filtrar publicaciones",
  "Full lockup": "Logotipo completo",
  "Full-frame Reposado keeps the entire photograph and its original shape, adds the real emblem and a fine editorial frame, and chooses readable branding colors. Keep the wording short and inspect the food before using. The named social templates use fixed editorial positions and a consistent shape; where needed, sampled background colors fill extra edges without cropping food. Choose a template with clear space in its title area. The alternate poster style adds height above a short photograph. Accent and closing lines apply to the poster only.": "Reposado a cuadro completo conserva toda la foto y su forma original, agrega el emblema real y un marco editorial fino, y elige colores de marca legibles. Usa un texto breve y revisa la comida antes de utilizarlo. Las plantillas sociales con nombre usan posiciones editoriales fijas y una forma uniforme; cuando hace falta, colores tomados del fondo completan los bordes sin recortar la comida. Elige una plantilla con espacio despejado en el área del título. El estilo alternativo de póster agrega altura sobre una foto corta. Las líneas de acento y cierre solo se aplican al póster.",
  "Generate caption preview / Generar texto": "Generar vista previa del texto",
  "Gmail clips messages around that size and hides the rest behind “View entire message” — including the unsubscribe link, which sits at the bottom.": "Gmail recorta los mensajes de ese tamaño y oculta el resto tras «Ver el mensaje completo», incluido el enlace para cancelar la suscripción, situado al final.",
  "Help me write · Ayúdame a escribir": "Ayúdame a escribir",
  "I reviewed every caption and media asset above, watched each video, and approve this exact version and its dates and times.": "Revisé todos los textos y archivos de arriba, vi cada video y apruebo esta versión exacta con sus fechas y horas.",
  "Internal name": "Nombre interno",
  "JPEG, PNG or WebP. 5MB max.": "JPEG, PNG o WebP. Máximo 5 MB.",
  "Language as written · Format unset": "Idioma tal como está escrito · formato sin definir",
  "Latest 60 posts returned · Últimas 60 publicaciones devueltas": "Últimas 60 publicaciones devueltas",
  "Link not specified": "Enlace sin especificar",
  "Loading replaces the subject, format and message below. It does not change the segment, and it never touches a campaign already sent.": "Al cargar, se reemplazan el asunto, el formato y el mensaje de abajo. No cambia el segmento ni modifica una campaña ya enviada.",
  "Long-lived tokens expire after ~60 days — this usually means it needs renewing.": "Los tokens de larga duración vencen después de unos 60 días; esto suele indicar que hay que renovarlo.",
  "MEDIA FOR ONE POST": "ARCHIVOS DE UNA PUBLICACIÓN",
  "Made by the image provider. Still a draft; add it or discard it.": "Creada por el proveedor de imágenes. Sigue siendo un borrador; agrégala o descártala.",
  "Mark finish": "Acabado de la marca",
  "Mark position": "Posición de la marca",
  "Masthead — top": "Cabecera · arriba",
  "Media not attached": "Archivo sin adjuntar",
  "Media unavailable": "Archivo no disponible",
  "Media, approval and schedule values in the file are ignored. This creates private drafts only. If an import stops, select the same unchanged file to resume.": "Se ignoran los valores de archivos, aprobación y programación del documento. Solo crea borradores privados. Si la importación se interrumpe, selecciona el mismo archivo sin cambios para reanudarla.",
  "Model-classified scope: unknown. Exact caption and registered overlay excerpts are checked against saved source text; this does not prove the model found every claim.": "Alcance clasificado por el modelo: desconocido. Los fragmentos exactos del texto de la publicación y del texto superpuesto registrado se comparan con el texto de origen guardado; esto no demuestra que el modelo haya detectado todas las afirmaciones.",
  "New paid calls pause at the recorded limit or when the ledger is unavailable. In-flight calls and delayed recording can affect the final total.": "Las nuevas llamadas de pago se detienen al alcanzar el límite registrado o cuando el registro no está disponible. Las llamadas en curso y los registros demorados pueden afectar el total final.",
  "Next month": "Próximo mes",
  "No campaign has been drafted yet.": "Aún no se ha preparado ninguna campaña en borrador.",
  "No plate behind the mark and no band behind the wording. The photo underneath is read first, and the mark and the type are inked in whichever kit colour separates from it — gold, cream or deep forest — so they sit on the image instead of on a box.": "Sin placa detrás de la marca ni banda detrás del texto. Primero se analiza la foto de fondo y luego se dibujan la marca y la tipografía con el color de la paleta que más contraste ofrezca: dorado, crema o verde bosque oscuro. Así quedan sobre la imagen, sin un recuadro.",
  "No posts in this view.": "No hay publicaciones en esta vista.",
  "No saved templates yet — write or load one below, then “Save as template”.": "Aún no hay plantillas guardadas: escribe o carga una abajo y luego elige «Guardar como plantilla».",
  "No warnings returned for this version.": "No se devolvieron advertencias para esta versión.",
  "Nobody has opted in to marketing texts yet. That is expected: the consent already on file was collected for order and delivery updates, and nobody was carried over into marketing. This list fills up only as people tick a box that specifically says marketing texts.": "Nadie ha aceptado recibir mensajes de marketing todavía. Es lo esperado: el consentimiento existente se obtuvo para novedades de pedidos y entregas, y no se trasladó a marketing. Esta lista solo se llena cuando alguien marca una casilla que dice específicamente mensajes de marketing.",
  "Nobody in this segment is being excluded.": "No se excluye a nadie de este segmento.",
  "Not attached": "Sin adjuntar",
  "Not audited · current audit not verified": "Sin auditar · auditoría actual sin verificar",
  "Not audited · current snapshot": "Sin auditar · instantánea actual",
  "Offer: Unspecified · CTA: Unspecified": "Oferta: sin especificar · Llamada a la acción: sin especificar",
  "One restrained italic line, and one is enough — the style says so, and the field is capped to keep it that way.": "Una línea breve en cursiva es suficiente: el estilo lo indica y el campo tiene un límite para mantenerlo así.",
  "Optional refinements": "Ajustes opcionales",
  "Or send it later": "O enviarlo después",
  "Original colours": "Colores originales",
  "Original photo preserved. Preview uses an upright sRGB PNG; color handling is browser-declared and needs visual review.": "Foto original conservada. La vista previa usa un PNG sRGB vertical; el navegador declara el tratamiento del color y se necesita revisión visual.",
  "Original photo preserved. This format was not normalized; review its orientation and colors.": "Foto original conservada. Este formato no se normalizó; revisa su orientación y sus colores.",
  "Over 100 KB.": "Más de 100 KB.",
  "Overlay — mark and wording on the photo": "Superposición · marca y texto sobre la foto",
  "Owner reviewed media & warnings · unavailable": "Revisión de archivos y advertencias por el propietario · no disponible",
  "Photo evidence": "Evidencia fotográfica",
  "Plan with Marketing": "Planificar con Marketing",
  "Post details & caption": "Detalles de la publicación y texto",
  "Post type": "Tipo de publicación",
  "Posts / Publicaciones": "Publicaciones",
  "Preview digest: Unavailable · approval cannot be bound": "Resumen de integridad de la vista previa: no disponible · no puede vincularse la aprobación",
  "Preview rebuilt from the preserved photo before recorded editorial overlays. Inspect any branding already present in that photo. Preview uses an upright sRGB PNG; color handling is browser-declared and needs visual review.": "Vista previa reconstruida a partir de la foto conservada, antes de las superposiciones editoriales registradas. Revisa cualquier marca que ya aparezca en esa foto. La vista previa usa un PNG sRGB vertical; el navegador declara el tratamiento del color y se necesita revisión visual.",
  "Preview rebuilt from the preserved photo before recorded editorial overlays. Inspect any branding already present in that photo. This format was not normalized; review its orientation and colors.": "Vista previa reconstruida a partir de la foto conservada, antes de las superposiciones editoriales registradas. Revisa cualquier marca que ya aparezca en esa foto. Este formato no se normalizó; revisa su orientación y sus colores.",
  "Preview — merge tokens shown as sample values": "Vista previa · variables mostradas con valores de ejemplo",
  "Product claim scope": "Alcance de las afirmaciones del producto",
  "Readiness & audit details": "Preparación y detalles de auditoría",
  "Recipients frozen at send": "Destinatarios fijados al enviar",
  "Reference examples": "Ejemplos de referencia",
  "Removed draft": "Borrador eliminado",
  "Removed from the active queue. Restoring keeps it unscheduled.": "Retirado de la cola activa. Al restaurarlo, permanece sin programar.",
  "Reposado poster — full editorial layout": "Póster Reposado · diseño editorial completo",
  "Reposado — Signature Cajita launch": "Reposado · lanzamiento de La Cajita Signature",
  "Reposado — dense food spread": "Reposado · composición de comida abundante",
  "Reposado — full-frame photograph": "Reposado · fotografía a cuadro completo",
  "Reposado — square, lower-edge title": "Reposado · cuadrado, título en el borde inferior",
  "Reposado — tall tray, side title": "Reposado · bandeja vertical, título lateral",
  "Reposado — wide photo, lower-left title": "Reposado · foto horizontal, título abajo a la izquierda",
  "Resolve without retry": "Resolver sin reintentar",
  "Review audit evidence": "Revisar evidencia de auditoría",
  "Review caption changes": "Revisar cambios del texto",
  "Review every image and watch each video. This approval applies only to the captions, assets, and times below.": "Revisa cada imagen y mira cada video. Esta aprobación solo abarca los textos, archivos y horarios de abajo.",
  "Review in Comms →": "Revisar en Comunicaciones →",
  "Review method": "Método de revisión",
  "Review warnings": "Revisar advertencias",
  "Save as template": "Guardar como plantilla",
  "Save changes below. Saving invalidates the previous review; media and scheduling need a fresh review.": "Guarda los cambios abajo. Al guardar, se invalida la revisión anterior; los archivos y la programación requieren una nueva revisión.",
  "Save draft plan": "Guardar plan en borrador",
  "Save example": "Guardar ejemplo",
  "Save the draft first, then you can schedule it.": "Guarda primero el borrador; después podrás programarlo.",
  "Save this draft plan?": "¿Guardar este plan en borrador?",
  "Saved AI declaration: enhanced. Stored history is not proof of authenticity.": "Declaración de IA guardada: mejorada. El historial almacenado no demuestra autenticidad.",
  "Saved AI declaration: not AI-enhanced (declared). Stored history is not proof of authenticity.": "Declaración de IA guardada: sin mejora con IA (declarado). El historial almacenado no demuestra autenticidad.",
  "Saved AI declaration: unknown. Stored history is not proof of authenticity.": "Declaración de IA guardada: desconocida. El historial almacenado no demuestra autenticidad.",
  "Saved design source records": "Registros de origen del diseño guardado",
  "Saved drafts": "Borradores guardados",
  "Saved post IDs and media stay attached. This updates private dates, offer details and the captions shown below; it does not approve or schedule.": "Los IDs de publicaciones guardadas y sus archivos siguen adjuntos. Esto actualiza fechas privadas, detalles de la oferta y los textos de abajo; no aprueba ni programa.",
  "Saved templates": "Plantillas guardadas",
  "Saving text changes resets customer eligibility. Review the updated rule before enabling it again.": "Guardar cambios de texto restablece la elegibilidad para clientes. Revisa la regla actualizada antes de habilitarla de nuevo.",
  "Scheduling unlocks after asset validation and a current review. Each validation step checks up to three assets.": "La programación se habilita después de validar los archivos y contar con una revisión vigente. Cada paso de validación comprueba hasta tres archivos.",
  "Send now…": "Enviar ahora…",
  "Set in Cormorant Garamond, in your own capitalisation. Drawn from these exact characters, never generated — it cannot be misspelled. It resizes and wraps itself to fit the photo.": "Compuesto en Cormorant Garamond, respetando tus mayúsculas y minúsculas. Se dibuja a partir de estos caracteres exactos, sin generarlos, para evitar errores de escritura. Ajusta su tamaño y sus líneas a la foto.",
  "Set up, but Instagram refused the token.": "Configurado, pero Instagram rechazó el token.",
  "Skipped (bounced or complained before)": "Omitidos (rebotaron o presentaron una queja anteriormente)",
  "Small line above (optional)": "Línea pequeña arriba (opcional)",
  "Some of your training did not fit.": "Parte de tu capacitación no cupo.",
  "Source selection reached its 500-row limit; older rows may be omitted.": "La selección de fuentes alcanzó su límite de 500 filas; podrían haberse omitido filas anteriores.",
  "Start with this month’s results and a fresh offer. The next cycle needs its own draft, media review, and approval.": "Empieza con los resultados de este mes y una oferta nueva. El próximo ciclo necesita su propio borrador, revisión de archivos y aprobación.",
  "Stored declarations are not brand approval. Review the actual photo and run its current audit.": "Las declaraciones guardadas no constituyen aprobación de marca. Revisa la foto real y ejecuta su auditoría actual.",
  "Styled variant of the real photo — made by the image provider. Still a draft; add it or discard it.": "Variante estilizada de la foto real, creada por el proveedor de imágenes. Sigue siendo un borrador; agrégala o descártala.",
  "Subject line": "Asunto",
  "Team Lead": "Líder del equipo",
  "The Team Lead reads your cover and plans the rest as ONE story — distinct on-brand frames that flow from it and end on a call-to-action — and writes the wording for each frame so you can paste it straight into branding. Costs against the weekly AI budget: one provider call per new slide.": "El líder del equipo analiza la portada y planifica el resto como UNA historia: fotogramas distintos, acordes con la marca, que fluyen desde ella y terminan con una llamada a la acción. También escribe el texto de cada fotograma para pegarlo directamente en la herramienta de identidad de marca. Se descuenta del presupuesto semanal de IA: una llamada al proveedor por cada diapositiva nueva.",
  "The design or source guidance must be checked again. Visual comparison does not prove image or logo provenance. An audit is not permission to publish.": "Hay que volver a revisar el diseño o las indicaciones de origen. La comparación visual no demuestra la procedencia de la imagen o del logotipo. Una auditoría no autoriza a publicar.",
  "The ledger could not be verified. Paid AI calls are paused; spend and remaining budget are unknown.": "No se pudo verificar el registro. Las llamadas de IA de pago están pausadas; se desconocen el gasto y el presupuesto restante.",
  "The letterspaced line above the headline. Always set in capitals. On a poster this is the subtitle under the title — e.g. PLANT-BASED WELLNESS BOWL.": "La línea con espaciado entre letras sobre el titular. Siempre en mayúsculas. En un póster es el subtítulo bajo el título; por ejemplo, BOWL DE BIENESTAR A BASE DE PLANTAS.",
  "This channel is not configured on the server, so sending will be refused.": "Este canal no está configurado en el servidor, por lo que se rechazará el envío.",
  "This makes a styled variant of a real Añejo photo": "Esto crea una variante estilizada de una foto real de Añejo",
  "This screen is a read-only preview. Review the full captions and every media asset, then give explicit approval for this exact version. Scheduling and provider acceptance require separate evidence.": "Esta pantalla es una vista previa de solo lectura. Revisa los textos completos y todos los archivos; luego da tu aprobación explícita para esta versión exacta. La programación y la aceptación del proveedor requieren evidencia por separado.",
  "Top centre": "Arriba, al centro",
  "Top left": "Arriba, a la izquierda",
  "Top right": "Arriba, a la derecha",
  "Topic / Tema": "Tema",
  "Traditional / Tradicional": "Tradicional",
  "Training read incomplete. One or more sources are unavailable; this is not proof that no guidance exists.": "Lectura de capacitación incompleta. Una o más fuentes no están disponibles; esto no demuestra que no existan indicaciones.",
  "Update private draft plan": "Actualizar plan privado en borrador",
  "Update this private draft plan?": "¿Actualizar este plan privado en borrador?",
  "Use a library photo / Usar foto de biblioteca": "Usar foto de biblioteca",
  "Use caption / Usar texto": "Usar texto",
  "Validation: Not run.": "Validación: no ejecutada.",
  "Visual comparison does not prove image or logo provenance. An audit is not permission to publish.": "La comparación visual no demuestra la procedencia de la imagen o del logotipo. Una auditoría no autoriza a publicar.",
  "What should the rest be about? (optional) — e.g. “the Palm Beach cities we deliver to”. Leave blank and it infers from the cover.": "¿De qué debe tratar el resto? (opcional). Por ejemplo: «las ciudades de Palm Beach donde entregamos». Si lo dejas vacío, se deduce a partir de la portada.",
  "Which bowl": "Qué bowl",
  "Which photo": "Qué foto",
  "Who will NOT get this, and why": "Quién NO lo recibirá y por qué",
  "Why this audit needs review": "Por qué esta auditoría necesita revisión",
  "Wording (optional)": "Texto (opcional)",
  "Wording for each new frame": "Texto de cada fotograma nuevo",
  "You can also use": "También puedes usar",
  "Your template carries the unsubscribe link and postal address itself, so": "Tu plantilla ya incluye el enlace para cancelar la suscripción y la dirección postal, así que",
  "added below your design": "debajo de tu diseño",
  "anywhere in the template.": "en cualquier parte de la plantilla.",
  "declaration readback unavailable or no slides recorded.": "lectura de las declaraciones no disponible o sin diapositivas registradas.",
  "e.g. Clean sips to pair with your bowl.": "Ej.: Bebidas frescas para acompañar tu bowl.",
  "e.g. Order by Thursday": "Ej.: Pide antes del jueves",
  "e.g. Rooted. Warm. Nourishing.": "Ej.: Raíces. Calidez. Nutrición.",
  "e.g. This week only": "Ej.: Solo esta semana",
  "e.g. beach picnic, golden hour": "Ej.: picnic en la playa, luz del atardecer",
  "in your own footer. Both are needed; one on its own still gets the added block.": "en tu propio pie. Ambos son necesarios; si solo incluyes uno, se agrega el bloque de todos modos.",
  "median reach": "mediana del alcance",
  "no campaign context recorded — review the caption before approval.": "no hay un contexto de campaña registrado; revisa el texto antes de aprobar.",
  "nothing is added": "no se agrega nada",
  "people in this segment are excluded.": "personas de este segmento quedan excluidas.",
  "people will receive this": "personas recibirán esto",
  "renders more predictably.": "se muestra de forma más predecible.",
  "stylesheet (usually a webfont). Gmail and Outlook strip it, so the email falls back to the fonts named inline. That is normal, not a fault — it just will not look like the browser.": "como hoja de estilo (normalmente una fuente web). Gmail y Outlook la eliminan, por lo que el correo usa las fuentes indicadas en línea. Es normal, no un fallo; simplemente no se verá igual que en el navegador.",
  "tag. It is removed before sending — no email client runs scripts.": "como etiqueta. Se elimina antes del envío; ningún cliente de correo ejecuta scripts.",
  "vs. without": "frente a sin ella",
  "· browser declaration saved · image bytes matched · layout unverified": "· declaración del navegador guardada · bytes de la imagen coincidentes · diseño sin verificar",
  "· no registered design declaration": "· sin declaración de diseño registrada",
  "· registered output matched": "· salida registrada coincidente",
  "· render receipt unavailable": "· recibo de renderizado no disponible",
  "— it carries the unsubscribe link and the postal address, both legally required. To place them yourself instead, put": ": incluye el enlace para cancelar la suscripción y la dirección postal, ambos obligatorios por ley. Para incluirlos tú misma, coloca",
  "— pick a template —": "— elige una plantilla —",
  "— the design goes out exactly as written.": "; el diseño se envía exactamente como está escrito.",
  "— your local time.": ": tu hora local.",
  "✓ Good example — do this": "✓ Buen ejemplo · haz esto",
  "✕ Avoid — never do this": "✕ Evita esto · nunca lo hagas",
  "🎞️ Generate the rest of a carousel": "🎞️ Generar el resto del carrusel",
  "🏷️ Add branding (logo + optional wording)": "🏷️ Agregar identidad de marca (logo y texto opcional)",
  "🏷️ Category:": "🏷️ Categoría:",
  "📋 Campaign brief:": "📋 Brief de campaña:",
  "📐 Training rules active:": "📐 Reglas de capacitación activas:",
  "📷 Change photo": "📷 Cambiar foto",
  "📷 Photos / Fotos": "📷 Fotos",
  "🖼️ Format:": "🖼️ Formato:",
  "🖼️ Reference variant — same bowl, new scene": "🖼️ Variante de referencia · mismo bowl, nueva escena",
  "off": "desactivado",
  "draft": "borrador",
  "skipped": "omitido",
  "English": "Inglés",
  "Sent": "Enviado",
  "Attach": "Adjuntar",
  "Clear": "Borrar",
  "Currently": "Actualmente",
  "Delete": "Eliminar",
  "Link": "Enlace",
  "not": "no",
  "Audit": "Auditoría",
  "CTA:": "Llamada a la acción:",
  "Calendar": "Calendario",
  "Campaign": "Campaña",
  "Campaigns": "Campañas",
  "Categories": "Categorías",
  "Channel": "Canal",
  "Drafts": "Borradores",
  "Format": "Formato",
  "Layout": "Diseño",
  "List": "Lista",
  "Load": "Cargar",
  "Mark": "Marca",
  "Offer": "Oferta",
  "Published": "Publicado",
  "Reading": "Lectura",
  "Rules": "Reglas",
  "Segment": "Segmento",
  "Show": "Mostrar",
  "Signal": "Señal",
  "Teach": "Enseñar",
  "Thread": "Conversación",
  "comment": "comentario",
  "sample": "muestra",
  "scheduled": "programado",
  "sending": "enviando",
  "Auto-publish on": "Publicación automática activada",
  "Back to manual approval": "Volver a la aprobación manual",
  "Branded slide saved as draft with source record — review before scheduling": "Diapositiva con identidad de marca guardada como borrador con registro de origen; revísala antes de programar",
  "Branded slide source record confirmed — post is currently scheduled": "Registro de origen de la diapositiva con identidad de marca confirmado; la publicación está programada actualmente",
  "Carousel updated": "Carrusel actualizado",
  "Could not add that rule": "No se pudo agregar esa regla",
  "Could not attach the branded photo. Your original is preserved.": "No se pudo adjuntar la foto con identidad de marca. Se conserva tu original.",
  "Could not change that": "No se pudo cambiar eso",
  "Could not publish": "No se pudo publicar",
  "Could not remove": "No se pudo quitar",
  "Could not restore": "No se pudo restaurar",
  "Could not save that example": "No se pudo guardar ese ejemplo",
  "Could not save the branded photo": "No se pudo guardar la foto con identidad de marca",
  "Describe the campaign look first.": "Describe primero el estilo de la campaña.",
  "Draft removed. Restore it from Removed.": "Borrador eliminado. Restáuralo desde Eliminadas.",
  "Example saved": "Ejemplo guardado",
  "Explain the example first": "Explica primero el ejemplo",
  "Give the template a name.": "Dale un nombre a la plantilla.",
  "Nothing to preview yet.": "Aún no hay nada para mostrar en la vista previa.",
  "Paste a video key first.": "Pega primero una clave de video.",
  "Paste the image key first.": "Pega primero la clave de la imagen.",
  "Photo attached, but the list could not refresh. Refresh before adding it again.": "La foto se adjuntó, pero no se pudo actualizar la lista. Actualiza antes de agregarla de nuevo.",
  "Photo attached. Caption edits preserved.": "Foto adjunta. Se conservaron los cambios del texto.",
  "Photo saved in your shared library.": "Foto guardada en tu biblioteca compartida.",
  "Pick a date first.": "Elige primero una fecha.",
  "Pick a photo first.": "Elige primero una foto.",
  "Pick a size first.": "Elige primero un tamaño.",
  "Pick a valid date and time.": "Elige una fecha y una hora válidas.",
  "Pick an image first.": "Elige primero una imagen.",
  "Postal address saved": "Dirección postal guardada",
  "Posted to Instagram": "Publicado en Instagram",
  "Previous request closed without saving. Your edits are preserved.": "La solicitud anterior se cerró sin guardar. Se conservaron tus cambios.",
  "Previous save confirmed. Refresh the queue for its current status.": "Guardado anterior confirmado. Actualiza la cola para consultar su estado actual.",
  "Reply not saved—do not repeat actions blindly.": "La respuesta no se guardó; no repitas acciones sin comprobar el resultado.",
  "Restored as an unscheduled draft": "Restaurado como borrador sin programar",
  "Rule added": "Regla agregada",
  "Rule saved": "Regla guardada",
  "Save your caption changes before auditing": "Guarda los cambios del texto antes de auditar",
  "Save your caption changes before testing": "Guarda los cambios del texto antes de probar",
  "Save your draft changes before switching queues.": "Guarda los cambios del borrador antes de cambiar de cola.",
  "Saved as a draft": "Guardado como borrador",
  "Schedule cancelled — it is a draft again.": "Programación cancelada: vuelve a ser un borrador.",
  "Test recipients saved": "Destinatarios de prueba guardados",
  "That date did not parse.": "No se pudo interpretar esa fecha.",
  "That was already live": "Eso ya estaba publicado",
  "There is nothing to save yet.": "Aún no hay nada que guardar.",
  "Too large — 5MB max.": "Demasiado grande: máximo 5 MB.",
  "Too large — 5MB max. Export a smaller JPEG.": "Demasiado grande: máximo 5 MB. Exporta un JPEG más pequeño.",
  "Unconfirmed previous save retained. Current edits preserved; use Recover previous save.": "Se conserva el guardado anterior sin confirmar. Tus cambios actuales se mantienen; usa Recuperar guardado anterior.",
  "Upload a photo first": "Sube primero una foto",
  "Deleted": "Eliminado",
  "Resolve the pending kitchen save first.": "Resuelve el guardado pendiente de cocina primero.",
  "Equipment powered off and cooled down": "Equipo apagado y enfriado",
  "All prep surfaces cleaned and sanitized": "Todas las superficies de preparación limpias y desinfectadas",
  "Walk-in cooler at safe temperature at close": "Cámara frigorífica a temperatura segura al cerrar",
  "Trash and recycling taken out": "Basura y reciclaje retirados",
  "Leftover product labeled with date and stored": "Producto sobrante etiquetado con fecha y almacenado",
  "Floors swept and mopped": "Pisos barridos y fregados",
  "Kitchen Prep": "Preparación de cocina",
  "Today's recipes/prep list confirmed": "Recetas y lista de preparación de hoy confirmadas",
  "Ingredients pulled and staged": "Ingredientes retirados y preparados en el área de trabajo",
  "Portion sizes checked against spec": "Tamaños de porción revisados contra la especificación",
  "Allergen labels checked and applied": "Etiquetas de alérgenos revisadas y colocadas",
  "Cook temperatures logged for hot-held items": "Temperaturas de cocción registradas para alimentos mantenidos calientes",
  "Kitchen Sanitation": "Higiene de cocina",
  "Handwashing supplies stocked": "Suministros para lavado de manos abastecidos",
  "Sanitizer solution mixed to correct concentration": "Solución desinfectante preparada con la concentración correcta",
  "Dish/wash area clean and organized": "Área de lavado de utensilios limpia y organizada",
  "Food-contact surfaces sanitized between tasks": "Superficies en contacto con alimentos desinfectadas entre tareas",
  "No signs of pests observed": "No se observaron señales de plagas",
  "Driver Vehicle Check": "Revisión del vehículo del conductor",
  "Vehicle interior clean and free of debris": "Interior del vehículo limpio y sin residuos",
  "Fuel level checked and adequate for route": "Nivel de combustible revisado y suficiente para la ruta",
  "Delivery coolers at safe temperature": "Neveras de entrega a temperatura segura",
  "Tires and lights visually checked": "Neumáticos y luces revisados visualmente",
  "Route sheet and delivery docs onboard": "Hoja de ruta y documentos de entrega a bordo",
  "Driver Loadout": "Carga del conductor",
  "Order count matches route manifest": "El conteo de pedidos coincide con el manifiesto de ruta",
  "Bags and containers sealed and labeled": "Bolsas y envases sellados y etiquetados",
  "Cold items packed in coolers with ice packs": "Alimentos fríos empacados en neveras con acumuladores de hielo",
  "Fragile and liquid items secured upright": "Artículos frágiles y líquidos asegurados en posición vertical",
  "Photo of loaded vehicle taken": "Foto del vehículo cargado tomada",
  "Driver Drop-off": "Entrega del conductor",
  "Delivery address confirmed against order": "Dirección de entrega confirmada contra el pedido",
  "Handed to recipient or proof photo taken": "Entregado al destinatario o foto de prueba tomada",
  "Product still within safe temperature at drop-off": "Producto aún dentro del rango de temperatura segura al entregar",
  "Signature captured when required": "Firma registrada cuando se requiere",
  "Delivery marked complete in the app": "Entrega marcada como completada en la aplicación",
  "Open the kitchen Google form. Submitting records the time; it does not reserve hours. Keep the emailed copy.": "Abre el formulario de Google de la cocina. El envío registra la hora; no reserva horas. Conserve la copia recibida por correo.",
  "Open kitchen record": "Abrir registro de la cocina",
  "Update unconfirmed. Retry the saved request.": "Actualización sin confirmar. Reintente la solicitud guardada.",
  "Loading event progress…": "Cargando progreso del evento…",
  "Cooking · minutes": "Cocción · minutos",
  "Confirm the actual visit and complete the required fields.": "Confirme la visita real y complete los campos requeridos.",
  "I confirm this record describes actual kitchen use.": "Confirmo que este registro describe uso real de la cocina.",
  "Correct actual hours": "Corregir horas reales",
  "Email for the copy": "Correo para la copia",
  "Details for the form": "Datos para el formulario",
  "Edit form details": "Editar datos del formulario",
  "Recovery storage is unavailable. The update was not sent.": "El almacenamiento de recuperación no está disponible. No se envió la actualización.",
  "These are durations, not clock times. The serving time is changed in Details.": "Estas son duraciones, no horas del reloj. La hora de servicio se cambia en Detalles.",
  "This records your declaration. The Hub does not submit the form or verify your receipt.": "Esto registra su declaración. El Hub no envía el formulario ni verifica su comprobante.",
  "I am at the shared kitchen and starting this visit now.": "Estoy en la cocina compartida e inicio esta visita ahora.",
  "I am ending this visit now.": "Estoy finalizando esta visita ahora.",
  "Related catering event · optional": "Evento de catering relacionado · opcional",
  "Actual end · your local time": "Final real · su hora local",
  "End actual visit": "Finalizar visita real",
  "Saved. No external form was submitted.": "Guardado. No se envió ningún formulario externo.",
  "Saved. Reload the records to see the current status.": "Guardado. Vuelva a cargar los registros para ver el estado actual.",
  "Recorded history": "Historial registrado",
  "Start actual visit": "Iniciar visita real",
  "Actual start · your local time": "Inicio real · su hora local",
  "My actual hours": "Mis horas reales",
  "My records": "Mis registros",
  "Correction reason": "Motivo de corrección",
  "No ingredients calculated. Confirm the recipes or add items for this event.": "No hay ingredientes calculados. Confirme las recetas o agregue artículos para este evento.",
  "No visit in progress": "No hay visita en curso",
  "No actual visits recorded this month.": "No hay visitas reales registradas este mes.",
  "Business name": "Nombre del negocio",
  "Visit note · optional": "Nota de la visita · opcional",
  "License number · digits only": "Número de licencia · solo dígitos",
  "Visit options": "Opciones de la visita",
  "Time and quantity source": "Origen del tiempo y cantidades",
  "Pending owner review": "Pendiente de revisión del dueño",
  "Delivery plan · travel and setup": "Plan de entrega · viaje y montaje",
  "Email receipt reference or note · optional": "Referencia o nota del comprobante por correo · opcional",
  "Record form submission": "Registrar envío del formulario",
  "Record actual use here. Proposed hours remain in the event reservation.": "Registre el uso real aquí. Las horas propuestas permanecen en la reserva del evento.",
  "External record: user-declared submission · receipt unverified": "Registro externo: envío declarado por el usuario · comprobante no verificado",
  "Team records": "Registros del equipo",
  "Owner reviewed": "Revisado por el dueño",
  "Review visit": "Revisar visita",
  "Original history is preserved. A correction resets the external-submission status for review.": "Se conserva el historial original. Una corrección reinicia el estado de envío externo para revisarlo.",
  "The latest 500 visits are shown; totals include the full month.": "Se muestran las últimas 500 visitas; los totales incluyen el mes completo.",
  "Select…": "Seleccione…",
  "Services actually used": "Servicios realmente utilizados",
  "No submission declared for the kitchen form": "Sin envío declarado al formulario de la cocina",
  "No related event": "Sin evento relacionado",
  "License type": "Tipo de licencia",
  "Event work": "Trabajo del evento",
  "A saved update belongs to another operator. That operator must reconcile it first.": "Una actualización guardada pertenece a otro operador. Ese operador debe conciliarla primero.",
  "An update needs confirmation. Retry the saved request before recording another action.": "Una actualización necesita confirmación. Reintente la solicitud guardada antes de registrar otra acción.",
  "Order units": "Unidades del pedido",
  "Use your verified business and license details in the external form. Saving these details does not submit it.": "Use los datos verificados de su negocio y licencia en el formulario externo. Guardar estos datos no lo envía.",
  "Shared kitchen use": "Uso de cocina compartida",
  "Visit in progress": "Visita en curso",
  "Completed staff visits": "Visitas del personal finalizadas",
  "Completed visits": "Visitas finalizadas",
  "Real visits. Clear records.": "Visitas reales. Registros claros.",
  "Reload records": "Volver a cargar registros",
  "I submitted the kitchen form for this actual visit.": "Yo envié el formulario de la cocina para esta visita real.",
  "📋 Open the production plan →": "📋 Abre el plan de producción →",
  "· Paid in full": "· Pagado en su totalidad",
  "Final payment received": "Pago final recibido",
  "Dish / pack": "Plato / paquete",
  "Line total ($)": "Total de la partida ($)",
  "Pricing note (optional)": "Nota de precio (opcional)",
  "Open the branded email preview, payment link and client account. Nothing sends until you approve.": "Abre la vista previa del correo con la marca, el enlace de pago y la cuenta del cliente. No se envía nada hasta que lo apruebes.",
  "Review both branded emails, approve their timing and see feedback saved with this event.": "Revisa ambos correos con la marca, aprueba cuándo se enviarán y consulta los comentarios guardados con este evento.",
  "New guest count asked for:": "Nuevo número de invitados solicitado:",
  "What should she be told? (she sees this)": "¿Qué quieres decirle? (ella verá este mensaje)",
  "Your reply:": "Tu respuesta:",
  "Remove line": "Quitar partida",
  "View / recover replacement": "Ver / recuperar reemplazo",
  "Published price × quantity of the stated pack / serving. This is not an individual-piece count unless the unit says so.": "Precio publicado × cantidad del paquete / porción indicado. Esto no representa piezas individuales, salvo que la unidad así lo indique.",
  "Edit quote · save changes": "Editar cotización · guardar cambios",
  "Agreed quote rate × quantity; no current-price overwrite.": "Tarifa acordada en la cotización × cantidad; no reemplaza el precio vigente.",
  "Deposit received:": "Depósito recibido:",
  "Lead follow-up & response status": "Seguimiento del prospecto y estado de respuesta",
  "Review the branded payment email and client account before sending.": "Revisa el correo de pago con la marca y la cuenta del cliente antes de enviarlo.",
  "Catering booking": "Reserva de catering",
  "No catering quotes yet.": "Aún no hay cotizaciones de catering.",
  "Final payment due date not recorded": "No se registró la fecha de vencimiento del pago final",
  "I reviewed this saved quote email and recipient.": "Revisé este correo de cotización guardado y su destinatario.",
  "Saved quote preview loaded. Nothing has been sent by this action.": "Se cargó la vista previa de la cotización guardada. Esta acción no envió nada.",
  "Send reviewed quote": "Enviar cotización revisada",
  "Gift for this customer": "Regalo para este cliente",
  "No phone number on this quote — email only": "Esta cotización no incluye un número de teléfono; solo se enviará por correo electrónico.",
  "Or send it yourself:": "O envíalo tú misma:",
  "Date not recorded · — guests": "Fecha no registrada · — invitados",
  "Event date not recorded · — guests": "Fecha del evento no registrada · — invitados",
  "Read the preview above one more time. When you are happy, this emails it to the address on the quote and texts her if she consented to texts.": "Vuelve a leer la vista previa de arriba. Cuando estés conforme, se enviará por correo a la dirección de la cotización y por mensaje de texto a la clienta si dio su consentimiento.",
  "· Final payment waived": "· Pago final exonerado",
  "· deposit unpaid": "· depósito pendiente",
  "On. The reveal appears once she pays the": "Activado. La revelación aparecerá cuando ella pague el",
  "— not before.": "— no antes.",
  "Off. Nothing is promised and nothing is shown.": "Desactivado. No se promete ni se muestra nada.",
  "On. She has paid in full, so the reveal is showing on her quote page now.": "Activado. Ella pagó el total, así que la revelación ya aparece en la página de su cotización.",
  "Choose a quote": "Elige una cotización",
  "Existing quotes for this request": "Cotizaciones existentes para esta solicitud",
  "Compare the amounts and choose the correct quote. Paid quotes are read-only. Nothing is sent.": "Compara los importes y elige la cotización correcta. Las cotizaciones pagadas son de solo lectura. No se envía nada.",
  "Historical records are preserved here. These checkouts are no longer active; use the active quote above for the current offer.": "Aquí se conservan los registros históricos. Estos pagos ya no están activos; usa la cotización activa de arriba para la oferta vigente.",
  "No active catering quotes.": "No hay cotizaciones de catering activas.",
  "Open selected quote": "Abrir cotización seleccionada",
  "Revise selected quote with my draft": "Revisar la cotización seleccionada con mi borrador",
  "Your current draft will be copied into the selected unpaid quote revision after you choose it. No message is sent.": "Tu borrador actual se copiará en la revisión de la cotización impaga seleccionada cuando la elijas. No se enviará ningún mensaje.",
  "No matching published dishes.": "No hay platos publicados que coincidan.",
  "Prices below are per stated serving or pack. New lines use this published price; existing agreed lines remain unchanged.": "Los precios de abajo corresponden a la porción o paquete indicado. Las partidas nuevas usarán este precio publicado; las partidas acordadas no cambiarán.",
  "Waiting on you": "Pendiente de tu acción",
  "Agreed food subtotal (dollars)": "Subtotal de comida acordado (dólares)",
  "Checkout to retire:": "Pago que se retirará:",
  "Choose the correct quote": "Elige la cotización correcta",
  "Correct quote to keep": "Cotización correcta que se conservará",
  "Could not load catering quotes.": "No se pudieron cargar las cotizaciones de catering.",
  "I compared the quotes and confirm the checkout above is the obsolete duplicate.": "Comparé las cotizaciones y confirmo que el pago de arriba es el duplicado obsoleto.",
  "It sends nothing.": "No se envía nada.",
  "Leave blank until confirmed": "Déjalo en blanco hasta confirmarlo",
  "Line items": "Artículos desglosados",
  "No terms snapshot on this quote — it predates stored terms. Do not quote terms from this screen; check what was sent.": "Esta cotización no tiene una copia de las condiciones; es anterior al registro de condiciones. No las cites desde esta pantalla; verifica qué se envió.",
  "Only the obsolete checkout is retired. Order history remains. This does not refund or charge money and sends no email or text.": "Solo se retira el pago obsoleto. El historial del pedido permanece. Esto no reembolsa ni cobra dinero y no envía correos ni mensajes de texto.",
  "Optional signature croquetas": "Croquetas de la casa (opcional)",
  "Retire an obsolete duplicate": "Retirar un duplicado obsoleto",
  "Retire only the obsolete checkout": "Retirar solo el pago obsoleto",
  "Terms this customer agreed to · unversioned": "Condiciones aceptadas por este cliente · sin versión registrada",
  "Whatever she used on the site": "Lo que ella indicó en el sitio",
  "Call or respond now.": "Llama o responde ahora.",
  "Call notes / next action": "Notas de llamada / próxima acción",
  "Contact and delivery evidence": "Pruebas de contacto y entrega",
  "Internal call-task status": "Estado interno de la tarea de llamada",
  "Next follow-up": "Próximo seguimiento",
  "Open messages": "Abrir mensajes",
  "Provider acceptance does not establish that the recipient read the message.": "La aceptación del proveedor no demuestra que el destinatario haya leído el mensaje.",
  "Save follow-up": "Guardar seguimiento",
  "Customer response · owner recorded": "Respuesta del cliente · registrada por el propietario",
  "Private response notes": "Notas privadas sobre la respuesta",
  "Save customer response": "Guardar respuesta del cliente",
  "These notes are internal. Saving does not send a message, book a call or record payment.": "Estas notas son internas. Guardar no envía mensajes, reserva llamadas ni registra pagos.",
  "No email": "Sin correo electrónico",
  "Owner notification evidence unavailable": "Pruebas de notificación al propietario no disponibles",
  "Customer response & quote reminder": "Respuesta del cliente y recordatorio de cotización",
  "Customer response & reminder history": "Respuesta del cliente e historial de recordatorios",
  "Customer response and quote reminder": "Respuesta del cliente y recordatorio de cotización",
  "Open to retrieve current evidence. Opening never sends a message.": "Abre para consultar las pruebas actuales. Abrir no envía ningún mensaje.",
  "Separate from your call-task status. Recording a call attempt does not mean the customer replied.": "Es independiente del estado de tu tarea de llamada. Registrar un intento de llamada no significa que el cliente haya respondido.",
  "Suggested checkpoints: 24 hours, 72 hours and 7 days after the quote. These are owner actions; this panel does not schedule automatic customer emails.": "Revisiones sugeridas: 24 horas, 72 horas y 7 días después de la cotización. Son acciones del propietario; este panel no programa correos automáticos para el cliente.",
  "Customer acknowledgement: not recorded": "Confirmación del cliente: no registrada",
  "Create and send a quote before reviewing a quote reminder.": "Crea y envía una cotización antes de revisar un recordatorio de cotización.",
  "Response details not loaded": "Detalles de la respuesta sin cargar",
  "Review the lead and choose your next action.": "Revisa el prospecto y elige la próxima acción.",
  "Provider receipt:": "Comprobante del proveedor:",
  "Quote reminder": "Recordatorio de cotización",
  "Closed — not proceeding": "Cerrado; no continúa",
  "Closed — owner marked won": "Cerrado; ganado según el propietario",
  "Could not retrieve response evidence. No message was sent.": "No se pudo obtener la evidencia de respuesta. No se envió ningún mensaje.",
  "Needs contact": "Contacto pendiente",
  "No catering inquiries yet.": "Aún no hay solicitudes de catering.",
  "Owner marked won": "Ganados según el propietario",
  "Paid deposits": "Depósitos pagados",
  "Quotes sent": "Cotizaciones enviadas",
  "Responses are owner-recorded. Owner-marked wins are separate from verified paid deposits. These counts do not establish email opens or link clicks.": "Las respuestas las registra el propietario. Los casos marcados como ganados por el propietario son independientes de los depósitos pagados verificados. Estos conteos no demuestran aperturas de correo ni clics en enlaces.",
  "Responses recorded": "Respuestas registradas",
  "Summary scope not recorded": "Alcance del resumen no registrado",
  "Active request": "Solicitud activa",
  "Internal note": "Nota interna",
  "Open catering desk": "Abrir el panel de catering",
  "Request state": "Estado de la solicitud",
  "Save request": "Guardar solicitud",
  "Customer messages are stopped. Review the existing Google event separately; canceling this request does not remove that event.": "Los mensajes al cliente están detenidos. Revisa por separado el evento existente en Google; cancelar esta solicitud no elimina ese evento.",
  "A branded Añejo email is staged here. Opening this screen does not send an email or charge the customer.": "Aquí está preparado un correo con la marca Añejo. Abrir esta pantalla no envía correos ni cobra al cliente.",
  "Branded client email": "Correo para el cliente con la marca",
  "Collect final payment": "Cobrar el pago final",
  "Email activity and provider receipts": "Actividad de correo y comprobantes del proveedor",
  "Enable future reminders with this template": "Activar recordatorios futuros con esta plantilla",
  "I approve this rendered template for future final-payment reminders in this language.": "Apruebo esta plantilla renderizada para futuros recordatorios de pago final en este idioma.",
  "I reviewed the named recipient, subject and complete rendered email and approve this one send.": "Revisé el destinatario indicado, el asunto y el correo completo renderizado; apruebo este único envío.",
  "I reviewed this recipient, amount, due date and complete rendered email, and approve this one send.": "Revisé el destinatario, el importe, la fecha de vencimiento y el correo completo renderizado; apruebo este único envío.",
  "Preview branded email": "Vista previa del correo con la marca",
  "Refresh payment and reminder status": "Actualizar el estado del pago y los recordatorios",
  "Reminder activity and provider receipts": "Actividad de recordatorios y comprobantes del proveedor",
  "Send branded payment reminder once": "Enviar una vez el recordatorio de pago con la marca",
  "Send reviewed branded email once": "Enviar una vez el correo con la marca revisado",
  "Send through Añejo’s branded Resend email. No email app opens. Drafting and previewing send nothing.": "Envíalo mediante el correo de Resend con la marca Añejo. No se abre una aplicación de correo. Redactar y previsualizar no envía nada.",
  "Write your message. Añejo branding and contact details are included automatically.": "Escribe tu mensaje. La marca y los datos de contacto de Añejo se incluyen automáticamente.",
  "15 or more days before the event": "15 días o más antes del evento",
  "8–14 days before the event": "8–14 días antes del evento",
  "3–7 days before the event": "3–7 días antes del evento",
  "less than 3 days before the event": "menos de 3 días antes del evento",
  "Confirm the kitchen’s actual booking calendar.": "Confirma el calendario real de reservas de la cocina.",
  "Calendar runtime credentials are not configured.": "Las credenciales de ejecución del calendario no están configuradas.",
  "Confirm the exact kitchen reservation calendar ID.": "Confirma el ID exacto del calendario de reservas de la cocina.",
  "Review this request before preparing a quote.": "Revisa esta solicitud antes de preparar una cotización.",
  "Deposit recorded. Continue event planning.": "Depósito registrado. Continúa la planificación del evento.",
  "Customer declined. Do not send further quote reminders.": "El cliente rechazó la cotización. No envíes más recordatorios.",
  "Review the requested call time and arrange the call.": "Revisa la hora solicitada y coordina la llamada.",
  "Review requested changes before sending another quote.": "Revisa los cambios solicitados antes de enviar otra cotización.",
  "Review the customer response and record the next agreed action.": "Revisa la respuesta del cliente y registra la próxima acción acordada.",
  "All three reviewed email steps are used. Review the plans or arrange a call; the lead remains open until you decide otherwise.": "Ya se usaron los tres pasos de correo revisados. Revisa los planes o coordina una llamada; el prospecto seguirá abierto hasta que decidas lo contrario.",
  "Owner decision: call to confirm plans or close this follow-up. No automatic message.": "Decisión de la propietaria: llama para confirmar los planes o cierra este seguimiento. No se enviará ningún mensaje automáticamente.",
  "Owner check: ask whether anything needs clarification. No automatic message.": "Revisión de la propietaria: pregunta si algo necesita aclaración. No se enviará ningún mensaje automáticamente.",
  "Review the quote response after 24 hours. Sending always requires a reviewed owner action.": "Revisa la respuesta a la cotización después de 24 horas. El envío siempre requiere una acción revisada por la propietaria.",
  "No active quote is strongly linked to this lead.": "No hay una cotización activa vinculada claramente a este prospecto.",
  "Only unpaid active quotes may receive a review reminder.": "Solo las cotizaciones activas sin pagar pueden recibir un recordatorio de revisión.",
  "This lead is closed. No reminder will be sent.": "Este prospecto está cerrado. No se enviará ningún recordatorio.",
  "The event date is missing, invalid or past.": "La fecha del evento falta, no es válida o ya pasó.",
  "The quote needs a valid recipient email.": "La cotización necesita una dirección de correo válida para el destinatario.",
  "A valid quote must already have been sent before following up.": "La cotización válida debe haberse enviado antes de hacer seguimiento.",
  "A quote revision or duplicate retirement is still in progress.": "Aún se está procesando una revisión de la cotización o el retiro de un duplicado.",
  "This recipient is suppressed or opted out. Do not send.": "Este destinatario está suprimido o canceló su suscripción. No envíes el mensaje.",
  "A customer response has been recorded. Review it instead of sending this reminder.": "Se registró una respuesta del cliente. Revísala en vez de enviar este recordatorio.",
  "An inbound reply is recorded. Review the conversation first.": "Se registró una respuesta entrante. Revisa primero la conversación.",
  "A call was requested. Review the request first.": "Se solicitó una llamada. Revisa primero la solicitud.",
  "Order changes were requested. Review them first.": "Se solicitaron cambios al pedido. Revísalos primero.",
  "Reconcile the unconfirmed email before any further send.": "Reconcilia el correo sin confirmar antes de realizar otro envío.",
  "Follow-up closed. No further quote reminders; owner-marked wins do not establish payment.": "Seguimiento cerrado. No envíes más recordatorios de cotización; marcar una oportunidad como ganada no demuestra que se haya pagado.",
  "Arrange the requested call.": "Coordina la llamada solicitada.",
  "Review the requested quote changes.": "Revisa los cambios solicitados a la cotización.",
  "Respond to the customer and agree on the next step.": "Responde al cliente y acuerda el próximo paso.",
  "Confirm plans by call or record the outcome. No automatic closure.": "Confirma los planes por llamada o registra el resultado. No se cerrará automáticamente.",
  "Review the next quote reminder or make a call.": "Revisa el próximo recordatorio de cotización o llama.",
  "Review the request and contact the customer.": "Revisa la solicitud y contacta al cliente.",
  "Connect QuickBooks": "Conectar QuickBooks",
  "Content briefs": "Resúmenes de contenido",
  "Copy link": "Copiar enlace",
  "Could not ask.": "No se pudo hacer la pregunta.",
  "Could not file this to the queue; it is shown here only.": "No se pudo añadir esto a la cola; solo se muestra aquí.",
  "Currently using the built-in defaults — nothing has been set here yet.": "Se están usando los valores predeterminados incluidos; todavía no se ha configurado nada aquí.",
  "Database backup": "Copia de seguridad de la base de datos",
  "Delivered / opened": "Entregado / abierto",
  "Deposit paid · balance": "Depósito pagado · saldo pendiente",
  "Discover new organizations": "Buscar nuevas organizaciones",
  "Employment type": "Tipo de empleo",
  "Every location can be reached by email and by text.": "Se puede contactar cada ubicación por correo electrónico y mensaje de texto.",
  "Filed in AI Suggestions below — approve or dismiss it there. Nothing happens until you do.": "Se guardó en Sugerencias de IA, abajo; apruébala o descártala allí. No ocurre nada hasta que lo hagas.",
  "Fix before the next holiday": "Corregir antes del próximo feriado",
  "Flagged claims:": "Afirmaciones señaladas:",
  "Good news (green)": "Buenas noticias (verde)",
  "Grant it": "Conceder el beneficio",
  "Hourly rate in dollars — used only when they are paid hourly": "Tarifa por hora en dólares; solo se usa cuando se paga por hora",
  "How they are paid": "Cómo se les paga",
  "I have read the flags and want to send it as written.": "Leí las advertencias y quiero enviarlo tal como está escrito.",
  "In force": "Vigente",
  "Invoices cannot be sent until you add one — and without it the only people Añejo can reach here are the office staff who count heads, who never see pricing.": "No se pueden enviar facturas hasta que agregues un contacto. Sin él, las únicas personas a las que Añejo puede llegar aquí son el personal de oficina que cuenta a los comensales y que nunca ve los precios.",
  "Last 2 weeks (biweekly)": "Últimas 2 semanas (quincenal)",
  "Last week": "La semana pasada",
  "Launch list": "Lista de lanzamiento",
  "Launch list — not yet purchased": "Lista de lanzamiento — aún no comprada",
  "Legacy Member": "Miembro anterior",
  "Library unavailable — see above.": "Biblioteca no disponible — consulta arriba.",
  "Mileage rate ($/mi)": "Tarifa por milla ($/mi)",
  "Mobile e.g. 561-555-0142": "Celular; por ejemplo, 561-555-0142",
  "Neutral (dark green)": "Neutro (verde oscuro)",
  "No activity.": "Sin actividad.",
  "No area set — orders are accepted from anywhere.": "No se definió un área; se aceptan pedidos desde cualquier lugar.",
  "No billing contact.": "No hay contacto de facturación.",
  "No brief yet. “Generate account brief” writes one from the evidence below.": "Todavía no hay un resumen. «Generar resumen de cuenta» crea uno a partir de la evidencia de abajo.",
  "No criteria earned points — check before sending.": "Ningún criterio obtuvo puntos; revisa antes de enviar.",
  "No evidence captured yet.": "Todavía no se ha recopilado evidencia.",
  "No flagged claims.": "No hay afirmaciones señaladas.",
  "No members yet.": "Todavía no hay miembros.",
  "No office order has been measured yet.": "Todavía no se ha medido ningún pedido de oficina.",
  "No organizations yet. Add one below, import a CSV, or run discovery.": "Todavía no hay organizaciones. Agrega una abajo, importa un CSV o inicia una búsqueda.",
  "No reports yet. Briefings, end-of-service checklists, standups and the weekly summary appear here.": "Todavía no hay informes. Aquí aparecen los informes, las listas de cierre del servicio, las reuniones breves y el resumen semanal.",
  "No sources recorded.": "No se registraron fuentes.",
  "Nobody is due. Either the list is worked, or everyone is resting.": "Nadie tiene seguimiento pendiente. O ya se trabajó la lista o todos están descansando.",
  "None chosen yet — until you choose, no closure notice is ever sent.": "Todavía no elegiste ninguno; no se enviará un aviso de cierre hasta que elijas.",
  "Not applicable": "No corresponde",
  "Not available": "No disponible",
  "Not connected": "No conectado",
  "Not entered": "No ingresado",
  "Not running:": "No está en ejecución:",
  "Nothing logged yet.": "Todavía no hay registros.",
  "Nothing measured and no estimates set yet.": "Todavía no hay mediciones ni estimaciones.",
  "Nothing recorded yet. It fills up on its own as orders are marked ready.": "Todavía no hay registros. Se completará a medida que los pedidos se marquen como listos.",
  "Nothing required is missing for the categories in your pipeline.": "No falta ningún requisito para las categorías de tu proceso.",
  "Nothing sent or drafted yet.": "Todavía no se ha enviado ni redactado nada.",
  "Nothing showing.": "No hay nada para mostrar.",
  "Nothing waiting for approval.": "No hay nada pendiente de aprobación.",
  "Nothing written yet.": "Todavía no se ha escrito nada.",
  "Notices sent and what they answered": "Avisos enviados y sus respuestas",
  "Off — internal HUB content only": "Desactivado — solo contenido interno del HUB",
  "Office contact — receives the verification code & SMS receipts": "Contacto de oficina — recibe el código de verificación y los recibos por SMS",
  "Only an owner can change eligibility for an active document with a saved update timestamp.": "Solo el propietario puede cambiar la elegibilidad de un documento activo que tenga una fecha de actualización guardada.",
  "Only these ZIPs can check out.": "Solo se puede finalizar la compra desde estos códigos postales.",
  "Open Readiness": "Abrir preparación",
  "Open the Catering desk": "Abrir el panel de catering",
  "Out of stock": "Agotado",
  "Owner’s daily rhythm": "Rutina diaria de la propietaria",
  "Pop-up in the middle (shown once)": "Ventana emergente en el centro (se muestra una vez)",
  "Preview their page": "Previsualizar su página",
  "Read them below first. Each is re-previewed and approved against its own rendered text; anything that changed since you looked is refused by name.": "Léelos primero abajo. Cada uno se vuelve a previsualizar y aprobar según su propio texto renderizado; cualquier elemento que haya cambiado desde que lo revisaste será rechazado y se identificará por nombre.",
  "Reconnect QuickBooks": "Volver a conectar QuickBooks",
  "Retype the staff id to confirm.": "Vuelve a escribir el ID del personal para confirmar.",
  "Run again": "Ejecutar de nuevo",
  "Rush fees": "Cargos por urgencia",
  "Save answer": "Guardar respuesta",
  "Scheduled-ahead only — customers pick a future day. Same-day is off regardless of the clock.": "Solo se programa con anticipación: los clientes eligen un día futuro. Los pedidos para el mismo día están desactivados, independientemente de la hora.",
  "Send emails this invoice to the billing contact and moves it to": "Envía esta factura por correo al contacto de facturación y la mueve a",
  "Service ended. Ordering link disabled; historical records below.": "El servicio terminó. El enlace para pedir está desactivado; los registros históricos aparecen abajo.",
  "Settings could not be read — treating both switches as OFF.": "No se pudieron leer los ajustes; ambos controles se consideran DESACTIVADOS.",
  "Shipped version": "Versión publicada",
  "Showing on the site right now.": "Se muestra en el sitio ahora mismo.",
  "Social planner": "Planificador de redes sociales",
  "Subscription delivery": "Entrega de suscripciones",
  "Target net margin": "Margen neto objetivo",
  "The weekly price of each meal plan. Saving one changes what the NEXT subscriber is charged and what /subscribe shows. People already subscribed keep the price they signed up at until they change plans.": "El precio semanal de cada plan de comidas. Guardar un precio cambia lo que pagará el PRÓXIMO suscriptor y lo que aparece en /subscribe. Quienes ya tienen una suscripción conservan el precio al que se inscribieron hasta que cambien de plan.",
  "Their answer": "Su respuesta",
  "This cannot be undone.": "Esta acción no se puede deshacer.",
  "This email cannot be approved: the recipient is suppressed.": "No se puede aprobar este correo: el destinatario está suprimido.",
  "This invoice is void.": "Esta factura está anulada.",
  "This order cannot be canceled.": "Este pedido no se puede cancelar.",
  "This order cannot be refunded here.": "Este pedido no se puede reembolsar desde aquí.",
  "Unanswered — the research attempt failed.": "Sin respuesta — falló el intento de investigación.",
  "Unanswered — waiting on research, or answer it yourself below.": "Sin respuesta — a la espera de la investigación, o responde tú misma abajo.",
  "Unbilled this period": "Sin facturar en este período",
  "Unknown handle": "Identificador desconocido",
  "Urgent (red)": "Urgente (rojo)",
  "Void — nothing due": "Anular — no hay saldo pendiente",
  "You can read every content file here. To change one, open it and send the change to Dayan for approval.": "Aquí puedes leer todos los archivos de contenido. Para cambiar uno, ábrelo y envía el cambio a Dayan para que lo apruebe.",
  "Your estimate": "Tu estimado",
  "Your version is live": "Tu versión está activa",
  "active staff are up to date on their role training.": "miembros activos del personal tienen al día la capacitación de su puesto.",
  "already counted": "ya contado",
  "container + lid + sauce cup + label": "envase + tapa + vasito para salsa + etiqueta",
  "could not load pricing": "no se pudieron cargar los precios",
  "dish price": "precio del plato",
  "fraction: 0.25 = 25%": "fracción: 0.25 = 25%",
  "fraction: 0.30 = 30%": "fracción: 0.30 = 30%",
  "fraction: 0.50 = 50%": "fracción: 0.50 = 50%",
  "gym / trainer": "gimnasio / entrenador",
  "have never been trained.": "nunca han recibido capacitación.",
  "lead days": "días de anticipación",
  "next week": "la próxima semana",
  "no address": "sin dirección",
  "no photo": "sin foto",
  "of the Founding Hundred": "de los Cien Miembros Fundadores",
  "on request only": "solo a solicitud",
  "padding:7px 12px;border-radius:8px;font-size:12.5px;opacity:0;pointer-events:none;transition:opacity .25s;z-index:9998}": "padding:7px 12px;border-radius:8px;font-size:12.5px;opacity:0;pointer-events:none;transition:opacity .25s;z-index:9998}",
  "prep + travel + service + breakdown": "preparación + traslado + servicio + desmontaje",
  "the email has changed since": "el correo cambió desde",
  "this week": "esta semana",
  "unconfirmed, worth a human read": "sin confirmar; conviene que una persona lo revise",
  "we ask if they are open": "preguntamos si les interesa",
  "· not approved": "· no aprobado",
  "— distance scoring uses contract sites only": "— la puntuación de distancia solo usa las ubicaciones con contrato",
  "— team —": "— equipo —",
  "— type —": "— tipo —",
  "…loading the rest…": "…cargando el resto…",
  "▭ Top bar": "▭ Barra superior",
  "⚠️ CRON_KEY not set — scheduled jobs will not run": "⚠️ CRON_KEY no está configurada — las tareas programadas no se ejecutarán",
  "⚠️ RESEND_API_KEY not set": "⚠️ RESEND_API_KEY no está configurada",
  "Nothing in the queue covers today.": "No hay nada en la cola que cubra el día de hoy.",
  "Write one below.": "Escribe uno abajo.",
  "high confidence": "confianza alta",
  "kitchen closed": "cocina cerrada",
  "⏱ Measured": "⏱ Medido",
  "💳 Create Square payment link": "💳 Crear enlace de pago de Square",
  "📋 Copy": "📋 Copiar",
  "+ Add to CRM": "+ Añadir al CRM",
  "No opportunity yet. Create one to start outreach.": "Aún no hay oportunidades. Crea una para iniciar el contacto.",
  "Payment reference (check #, ACH, Square…)": "Referencia del pago (n.º de cheque, ACH, Square…)",
  "location price": "precio por ubicación",
  "on approval": "al aprobar",
  "✓ Mark paid": "✓ Marcar como pagado",
  "📗 Send to QuickBooks": "📗 Enviar a QuickBooks",
  "(as verified 9/18/2026)": "(según se verificó el 18/9/2026)",
  "(your visits are not counted)": "(tus visitas no se cuentan)",
  "+ Write another message": "+ Escribir otro mensaje",
  ". Mark paid closes it — it stops counting as outstanding.": ". Marcar como pagado lo cierra: deja de contarse como pendiente.",
  "25-30 is a common start": "25-30 es un punto de partida habitual",
  "2× points for life ✓": "2× puntos de por vida ✓",
  "AI Ops:": "Operaciones con IA:",
  "Accepting records your decision — the HUB does not carry this out for you.": "Aceptar registra tu decisión; HUB no ejecuta esta acción por ti.",
  "Acknowledge flagged claims and readiness gaps": "Reconoce las afirmaciones señaladas y las brechas de preparación",
  "Add to the queue": "Añadir a la cola",
  "All un-invoiced": "Todo lo que aún no se ha facturado",
  "An answer is drafted and waiting in Approvals.": "La respuesta está redactada y espera en Aprobaciones.",
  "An out-of-area customer can pay for food you cannot deliver.": "Un cliente fuera del área puede pagar por comida que no puedes entregar.",
  "Approve & queue this exact email": "Aprobar y poner en cola este correo exacto",
  "Approve several": "Aprobar varios",
  "Ask on the first call:": "Pregunta en la primera llamada:",
  "Balance outstanding": "Saldo pendiente",
  "Bar across the top of every page": "Barra en la parte superior de cada página",
  "Before it can be confirmed:": "Antes de poder confirmarlo:",
  "Benefit MISSING": "FALTA el beneficio",
  "Blocking deals in your pipeline right now:": "Negocios que ahora mismo bloquean tu cartera:",
  "Bowl checked": "Cuenco marcado",
  "Bowl unchecked": "Cuenco sin marcar",
  "Brief change": "Cambio en el resumen",
  "Buyers will ask for things Añejo cannot hand over yet.": "Los compradores pedirán cosas que Añejo todavía no puede entregar.",
  "CSV import": "Importación de CSV",
  "Cancel this order": "Cancelar este pedido",
  "Card link:": "Enlace de tarjeta:",
  "Coming soon": "Próximamente",
  "Demand forecast": "Pronóstico de demanda",
  "How we know": "Cómo lo sabemos",
  "Total due": "Total adeudado",
  "Vendor lead time (days) — used for Ops order timing": "Plazo de entrega del proveedor (días), usado para programar pedidos de Operaciones",
  "⚠️ The connection expired": "⚠️ La conexión venció",
  "✉️ Re-send to client": "✉️ Reenviar al cliente",
  "✉️ Send to client": "✉️ Enviar al cliente",
  "✓ Brief drafted — see Library": "✓ Resumen redactado; consulta la Biblioteca",
  "✓ Nothing outstanding on this event.": "✓ No hay pendientes para este evento.",
  "🔑 Login link": "🔑 Enlace de inicio de sesión",
  "Read them below first, or the request will be refused by name.": "Léelos abajo primero; de lo contrario, la solicitud será rechazada y se identificará por nombre.",
  "Account brief": "Resumen de la cuenta",
  "Account name": "Nombre de la cuenta",
  "AI briefs": "Resúmenes con IA",
  "Add a contact": "Añadir un contacto",
  "Add a prospect with a sendable contact to see it.": "Añade un prospecto con un contacto al que se pueda escribir para verlo.",
  "Add an organization": "Añadir una organización",
  "Add and score": "Añadir y puntuar",
  "Add contact": "Añadir contacto",
  "Anonymous proof line — only if true": "Frase de respaldo anónima — solo si es cierta",
  "Anything else": "Algo más",
  "Anything to tell the writer": "Algo que quieras indicarle a quien redacta",
  "Are we ready to close?": "¿Estamos listos para cerrar?",
  "At most": "Como máximo",
  "Automatic intro email": "Correo electrónico introductorio automático",
  "Call list": "Lista de llamadas",
  "Campaign name": "Nombre de la campaña",
  "Capacity (only if known)": "Capacidad (solo si se conoce)",
  "Capacity / onboarding note": "Capacidad / nota de incorporación",
  "Category (locks it)": "Categoría (queda fijada)",
  "Category fit (0–1)": "Afinidad con la categoría (0–1)",
  "Claims this email relies on": "Afirmaciones en las que se basa este correo",
  "Create opportunity": "Crear oportunidad",
  "Created with the first opportunity.": "Se crea junto con la primera oportunidad.",
  "Dayan at Añejo": "Dayan en Añejo",
  "Days per week": "Días por semana",
  "Decide from the record": "Decidir según el registro",
  "Delivery days text": "Texto de los días de entrega",
  "Delivery fee per day ($)": "Tarifa de entrega por día ($)",
  "Delivery locations": "Ubicaciones de entrega",
  "Delivery/open events": "Eventos de entrega/apertura",
  "Detect automatically": "Detectar automáticamente",
  "Discovery sources": "Fuentes de descubrimiento",
  "Do not contact": "No contactar",
  "Edit organization": "Editar organización",
  "Edited — preview again before approving.": "Editado — vuelve a previsualizar antes de aprobar.",
  "Email provider": "Proveedor de correo electrónico",
  "Est. monthly ($)": "Estimado mensual ($)",
  "Estimates & next action": "Estimaciones y próximo paso",
  "Exact email preview": "Vista previa exacta del correo electrónico",
  "First email": "Primer correo electrónico",
  "Follow-up sequence": "Secuencia de seguimiento",
  "From (hour)": "Desde (hora)",
  "From address (verified sending domain)": "Dirección de envío (dominio verificado)",
  "From name": "Nombre del remitente",
  "Generate account brief": "Generar resumen de la cuenta",
  "Headcount cutoff": "Límite de comensales",
  "Headcount cutoff text": "Texto del límite de comensales",
  "+ Location": "+ Ubicación",
  "+ Person": "+ Persona",
  ". Nothing changes until you approve it there.": ". Nada cambia hasta que lo apruebes allí.",
  "A price, a menu, a callback, a date. Optional.": "Un precio, un menú, una llamada de seguimiento o una fecha. Opcional.",
  "Accepting head counts — unchecking pauses this location's intake link": "Aceptar recuentos de comensales — desmarcar pausa el enlace de solicitud de esta ubicación",
  "Also text each location’s primary contact (English and Spanish)": "Enviar también un mensaje de texto al contacto principal de cada ubicación (en inglés y español)",
  "Before every federal holiday we ask each location whether they are open. If our kitchen is closed, they hear it at least 7 days ahead.": "Antes de cada feriado federal, preguntamos a cada ubicación si abrirá. Si nuestra cocina está cerrada, se les avisa con al menos 7 días de anticipación.",
  "Billing model": "Modelo de facturación",
  "Biweekly invoice": "Factura quincenal",
  "Coming up": "Próximamente",
  "Contact name": "Nombre de contacto",
  "Dish name": "Nombre del plato",
  "Each person gets their own 6-digit code by text when they order. The main contact is copied on every receipt.": "Cada persona recibe su propio código de 6 dígitos por mensaje de texto al hacer un pedido. El contacto principal recibe una copia de cada recibo.",
  "For a count phoned or texted in, or a day the office could not use the form. No text is sent to the client. Overwrites the day if it already has a count.": "Para anotar un recuento comunicado por llamada o mensaje, o un día en que la oficina no pudo usar el formulario. No se envía ningún mensaje al cliente. Si ese día ya tiene un recuento, se reemplaza.",
  "Holiday & operations contact": "Contacto para feriados y operaciones",
  "Kitchen window": "Horario de cocina",
  "Lands as": "Se registra como",
  "Loading the menu…": "Cargando el menú…",
  "Monthly invoice": "Factura mensual",
  "Name (optional)": "Nombre (opcional)",
  "No contract accounts yet — onboard one above.": "Todavía no hay cuentas con contrato — incorpora una arriba.",
  "No counts yet.": "Todavía no hay recuentos.",
  "No delivery days in the next two weeks.": "No hay días de entrega durante las próximas dos semanas.",
  "No federal holiday in the next 90 days.": "No hay feriados federales en los próximos 90 días.",
  "No location on this account has delivery days yet — set them with ✏️ Edit terms first.": "Ninguna ubicación de esta cuenta tiene días de entrega configurados — primero configúralos con ✏️ Editar condiciones.",
  "Note (optional) — e.g. renegotiated on the 7/25 call": "Nota (opcional) — p. ej., renegociado en la llamada del 25/7",
  "Note (optional) — goes on Terms history": "Nota (opcional) — aparecerá en el historial de condiciones",
  "Notes — allergens, sides (optional)": "Notas — alérgenos, acompañamientos (opcional)",
  "Offboard account — stop service": "Dar de baja la cuenta — detener el servicio",
  "Only the main contact above can order — add a backup so a sick day never blocks the count.": "Solo el contacto principal de arriba puede hacer pedidos — añade un contacto suplente para que una enfermedad no impida enviar el recuento.",
  "Ops emails, who decides if this location is open": "Correos de Operaciones, quién decide si esta ubicación abre",
  "Same day": "El mismo día",
  "Save holiday settings": "Guardar la configuración de feriados",
  "Spanish name (optional)": "Nombre en español (opcional)",
  "Text them the ordering link now": "Enviarles ahora el enlace para hacer pedidos",
  "Week 1 starts (a Monday)": "La semana 1 comienza un lunes",
  "Weekly autopay": "Pago automático semanal",
  "Where it came from — e.g. texted by Roxana": "De dónde provino — p. ej., mensaje de texto de Roxana",
  "Which holidays is our kitchen closed?": "¿Durante qué feriados estará cerrada nuestra cocina?",
  "all sites ·": "todas las ubicaciones ·",
  "head count. Days already submitted keep the price they were quoted.": "recuento de comensales. Los días ya enviados conservan el precio que se les cotizó.",
  "in their invoice emails": "en sus correos de factura",
  "“Pay now” card button": "Botón de tarjeta «Pagar ahora»",
  "✍️ Record a count yourself": "✍️ Registrar un recuento manualmente",
  "🍽️ Weekly menu & per-dish prices": "🍽️ Menú semanal y precios por plato",
  "📊 Pricing & margin model": "📊 Precios y modelo de margen",
  "🗓️ Holidays": "🗓️ Feriados",
  "🧾 Generate invoice (choose period)": "🧾 Generar factura (elegir período)",
  "(not set).": "(sin configurar).",
  "🟢 Same-day ordering is OPEN right now": "🟢 Los pedidos para el mismo día están ABIERTOS ahora mismo",
  "= Broward) or a full 5-digit ZIP. Leave blank for no limit.": "= Broward) o un código postal completo de 5 dígitos. Déjalo en blanco para no establecer un límite.",
  "= Palm Beach County,": "= condado de Palm Beach,",
  "A price you save here is charged on the next order immediately — but /order is still shipping a hardcoded copy of the menu, so customers will keep SEEING the old price while being charged the new one. Get that page wired to /api/menu before you change a price.": "El precio que guardes aquí se cobrará inmediatamente en el próximo pedido; pero /order todavía publica una copia fija del menú, así que los clientes seguirán VIENDO el precio anterior mientras se les cobra el nuevo. Conecta esa página con /api/menu antes de cambiar un precio.",
  "Anything other than Available keeps the item on the site but blocks it at checkout — customers see the wording you pick. To remove it from the site entirely, untick “Show on the website” below.": "Cualquier estado que no sea Disponible mantiene el artículo en el sitio, pero lo bloquea al pagar; los clientes verán el texto que elijas. Para quitarlo por completo del sitio, desmarca «Mostrar en el sitio web» abajo.",
  "Closed dates": "Fechas de cierre",
  "Comma-separated. Use 3 digits for a whole area (": "Separados por comas. Usa 3 dígitos para indicar un área completa (",
  "Contract orders, measured end to end, against the office lunch estimate in": "Pedidos con contrato, medidos de principio a fin, comparados con la estimación del almuerzo de oficina en",
  "Could not load ordering settings.": "No se pudo cargar la configuración de pedidos.",
  "Delivery area": "Área de entrega",
  "Dinner window opens": "Apertura del horario de cena",
  "How long one takes to make, start to packed. The kitchen uses it to show when to start and a countdown. An order takes as long as its slowest item. Leave blank and the kitchen shows no timer for it.": "Cuánto tiempo se tarda en prepararlo, desde el inicio hasta que queda empacado. La cocina lo usa para indicar cuándo empezar y mostrar una cuenta regresiva. Un pedido tarda lo que tarde su artículo más lento. Déjalo en blanco y la cocina no mostrará un temporizador.",
  "How many today": "Cuántos hoy",
  "How many you made today. Leave blank for no limit. What is LEFT counts down from this as orders come in, and resets overnight.": "Cuántos preparaste hoy. Déjalo en blanco para no establecer un límite. La cantidad RESTANTE disminuye a medida que llegan pedidos y se reinicia durante la noche.",
  "Live prices are NOT coming from this page": "Los precios en vivo NO provienen de esta página",
  "Lunch window opens": "Apertura del horario de almuerzo",
  "Name, description, photo, order": "Nombre, descripción, foto, pedido",
  "No bowls are on sale right now": "No hay bowls a la venta en este momento",
  "No modifier prices found.": "No se encontraron precios para modificadores.",
  "No price changes recorded yet.": "Todavía no se han registrado cambios de precio.",
  "Office lunch prep time (minutes)": "Tiempo de preparación del almuerzo de oficina (minutos)",
  "Office orders have no menu item, so their estimate is set here. Their window comes from each site.": "Los pedidos de oficina no tienen un artículo de menú, así que su estimación se configura aquí. El horario proviene de cada ubicación.",
  "On the menu, impossible to buy": "En el menú, imposible de comprar",
  "Order-by deadline & windows": "Fecha límite y horarios para pedir",
  "Palm Beach & Broward County": "Condados de Palm Beach y Broward",
  "Prep time (minutes)": "Tiempo de preparación (minutos)",
  "Ready before delivery (minutes)": "Tiempo antes de la entrega (minutos)",
  "Same-day window (Eastern) and daily cap per bowl.": "Horario para pedidos el mismo día (hora del Este) y límite diario por bowl.",
  "Save all changes": "Guardar todos los cambios",
  "Scheduled-ahead orders only": "Solo pedidos programados con anticipación",
  "Show on the website": "Mostrar en el sitio web",
  "The kitchen records what it really takes — every order records itself when it is marked ready, and cooks time batches with the stopwatch on the kitchen board. Nothing here changes an estimate. You do, with": "La cocina registra el tiempo real: cada pedido se registra cuando se marca como listo y los cocineros cronometran los lotes con el temporizador del tablero de cocina. Nada aquí cambia una estimación. Tú la cambias con",
  "The kitchen shows each order a": "La cocina muestra a cada pedido un",
  "The order page loads /api/menu and /api/menu is answering from these rows, so a saved price shows up for customers within about a minute (the menu is edge-cached 60s).": "La página de pedidos carga /api/menu y este responde con estas filas; por eso, el precio guardado aparece para los clientes en aproximadamente un minuto (el menú permanece en caché perimetral durante 60 s).",
  "The order page still shows its own prices": "La página de pedidos todavía muestra sus propios precios",
  "The photo must already exist under /assets/img/ — this box names the file, it does not upload one. A subfolder is fine: menu-launch/combo-bites.webp.": "La foto debe existir previamente en /assets/img/; este campo indica el nombre del archivo, pero no lo carga. Puedes usar una subcarpeta: menu-launch/combo-bites.webp.",
  "The site reads this menu": "El sitio lee este menú",
  "Time for packing and the driver to load. 30 is only a starting point.": "Tiempo para empacar y para que el conductor cargue el pedido. 30 es solo un punto de partida.",
  "Turns off same-day ordering completely. Customers order for a future day instead. Use it when the kitchen is at capacity or you are away.": "Desactiva por completo los pedidos para el mismo día. Los clientes hacen pedidos para una fecha futura. Úsalo cuando la cocina esté a plena capacidad o no estés disponible.",
  "What customers see": "Lo que ven los clientes",
  "What each extra costs when someone customizes a bowl. These keys are fixed in code — you set the price, not the list.": "Cuánto cuesta cada extra cuando alguien personaliza un bowl. Estas opciones están fijadas en el código; tú defines el precio, no la lista.",
  "What the kitchen recorded, newest first — batches the cooks timed, and orders that timed themselves.": "Lo que registró la cocina, empezando por lo más reciente: lotes cronometrados por los cocineros y pedidos que registraron su propio tiempo.",
  "Which weekdays customers can choose. Unticking a day removes it from the storefront.": "Qué días de la semana pueden elegir los clientes. Al desmarcar un día, se quita de la tienda en línea.",
  "can’t be bought": "no se puede comprar",
  "is measured minutes divided by how many were made — the estimate has no quantity in it, so this is the column that will eventually say whether it needs one.": "se calcula como los minutos medidos divididos por la cantidad preparada. La estimación no incluye la cantidad, así que esta columna indicará si hace falta incorporarla.",
  "matches your estimate": "coincide con tu estimación",
  "no limit": "sin límite",
  "per unit": "por unidad",
  "ready by": "listo para",
  "start by": "empezar a",
  "time and a countdown. Ready by = when the delivery window opens, minus the time below. Start by = ready by, minus the order’s prep time.": "tiempo y cuenta regresiva. «Listo para» = hora de apertura del horario de entrega, menos el tiempo indicado abajo. «Empezar a» = hora de «Listo para», menos el tiempo de preparación del pedido.",
  "time, a": "tiempo, un",
  "· …”. The ZIPs above decide who can check out; this is just how you name the area.": "· …». Los códigos postales de arriba determinan quién puede pagar; esto solo sirve para nombrar el área.",
  "At different prices": "Con distintos precios",
  "Dial in your real numbers — everything recalculates live. Then set the price + per-office delivery fee on the account.": "Introduce tus cifras reales; todo se recalcula en vivo. Luego configura en la cuenta el precio y la tarifa de entrega por oficina.",
  "Food %": "Costo de alimentos %",
  "Fully-loaded cost per lunch": "Costo total por almuerzo",
  "Margin / lunch": "Margen / almuerzo",
  "Margin%": "Margen %",
  "Margin/lunch": "Margen/almuerzo",
  "Per head": "Por persona",
  "Price/lunch": "Precio/almuerzo",
  "Profit/day·office": "Ganancia/día·oficina",
  "Recommended price per lunch": "Precio recomendado por almuerzo",
  "To hit your target margin on the lunch itself (delivery fee should separately cover the run).": "Para alcanzar tu margen objetivo en el almuerzo mismo (la tarifa de entrega debe cubrir el recorrido por separado).",
  "Your all-in revenue / lunch": "Tus ingresos totales / almuerzo",
  "Automatic payments": "Pagos automáticos",
  "Could not load the QuickBooks status.": "No se pudo cargar el estado de QuickBooks.",
  "Could not load the automatic-payment switches.": "No se pudieron cargar los controles de pago automático.",
  "Redirect URI to register on the Intuit app:": "URI de redirección que debes registrar en la aplicación de Intuit:",
  "company · sandbox": "empresa · entorno de pruebas",
  "✅ Connected": "✅ Conectado",
  "Date / item": "Fecha / artículo",
  "Delivery — shared route": "Entrega — ruta compartida",
  "Invoice actions": "Acciones de factura",
  "Thank you for your business. Please remit to Añejo Catering Co. LLC. Questions about this invoice? Reply to the email it was sent with.": "Gracias por su preferencia. Envíe el pago a Añejo Catering Co. LLC. ¿Tiene preguntas sobre esta factura? Responda al correo con el que se envió.",
  "Could not plan.": "No se pudo planificar.",
  "Dinner (5–8)": "Cena (5–8)",
  "Enable automated dispatch": "Activar despacho automático",
  "Lunch (11–2)": "Almuerzo (11–2)",
  "No drivers yet": "Todavía no hay conductores",
  "No unassigned orders to plan for this date.": "No hay pedidos sin asignar para planificar en esta fecha.",
  "Unassigned ⚡": "Sin asignar ⚡",
  "max wait": "espera máx.",
  "min stops": "paradas mín.",
  "pending · late": "pendiente · tarde",
  "pending · on time": "pendiente · a tiempo",
  "total driver pay": "pago total al conductor",
  "⚡ Smart route planner": "⚡ Planificador inteligente de rutas",
  "🛵 ASAP · DISPATCH": "🛵 LO ANTES POSIBLE · DESPACHAR",
  "🤖 Automated dispatch": "🤖 Despacho automático",
  "Boca Raton": "Boca Raton",
  "% off": "% de descuento",
  "Active subs": "Suscripciones activas",
  "Añejo credit (1.5×)": "Crédito de Añejo (1.5×)",
  "Cash (monthly)": "Efectivo (mensual)",
  "Commission %": "Comisión %",
  "Create a promo code": "Crear un código promocional",
  "Create code": "Crear código",
  "Create partner": "Crear socio",
  "Expires in (days)": "Vence en (días)",
  "Free Fit drink on first order": "Bebida Fit gratis con el primer pedido",
  "Free delivery": "Entrega gratis",
  "Instagram handle": "Usuario de Instagram",
  "Mark paid": "Marcar como pagado",
  "Max uses": "Usos máximos",
  "No codes yet.": "Todavía no hay códigos.",
  "No extra benefit": "Sin beneficio adicional",
  "Onboard a creator partner": "Incorporar a un socio creador",
  "Owed to partners": "Adeudado a los socios",
  "Paid to date": "Pagado hasta la fecha",
  "Payout method": "Método de pago",
  "Points multiplier": "Multiplicador de puntos",
  "Resend onboarding": "Reenviar incorporación",
  "Sales credited": "Ventas atribuidas",
  "Send the onboarding email now": "Enviar ahora el correo de incorporación",
  "Summer campaign": "Campaña de verano",
  "credit (1.5×)": "crédito (1.5×)",
  "legacy member": "miembro antiguo",
  "— review & decide below": "— revisa y decide abajo",
  "Amount to refund (USD)": "Importe a reembolsar (USD)",
  "Cancelling never returns money.": "Cancelar nunca devuelve el dinero.",
  "Kitchen PIN trail": "Registro del PIN de cocina",
  "No kitchen actions recorded for this order.": "No hay acciones de cocina registradas para este pedido.",
  "Owner actions are unavailable for this order.": "Las acciones del propietario no están disponibles para este pedido.",
  "Reason (recorded on the order)": "Motivo (registrado en el pedido)",
  "Reason (sent to Square and recorded on the order)": "Motivo (enviado a Square y registrado en el pedido)",
  "This returns real money to the customer through Square and cannot be undone from the HUB.": "Esto devuelve dinero real al cliente a través de Square y no se puede deshacer desde HUB.",
  "We could not read a Square payment for this order": "No pudimos leer un pago de Square para este pedido",
  "check Square before telling the customer they were not charged.": "verifica Square antes de decirle al cliente que no se le cobró.",
  "e.g. customer called to cancel": "p. ej., el cliente llamó para cancelar",
  "e.g. order never delivered": "p. ej., el pedido nunca se entregó",
  "is still held from this customer — use Refund below to give it back.": "sigue retenido de este cliente; usa Reembolsar abajo para devolverlo.",
  "← Back to orders": "← Volver a los pedidos",
  "No answer.": "Sin respuesta.",
  "Could not load schedule health.": "No se pudo cargar el estado del calendario.",
  "No forecast yet. It runs nightly (~10pm ET), or tap “Run forecast now”.": "Todavía no hay pronóstico. Se ejecuta cada noche (aprox. 10 p. m., hora del Este); también puedes tocar «Ejecutar pronóstico ahora».",
  "What this answer was based on": "En qué se basa esta respuesta",
  "📊 Demand forecast & prep sheet": "📊 Pronóstico de demanda y hoja de preparación",
  "Get their email on Instagram, then add to CRM": "Consigue su correo electrónico por Instagram y luego añádelo al CRM",
  "✉️ Email": "✉️ Correo electrónico",
  "📷 Instagram": "📷 Instagram",
  "Inquiry not found. Go back and reopen.": "No se encontró la consulta. Vuelve atrás y ábrela de nuevo.",
  "No inquiries yet.": "Todavía no hay consultas.",
  "SMS opt-in": "Consentimiento para recibir SMS",
  "View the Instagram conversation in the inbox →": "Ver la conversación de Instagram en la bandeja de entrada →",
  "Website inquiries": "Consultas del sitio web",
  "in CRM": "en el CRM",
  "launch list": "lista de lanzamiento",
  "← Back to inquiries": "← Volver a las consultas",
  "Could not load roster.": "No se pudo cargar la lista del personal.",
  "Language for texts sent to them": "Idioma de los mensajes de texto que se les envían",
  "Share it with them now — it will not be shown again. They'll set their own PIN on first sign-in.": "Compártelo con ellos ahora; no volverá a mostrarse. Configurarán su propio PIN al iniciar sesión por primera vez.",
  "👋 Remind to clock out": "👋 Recordatorio para marcar la salida",
  "🗣 EN": "🗣 EN",
  "🗣 ES": "🗣 ES",
  "Could not read the library.": "No se pudo leer la biblioteca.",
  "Internal by default.": "De forma predeterminada, es interno.",
  "Nothing relevant found.": "No se encontró nada pertinente.",
  "PDF, Word, scans, spreadsheets, text. 20MB each.": "PDF, Word, escaneos, hojas de cálculo y texto. 20 MB cada uno.",
  "Searching…": "Buscando…",
  "The Studio would tell the chef the documents on hand do not cover this, instead of guessing. Upload a document covering it, or reword the question.": "Studio le indicaría al chef que los documentos disponibles no cubren este tema, en vez de adivinar. Sube un documento que lo cubra o reformula la pregunta.",
  "Use the Search panel above to inspect retrieved excerpts; excerpts do not prove the full source was reviewed.": "Usa el panel de búsqueda de arriba para revisar los extractos encontrados; los extractos no demuestran que se haya revisado la fuente completa.",
  "Note to staff (required to reject or request more info)": "Nota para el personal (obligatoria para rechazar o pedir más información)",
  "Preview this version": "Previsualizar esta versión",
  "Version history": "Historial de versiones",
  "View full proposed Brief": "Ver el resumen propuesto completo",
  "Could not load rewards.": "No se pudieron cargar las recompensas.",
  "Members by tier": "Miembros por nivel",
  "Points out": "Puntos emitidos",
  "Program at a glance": "Resumen del programa",
  "Top members": "Miembros principales",
  "No activity yet.": "Todavía no hay actividad.",
  "Next week →": "Semana siguiente →",
  "← Previous week": "← Semana anterior",
  "⬇ Download payroll CSV": "⬇ Descargar CSV de nómina",
  "Aña auto-reply": "Respuesta automática de Aña",
  "Could not load the auto-reply setting.": "No se pudo cargar la configuración de respuesta automática.",
  "Message & comms activity": "Actividad de mensajes y comunicaciones",
  "No comms activity yet.": "Todavía no hay actividad de comunicaciones.",
  "Lunch route": "Ruta de almuerzo",
  "No data yet.": "Todavía no hay datos.",
  "Deposit unpaid": "Depósito pendiente de pago",
  "Catering events this week": "Eventos de catering esta semana",
  "Estimated food cost": "Costo estimado de alimentos",
  "Loading your success conversations…": "Cargando tus conversaciones de éxito…",
  "No 4–5★ reviews with comments yet. They appear here automatically as customers rate their deliveries.": "Todavía no hay reseñas de 4–5★ con comentarios. Aparecerán aquí automáticamente cuando los clientes califiquen sus entregas.",
  "Real 4–5★ reviews from your customers. Review one and draft a content brief + receipt — the receipt keeps the quote honest and attributed.": "Reseñas reales de 4–5★ de tus clientes. Revisa una y prepara un resumen de contenido y un comprobante; el comprobante mantiene la cita fiel y atribuida.",
  "Send a change to Dayan": "Enviar un cambio a Dayan",
  "Success Stories": "Historias de éxito",
  "Success conversations": "Conversaciones de éxito",
  "Immortal $": "Inmortal $",
  "Immortal ×": "Inmortal ×",
  "Legend $": "Leyenda $",
  "Legend ×": "Leyenda ×",
  "Thriving $": "Próspero $",
  "Thriving ×": "Próspero ×",
  "Enter a staff id.": "Introduce un ID del personal.",
  "Kept — business records": "Se conserva — registros comerciales",
  "Sign in as owner.": "Inicia sesión como propietario.",
  "Would be erased": "Se borraría",
  "Apt / unit (optional)": "Apto./unidad (opcional)",
  "No client profile (guest checkout) — onboard them below to edit this profile.": "No hay perfil del cliente (pago como invitado); incorpóralo abajo para editar este perfil.",
  "✏️ Edit profile": "✏️ Editar perfil",
  "By driver": "Por conductor",
  "Could not load payouts.": "No se pudieron cargar los pagos.",
  "owed now": "adeudado ahora",
  "⚠️ RESEND_WEBHOOK_SECRET not set": "⚠️ RESEND_WEBHOOK_SECRET no está configurado",
  "⚠️ no ANTHROPIC_API_KEY — briefs are built from facts only": "⚠️ No hay ANTHROPIC_API_KEY — los resúmenes se elaboran solo a partir de hechos",
  "⚠️ not yet": "⚠️ todavía no",
  "✅ Resend webhook secret set": "✅ Secreto del webhook de Resend configurado",
  "(do not contact)": "(no contactar)",
  "Anything they said, from anywhere — a reply in your inbox, a call, a voicemail, a word at the door. What you put here moves the record and is what the next email gets written from.": "Lo que hayan dicho, por cualquier medio: una respuesta en tu bandeja de entrada, una llamada, un mensaje de voz o una conversación en persona. Lo que escribas aquí actualiza el registro y servirá de base para redactar el próximo correo.",
  "Contract account created.": "Cuenta con contrato creada.",
  "Enrolls every prospect shown above that has a usable contact, and names the set so you can see later what it produced. It drafts; it never sends.": "Incorpora a todos los prospectos mostrados arriba que tengan un contacto utilizable y asigna un nombre al grupo para que luego puedas ver qué produjo. Prepara borradores; nunca los envía.",
  "Every institutional buyer asks for documents before they sign. This page is Añejo's side: keep each item current, and every prospect page shows which of them that buyer needs.": "Todo comprador institucional pide documentos antes de firmar. Esta página corresponde a Añejo: mantén cada elemento actualizado y cada página de prospecto mostrará cuáles necesita ese comprador.",
  "Every prospect email waits here for you. Preview shows the exact email — subject, body, the footer with the opt-out and your postal address, sender and reply-to. Approve appears only after a preview, and only for the text you previewed.": "Cada correo para un prospecto espera aquí. La vista previa muestra el correo exacto: asunto, cuerpo, pie con la opción para dejar de recibir mensajes y tu dirección postal, remitente y dirección de respuesta. «Aprobar» aparece solo después de previsualizar y únicamente para el texto que viste.",
  "Headcount workflow": "Flujo de trabajo de recuento de comensales",
  "Header row required. Recognised columns: name, website, phone, street, city, state, zip, county, category, capacity, notes, contact_name, contact_title, contact_email, contact_phone, source_url. Importing the same file again is safe — duplicates are recognised.": "Se requiere una fila de encabezado. Columnas reconocidas: name, website, phone, street, city, state, zip, county, category, capacity, notes, contact_name, contact_title, contact_email, contact_phone, source_url. Es seguro volver a importar el mismo archivo: se reconocen los duplicados.",
  "Headline (landing page)": "Titular (página de destino)",
  "How did it land?": "¿Cómo resultó?",
  "How do you know this email?": "¿Cómo sabes que este correo es correcto?",
  "How it came in": "Cómo llegó",
  "How it landed": "Cómo resultó",
  "How it went": "Cómo salió",
  "How strict": "Qué tan estricto",
  "I confirmed it (spoke to them / their card)": "Lo confirmé (hablé con ellos / con su tarjeta)",
  "I have it but did not confirm it": "Lo tengo, pero no lo confirmé",
  "I have read this email and approve it being sent automatically to new prospects": "Leí este correo y apruebo que se envíe automáticamente a nuevos prospectos",
  "I have read this offer; every statement is true of our operation today.": "Leí esta oferta; todas sus afirmaciones describen con veracidad nuestra operación actual.",
  "ICP scoring": "Puntuación ICP",
  "If lost — why": "Si se perdió — por qué",
  "If they push back": "Si presentan objeciones",
  "Import a CSV": "Importar un CSV",
  "It is a guess — do NOT email it": "Es una suposición — NO le envíes un correo",
  "It is written from this prospect's own record — the visit, everything logged above, what was already sent. It lands in Approvals where you can rewrite every word before it goes.": "Se redacta a partir del propio registro de este prospecto: la visita, todo lo anotado arriba y lo que ya se envió. Aparece en Aprobaciones, donde puedes reescribir cada palabra antes de enviarlo.",
  "Kitchen origin": "Origen de la cocina",
  "Landing page": "Página de destino",
  "Last touch": "Último contacto",
  "Launch even though readiness gaps are open": "Iniciar aunque haya brechas de preparación abiertas",
  "Leave it where it is": "Dejarlo como está",
  "Location #": "N.º de ubicación",
  "Log this reply": "Registrar esta respuesta",
  "Log what they said": "Registrar lo que dijeron",
  "Logged replies": "Respuestas registradas",
  "Max (mi)": "Máx. (mi)",
  "Monday–Friday": "De lunes a viernes",
  "Move the stage": "Cambiar la etapa",
  "Move the stage to": "Cambiar la etapa a",
  "Name or city": "Nombre o ciudad",
  "Named permission recorded?": "¿Se registró el permiso nominal?",
  "Named proof line": "Frase de respaldo con nombre",
  "Near (mi)": "Cerca (mi)",
  "No contacts found yet. Research the website or add one.": "Todavía no se encontraron contactos. Investiga el sitio web o añade uno.",
  "No scored prospects yet.": "Todavía no hay prospectos puntuados.",
  "Not scored yet.": "Aún no se ha puntuado.",
  "Note (what, where, expires)": "Nota (qué, dónde, cuándo vence)",
  "Open Contracts →": "Abrir Contratos →",
  "Open this before you walk in. Fill it in as you talk — what you write here updates the score and the contacts, it is not a scratchpad.": "Ábrelo antes de entrar. Complétalo mientras conversas: lo que escribas aquí actualizará la puntuación y los contactos; no es un bloc de notas.",
  "Optional. What you owe them next.": "Opcional. El siguiente paso que tienes pendiente con ellos.",
  "Optional. e.g. keep it to three lines, or mention I will be in the area Thursday.": "Opcional. Por ejemplo, limitarlo a tres líneas o mencionar que estarás por la zona el jueves.",
  "Or start a campaign": "O inicia una campaña",
  "Outreach history": "Historial de contacto",
  "Paste a reply. The Hub stops the sequence, moves the stage and drafts the answer for your approval. Nothing sends.": "Pega una respuesta. Hub detiene la secuencia, cambia la etapa y prepara una respuesta para que la apruebes. No se envía nada.",
  "Paste their reply": "Pega su respuesta",
  "People per day, if they said": "Personas por día, si lo indicaron",
  "People who may submit counts (added to the roster, not texted)": "Personas que pueden enviar recuentos (se añaden a la lista del personal; no reciben mensajes de texto)",
  "Plain-text version (what many inboxes show)": "Versión de texto sin formato (la que muestran muchas bandejas de entrada)",
  "Postal address in every email:": "Dirección postal en cada correo electrónico:",
  "Preview a prospect’s page": "Previsualizar la página de un prospecto",
  "Preview exact email": "Previsualizar el correo exacto",
  "Price per meal ($)": "Precio por comida ($)",
  "Pricing on the page": "Precios en la página",
  "Probability %": "Probabilidad %",
  "Product name": "Nombre del producto",
  "Program Director": "Director del programa",
  "Proof / case study": "Respaldo / caso de estudio",
  "Proposal & contract": "Propuesta y contrato",
  "Propose the institutional positioning": "Proponer el posicionamiento institucional",
  "Prospect email is ready to send approved messages.": "El correo para el prospecto está listo para enviar mensajes aprobados.",
  "Read the exact email": "Leer el correo exacto",
  "Reject…": "Rechazar…",
  "Reply detection": "Detección de respuestas",
  "Reply received — stop the sequence": "Respuesta recibida — detener la secuencia",
  "Reply-To (a mailbox you read)": "Responder a (un buzón que revisas)",
  "Rescore everyone": "Volver a puntuar a todos",
  "Research the ones never researched": "Investigar los que nunca se han investigado",
  "Research website": "Investigar el sitio web",
  "Rush fee ($)": "Cargo por urgencia ($)",
  "Sample menu item ids (comma separated, from Menu)": "IDs de muestra de artículos del menú (separados por comas, de Menú)",
  "Save ICP": "Guardar ICP",
  "Save edit": "Guardar edición",
  "Save my standing approval": "Guardar mi aprobación permanente",
  "Save offer": "Guardar oferta",
  "Save proof policy": "Guardar política de respaldo",
  "Save proposal": "Guardar propuesta",
  "Save sender": "Guardar remitente",
  "Save service area": "Guardar área de servicio",
  "Save stage": "Guardar etapa",
  "Save window": "Guardar horario",
  "Send window (Eastern)": "Horario de envío (hora del Este)",
  "Sender (required before anything sends)": "Remitente (obligatorio antes de enviar nada)",
  "Service area": "Área de servicio",
  "Service area text": "Texto del área de servicio",
  "Setup status": "Estado de configuración",
  "Signature name": "Nombre para la firma",
  "Signature phone": "Teléfono para la firma",
  "Signature title": "Cargo para la firma",
  "Site contact": "Contacto del sitio",
  "Site phone": "Teléfono del sitio",
  "Snooze 3 days": "Posponer 3 días",
  "Special terms": "Condiciones especiales",
  "Start campaign": "Iniciar campaña",
  "Start date": "Fecha de inicio",
  "Stop sequence": "Detener secuencia",
  "Show this client a": "Mostrarle a este cliente un",
  "New terms apply to the": "Las nuevas condiciones se aplican a la",
  "Off by default. Card costs ~2.7% and offers a rail a direct-deposit vendor agreement doesn’t include — tick it only for an account that asked to pay by card.": "Está desactivado de forma predeterminada. El pago con tarjeta cuesta ~2.7% y ofrece una vía de pago que no incluye un acuerdo de depósito directo con el proveedor. Márcalo solo para una cuenta que haya pedido pagar con tarjeta.",
  "Ordering access and recurring service reminders are stopped. Orders, invoices and history remain available below.": "Se detienen el acceso para hacer pedidos y los recordatorios recurrentes del servicio. Los pedidos, las facturas y el historial seguirán disponibles abajo.",
  "Pick a preset above, or set From/To yourself for a period like a mid-month catch-up. Only un-invoiced days inside the range are billed — anything already invoiced is skipped, never double-billed.": "Elige una opción predeterminada arriba o establece tú mismo Desde/Hasta para un período, como un ajuste a mitad de mes. Solo se facturan los días del período que aún no se hayan facturado; se omiten los ya facturados para evitar duplicados.",
  "Pricing, cut-off and delivery time are copied from this account's existing location — adjust them after with Edit terms.": "Los precios, la hora límite y la hora de entrega se copian de la ubicación existente de esta cuenta; después puedes ajustarlos con Editar condiciones.",
  "Separate several with commas. Everyone listed is on the same holiday email, so whoever sees it first can answer. Left blank, it goes to the billing inbox.": "Sepáralos con comas. Todas las personas de la lista reciben el mismo correo sobre feriados, así que puede responder quien lo vea primero. Si lo dejas en blanco, se envía a la bandeja de facturación.",
  "Stops every location immediately, revokes ordering access and stops service reminders. Existing orders and invoices are preserved; no cancellations or refunds are made.": "Detiene inmediatamente todas las ubicaciones, revoca el acceso para hacer pedidos y detiene los recordatorios del servicio. Se conservan los pedidos y las facturas existentes; no se cancela ni se reembolsa nada.",
  "Give it dates and write it now — it appears and retires on its own. An end time is what stops a promo bar living on past the promo.": "Asigna fechas y redacta el mensaje ahora: aparecerá y se retirará automáticamente. La hora de finalización evita que una barra promocional siga visible después de la promoción.",
  "Headings, paragraphs and lists — <h2>, <p>, <ul>. The page title, table of contents and legal schema stay as they are; this replaces the document body.": "Encabezados, párrafos y listas — <h2>, <p>, <ul>. El título de la página, la tabla de contenido y el esquema legal se mantienen; esto reemplaza el cuerpo del documento.",
  "Keep it to one line — it sits across the top of every public page.": "Limítalo a una línea: aparece en la parte superior de cada página pública.",
  "Leave blank and the site translates the English automatically. Write it here when the wording matters.": "Déjalo en blanco y el sitio traducirá el inglés automáticamente. Escribe aquí el texto cuando la redacción sea importante.",
  "Message (Spanish, optional)": "Mensaje (español, opcional)",
  "New message (English)": "Nuevo mensaje (inglés)",
  "Page body (HTML)": "Cuerpo de la página (HTML)",
  "Show it": "Mostrarlo",
  "Switched on": "Activado",
  "opens in the middle of the screen and is shown": "se abre en el centro de la pantalla y se muestra",
  "sits across the top of every page and stays until they close it — right for a standing line. A": "aparece en la parte superior de cada página y permanece hasta que la cierran: adecuado para un mensaje permanente. Un",
  "— right for something that has to actually be read, like a closure. Edit the message and it counts as new, so it shows again.": "— adecuado para algo que realmente deben leer, como un cierre. Al editar el mensaje, se considera nuevo y vuelve a mostrarse.",
  "Subject": "Asunto",
  "Who": "Quién",
  "REGULATORY": "NORMATIVO",
  "Readiness": "Preparación",
  "SMS": "SMS",
  "Code": "Código",
  "Declined": "Rechazada",
  "Each": "Cada",
  "Location": "Ubicación",
  "Lunches": "Almuerzos",
  "Opportunity": "Oportunidad",
  "Replies": "Respuestas",
  "VOID": "ANULADA",
  "When": "Cuándo",
  "balance": "saldo",
  "creator": "creador",
  "rush": "urgencia",
  "$/lunch": "$/almuerzo",
  "A-tier prospects": "Prospectos de nivel A",
  "AI voice calls": "Llamadas de voz con IA",
  "Accounts won": "Cuentas ganadas",
  "Accepted": "Aceptado",
  "Approved, queued": "Aprobado y en cola",
  "Auto-send without approval": "Envío automático sin aprobación",
  "Awaiting research": "En espera de investigación",
  "Bowl": "Bowl",
  "Cajita request": "Solicitud de Cajita",
  "Canceled": "Cancelado",
  "Client": "Cliente",
  "Comments only": "Solo comentarios",
  "County": "Condado",
  "Criterion": "Criterio",
  "DMs and comments": "Mensajes directos y comentarios",
  "DMs only": "Solo mensajes directos",
  "Deposit": "Depósito",
  "Draft follow-ups when due": "Preparar seguimientos cuando correspondan",
  "Estimate": "Estimación",
  "Failed.": "Falló.",
  "Gap": "Brecha",
  "Google Places as a production prospect source": "Google Places como fuente de prospectos productivos",
  "Guests": "Invitados",
  "Last": "Último",
  "Max automatic intro emails per day": "Máximo de correos introductorios automáticos por día",
  "Max discovery API calls per day": "Máximo de llamadas a la API de descubrimiento por día",
  "Max new prospects per day": "Máximo de prospectos nuevos por día",
  "Max prospect emails per day": "Máximo de correos para prospectos por día",
  "Measured": "Medido",
  "Mode": "Modo",
  "None.": "Ninguno.",
  "Nothing.": "Nada.",
  "Owner approval required for every email": "Se requiere aprobación del propietario para cada correo",
  "PAID": "PAGADA",
  "Pipeline / month": "Cartera / mes",
  "Points": "Puntos",
  "Position": "Posición",
  "Pricing": "Precios",
  "Prospects": "Prospectos",
  "Reopen": "Reabrir",
  "Replied": "Respondió",
  "Sales workspace": "Espacio de trabajo de ventas",
  "Scheduled discovery (daily)": "Descubrimiento programado (diario)",
  "Scheduled website research (hourly)": "Investigación programada de sitios web (cada hora)",
  "Send approved prospect emails": "Enviar correos aprobados a prospectos",
  "Send the intro email automatically (standing approval)": "Enviar automáticamente el correo introductorio (aprobación permanente)",
  "Sequence": "Secuencia",
  "Someone": "Alguien",
  "Stage": "Etapa",
  "Subject:": "Asunto:",
  "Tasting": "Degustación",
  "Took": "Tardó",
  "View": "Ver",
  "Wants to add items": "Quiere añadir artículos",
  "Website": "Sitio web",
  "What": "Qué",
  "Why": "Por qué",
  "brand": "marca",
  "bulk/corporate": "mayoreo/corporativo",
  "card button": "botón de tarjeta",
  "catering/event": "catering/evento",
  "invoices to": "facturas a",
  "note": "nota",
  "offboarded": "dado de baja",
  "policy": "política",
  "procedure": "procedimiento",
  "proof": "respaldo",
  "recipe": "receta",
  "revoked": "revocado",
  "suppressed": "suprimido",
  "unconfirmed": "sin confirmar",
  "wholesale/partner": "mayoreo/socio",
  "Abandoned": "Abandonado",
  "Add": "Añadir",
  "Add-on": "Adicional",
  "Amount": "Importe",
  "Approvals": "Aprobaciones",
  "Ask:": "Pregunta:",
  "Availability": "Disponibilidad",
  "Available": "Disponible",
  "Balance": "Saldo",
  "Benefit": "Beneficio",
  "Billing": "Facturación",
  "Business": "Negocio",
  "CTA": "CTA",
  "Captured": "Capturado",
  "Category": "Categoría",
  "Changes": "Cambios",
  "Cities": "Ciudades",
  "Contactable": "Se puede contactar",
  "Contacts": "Contactos",
  "Counties": "Condados",
  "Dashboard": "Panel",
  "Disable": "Desactivar",
  "Dish": "Plato",
  "Drink": "Bebida",
  "Drinks": "Bebidas",
  "Due": "Vencido",
  "Earned": "Obtenido",
  "Enable": "Activar",
  "Evidence": "Evidencia",
  "Extras": "Extras",
  "Filed": "Archivado",
  "Filter": "Filtro",
  "Fri": "Vie",
  "GOOD": "BUENO",
  "Handle": "Usuario",
  "Headline": "Titular",
  "INVOICE": "FACTURA",
  "Import": "Importar",
  "Inquiry": "Consulta",
  "Inv.": "Fact.",
  "Invoices": "Facturas",
  "LOW": "BAJO",
  "Label": "Etiqueta",
  "Meal": "Comida",
  "Mon": "Lun",
  "Negative": "Negativo",
  "Neutral": "Neutral",
  "Never": "Nunca",
  "Noted": "Anotado",
  "Now": "Ahora",
  "Open:": "Abierto:",
  "Ordering": "Pedidos",
  "Organization": "Organización",
  "Organization:": "Organización:",
  "Payout": "Pago",
  "Period": "Período",
  "Positive": "Positivo",
  "Product": "Producto",
  "Proposals": "Propuestas",
  "Prospect": "Prospecto",
  "Publish": "Publicar",
  "Quote": "Cotización",
  "Quotes": "Cotizaciones",
  "Redeemed": "Canjeado",
  "Redemptions": "Canjes",
  "Refundable": "Reembolsable",
  "Refunded": "Reembolsado",
  "Reply-To": "Responder a",
  "Rescore": "Volver a puntuar",
  "Review": "Revisar",
  "Role": "Rol",
  "Rotation": "Rotación",
  "Sat": "Sáb",
  "Scheduler": "Programador",
  "Sources": "Fuentes",
  "State": "Estado",
  "Status:": "Estado:",
  "Suppression": "Supresión",
  "Switches": "Controles",
  "Thu": "Jue",
  "Tier": "Nivel",
  "To:": "Para:",
  "Trainers": "Entrenadores",
  "Tue": "Mar",
  "Untitled": "Sin título",
  "Use": "Usar",
  "Value": "Valor",
  "WATCH": "VIGILAR",
  "Was": "Era",
  "Wed": "Mié",
  "Windows": "Horarios",
  "Yes": "Sí",
  "auto": "automático",
  "biweekly": "quincenal",
  "campaign": "campaña",
  "cash": "efectivo",
  "city": "ciudad",
  "clear": "borrar",
  "cut-off": "hora límite",
  "email": "correo electrónico",
  "hidden": "oculto",
  "main": "principal",
  "monthly": "mensual",
  "name": "nombre",
  "next": "siguiente",
  "offered": "ofrecido",
  "sales": "ventas",
  "same_day": "mismo_día",
  "state": "estado",
  "street": "calle",
  "subs": "suscripciones",
  "text": "texto",
  "unavailable": "no disponible",
  "unsaved": "sin guardar",
  "unlimited": "ilimitado",
  "used": "usado",
  "weekly_autopay": "pago_automático_semanal",
  "wholesale": "mayoreo",
  "unit": "unidad",
  "zip": "código postal",
  "After delivery · honest feedback": "Después de la entrega · comentarios sinceros",
  "Before the event · service check-in": "Antes del evento · confirmación del servicio",
  "Delivery outcome unknown. Check Instagram before any further reply.": "No se conoce el resultado de la entrega. Revisa Instagram antes de responder de nuevo.",
  "Provider accepted this reply; recipient delivery or reading is not verified.": "El proveedor aceptó esta respuesta; no se ha verificado que haya llegado al destinatario ni que la haya leído.",
  "Attempt failed. No automatic retry; review the recorded error.": "El intento falló. No se reintentará automáticamente; revisa el error registrado.",
  "Send claimed; outcome pending or interrupted. Do not resend.": "Se inició el envío; el resultado está pendiente o se interrumpió. No vuelvas a enviarlo.",
  "The identification line, one-click unsubscribe and your postal address are added under every email and cannot be edited out.": "La línea de identificación, el enlace de un clic para cancelar la suscripción y tu dirección postal se añaden al pie de cada correo y no se pueden quitar.",
  "This is the screen to read before anything goes live. Nothing on it sends anything.": "Esta es la pantalla que debes leer antes de activar algo. Desde aquí no se envía nada.",
  "The ask — do not leave without it": "La solicitud — no te vayas sin hacerla",
  "The conversation": "La conversación",
  "The script": "El guion",
  "Their words if you have them, otherwise yours.": "Sus palabras, si las tienes; si no, las tuyas.",
  "They replied": "Respondieron",
  "They will ask for": "Te pedirán",
  "What are you trying to learn or win?": "¿Qué intentas averiguar o conseguir?",
  "What kind": "Qué tipo",
  "What prospects actually said": "Lo que realmente dijeron los prospectos",
  "What they asked for": "Lo que pidieron",
  "What they said": "Lo que dijeron",
  "What they said, in their words": "Lo que dijeron, con sus propias palabras",
  "What they wrote": "Lo que escribieron",
  "What this buyer will ask for": "Lo que pedirá este comprador",
  "What time lunch goes out": "A qué hora sale el almuerzo",
  "What you came back with": "Qué averiguaste",
  "Where it came from (URL, optional)": "De dónde provino (URL, opcional)",
  "Where it is stuck:": "Dónde está atascado:",
  "Who granted it, when": "Quién lo concedió y cuándo",
  "Why this prospect qualifies": "Por qué este prospecto cumple los requisitos",
  "Why this score": "Por qué tiene esta puntuación",
  "Work this list": "Trabajar con esta lista",
  "Write down:": "Anota:",
  "Write the follow-up": "Redactar el seguimiento",
  "Your standing approval of one exact email. New prospects that clear every bar get that letter without another click. Follow-ups, flagged claims and buyers with an open readiness gap always wait for you.": "Tu aprobación permanente se aplica a un único correo exacto. Los nuevos prospectos que cumplan todos los criterios reciben ese correo sin otro clic. Los seguimientos, las afirmaciones señaladas y los compradores con brechas de preparación pendientes siempre esperan tu aprobación.",
  "· SMS/voice: off": "· SMS/voz: desactivados",
  "· — / yes": "· — / sí",
  "“From” price per meal ($)": "Precio «desde» por comida ($)",
  "…or paste straight from a spreadsheet — tab-separated works too": "…o pega directamente desde una hoja de cálculo; también funciona el formato separado por tabulaciones",
  "← Prospects": "← Prospectos",
  "🔒 Locked off in this release —": "🔒 Desactivado en esta versión —",
  "🔒 Locked on in this release —": "🔒 Activado en esta versión —",
  "/ Lunches": "/ Almuerzos",
  "Learn more": "Más información",
  "(empty)": "(vacío)",
  "Edit message (English)": "Editar mensaje (inglés)",
  "End (optional)": "Fin (opcional)",
  "Link (optional)": "Enlace (opcional)",
  "Link text": "Texto del enlace",
  "Order now": "Pedir ahora",
  "Start (optional)": "Inicio (opcional)",
  "🧾 Invoices for this account go to": "🧾 Las facturas de esta cuenta se envían a",
  "(observed)": "(observado)",
  "(none yet — first submitter will enroll one)": "(todavía ninguno; la primera persona que lo envíe inscribirá uno)",
  "Leave a day blank to keep it off the menu. Leave the price blank to charge the location's price per lunch. A dish price applies from the next head count on — days already counted keep the price they were quoted. Offices see the dish name, never a price.": "Deja un día en blanco para no incluirlo en el menú. Deja el precio en blanco para cobrar el precio por almuerzo de la ubicación. El precio del plato se aplica a partir del siguiente recuento de comensales; los días ya contabilizados mantienen el precio cotizado. Las oficinas ven el nombre del plato, nunca el precio.",
  "Leave blank to charge the location's price per lunch": "Déjalo en blanco para cobrar el precio por almuerzo de la ubicación",
  "New signup — set the negotiated terms, then activate to turn on their ordering links. (Model:": "Nuevo registro: establece las condiciones negociadas y luego actívalo para habilitar sus enlaces de pedidos. (Modelo:",
  "Stops on reply, unsubscribe, bounce, complaint, manual stop, won, lost or do-not-contact. Never two steps on the same day.": "Se detiene si hay una respuesta, cancelación de suscripción, rebote, queja, detención manual, oportunidad ganada o perdida, o solicitud de no contactar. Nunca hay dos pasos el mismo día.",
  "Tasting CTA": "Llamada a la acción de degustación",
  "Tasting offer": "Oferta de degustación",
  "Teach the marketing team": "Capacitar al equipo de marketing",
  "The Team Lead, the planner, governance and Aña all read your Brand & Standards Brief. This files ONE added section — institutional recurring meal service as a strategic product, traditional Cuban catering as first-class, live-menu pricing, no customer names without permission — as a proposal in": "El líder del equipo, el planificador, gobernanza y Aña consultan tu Resumen de marca y estándares. Esto presenta UNA sección adicional como propuesta en: el servicio recurrente de comidas institucionales como producto estratégico, el catering cubano tradicional como oferta prioritaria, precios del menú actualizados en vivo y la prohibición de usar nombres de clientes sin permiso.",
  "The institutional offer ✅ confirmed": "Oferta institucional ✅ confirmada",
  "Tier A from": "Nivel A desde",
  "Tier B from": "Nivel B desde",
  "Tier C from": "Nivel C desde",
  "Two more centers like Boca": "Dos centros más como Boca",
  "Until (hour)": "Hasta (hora)",
  "Update Añejo's side in": "Actualizar la información de Añejo en",
  "Value proposition — only what the operation actually does": "Propuesta de valor — solo lo que la operación realmente ofrece",
  "We provide recurring scheduled lunch service to a healthcare organization in South Florida.": "Ofrecemos un servicio recurrente de almuerzos programados a una organización de atención médica en el sur de Florida.",
  "What can you do?": "¿Qué puedes hacer?",
  "e.g. 45 clients": "p. ej., 45 clientes",
  "hours after the previous step": "horas después del paso anterior",
  "new prospects per day.": "prospectos nuevos por día.",
  "prospect emails and": "correos electrónicos a prospectos y",
  "yes / yes": "sí / sí",
  "yes / —": "sí / —",
  "Shown on /order as “Delivery only ·": "Se muestra en /order como «Solo entrega ·",
  "SMS ✓": "SMS ✓",
  "@Instagram": "@Instagram",
  "@handle": "@usuario",
  "Creates their partner record, activates a live code at checkout, and emails them their code, link, commission terms, and the disclosure rules.": "Crea su registro de socio, activa un código vigente al pagar y le envía por correo el código, el enlace, las condiciones de comisión y las reglas de divulgación.",
  "Hourly staff are paid for worked hours. Per-route drivers show hours but are paid by their routes — never both. Times are Eastern (America/New_York).": "Al personal por hora se le paga por las horas trabajadas. Los conductores por ruta ven las horas, pero se les paga por sus rutas; nunca se paga por ambos conceptos. Las horas corresponden a la hora del Este (America/New_York).",
  "Bill to": "Facturar a",
  "Añejo Catering Co. LLC · anejocateringco.com": "Añejo Catering Co. LLC · anejocateringco.com",
  "Calc cost": "Calcular costo",
  "1 tap": "1 toque",
  "Ask about orders or marketing status…": "Pregunta sobre pedidos o el estado del marketing…",
  "Ask the operator": "Preguntar al operador",
  "Marketing status": "Estado del marketing",
  "talk ·": "hablar ·",
  "card ••": "tarjeta ••",
  "· · automatic charging will refuse for this account until a card is added": "· · el cobro automático será rechazado para esta cuenta hasta que se añada una tarjeta",
  "Deposit UNPAID": "Depósito SIN PAGAR",
  "$/hr": "$/hora",
  ". The week changes every Monday.": ". La semana cambia cada lunes.",
  "<span class=\"row-sub\">on their first paid order</span>": "<span class=\"row-sub\">en su primer pedido pagado</span>",
  "on their first paid order": "en su primer pedido pagado",
  "· · no email yet": "· · aún sin correo electrónico",
  "· · ✉︎ contactable": "· · ✉︎ se puede contactar",
  "— / yes": "— / sí",
  "— email only; every step needs your approval; stops on reply, unsubscribe, bounce, complaint, won, lost or do-not-contact.": "— solo correo electrónico; cada paso requiere tu aprobación; se detiene al recibir respuesta, cancelar suscripción, rebotar, recibir una queja, ganar, perder o marcar como no contactar.",
  "⚠️ Approving a proposal OVERWRITES the live Brand & Standards Brief and grounds every future Creative Studio session on it. The prior version is snapshotted, and you can put it back from Version history below. Review the full proposed Brief before approving.": "⚠️ Aprobar una propuesta REEMPLAZA el Resumen de marca y estándares vigente y sirve de base para cada sesión futura de Creative Studio. Se guarda una instantánea de la versión anterior y puedes restaurarla desde el Historial de versiones. Revisa el resumen propuesto completo antes de aprobarlo.",
  "🤝 Trainer commissions — partners & clients →": "🤝 Comisiones de entrenadores — socios y clientes →",
  "🥂 Catering quotes — deposits & balances →": "🥂 Cotizaciones de catering — depósitos y saldos →",
  "Note": "Nota",
  "Samples": "Muestras",
  "None": "Ninguno",
  "new": "nuevo",
  "Price": "Precio",
  "Sun": "Dom",
  "Name (ES)": "Nombre (ES)",
  "Description (ES)": "Descripción (ES)",
  "Owner's day": "La jornada de la dueña",
  "Spanish": "Español",
  "9:00 AM": "9:00 a. m.",
  "A follow-up attempt already exists for this quote. Check its receipt before any further contact.": "Ya existe un intento de seguimiento para esta cotización. Revisa el comprobante antes de volver a contactar.",
  "$ location": "$ ubicación",
  "Account activated": "Cuenta activada",
  "Actual provider text synced — no new message sent": "Texto real del proveedor sincronizado; no se envió ningún mensaje nuevo",
  "Add a billing email first": "Primero añade un correo de facturación",
  "Add a note telling staff what you need": "Añade una nota para indicarle al personal qué necesitas",
  "Add a reason for the staff member": "Añade un motivo para el miembro del personal",
  "Added to CRM": "Añadido al CRM",
  "Allowed — they can order now.": "Autorizado; ya pueden hacer pedidos.",
  "Already awaiting a driver": "Ya está en espera de un conductor",
  "Already canceled.": "Ya está cancelado.",
  "Already in CRM": "Ya está en el CRM",
  "An active quote exists. Use its revision flow; no duplicate was created.": "Ya existe una cotización activa. Usa su flujo de revisión; no se creó un duplicado.",
  "Approval withdrawn": "Aprobación retirada",
  "Approve the amount first (step 1)": "Primero aprueba el importe (paso 1)",
  "Approved — Brief updated": "Aprobado; se actualizó el Resumen",
  "Auto-dispatch saved (off)": "Despacho automático guardado (desactivado)",
  "Balance closed": "Saldo cerrado",
  "Billing contact cleared": "Se quitó el contacto de facturación",
  "Cannot verify revision status": "No se puede verificar el estado de la revisión",
  "Card link copied": "Enlace de tarjeta copiado",
  "Card removed": "Tarjeta eliminada",
  "Choose an existing quote first.": "Primero elige una cotización existente.",
  "Cleared — the shipped page is back": "Borrado; se restauró la página publicada",
  "Contact saved": "Contacto guardado",
  "Could not activate": "No se pudo activar",
  "Could not add the location": "No se pudo añadir la ubicación",
  "Could not add to CRM.": "No se pudo añadir al CRM.",
  "Could not add.": "No se pudo añadir.",
  "Could not auto-build": "No se pudo crear automáticamente",
  "Could not calculate cost": "No se pudo calcular el costo",
  "Could not cancel.": "No se pudo cancelar.",
  "Could not change that switch": "No se pudo cambiar ese control",
  "Could not clear": "No se pudo borrar",
  "Could not close that balance": "No se pudo cerrar ese saldo",
  "Could not connect QuickBooks": "No se pudo conectar con QuickBooks",
  "Could not create the account": "No se pudo crear la cuenta",
  "Could not create the balance link": "No se pudo crear el enlace de saldo",
  "Could not create the deposit link": "No se pudo crear el enlace de depósito",
  "Could not create the payment link": "No se pudo crear el enlace de pago",
  "Could not disconnect": "No se pudo desconectar",
  "Could not generate invoice": "No se pudo generar la factura",
  "Could not grant it": "No se pudo conceder",
  "Could not open messages": "No se pudieron abrir los mensajes",
  "Could not re-offer": "No se pudo volver a ofrecer",
  "Could not record.": "No se pudo registrar.",
  "Could not release route": "No se pudo liberar la ruta",
  "Could not remove that card": "No se pudo eliminar esa tarjeta",
  "Could not restore that version": "No se pudo restaurar esa versión",
  "Could not revoke": "No se pudo revocar",
  "Could not run forecast": "No se pudo ejecutar el pronóstico",
  "Could not save holiday settings": "No se pudo guardar la configuración de feriados",
  "Could not save the changes": "No se pudieron guardar los cambios",
  "Could not save the menu": "No se pudo guardar el menú",
  "Could not send login link.": "No se pudo enviar el enlace de inicio de sesión.",
  "Could not send to QuickBooks": "No se pudo enviar a QuickBooks",
  "Could not start the connection": "No se pudo iniciar la conexión",
  "Could not update.": "No se pudo actualizar.",
  "Could not verify text receipt. No new text was sent.": "No se pudo verificar el comprobante del mensaje. No se envió ningún mensaje nuevo.",
  "Could not verify the existing quote. No new checkout was created.": "No se pudo verificar la cotización existente. No se inició un nuevo pago.",
  "Could not void that invoice": "No se pudo anular esa factura",
  "Could not withdraw that approval": "No se pudo retirar esa aprobación",
  "Deleted — another message is showing now": "Eliminado; ahora se muestra otro mensaje",
  "Deleted — nothing showing": "Eliminado; no se muestra ningún mensaje",
  "Delivery address needs a street, city, and 5-digit ZIP.": "La dirección de entrega debe incluir calle, ciudad y código postal de 5 dígitos.",
  "Device revoked": "Dispositivo revocado",
  "Enter a billing email — invoices have nowhere to go without one.": "Introduce un correo de facturación; sin él no se pueden enviar las facturas.",
  "Enter a payment reference of 1–120 characters after checking the bank receipt.": "Después de revisar el comprobante bancario, introduce una referencia de pago de 1 a 120 caracteres.",
  "Enter an amount to refund.": "Introduce un importe para reembolsar.",
  "Enter the company name.": "Introduce el nombre de la empresa.",
  "Enter the guest count": "Introduce la cantidad de invitados",
  "Enter the head count.": "Introduce el número de comensales.",
  "Enter the hourly rate like 12.50": "Introduce la tarifa por hora, por ejemplo, 12.50",
  "Existing quote lookup is unavailable. Refresh the quote list before starting another checkout.": "La búsqueda de cotizaciones existentes no está disponible. Actualiza la lista antes de iniciar otro pago.",
  "Follow-up recorded": "Seguimiento registrado",
  "Forecast updated": "Pronóstico actualizado",
  "Founding benefit granted — 2× points for life": "Beneficio de miembro fundador concedido: 2× puntos de por vida",
  "From must be before To.": "La fecha Desde debe ser anterior a Hasta.",
  "Gift removed": "Regalo eliminado",
  "Give the location a name.": "Asigna un nombre a la ubicación.",
  "Her order is laid out below at menu prices — every one of them is yours to change": "Su pedido aparece abajo con los precios del menú; puedes cambiar cualquiera de ellos",
  "Holiday settings saved": "Configuración de feriados guardada",
  "Invoice emailed": "Factura enviada por correo electrónico",
  "Invoice voided — its days are un-invoiced again": "Factura anulada; sus días vuelven a quedar sin facturar",
  "It was already in QuickBooks": "Ya estaba en QuickBooks",
  "Marked paid": "Marcado como pagado",
  "Marked paid (details unavailable — migration pending)": "Marcado como pagado (detalles no disponibles; migración pendiente)",
  "Menu saved": "Menú guardado",
  "Menu saved (history unavailable — migration pending)": "Menú guardado (historial no disponible; migración pendiente)",
  "Menu saved — nothing had changed": "Menú guardado; no había cambios",
  "Name and mobile are both needed.": "Se necesitan tanto el nombre como el celular.",
  "No driver available — still unfilled": "No hay ningún conductor disponible; sigue sin asignarse",
  "No unassigned orders to build": "No hay pedidos sin asignar para crear rutas",
  "Nothing changed yet.": "Todavía no se ha cambiado nada.",
  "Obsolete duplicate retired. Correct quote kept; no message sent.": "Se retiró el duplicado obsoleto. Se conservó la cotización correcta; no se envió ningún mensaje.",
  "Order canceled.": "Pedido cancelado.",
  "Pay settings saved": "Configuración de pagos guardada",
  "Payment link created": "Enlace de pago creado",
  "Payouts are switched OFF — turn them on in Finance → Automatic payments": "Los pagos a conductores están DESACTIVADOS; actívalos en Finanzas → Pagos automáticos",
  "Pick a driver for this route.": "Elige un conductor para esta ruta.",
  "Pick the service date.": "Elige la fecha del servicio.",
  "Planning preferences saved; activation unchanged": "Preferencias de planificación guardadas; la activación no cambió",
  "Price per lunch must be more than $0.": "El precio por almuerzo debe ser mayor que $0.",
  "Profile saved": "Perfil guardado",
  "QuickBooks connected": "QuickBooks conectado",
  "QuickBooks connection cancelled": "Conexión con QuickBooks cancelada",
  "QuickBooks disconnected": "QuickBooks desconectado",
  "Re-offered to a driver": "Volvió a ofrecerse a un conductor",
  "Read the updated email preview before saving this revision.": "Lee la vista previa actualizada del correo antes de guardar esta revisión.",
  "Refund failed.": "El reembolso falló.",
  "Rejected — staff notified": "Rechazado; se notificó al personal",
  "Removed — they can no longer order.": "Se quitó; ya no pueden hacer pedidos.",
  "Report downloaded": "Informe descargado",
  "Request updated": "Solicitud actualizada",
  "Rewards settings saved": "Configuración de recompensas guardada",
  "Route already released": "La ruta ya se liberó",
  "Saved (history unavailable — migration pending)": "Guardado (historial no disponible; migración pendiente)",
  "Saved — another message is showing until its window ends": "Guardado; se mostrará otro mensaje hasta que termine su período",
  "Saved — but the card setting needs migration 0095": "Guardado; la configuración de tarjeta necesita la migración 0095",
  "Saved — customers will order ahead": "Guardado; los clientes harán pedidos con anticipación",
  "Saved — history moved with the new email": "Guardado; el historial se trasladó con el nuevo correo",
  "Saved — it will appear inside its window": "Guardado; aparecerá durante el período establecido",
  "Saved — its window has already passed, so it will not show": "Guardado; su período ya pasó, así que no se mostrará",
  "Saved — same-day ordering is open": "Guardado; los pedidos para el mismo día están abiertos",
  "Saved — switched off": "Guardado; desactivado",
  "Saved — this is the one on the site now": "Guardado; este es el que aparece ahora en el sitio",
  "Say where the count came from — it goes on the record.": "Indica de dónde provino el recuento; quedará registrado.",
  "Sent back to staff for more info": "Devuelto al personal para obtener más información",
  "Sent to QuickBooks": "Enviado a QuickBooks",
  "Set a price per lunch first.": "Primero establece un precio por almuerzo.",
  "Set both From and To, or leave both blank for all un-invoiced days.": "Establece Desde y Hasta, o deja ambos en blanco para incluir todos los días sin facturar.",
  "Square balance link ready": "Enlace de saldo de Square listo",
  "Suggested total filled in from the live menu — change it if you agreed something else": "El total sugerido se completó con los precios del menú vigente; cámbialo si acordaste otra cantidad",
  "The first location needs a name, street and city.": "La primera ubicación debe tener nombre, calle y ciudad.",
  "The shipped page is back": "Se restauró la página publicada",
  "This void quote has no recoverable revision.": "Esta cotización anulada no tiene una revisión recuperable.",
  "Type a question first.": "Primero escribe una pregunta.",
  "Week 1 has to start on a Monday.": "La semana 1 debe comenzar un lunes.",
  "Added one unit. Set the quantity on its line.": "Se añadió una unidad. Establece la cantidad en su línea.",
  "Answered": "Respondido",
  "Copied": "Copiado",
  "Gift on for this quote": "Regalo activado para esta cotización",
  "owe the new training.": "deben completar la nueva capacitación.",
  "⚠ Never trained": "⚠ Nunca recibió capacitación",
  "Answer manually": "Responder manualmente",
  "Gemini — nano-banana image": "Gemini · imagen nano-banana",
  "Instagram platform pulse": "Actualidad de la plataforma Instagram",
  "Local competitor sweep": "Revisión de competidores locales",
  "Most recent owner question, answered": "Última pregunta del propietario, respondida",
  "OpenAI — gpt-image-2": "OpenAI · gpt-image-2",
  "Type the answer yourself…": "Escribe la respuesta tú mismo…",
  "Workers AI — Leonardo Phoenix": "Workers AI · Leonardo Phoenix",
  "A provider marked": "Un proveedor marcado como",
  "Answer": "Respuesta",
  "Ask a research question": "Haz una pregunta de investigación",
  "Attach a media batch": "Adjuntar un lote de archivos multimedia",
  "Attach private media": "Adjuntar archivos multimedia privados",
  "Check files": "Comprobar archivos",
  "Checkpoint JSON": "JSON del punto de recuperación",
  "Checkpoints contain saved upload receipts, never your sign-in.": "Los puntos de recuperación contienen comprobantes de cargas guardadas, nunca tus datos de acceso.",
  "Choose the manifest and all matching files once. Captions stay unchanged. Review and scheduling remain separate.": "Elige el manifiesto y todos los archivos correspondientes una sola vez. Los textos de las publicaciones no cambian. La revisión y la programación siguen siendo pasos aparte.",
  "Choose the manifest and files to begin.": "Elige el manifiesto y los archivos para comenzar.",
  "Continue from a checkpoint": "Continuar desde un punto de recuperación",
  "Could not load cadence settings.": "No se pudo cargar la configuración de frecuencia.",
  "Could not load intel.": "No se pudo cargar la información de investigación.",
  "Could not load posting times.": "No se pudieron cargar los horarios de publicación.",
  "Could not load provider settings.": "No se pudo cargar la configuración de proveedores.",
  "Disabled": "Desactivado",
  "Export checkpoint": "Exportar punto de recuperación",
  "Feed & Stories cadence": "Frecuencia de publicaciones e historias",
  "Market": "Mercado",
  "Market intelligence": "Información del mercado",
  "Media files": "Archivos multimedia",
  "Media manifest JSON": "JSON del manifiesto multimedia",
  "Move down": "Bajar",
  "Move up": "Subir",
  "No questions filed yet.": "Aún no hay preguntas registradas.",
  "October adult day care": "Centros diurnos para adultos · octubre",
  "Plate image providers": "Proveedores de imágenes de platos",
  "Posting times": "Horarios de publicación",
  "Posts attached": "Publicaciones adjuntas",
  "Question queue": "Cola de preguntas",
  "Read saved status": "Consultar estado guardado",
  "Researched default: — ET": "Valor predeterminado investigado: — ET",
  "SUB": "SUSCRIPCIÓN",
  "Stop after current request": "Detener después de la solicitud actual",
  "company": "empresa",
  "never": "nunca",
  "subscription": "suscripción",
  "type": "tipo",
  "Answer saved": "Respuesta guardada",
  "Cadence saved": "Frecuencia guardada",
  "Intel tick ran": "Se ejecutó la actualización de investigación",
  "Posting times saved": "Horarios de publicación guardados",
  "Provider order saved": "Orden de proveedores guardado",
  "Question queued": "Pregunta puesta en cola",
  "Inquiries": "Consultas",
  "Latest 100 catering inquiries": "Últimas 100 consultas de catering",
  "Needs first contact": "Primer contacto pendiente",
  "Received": "Recibido",
  "Source:": "Origen:",
  "Not recorded — do not infer a source": "Sin registrar; no deduzcas el origen",
  "Browsing path not recorded": "Recorrido de navegación sin registrar",
  "Request & quote": "Solicitud y cotización",
  "Owner Hub alert": "Alerta del Hub del propietario",
  "Owner email": "Correo del propietario",
  "accepted — receipt recorded": "aceptado; comprobante registrado",
  "Customer acknowledgement:": "Confirmación de recepción al cliente:",
  "Contacted": "Contactado",
  "Date to confirm": "Fecha por confirmar",
  "Deposit recorded · booked": "Depósito registrado · reservado",
  "Contacted · follow-up planned": "Contactado · seguimiento planificado",
  "Quote sent · deposit pending": "Cotización enviada · depósito pendiente",
  "Closed · not proceeding": "Cerrado · no continúa",
  "Owner marked won · payment not verified": "Ganado según el propietario · pago sin verificar",
  "Review / send quote reminder": "Revisar / enviar recordatorio de cotización",
  "Provider accepted — delivery and reading unverified": "Aceptado por el proveedor; entrega y lectura sin verificar",
  "Send outcome unknown — do not retry": "Resultado del envío desconocido; no reintentes",
  "Suppressed — no reminder sent": "Suprimido; no se envió ningún recordatorio",
  "Provider failed — acceptance not recorded": "Fallo del proveedor; aceptación sin registrar",
  "Send pending — do not retry": "Envío pendiente; no reintentes",
  "Outcome not verified": "Resultado sin verificar",
  "Awaiting customer reply": "Esperando respuesta del cliente",
  "Customer replied": "El cliente respondió",
  "Customer requested a call": "El cliente solicitó una llamada",
  "Customer requested changes": "El cliente solicitó cambios",
  "Customer declined": "El cliente rechazó",
  "Next action:": "Próxima acción:",
  "Latest reminder:": "Último recordatorio:",
  "Choose a response status": "Elige un estado de respuesta",
  "No reminder send evidence recorded.": "No hay pruebas registradas de envío de recordatorios.",
  "Reminder availability:": "Disponibilidad del recordatorio:",
  "An alert fired": "Se activó una alerta",
  "Asked the Studio AI for help": "Pidió ayuda a la IA del Estudio",
  "Added a photo or voice note": "Agregó una foto o nota de voz",
  "Started a Creative Studio session": "Inició una sesión del Estudio Creativo",
  "Signed in": "Inició sesión",
  "DRIVER PAY (EARNED)": "PAGO A CONDUCTORES (GANADO)",
  "Trainer commissions — partners & clients →": "Comisiones de entrenadores · aliados y clientes →",
  "Catering quotes — deposits & balances →": "Cotizaciones de catering · depósitos y saldos →",
  "AUTOMATIC PAYMENTS": "PAGOS AUTOMÁTICOS",
  "Charge contract invoices automatically": "Cobrar automáticamente las facturas de contratos",
  "Both safeties always apply.": "Siempre se aplican ambas protecciones.",
  "No contract accounts yet.": "Aún no hay cuentas con contrato.",
  "Send an invoice to QuickBooks from the invoice page.": "Envía una factura a QuickBooks desde la página de la factura.",
  "Disconnect": "Desconectar",
  "finance": "finanzas",
  "payroll": "nómina",
  "deliveries": "entregas",
  "accountability": "responsabilidad",
  "temp_compliance": "cumplimiento de temperaturas",
  "Export": "Exportar",
  "sent": "enviado",
  "open": "abierto",
  "not approved": "sin aprobar",
  "Contract accounts (B2B)": "Cuentas con contrato (B2B)",
  "Añejo (Direct)": "Añejo (Directo)",
  "Edit profile": "Editar perfil",
  "Login link": "Enlace de acceso",
  "Changing the email re-links their orders, points and founding benefit to the new address.": "Cambiar el correo vuelve a vincular sus pedidos, puntos y beneficio de fundador a la nueva dirección.",
  "Street": "Calle",
  "Unit / apt": "Unidad / apartamento",
  "Allergens": "Alérgenos",
  "Marketing email consent": "Consentimiento para correos de marketing",
  "Marketing SMS consent": "Consentimiento para SMS de marketing",
  "PROGRAM AT A GLANCE": "RESUMEN DEL PROGRAMA",
  "POINTS OUT": "PUNTOS EN CIRCULACIÓN",
  "EARNED": "GANADOS",
  "REDEEMED": "CANJEADOS",
  "REDEMPTIONS": "CANJES",
  "MEMBERS BY TIER": "MIEMBROS POR NIVEL",
  "TOP MEMBERS": "MIEMBROS DESTACADOS",
  "Tier thresholds (lifetime $) & earn multiplier": "Umbrales de nivel ($ acumulados) y multiplicador de puntos ganados",
  "Off": "Desactivado",
  "Team lead": "Responsable del equipo",
  "Missing reports": "Reportes faltantes",
  "Calls": "Llamadas",
  "CALL LIST": "LISTA DE LLAMADAS",
  "Licensed facilities with a phone and no email we can use. Best first. A number called today is not offered again today.": "Centros con licencia que tienen teléfono y ningún correo utilizable. Los mejores aparecen primero. Un número llamado hoy no se vuelve a ofrecer hoy.",
  "Ready to call": "Listos para llamar",
  "Called today": "Llamados hoy",
  "Last 7 days": "Últimos 7 días",
  "What to say": "Qué decir",
  "Outcome": "Resultado",
  "Reached the decision-maker": "Hablé con quien toma las decisiones",
  "Spoke to the front desk": "Hablé con recepción",
  "Left a voicemail": "Dejé un mensaje de voz",
  "Asked me to call back": "Pidió que volviera a llamar",
  "Asked for information by email": "Pidió información por correo",
  "Not interested": "No le interesa",
  "Asked not to be contacted": "Pidió que no le contacten",
  "Wrong or dead number": "Número incorrecto o fuera de servicio",
  "How many attend daily": "Cuántas personas asisten a diario",
  "Who decides (name)": "Quién decide (nombre)",
  "Their title": "Su cargo",
  "Email for the menu": "Correo para el menú",
  "Notes": "Notas",
  "Log this call": "Registrar esta llamada",
  "adult day": "centro diurno para adultos",
  "addiction treatment": "tratamiento de adicciones",
  "not approved for production": "no aprobado para producción",
  "Partners": "Aliados",
  "Codes": "Códigos",
  "Production planning": "Planificación de producción",
  "Set up a plan": "Configurar un plan",
  "Cost source and exact calculation": "Fuente del costo y cálculo exacto",
  "Published recipe": "Receta publicada",
  "Finished-item target": "Objetivo de productos terminados",
  "VERSION HISTORY": "HISTORIAL DE VERSIONES",
  "SNAPSHOT": "COPIA GUARDADA",
  "Paid in full": "Pagado en su totalidad",
  "Confirmed": "Confirmado",
  "Kitchen Opening": "Apertura de cocina",
  "Handwashing station stocked (soap, paper towels)": "Estación de lavado de manos abastecida (jabón y toallas de papel)",
  "Walk-in cooler and reach-ins at safe temperature": "Cámara frigorífica y refrigeradores a temperatura segura",
  "Prep surfaces sanitized before use": "Superficies de preparación desinfectadas antes del uso",
  "Equipment powered on and warmed up": "Equipo encendido y precalentado",
  "Opening stock checked against par levels": "Existencias iniciales revisadas contra los mínimos",
  "Kitchen Closing": "Cierre de cocina",
  "Ingredients": "Ingredientes",
  "Steps": "Pasos",
  "Events": "Eventos",
  "Photo approved": "Foto aprobada",
  "Photo awaiting owner review": "Foto pendiente de revisión del propietario",
  "Photo rejected": "Foto rechazada",
  "Program": "Programa",
  "Storage": "Almacenamiento",
  "kept": "conservado",
  "owed": "pendiente de pago",
  "Ambient": "Ambiente",
  "Arrived": "Llegó",
  "Avocado": "Aguacate",
  "Home": "Inicio",
  "Issue": "Incidencia",
  "Kind": "Tipo",
  "Order": "Pedido",
  "Planned": "Planificado",
  "Portion:": "Porción:",
  "Portions": "Porciones",
  "Preparing": "En preparación",
  "Problem": "Problema",
  "Quantity": "Cantidad",
  "Recorded": "Registrado",
  "Source": "Origen",
  "Working": "En curso",
  "count_quantity": "conteo por unidades",
  "on_hand": "disponible",
  "total_weight_grams": "peso total en gramos",
  "today": "hoy"
};
  var fragmentPatterns = [
  {"en":"A customer {value}","es":"Un cliente {value}"},
  {
    "en": "Every email carries a one-click unsubscribe link and “{value}” in the footer. That is what makes emailing your customer list lawful, so it is not optional. A designed template gets that footer added underneath it — unless the template places",
    "es": "Cada correo incluye un enlace para cancelar la suscripción con un clic y «{value}» en el pie. Esto permite enviar correos a tu lista de clientes conforme a la ley, por lo que no es opcional. Ese pie se agrega debajo de una plantilla diseñada, salvo que la plantilla incluya"
  },
  {
    "en": "This saved date may be outdated; it does not prove that publishing, the DM inbox or insights are unavailable. Verify the current connection and token in Meta, renew if needed, then update this record. See {doc}.",
    "es": "Esta fecha guardada podría estar desactualizada; no demuestra que la publicación, la bandeja de mensajes directos o las estadísticas no estén disponibles. Verifica la conexión y el token actuales en Meta, renuévalo si hace falta y luego actualiza este registro. Consulta {doc}."
  },
  {
    "en": "Acts on the {value} prospects shown above, with the filters you have set. Neither button contacts anybody: an opportunity only makes a prospect addressable, and researching only reads their public website.",
    "es": "Actúa sobre los {value} prospectos que aparecen arriba, con los filtros que configuraste. Ningún botón contacta a nadie: una oportunidad solo permite dirigirse al prospecto y la investigación solo consulta su sitio web público."
  },
  {
    "en": "Acts on the {value} prospect shown above, with the filters you have set. Neither button contacts anybody: an opportunity only makes a prospect addressable, and researching only reads their public website.",
    "es": "Actúa sobre el prospecto {value} que aparece arriba, con los filtros que configuraste. Ningún botón contacta a nadie: una oportunidad solo permite dirigirse al prospecto y la investigación solo consulta su sitio web público."
  },
  {
    "en": "Comparing published posts WITH each cause against published posts WITHOUT it, by median reach. Below {value} posts on either side, this refuses to rank — one post is not a pattern.",
    "es": "Compara las publicaciones CON cada causa frente a las publicaciones SIN ella, según la mediana del alcance. Con menos de {value} publicaciones en cualquiera de los dos grupos, no asigna un orden: una publicación no demuestra un patrón."
  },
  {
    "en": "You have {v0} rule(s) and {v1} example(s) total, but only the retained rows above fit this Lead/planner preview cap. Remove something you no longer need, or trim what you have.",
    "es": "Tienes {v0} regla(s) y {v1} ejemplo(s) en total, pero solo las filas retenidas de arriba caben en el límite de esta vista previa del líder/planificador. Elimina algo que ya no necesites o reduce lo que tienes."
  },
  {
    "en": "Model-classified scope: {value}. Exact caption and registered overlay excerpts are checked against saved source text; this does not prove the model found every claim.",
    "es": "Alcance clasificado por el modelo: {value}. Los fragmentos exactos del texto de la publicación y del texto superpuesto registrado se comparan con el texto de origen guardado; esto no demuestra que el modelo haya detectado todas las afirmaciones."
  },
  {
    "en": "A lane earns auto-publish after {value} drafts in a row approved without an edit. One edit resets its streak. The switch is yours — nothing flips it for you.",
    "es": "Un canal puede obtener publicación automática después de {value} borradores seguidos aprobados sin cambios. Una edición reinicia la racha. Tú controlas el interruptor; no se activa solo."
  },
  {
    "en": "Invoice {v0} is {v1}. Check the address against the account before it goes out — a bill sent to the wrong company is not something an email can take back.",
    "es": "La factura {v0} está {v1}. Verifica la dirección con la cuenta antes de enviarla; un correo no puede retirar una factura enviada a la empresa equivocada."
  },
  {
    "en": "— the exact same dish, a different background and setting. It is never a new picture of food, and the bowl itself is never changed.{value}",
    "es": ": el mismo plato exacto con otro fondo y ambiente. Nunca es una imagen nueva de comida y el bowl en sí nunca cambia.{value}"
  },
  {
    "en": "Previous save already exists ({value}). It was not cancelled or changed. Current status: post no longer exists. Your edits are preserved.",
    "es": "El guardado anterior ya existe ({value}). No se canceló ni modificó. Estado actual: la publicación ya no existe. Se conservaron tus cambios."
  },
  {
    "en": "Status: {value}. Terms here are the ONLY thing a contract account is created from. Money is entered in dollars and stored as exact cents.",
    "es": "Estado: {value}. Las condiciones aquí son la ÚNICA base para crear una cuenta con contrato. El dinero se introduce en dólares y se guarda en centavos exactos."
  },
  {
    "en": "{value} — email only; every step needs your approval; stops on reply, unsubscribe, bounce, complaint, won, lost or do-not-contact.",
    "es": "{value} — solo correo electrónico; cada paso requiere tu aprobación; se detiene al recibir respuesta, cancelar suscripción, rebote, queja, ganar, perder o marcar como no contactar."
  },
  {
    "en": "Read the preview above one more time. When you are happy, this emails it to {value} and texts her if she consented to texts.",
    "es": "Vuelve a leer la vista previa de arriba. Cuando estés conforme, se enviará por correo a {value} y por mensaje de texto a la clienta si dio su consentimiento."
  },
  {
    "en": "{value} Below the sample floor, this stays silent rather than guess — a false \"it’s not working\" is worse than no answer.",
    "es": "{value} Con menos datos que el mínimo de muestra, no responde en lugar de adivinar: un falso «no está funcionando» es peor que no dar una respuesta."
  },
  {
    "en": "{v0} of {v1} posts left today (Instagram's limit). Token renews under Instagram → API setup with Instagram business login.",
    "es": "Quedan {v0} de {v1} publicaciones para hoy (límite de Instagram). El token se renueva en Instagram → Configuración de la API con el inicio de sesión de Instagram para empresas."
  },
  {
    "en": "(in {days} days). Verify the current token and renew if needed. This saved date does not establish live access. See {doc}.",
    "es": "(dentro de {days} días). Verifica el token actual y renuévalo si hace falta. Esta fecha guardada no demuestra acceso en vivo. Consulta {doc}."
  },
  {
    "en": "(in {days} day{plural}). Verify the current token and renew if needed. This saved date does not establish live access. See {doc}.",
    "es": "(dentro de {days} día{plural}). Verifica el token actual y renuévalo si hace falta. Esta fecha guardada no demuestra acceso en vivo. Consulta {doc}."
  },
  {
    "en": "Previous save already exists ({v0}). It was not cancelled or changed. Current status: {v1}. Your edits are preserved.",
    "es": "El guardado anterior ya existe ({v0}). No se canceló ni modificó. Estado actual: {v1}. Se conservaron tus cambios."
  },
  {
    "en": "{value} These saved measurements do not establish current Instagram performance or a complete posting history.",
    "es": "{value} Estas mediciones guardadas no demuestran el rendimiento actual de Instagram ni un historial completo de publicaciones."
  },
  {
    "en": "Previous save confirmed: {value}. Current edits are preserved; review the saved post before creating another.",
    "es": "Guardado anterior confirmado: {value}. Tus cambios actuales se mantienen; revisa la publicación guardada antes de crear otra."
  },
  {
    "en": "Styled variant of the real {value} photo — made by the image provider. Still a draft; add it or discard it.",
    "es": "Variante estilizada de la foto real de {value}, creada por el proveedor de imágenes. Sigue siendo un borrador; agrégala o descártala."
  },
  {
    "en": "Carousel · {value} photos, posted in this order. Instagram crops every slide to the first photo's shape.",
    "es": "Carrusel · {value} fotos, publicadas en este orden. Instagram recorta todas las diapositivas a la forma de la primera foto."
  },
  {
    "en": "{v0} reminder record(s) · {v1} provider acceptance receipt(s). Delivery and reading are not established.",
    "es": "{v0} registro(s) de recordatorio · {v1} comprobante(s) de aceptación del proveedor. No se confirma la entrega ni la lectura."
  },
  {
    "en": "{count} reminder record(s) · {accepted} provider acceptance receipt(s). Delivery and reading are not established.",
    "es": "{count} registros de recordatorios · {accepted} comprobantes de aceptación del proveedor. La entrega y la lectura no están demostradas."
  },
  {
    "en": "Her order is laid out below — {value} lines have no menu price, and every price is yours to change",
    "es": "Su pedido aparece abajo; las {value} líneas no tienen precio de menú y puedes cambiar todos los precios"
  },
  {
    "en": "{v0}/100 · tier {v1} · {v2} · {v3} — deterministic, from your ICP settings. The AI brief never changes it.",
    "es": "{v0}/100 · nivel {v1} · {v2} · {v3} — determinista y basado en tus ajustes de ICP. El resumen de IA nunca lo modifica."
  },
  {
    "en": "Criteria & max points: {v0}. Tiers A ≥ {v1}, B ≥ {v2}, C ≥ {v3}; out-of-area and closed places are tier D.",
    "es": "Criterios y puntos máximos: {v0}. Niveles: A ≥ {v1}, B ≥ {v2}, C ≥ {v3}; los lugares fuera del área y cerrados son de nivel D."
  },
  {
    "en": "Her order is laid out below — {value} line has no menu price, and every price is yours to change",
    "es": "Su pedido aparece abajo; la línea {value} no tiene precio de menú y puedes cambiar todos los precios"
  },
  {
    "en": "↑ Give this link to the {value} contact — they open it each morning to send the head count.",
    "es": "↑ Comparte este enlace con el contacto de {value}; lo abre cada mañana para enviar el recuento de comensales."
  },
  {
    "en": "Styled variant of the real {v0} photo — made by {v1}. Still a draft; add it or discard it.",
    "es": "Variante estilizada de la foto real de {v0}, creada por {v1}. Sigue siendo un borrador; agrégala o descártala."
  },
  {
    "en": "timed in batches — {value} more timings of a single one before this can set your estimate",
    "es": "medido por lotes: hacen falta {value} mediciones más de un solo elemento antes de que esto pueda establecer una estimación"
  },
  {
    "en": "Evidence gate: structured claim review. Original model judgment (unverified): {v0} — {v1}",
    "es": "Control de evidencia: revisión estructurada de afirmaciones. Evaluación original del modelo (sin verificar): {v0} — {v1}"
  },
  {
    "en": "Styled variant of the real photo — made by {value}. Still a draft; add it or discard it.",
    "es": "Variante estilizada de la foto real, creada por {value}. Sigue siendo un borrador; agrégala o descártala."
  },
  {
    "en": "Checkout outcome could not be confirmed. Refresh the quote list before retrying: {value}",
    "es": "No se pudo confirmar el resultado del pago. Actualiza la lista de cotizaciones antes de volver a intentarlo: {value}"
  },
  {
    "en": "Evidence gate: structured claim review. Original model judgment (unverified): {value} —",
    "es": "Control de evidencia: revisión estructurada de afirmaciones. Evaluación original del modelo (sin verificar): {value} —"
  },
  {
    "en": "Evidence gate: structured claim review. Original model judgment (unverified): — {value}",
    "es": "Control de evidencia: revisión estructurada de afirmaciones. Evaluación original del modelo (sin verificar): — {value}"
  },
  {
    "en": "{v0} · {v1} · {v2} · automatic charging will refuse for this account until a card is added",
    "es": "{v0} · {v1} · {v2} · el cobro automático será rechazado para esta cuenta hasta que se añada una tarjeta"
  },
  {
    "en": "Points per criterion; the score is normalised to 100. Tiers: A ≥ {v0}, B ≥ {v1}, C ≥ {v2}.",
    "es": "Puntos por criterio; la puntuación se normaliza a 100. Niveles: A ≥ {v0}, B ≥ {v1}, C ≥ {v2}."
  },
  {
    "en": "Brand & Standards Brief · {value} characters · grounds every Creative Studio session",
    "es": "Resumen de marca y estándares · {value} caracteres · sirve de base para cada sesión de Creative Studio"
  },
  {
    "en": "{v0} · {v1} · automatic charging will refuse for this account until a card is added",
    "es": "{v0} · {v1} · el cobro automático será rechazado para esta cuenta hasta que se añada una tarjeta"
  },
  {
    "en": "Latest {v0} receipt lines · read {v1} · Older lines are not included in this view.",
    "es": "Últimas {v0} líneas de recibos · lectura {v1} · Las líneas anteriores no se incluyen en esta vista."
  },
  {
    "en": "{v0} of {v1} posts left today (Instagram's limit). Token is a Facebook Page token.",
    "es": "Quedan {v0} de {v1} publicaciones para hoy (límite de Instagram). Es un token de página de Facebook."
  },
  {
    "en": "{value} · · automatic charging will refuse for this account until a card is added",
    "es": "{value} · · el cobro automático será rechazado para esta cuenta hasta que se añada una tarjeta"
  },
  {
    "en": "· {value} · automatic charging will refuse for this account until a card is added",
    "es": "· {value} · el cobro automático será rechazado para esta cuenta hasta que se añada una tarjeta"
  },
  {
    "en": "⚠ Your delivery fee ({v0}) is BELOW the run cost ({v1}) — every delivery loses {v2}.",
    "es": "⚠ Tu tarifa de entrega ({v0}) está POR DEBAJO del costo del recorrido ({v1}); pierdes {v2} en cada entrega."
  },
  {
    "en": "Requirements met: {v0}/{v1} · {v2} unresolved — review required · historical result",
    "es": "Requisitos cumplidos: {v0}/{v1} · {v2} sin resolver · requiere revisión · resultado histórico"
  },
  {
    "en": "Slide {v0}{v1}: branding declaration saved; current image bytes not rechecked.",
    "es": "Diapositiva {v0}{v1}: declaración de marca guardada; los bytes de la imagen actual no se volvieron a comprobar."
  },
  {
    "en": "Menu reviewed and signed by a Florida-licensed dietitian ({count} prospects)",
    "es": "Menú revisado y firmado por un dietista con licencia de Florida ({count} prospectos)"
  },
  {
    "en": "Profit/day (1 office, {v0} lunches): {v1} · week (all offices): {v2} · month ≈ {v3}",
    "es": "Ganancia/día (1 oficina, {v0} almuerzos): {v1} · semana (todas las oficinas): {v2} · mes ≈ {v3}"
  },
  {
    "en": "0 pauses the planner. 14 is a hard ceiling. Shipped default: {count}/week.",
    "es": "0 pausa el planificador. 14 es el límite máximo. Valor predeterminado incluido: {count}/semana."
  },
  {
    "en": "{v0} · unknown (model observation, not verified OCR) · caption line {v1}",
    "es": "{v0} · desconocido (observación del modelo, no OCR verificado) · línea de texto {v1}"
  },
  {
    "en": "· unknown (model observation, not verified OCR) · caption line {value}",
    "es": "· desconocido (observación del modelo, no OCR verificado) · línea de texto {value}"
  },
  {
    "en": "Legacy score: {value}/100 · not a complete current requirements audit",
    "es": "Puntuación anterior: {value}/100 · no es una auditoría completa de los requisitos actuales"
  },
  {
    "en": "{v0} cents ÷ 100 ÷ {v1} for per-pack cost; unit quantity unresolved.",
    "es": "{v0} centavos ÷ 100 ÷ {v1} para el costo por paquete; cantidad por unidad sin resolver."
  },
  {
    "en": "{v0}% confidence · {v1} subscription + {v2} on-demand · {v3} lunch / {v4} dinner",
    "es": "{v0}% de confianza · {v1} por suscripción + {v2} a pedido · {v3} almuerzos / {v4} cenas"
  },
  {
    "en": "The deadline applies to the NEXT delivery day. Currently: {value}.",
    "es": "La fecha límite se aplica al PRÓXIMO día de entrega. Actualmente: {value}."
  },
  {
    "en": "⏱ {v0} measured so far — {v1} more before a median means anything.",
    "es": "⏱ Se han medido {v0}; faltan {v1} mediciones para que la mediana tenga significado."
  },
  {
    "en": "Primary KPI — recurring institutional accounts activated: {value}",
    "es": "KPI principal — cuentas institucionales recurrentes activadas: {value}"
  },
  {
    "en": "{v0} — {v1} days after the previous step · owner approval required",
    "es": "{v0} — {v1} días después del paso anterior · requiere aprobación del propietario"
  },
  {
    "en": "{v0} · unknown (model observation, not verified OCR) · slide {v1}",
    "es": "{v0} · desconocido (observación del modelo, no OCR verificado) · diapositiva {v1}"
  },
  {
    "en": "{v0} · {v1} (model observation, not verified OCR) · caption line {v2}",
    "es": "{v0} · {v1} (observación del modelo, no OCR verificado) · línea de texto {v2}"
  },
  {
    "en": "Receipt lookup unavailable (HTTP {value}). No new text was sent.",
    "es": "La búsqueda del comprobante no está disponible (HTTP {value}). No se envió ningún mensaje nuevo."
  },
  {
    "en": "· unknown (model observation, not verified OCR) · slide {value}",
    "es": "· desconocido (observación del modelo, no OCR verificado) · diapositiva {value}"
  },
  {
    "en": "· {v0} (model observation, not verified OCR) · caption line {v1}",
    "es": "· {v0} (observación del modelo, no OCR verificado) · línea de texto {v1}"
  },
  {
    "en": "Holidays or days off. Customers cannot pick these. {value} set.",
    "es": "Feriados o días libres. Los clientes no pueden elegirlos. {value} configurados."
  },
  {
    "en": "Changes saved — replacement deposit {value}. Nothing sent yet.",
    "es": "Cambios guardados; depósito de reemplazo {value}. Todavía no se envió nada."
  },
  {
    "en": "Refund of {value} submitted — Square settles it in a few days.",
    "es": "Se envió el reembolso de {value}; Square lo liquidará en unos días."
  },
  {
    "en": "{v0} · {v1} characters · grounds every Creative Studio session",
    "es": "{v0} · {v1} caracteres · sirve de base para cada sesión de Creative Studio"
  },
  {
    "en": "Running. {v0} of {v1} sent automatically in the last 24 hours.",
    "es": "En curso. Se enviaron automáticamente {v0} de {v1} durante las últimas 24 horas."
  },
  {
    "en": "AI-written from the evidence, then checked in code · {value}",
    "es": "Redactado con IA a partir de la evidencia y luego verificado en el código · {value}"
  },
  {
    "en": "Licensed for {count}. Ask how many attend on an average day.",
    "es": "Con licencia para {count}. Pregunta cuántas personas asisten en un día habitual."
  },
  {
    "en": "Kept {value} business records. The erasure has been logged.",
    "es": "Se conservaron {value} registros comerciales. El borrado quedó registrado."
  },
  {
    "en": "Packing record: {v0} · {v1} °F · {v2} · requiere nueva medición",
    "es": "Registro de empaque: {v0} · {v1} °F · {v2} · requiere nueva medición"
  },
  {
    "en": "Registro de empaque: {v0} · {v1} °F · {v2} · new reading needed",
    "es": "Registro de empaque: {v0} · {v1} °F · {v2} · requiere nueva medición"
  },
  {
    "en": "Requirements met: {v0}/{v1} · {v2} unresolved — review required",
    "es": "Requisitos cumplidos: {v0}/{v1} · {v2} sin resolver · requiere revisión"
  },
  {
    "en": "{v0} {v1} · {v2} existing posts · {v3} caption change(s) · version {v4}",
    "es": "{v0} {v1} · {v2} publicaciones existentes · {v3} cambio(s) de texto · versión {v4}"
  },
  {
    "en": "Packing record: {v0} · {v1} °F · · requiere nueva medición",
    "es": "Registro de empaque: {v0} · {v1} °F · · requiere nueva medición"
  },
  {
    "en": "Registro de empaque: {v0} · {v1} °F · · new reading needed",
    "es": "Registro de empaque: {v0} · {v1} °F · · requiere nueva medición"
  },
  {
    "en": "The review provider rejected the {v0} request (HTTP {v1}).",
    "es": "El proveedor de revisión rechazó la solicitud de {v0} (HTTP {v1})."
  },
  {
    "en": "Slide {v0}{v1}: no attached branding declaration recorded.",
    "es": "Diapositiva {v0}{v1}: no hay una declaración de marca adjunta registrada."
  },
  {
    "en": "{v0} · {v1} (model observation, not verified OCR) · slide {v2}",
    "es": "{v0} · {v1} (observación del modelo, no OCR verificado) · diapositiva {v2}"
  },
  {
    "en": "· {v0} (model observation, not verified OCR) · slide {v1}",
    "es": "· {v0} (observación del modelo, no OCR verificado) · diapositiva {v1}"
  },
  {
    "en": "Margin is thin ({value}%). Most catering targets 25–40%.",
    "es": "El margen es bajo ({value}%). La mayoría de los pedidos de catering apunta a un margen de 25–40%."
  },
  {
    "en": "⏱ {v0} so far — {v1} more before a median means anything.",
    "es": "⏱ Van {v0}; faltan {v1} mediciones para que la mediana tenga significado."
  },
  {
    "en": "Three meals a day, seven days a week ({count} prospects)",
    "es": "Tres comidas al día, siete días a la semana ({count} prospectos)"
  },
  {
    "en": "{v0} Inventory was not replaced with an empty state.",
    "es": "{v0} El inventario no se reemplazó por un estado vacío."
  },
  {
    "en": "📈 Forecast accuracy: avg {v0}% error over last {v1} days",
    "es": "📈 Precisión del pronóstico: error promedio de {v0}% durante los últimos {v1} días"
  },
  {
    "en": "Packing record: {v0} · · {v1} · requiere nueva medición",
    "es": "Registro de empaque: {v0} · · {v1} · requiere nueva medición"
  },
  {
    "en": "Registro de empaque: {v0} · · {v1} · new reading needed",
    "es": "Registro de empaque: {v0} · · {v1} · requiere nueva medición"
  },
  {
    "en": "Review the lead and choose your next action. · {value}",
    "es": "Revisa el prospecto y elige la próxima acción. · {value}"
  },
  {
    "en": "Packing record: {v0} · {v1} °F · {v2} · new reading needed",
    "es": "Registro de empaque: {v0} · {v1} °F · {v2} · requiere nueva medición"
  },
  {
    "en": "Packing record: {v0} · · · requiere nueva medición",
    "es": "Registro de empaque: {v0} · · · requiere nueva medición"
  },
  {
    "en": "Registro de empaque: {v0} · · · new reading needed",
    "es": "Registro de empaque: {v0} · · · requiere nueva medición"
  },
  {
    "en": "Approval record: {v0} · owner {v1} · {v2} · Exact manifest",
    "es": "Registro de aprobación: {v0} · propietario {v1} · {v2} · Manifiesto exacto"
  },
  {
    "en": "Made by {value}. Still a draft; add it or discard it.",
    "es": "Creada por {value}. Sigue siendo un borrador; agrégala o descártala."
  },
  {
    "en": "Below {value} measurements no median is shown at all.",
    "es": "Por debajo de {value} mediciones no se muestra ninguna mediana."
  },
  {
    "en": "{value} — this does NOT mean your documents are gone.",
    "es": "{value} — esto NO significa que tus documentos hayan desaparecido."
  },
  {
    "en": "This week: {v0} bowls ({v1} subscription + {v2} on-demand)",
    "es": "Esta semana: {v0} bowls ({v1} por suscripción + {v2} a pedido)"
  },
  {
    "en": "Packing record: {v0} · {v1} °F · · new reading needed",
    "es": "Registro de empaque: {v0} · {v1} °F · · requiere nueva medición"
  },
  {
    "en": "Recorded Instagram token expiry has passed: {date}.",
    "es": "La fecha de vencimiento registrada del token de Instagram ya pasó: {date}."
  },
  {
    "en": "{v0}: Provider accepted · delivery unverified · {v1}",
    "es": "{v0}: el proveedor aceptó el envío · entrega sin verificar · {v1}"
  },
  {
    "en": "⚠️ This account has never been invoiced at {value}.",
    "es": "⚠️ Nunca se ha facturado a esta cuenta con {value}."
  },
  {
    "en": "{v0} · {v1} · card {v2} •• · not approved · last error: {v3}",
    "es": "{v0} · {v1} · tarjeta {v2} •• · no aprobado · último error: {v3}"
  },
  {
    "en": "{value} KB total · each is titled from its filename",
    "es": "{value} KB en total · cada uno lleva como título su nombre de archivo"
  },
  {
    "en": "{v0} · {v1} · card {v2} ••{v3} · not approved · last error: {v4}",
    "es": "{v0} · {v1} · tarjeta {v2} ••{v3} · no aprobado · último error: {v4}"
  },
  {
    "en": "{v0} · {v1} · {v2} guests · tap for the production plan",
    "es": "{v0} · {v1} · {v2} invitados · toca para ver el plan de producción"
  },
  {
    "en": "{v0} · {v1} · card •• · not approved · last error: {v2}",
    "es": "{v0} · {v1} · tarjeta •• · no aprobado · último error: {v2}"
  },
  {
    "en": "{v0} · {v1} · card ••{v2} · not approved · last error: {v3}",
    "es": "{v0} · {v1} · tarjeta ••{v2} · no aprobado · último error: {v3}"
  },
  {
    "en": "· {v0} · card {v1} •• · not approved · last error: {v2}",
    "es": "· {v0} · tarjeta {v1} •• · no aprobado · último error: {v2}"
  },
  {
    "en": "Packing record: {v0} · · {v1} · new reading needed",
    "es": "Registro de empaque: {v0} · · {v1} · requiere nueva medición"
  },
  {
    "en": "{v0} Production policy editing is unavailable.",
    "es": "{v0} La edición de políticas de producción no está disponible."
  },
  {
    "en": "{v0} of {v1} posts left today (Instagram's limit).",
    "es": "Quedan {v0} de {v1} publicaciones para hoy (límite de Instagram)."
  },
  {
    "en": "· {v0} · card •• · not approved · last error: {v1}",
    "es": "· {v0} · tarjeta •• · no aprobado · último error: {v1}"
  },
  {
    "en": "· {v0} · card ••{v1} · not approved · last error: {v2}",
    "es": "· {v0} · tarjeta ••{v1} · no aprobado · último error: {v2}"
  },
  {
    "en": "Auto-dispatch ON · {value} min before each window",
    "es": "Despacho automático ACTIVADO · {value} min antes de cada horario"
  },
  {
    "en": "Deposit link created — {value}. Nothing sent yet.",
    "es": "Enlace de depósito creado: {value}. Todavía no se envió nada."
  },
  {
    "en": "Packing record: {v0} · · · new reading needed",
    "es": "Registro de empaque: {v0} · · · requiere nueva medición"
  },
  {
    "en": "{value} photos — Instagram's limit for one post.",
    "es": "{value} fotos: el límite de Instagram por publicación."
  },
  {
    "en": "Customer acknowledgement: not recorded · {value}",
    "es": "Confirmación del cliente: no registrada · {value}"
  },
  {
    "en": "{value}: Provider accepted · delivery unverified",
    "es": "{value}: el proveedor aceptó el envío · entrega sin verificar"
  },
  {
    "en": "approved {value} — amount changed, approve again",
    "es": "aprobado {value} — el importe cambió; apruébalo de nuevo"
  },
  {
    "en": "Recent completed or cancelled batches ({v0})",
    "es": "Lotes completados o cancelados recientemente ({v0})"
  },
  {
    "en": "{v0} · {v1} · {v2} guests — open the production plan",
    "es": "{v0} · {v1} · {v2} invitados — abrir el plan de producción"
  },
  {
    "en": "{v0} planned posts · {v1} scheduled · {v2} published",
    "es": "{v0} publicaciones previstas · {v1} programadas · {v2} publicadas"
  },
  {
    "en": "{v0} · {v1} guests · tap for the production plan",
    "es": "{v0} · {v1} invitados · toca para ver el plan de producción"
  },
  {
    "en": "{value} — on approval · owner approval required",
    "es": "{value} — al aprobarse · requiere aprobación del propietario"
  },
  {
    "en": "to {value} · edited by you · flags acknowledged",
    "es": "a {value} · editado por ti · afirmaciones señaladas reconocidas"
  },
  {
    "en": "Requirements met: {v0}/{v1} · historical result",
    "es": "Requisitos cumplidos: {v0}/{v1} · resultado histórico"
  },
  {
    "en": "License status on the state registry: {status}.",
    "es": "Estado de licencia en el registro estatal: {status}."
  },
  {
    "en": "{v0} · Uploading does not approve a photo.",
    "es": "{v0} · Cargar no aprueba una foto."
  },
  {
    "en": "Last opportunity: {v0} → contract account {v1}",
    "es": "Última oportunidad: {v0} → cuenta con contrato {v1}"
  },
  {
    "en": "searchable passages across {value} documents.",
    "es": "pasajes con búsqueda en {value} documentos."
  },
  {
    "en": "{v0} cents ÷ 100 ÷ {v1} ÷ {v2} for per-unit cost.",
    "es": "{v0} centavos ÷ 100 ÷ {v1} ÷ {v2} para el costo por unidad."
  },
  {
    "en": "{v0} · {v1} guests — open the production plan",
    "es": "{v0} · {v1} invitados — abrir el plan de producción"
  },
  {
    "en": "⚠ At {v0}/lunch you LOSE {v1} on every lunch.",
    "es": "⚠ A {v0}/almuerzo, PIERDES {v1} en cada almuerzo."
  },
  {
    "en": "🧾 Audit trail — who submitted what ({value})",
    "es": "🧾 Registro de auditoría — quién envió qué ({value})"
  },
  {
    "en": "Suggested {v0} routes for {v1} stops · ~{v2} mi ·",
    "es": "Rutas {v0} sugeridas para {v1} paradas · ~{v2} mi ·"
  },
  {
    "en": "Invoices will go to {value} · card button ON",
    "es": "Las facturas se enviarán a {value} · botón de tarjeta ACTIVADO"
  },
  {
    "en": "Source: {source} · Browsing path not recorded",
    "es": "Origen: {source} · Recorrido de navegación sin registrar"
  },
  {
    "en": "Readiness & audit details · {value} item(s)",
    "es": "Preparación y detalles de auditoría · {value} elemento(s)"
  },
  {
    "en": "Balances still owed · {value} booked events",
    "es": "Saldos pendientes · {value} eventos reservados"
  },
  {
    "en": "Convert to Contract Account — {value}/month",
    "es": "Convertir en cuenta con contrato — {value}/mes"
  },
  {
    "en": "Suggested {v0} route for {v1} stops · ~{v2} mi ·",
    "es": "Ruta {v0} sugerida para {v1} paradas · ~{v2} mi ·"
  },
  {
    "en": "Paid line ${v0} · {v1} pack(s) · {v2} {v3} per pack",
    "es": "Línea pagada ${v0} · {v1} paquetes · {v2} {v3} por paquete"
  },
  {
    "en": "{v0} Saved inventory remains unchanged.",
    "es": "{v0} El inventario guardado sigue sin cambios."
  },
  {
    "en": "{v0} · available {v1} · counted {v2} · expires {v3}",
    "es": "{v0} · disponible {v1} · contado {v2} · vence {v3}"
  },
  {
    "en": "{v0} rules · {v1} examples · {v2} / {v3} characters",
    "es": "{v0} reglas · {v1} ejemplos · {v2} / {v3} caracteres"
  },
  {
    "en": "Balances still owed · {value} booked event",
    "es": "Saldos pendientes · {value} evento reservado"
  },
  {
    "en": "{v0} — counties: {v1}; {v2} cities; near ≤ {v3} mi.",
    "es": "{v0} — condados: {v1}; {v2} ciudades; cerca de ≤ {v3} mi."
  },
  {
    "en": "{value} created — set terms, then Activate",
    "es": "{value} creado; establece las condiciones y luego actívalo"
  },
  {
    "en": "Paid line ${v0} · {v1} pack(s) · {v2} per pack",
    "es": "Línea pagada ${v0} · {v1} paquetes · {v2} por paquete"
  },
  {
    "en": "{v0} rule · {v1} examples · {v2} / {v3} characters",
    "es": "{v0} regla · {v1} ejemplos · {v2} / {v3} caracteres"
  },
  {
    "en": "{v0} rules · {v1} example · {v2} / {v3} characters",
    "es": "{v0} reglas · {v1} ejemplo · {v2} / {v3} caracteres"
  },
  {
    "en": "✓ Delivery fee covers the run (+{value}).",
    "es": "✓ La tarifa de entrega cubre el recorrido (+{value})."
  },
  {
    "en": "{value} stops back in the unassigned list",
    "es": "Las {value} paradas volvieron a la lista de pendientes de asignación"
  },
  {
    "en": "Recorded yield: Unavailable · {v0} · {v1}",
    "es": "Rendimiento registrado: no disponible · {v0} · {v1}"
  },
  {
    "en": "{v0} = {v1} recipe portions per sale unit",
    "es": "{v0} = {v1} porciones de receta por unidad de venta"
  },
  {
    "en": "{v0} rule · {v1} example · {v2} / {v3} characters",
    "es": "{v0} regla · {v1} ejemplo · {v2} / {v3} caracteres"
  },
  {
    "en": "Event date not recorded · {value} guests",
    "es": "Fecha del evento no registrada · {value} invitados"
  },
  {
    "en": "Source: {v0} · Submitted entry page: {v1}",
    "es": "Origen: {v0} · Página de entrada enviada: {v1}"
  },
  {
    "en": "No quote possible yet — missing: {value}",
    "es": "Todavía no se puede cotizar — falta: {value}"
  },
  {
    "en": "food {v0} + pkg {v1} + labor {v2} + delivery {v3}",
    "es": "alimentos {v0} + empaque {v1} + mano de obra {v2} + entrega {v3}"
  },
  {
    "en": "{value} stop back in the unassigned list",
    "es": "La parada {value} volvió a la lista de pendientes de asignación"
  },
  {
    "en": "Source: {source} · Submitted entry page: {page}",
    "es": "Origen: {source} · Página de envío: {page}"
  },
  {
    "en": "Serving time: {v0} · {v1} · Eastern time",
    "es": "Hora de servicio: {v0} · {v1} · Hora del Este"
  },
  {
    "en": "Suggested batch: {v0} · Plan enabled",
    "es": "Lote sugerido: {v0} · Plan activado"
  },
  {
    "en": "Made by {value} — still just a preview.",
    "es": "Creada por {value}; sigue siendo una vista previa."
  },
  {
    "en": "Approval record: {v0} · owner {v1} · {v2} · {v3}",
    "es": "Registro de aprobación: {v0} · propietario {v1} · {v2} · {v3}"
  },
  {
    "en": "Terms this customer agreed to · {value}",
    "es": "Condiciones aceptadas por este cliente · {value}"
  },
  {
    "en": "{v0} · {v1} · added {v2} · authorized by {v3} ({v4})",
    "es": "{v0} · {v1} · añadido {v2} · autorizado por {v3} ({v4})"
  },
  {
    "en": ": needed by {v0} open prospects ({v1}). {v2}",
    "es": ": necesario para {v0} prospectos abiertos ({v1}). {v2}"
  },
  {
    "en": "Published — {value} now shows your text",
    "es": "Publicado; {value} ahora muestra tu texto"
  },
  {
    "en": "📦 {v0} accepted · {v1} denied · {v2} missed",
    "es": "📦 {v0} aceptados · {v1} rechazados · {v2} no registrados"
  },
  {
    "en": ": needed by {v0} open prospects ({v1}).",
    "es": ": necesario para {v0} prospectos abiertos ({v1})."
  },
  {
    "en": "· {value} open prospects · 🟡 ask first",
    "es": "· {value} prospectos abiertos · 🟡 preguntar primero"
  },
  {
    "en": "🔒 Locked off in this release — {value}",
    "es": "🔒 Desactivado en esta versión — {value}"
  },
  {
    "en": "{v0} · · added {v1} · authorized by {v2} ({v3})",
    "es": "{v0} · · añadido {v1} · autorizado por {v2} ({v3})"
  },
  {
    "en": "· {v0} · added {v1} · authorized by {v2} ({v3})",
    "es": "· {v0} · añadido {v1} · autorizado por {v2} ({v3})"
  },
  {
    "en": "Checklist submitted ({v0} flagged)",
    "es": "Lista de verificación enviada ({v0} señalados)"
  },
  {
    "en": "Recorded yield: Unavailable · {v0}",
    "es": "Rendimiento registrado: no disponible · {v0}"
  },
  {
    "en": "Unfinished event · {v0} · version {v1}",
    "es": "Evento sin finalizar · {v0} · versión {v1}"
  },
  {
    "en": "🔒 Locked on in this release — {value}",
    "es": "🔒 Activado en esta versión — {value}"
  },
  {
    "en": "· · added {v0} · authorized by {v1} ({v2})",
    "es": "· · añadido {v0} · autorizado por {v1} ({v2})"
  },
  {
    "en": "Recorded {v0} for {v1} — no text sent.",
    "es": "Se registró {v0} para {v1}; no se envió ningún mensaje."
  },
  {
    "en": "Latest {v0} receipt lines · read {v1}",
    "es": "Últimas {v0} líneas de recibos · lectura {v1}"
  },
  {
    "en": "{v0} {v1} · 30 days · {v2} caption drafts",
    "es": "{v0} {v1} · 30 días · {v2} borradores de texto"
  },
  {
    "en": "{value} · current audit not verified",
    "es": "{value} · auditoría actual sin verificar"
  },
  {
    "en": "Customer acknowledgement: {v0} · {v1}",
    "es": "Confirmación del cliente: {v0} · {v1}"
  },
  {
    "en": "Built from the facts alone · {value}",
    "es": "Elaborado solo a partir de los hechos · {value}"
  },
  {
    "en": "{v0} · {v1} · added {v2} · authorized by {v3}",
    "es": "{v0} · {v1} · añadido {v2} · autorizado por {v3}"
  },
  {
    "en": "{v0} · {v1} · card {v2} •• · not approved",
    "es": "{v0} · {v1} · tarjeta {v2} •• · no aprobado"
  },
  {
    "en": "Create opportunities for all {value}",
    "es": "Crear oportunidades para los {value}"
  },
  {
    "en": "· not approved · last error: {value}",
    "es": "· no aprobado · último error: {value}"
  },
  {
    "en": "{v0} · {v1} · card {v2} ••{v3} · not approved",
    "es": "{v0} · {v1} · tarjeta {v2} ••{v3} · no aprobado"
  },
  {
    "en": "Restored — Brief is back to v{value}",
    "es": "Restaurado; el Resumen volvió a la versión {value}"
  },
  {
    "en": "Suggested batch: {v0} · Plan off",
    "es": "Lote sugerido: {v0} · Plan desactivado"
  },
  {
    "en": "{value} MB · Uploaded, not attached",
    "es": "{value} MB · subido, sin adjuntar"
  },
  {
    "en": "Previous / retired quotes ({value})",
    "es": "Cotizaciones anteriores / retiradas ({value})"
  },
  {
    "en": "Proposed by staff (staff) · {value}",
    "es": "Propuesto por el personal (personal) · {value}"
  },
  {
    "en": "{v0} · {v1} · card •• · not approved",
    "es": "{v0} · {v1} · tarjeta •• · no aprobado"
  },
  {
    "en": "{v0} · {v1} · card ••{v2} · not approved",
    "es": "{v0} · {v1} · tarjeta ••{v2} · no aprobado"
  },
  {
    "en": "{v0} · · added {v1} · authorized by {v2}",
    "es": "{v0} · · añadido {v1} · autorizado por {v2}"
  },
  {
    "en": "· {v0} · added {v1} · authorized by {v2}",
    "es": "· {v0} · añadido {v1} · autorizado por {v2}"
  },
  {
    "en": "· {v0} · card {v1} •• · not approved",
    "es": "· {v0} · tarjeta {v1} •• · no aprobado"
  },
  {
    "en": "Approved {value} — now mark it paid",
    "es": "Aprobado {value}; ahora márcalo como pagado"
  },
  {
    "en": "{value} added — copy its link below",
    "es": "{value} añadido; copia su enlace abajo"
  },
  {
    "en": "{count} follow-ups due · refreshed {time}",
    "es": "{count} seguimientos pendientes · actualizado {time}"
  },
  {
    "en": "Connected company {company} · sandbox",
    "es": "Empresa conectada {company} · entorno de pruebas"
  },
  {
    "en": "Today’s finished count for {v0}",
    "es": "Conteo de productos terminados de hoy para {v0}"
  },
  {
    "en": "Rejected caption citation: {value}",
    "es": "Cita del texto rechazada: {value}"
  },
  {
    "en": "Date not recorded · {value} guests",
    "es": "Fecha no registrada · {value} invitados"
  },
  {
    "en": "pay · {v0} stops · {v1} mi · done ~{v2}",
    "es": "pago · {v0} paradas · {v1} mi · termina aprox. {v2}"
  },
  {
    "en": "· {value} open prospects · ✅ ready",
    "es": "· {value} prospectos abiertos · ✅ listo"
  },
  {
    "en": "· {value} · card •• · not approved",
    "es": "· {value} · tarjeta •• · no aprobado"
  },
  {
    "en": "· · added {v0} · authorized by {v1}",
    "es": "· · añadido {v0} · autorizado por {v1}"
  },
  {
    "en": "· {v0} · card ••{v1} · not approved",
    "es": "· {v0} · tarjeta ••{v1} · no aprobado"
  },
  {
    "en": "· source: {v0} · researched: {v1} ·",
    "es": "· fuente: {v0} · investigado: {v1} ·"
  },
  {
    "en": "Assignment: {v0} · Execution: {v1}",
    "es": "Asignación: {v0} · Ejecución: {v1}"
  },
  {
    "en": "Owner-approved recipe v{v0} · {v1}",
    "es": "Receta v{v0} aprobada por el propietario · {v1}"
  },
  {
    "en": "Publish carousel · {value} photos",
    "es": "Publicar carrusel · {value} fotos"
  },
  {
    "en": "Length/count: {v0} · maximum: {v1}",
    "es": "Longitud/cantidad: {v0} · máximo: {v1}"
  },
  {
    "en": "{value}h left in the reply window",
    "es": "Quedan {value} h en la ventana de respuesta"
  },
  {
    "en": "Offer: Unspecified · CTA: {value}",
    "es": "Oferta: sin especificar · Llamada a la acción: {value}"
  },
  {
    "en": "Offer: {value} · CTA: Unspecified",
    "es": "Oferta: {value} · Llamada a la acción: sin especificar"
  },
  {
    "en": "{v0} · unknown · caption line {v1}",
    "es": "{v0} · desconocido · línea de texto {v1}"
  },
  {
    "en": "{v0} · {v1} · Solicitud de cambios",
    "es": "{v0} · {v1} · Solicitud de cambios"
  },
  {
    "en": "Customer acknowledgement: {value}",
    "es": "Confirmación del cliente: {value}"
  },
  {
    "en": "📗 In QuickBooks (invoice {value})",
    "es": "📗 En QuickBooks (factura {value})"
  },
  {
    "en": "{v0} characters · replaced by {v1}",
    "es": "{v0} caracteres · reemplazado por {v1}"
  },
  {
    "en": "Contract account created. {value}",
    "es": "Cuenta con contrato creada. {value}"
  },
  {
    "en": "· {value} open prospects · ⛔ gaps",
    "es": "· {value} prospectos abiertos · ⛔ brechas"
  },
  {
    "en": "Only {value} is still refundable.",
    "es": "Solo {value} todavía se puede reembolsar."
  },
  {
    "en": "Built {v0} route(s) for {v1} stops",
    "es": "Se crearon {v0} ruta(s) para {v1} paradas"
  },
  {
    "en": "Route assigned — {v0} · {v1} stops",
    "es": "Ruta asignada — {v0} · {v1} paradas"
  },
  {
    "en": "Customer acknowledgement: {status}",
    "es": "Confirmación de recepción al cliente: {status}"
  },
  {
    "en": "Token last refreshed {age} ago.",
    "es": "Token actualizado por última vez hace {age}."
  },
  {
    "en": "kcal · {v0}P / {v1}C / {v2}F · {v3} fiber",
    "es": "kcal · {v0}P / {v1}C / {v2}G · {v3} fibra"
  },
  {
    "en": "Packing record: {v0} · {v1} °F · {v2}",
    "es": "Registro de empaque: {v0} · {v1} °F · {v2}"
  },
  {
    "en": "· unknown · caption line {value}",
    "es": "· desconocido · línea de texto {value}"
  },
  {
    "en": "Approved {v0} · subject: “{v1}” ·",
    "es": "Aprobado {v0} · asunto: “{v1}” ·"
  },
  {
    "en": "Delivery subtotal — {value} days",
    "es": "Subtotal de entrega — {value} días"
  },
  {
    "en": "active — step {v0}, next due {v1}",
    "es": "activo — paso {v0}, próximo vencimiento {v1}"
  },
  {
    "en": "Cost updated ({value} unmatched)",
    "es": "Costo actualizado ({value} sin coincidencia)"
  },
  {
    "en": "Packing record: {v0} · {v1} °F ·",
    "es": "Registro de empaque: {v0} · {v1} °F ·"
  },
  {
    "en": "{v0} · available {v1} · counted {v2}",
    "es": "{v0} · disponible {v1} · contado {v2}"
  },
  {
    "en": "Diagnostic category: {v0} · {v1}",
    "es": "Categoría del diagnóstico: {v0} · {v1}"
  },
  {
    "en": "Delivery subtotal — {value} day",
    "es": "Subtotal de entrega — {value} día"
  },
  {
    "en": "to {value} · flags acknowledged",
    "es": "a {value} · afirmaciones señaladas reconocidas"
  },
  {
    "en": "Sign-in link emailed to {value}",
    "es": "Enlace de inicio de sesión enviado por correo a {value}"
  },
  {
    "en": "⏳ Out of date · trained {date}",
    "es": "⏳ Desactualizado · capacitado el {date}"
  },
  {
    "en": "Sent to Dayan — {v0} logged",
    "es": "Enviado a Dayan: {v0} registrado"
  },
  {
    "en": "Inventory snapshot for {v0}",
    "es": "Instantánea de inventario para {v0}"
  },
  {
    "en": "Per pack: {v0} · Per unit: {v1}",
    "es": "Por paquete: {v0} · Por unidad: {v1}"
  },
  {
    "en": "{v0} · Confirm serving time",
    "es": "{v0} · Confirmar hora de servicio"
  },
  {
    "en": "📷 Add another photo ({v0}/{v1})",
    "es": "📷 Agregar otra foto ({v0}/{v1})"
  },
  {
    "en": "Reminder availability: {value}",
    "es": "Disponibilidad del recordatorio: {value}"
  },
  {
    "en": "Deposit paid · balance {value}",
    "es": "Depósito pagado · saldo de {value}"
  },
  {
    "en": "Approved {v0} · subject: “{v1}”",
    "es": "Aprobado {v0} · asunto: “{v1}”"
  },
  {
    "en": "{value} week (same every week)",
    "es": "{value} semana (igual todas las semanas)"
  },
  {
    "en": "{v0} · {v1} passages · {v2} chars ·",
    "es": "{v0} · {v1} pasajes · {v2} caracteres ·"
  },
  {
    "en": "Proposed by staff ({v0}) · {v1}",
    "es": "Propuesto por el personal ({v0}) · {v1}"
  },
  {
    "en": "Proposed by {v0} (staff) · {v1}",
    "es": "Propuesto por {v0} (personal) · {v1}"
  },
  {
    "en": "Researched default: {time} ET",
    "es": "Valor predeterminado investigado: {time} ET"
  },
  {
    "en": "Reminder availability: {reason}",
    "es": "Disponibilidad del recordatorio: {reason}"
  },
  {
    "en": "Signed W-9 ({count} prospects)",
    "es": "W-9 firmado ({count} prospectos)"
  },
  {
    "en": "Recorded yield: {v0} · {v1} · {v2}",
    "es": "Rendimiento registrado: {v0} · {v1} · {v2}"
  },
  {
    "en": "AI-optimized · {v0} mi est",
    "es": "Optimizado con IA · {v0} mi estimadas"
  },
  {
    "en": "Paid line ${v0} · {v1} pack(s)",
    "es": "Línea pagada ${v0} · {v1} paquetes"
  },
  {
    "en": "Recorded: {v0} · {v1} °F · {v2} · {v3}",
    "es": "Registrado: {v0} · {v1} °F · {v2} · {v3}"
  },
  {
    "en": "Review {v0} planning notes",
    "es": "Revisar notas del plan {v0}"
  },
  {
    "en": "{v0} · enabled · revision {v1}",
    "es": "{v0} · activado · revisión {v1}"
  },
  {
    "en": "Language as written · {value}",
    "es": "Idioma tal como está escrito · {value}"
  },
  {
    "en": "{v0} — {v1} · Timezone not set",
    "es": "{v0} — {v1} · zona horaria sin definir"
  },
  {
    "en": "Collect {value} final balance",
    "es": "Cobrar el saldo final de {value}"
  },
  {
    "en": "{v0} · {v1} · No date · unpaid",
    "es": "{v0} · {v1} · Sin fecha · impago"
  },
  {
    "en": "Confirm terms — {value}/month",
    "es": "Confirmar condiciones — {value}/mes"
  },
  {
    "en": "Token last refreshed {value}.",
    "es": "Última actualización del token: {value}."
  },
  {
    "en": "Step {v0} · snoozed until {v1}",
    "es": "Paso {v0} · pospuesto hasta {v1}"
  },
  {
    "en": "; next week (from {value}) is",
    "es": "; la próxima semana (desde {value}) es"
  },
  {
    "en": "Live food handling · {v0}",
    "es": "Manipulación de alimentos en curso · {v0}"
  },
  {
    "en": "Packing record: {v0} · · {v1}",
    "es": "Registro de empaque: {v0} · · {v1}"
  },
  {
    "en": "Prep {v0} min · Cook {v1} min",
    "es": "Preparación {v0} min · Cocción {v1} min"
  },
  {
    "en": "{v0} · {v1} · Receipt {v2}, line {v3}",
    "es": "{v0} · {v1} · Recibo {v2}, línea {v3}"
  },
  {
    "en": "${v0} of ${v1} spent · ${v2} left",
    "es": "${v0} de ${v1} gastados · quedan ${v2}"
  },
  {
    "en": "{value} — · Timezone not set",
    "es": "{value} — · zona horaria sin definir"
  },
  {
    "en": "{value}Media URL unavailable",
    "es": "{value}URL del archivo no disponible"
  },
  {
    "en": "· {v0} followers · {v1} posts",
    "es": "· {v0} seguidores · {v1} publicaciones"
  },
  {
    "en": "— {value} · Timezone not set",
    "es": "— {value} · zona horaria sin definir"
  },
  {
    "en": "{value} scheduled for later.",
    "es": "{value} programado para más tarde."
  },
  {
    "en": "pay · {v0} stops · done ~{v1}",
    "es": "pago · {v0} paradas · termina aprox. {v1}"
  },
  {
    "en": "🍳 Prep sheet · {value} bowls",
    "es": "🍳 Hoja de preparación · {value} bowls"
  },
  {
    "en": "{v0} · {v1} passages · {v2} chars",
    "es": "{v0} · {v1} pasajes · {v2} caracteres"
  },
  {
    "en": "Marked {value} route(s) paid",
    "es": "Se marcaron como pagadas {value} ruta(s)"
  },
  {
    "en": "Packing record: {v0} · ·",
    "es": "Registro de empaque: {v0} · ·"
  },
  {
    "en": "Media {v0}{v1} video preview",
    "es": "Vista previa del video {v0}{v1}"
  },
  {
    "en": "Latest reminder: {v0} · {v1}",
    "es": "Recordatorio más reciente: {v0} · {v1}"
  },
  {
    "en": "Before you pitch a {value}:",
    "es": "Antes de presentar {value}:"
  },
  {
    "en": "📱 Trusted devices ({value})",
    "es": "📱 Dispositivos de confianza ({value})"
  },
  {
    "en": "pending · {value} · on time",
    "es": "pendiente · {value} · a tiempo"
  },
  {
    "en": "{v0} subtotal — {v1} lunches",
    "es": "Subtotal de {v0} — {v1} almuerzos"
  },
  {
    "en": "Proposed by staff · {value}",
    "es": "Propuesto por el personal · {value}"
  },
  {
    "en": "This week (from {value}) is",
    "es": "Esta semana (desde {value}) es"
  },
  {
    "en": "{v0} · {v1} · Change request",
    "es": "{v0} · {v1} · Solicitud de cambio"
  },
  {
    "en": "({value}% on-demand buffer)",
    "es": "({value}% de reserva a pedido)"
  },
  {
    "en": "Invoices will go to {value}",
    "es": "Las facturas se enviarán a {value}"
  },
  {
    "en": "Recorded yield: {v0} · {v1}",
    "es": "Rendimiento registrado: {v0} · {v1}"
  },
  {
    "en": "Confirmed address: {v0}",
    "es": "Dirección confirmada: {v0}"
  },
  {
    "en": "Per pack: {v0} · Per {v1}: {v2}",
    "es": "Por paquete: {v0} · Por {v1}: {v2}"
  },
  {
    "en": "Recorded quantity: {v0}",
    "es": "Cantidad registrada: {v0}"
  },
  {
    "en": "Remove requirement {v0}{v1}",
    "es": "Quitar requisito {v0}{v1}"
  },
  {
    "en": "{v0} stops · {v1} delivered",
    "es": "{v0} paradas · {v1} entregadas"
  },
  {
    "en": "Campaign image for {value}",
    "es": "Imagen de campaña para {value}"
  },
  {
    "en": "Evidence field: {v0} · {v1}",
    "es": "Campo de evidencia: {v0} · {v1}"
  },
  {
    "en": "Requirements met: {v0}/{v1}",
    "es": "Requisitos cumplidos: {v0}/{v1}"
  },
  {
    "en": "{value} item(s) to resolve",
    "es": "{value} elemento(s) por resolver"
  },
  {
    "en": "{value} · current snapshot",
    "es": "{value} · instantánea actual"
  },
  {
    "en": "{v0} · unknown · slide {v1}",
    "es": "{v0} · desconocido · diapositiva {v1}"
  },
  {
    "en": "{v0} · {v1} · caption line {v2}",
    "es": "{v0} · {v1} · línea de texto {v2}"
  },
  {
    "en": "Original request · {value}",
    "es": "Solicitud original · {value}"
  },
  {
    "en": "Paid in full · due {value}",
    "es": "Pagado en su totalidad · vence el {value}"
  },
  {
    "en": "🎉 Catering event · {value}",
    "es": "🎉 Evento de catering · {value}"
  },
  {
    "en": "✏️ Terms history ({value})",
    "es": "✏️ Historial de condiciones ({value})"
  },
  {
    "en": "{value} …loading the rest…",
    "es": "{value} …cargando el resto…"
  },
  {
    "en": "· {value} · ✉︎ contactable",
    "es": "· {value} · ✉︎ se puede contactar"
  },
  {
    "en": "to {value} · edited by you",
    "es": "a {value} · editado por ti"
  },
  {
    "en": "{v0} · off · revision {v1}",
    "es": "{v0} · desactivado · revisión {v1}"
  },
  {
    "en": "{v0} · {v1} · Eastern time",
    "es": "{v0} · {v1} · Hora del Este"
  },
  {
    "en": "Recorded overlay: {value}",
    "es": "Texto superpuesto registrado: {value}"
  },
  {
    "en": "Scheduled to send {value}",
    "es": "Programado para enviar {value}"
  },
  {
    "en": "Video preview for {value}",
    "es": "Vista previa del video de {value}"
  },
  {
    "en": "· unknown · slide {value}",
    "es": "· desconocido · diapositiva {value}"
  },
  {
    "en": "· {v0} · caption line {v1}",
    "es": "· {v0} · línea de texto {v1}"
  },
  {
    "en": "Lead is degraded: {value}",
    "es": "El líder funciona con limitaciones: {value}"
  },
  {
    "en": "Review {name} plan notes",
    "es": "Revisar {name} notas del plan"
  },
  {
    "en": "Final payment due {value}",
    "es": "Pago final vence el {value}"
  },
  {
    "en": "Last opportunity: {value}",
    "es": "Última oportunidad: {value}"
  },
  {
    "en": "Approve all {value} below",
    "es": "Aprobar los {value} de abajo"
  },
  {
    "en": "company {value} · sandbox",
    "es": "empresa {value} · entorno de pruebas"
  },
  {
    "en": "pay · {v0} stops · {v1} mi",
    "es": "pago · {v0} paradas · {v1} mi"
  },
  {
    "en": "{v0} · {v1} bowls forecast",
    "es": "{v0} · pronóstico de {v1} bowls"
  },
  {
    "en": "{v0} · {v1} (role default){v2}",
    "es": "{v0} · {v1} (predeterminado del rol){v2}"
  },
  {
    "en": "Could not convert.{value}",
    "es": "No se pudo convertir. {value}"
  },
  {
    "en": "Auto-reply set to {value}",
    "es": "Respuesta automática configurada en {value}"
  },
  {
    "en": "✓ Up to date · {date} · {detail}",
    "es": "✓ Al día · {date} · {detail}"
  },
  {
    "en": "Proposed by {name} ({role}) · {date}",
    "es": "Propuesto por {name} ({role}) · {date}"
  },
  {
    "en": "Last count saved {v0}",
    "es": "Último conteo guardado {v0}"
  },
  {
    "en": "More actions for {v0}",
    "es": "Más acciones para {v0}"
  },
  {
    "en": "Recipe reference {v0}{v1}",
    "es": "Referencia de receta {v0}{v1}"
  },
  {
    "en": "Declared source: {value}",
    "es": "Fuente declarada: {value}"
  },
  {
    "en": "AI budget · week {value}",
    "es": "Presupuesto de IA · semana {value}"
  },
  {
    "en": "Media · {value} asset(s)",
    "es": "Archivos · {value} elemento(s)"
  },
  {
    "en": "Review video for {value}",
    "es": "Revisar video de {value}"
  },
  {
    "en": "Review {v0}, {v1} item(s)",
    "es": "Revisar {v0}, {v1} elemento(s)"
  },
  {
    "en": "{v0}/{v1} clean approvals",
    "es": "{v0}/{v1} aprobaciones sin cambios"
  },
  {
    "en": "{value} · Change request",
    "es": "{value} · Solicitud de cambios"
  },
  {
    "en": "Event {v0} · — guests",
    "es": "Evento {v0} · — invitados"
  },
  {
    "en": "Latest reminder: {value}",
    "es": "Recordatorio más reciente: {value}"
  },
  {
    "en": "pending · {value} · late",
    "es": "pendiente · {value} · tarde"
  },
  {
    "en": "{value} new applications",
    "es": "{value} nuevas solicitudes"
  },
  {
    "en": "· {v0} (role default){v1}",
    "es": "· {v0} (predeterminado del rol){v1}"
  },
  {
    "en": "· {value} · no email yet",
    "es": "· {value} · aún sin correo"
  },
  {
    "en": "{v0} · {v1} confidence · {v2}",
    "es": "{v0} · {v1} de confianza · {v2}"
  },
  {
    "en": "{value} · SMS/voice: off",
    "es": "{value} · SMS/voz: desactivados"
  },
  {
    "en": "Latest reminder: {status}",
    "es": "Último recordatorio: {status}"
  },
  {
    "en": "Recent changes ({count})",
    "es": "Cambios recientes ({count})"
  },
  {
    "en": "Assigned staff: {v0}",
    "es": "Personal asignado: {v0}"
  },
  {
    "en": "Recorded yield: {v0}",
    "es": "Rendimiento registrado: {v0}"
  },
  {
    "en": "kcal · {v0}P / {v1}C / {v2}F",
    "es": "kcal · {v0}P / {v1}C / {v2}G"
  },
  {
    "en": "Recorded: {v0} · {v1} · {v2}",
    "es": "Registrado: {v0} · {v1} · {v2}"
  },
  {
    "en": "Brand Auditor · {value}",
    "es": "Auditor de marca · {value}"
  },
  {
    "en": "Preview digest: {value}",
    "es": "Resumen de integridad de la vista previa: {value}"
  },
  {
    "en": "{value} MB · Local file",
    "es": "{value} MB · archivo local"
  },
  {
    "en": "Also text it to {value}",
    "es": "También envíalo por mensaje de texto a {value}"
  },
  {
    "en": "Event {v0} · {v1} guests",
    "es": "Evento {v0} · {v1} invitados"
  },
  {
    "en": "{v0} · {v1} · No date · {v2}",
    "es": "{v0} · {v1} · Sin fecha · {v2}"
  },
  {
    "en": "{value} · Event not set",
    "es": "{value} · Evento sin definir"
  },
  {
    "en": "Erased {value} records.",
    "es": "Se borraron {value} registros."
  },
  {
    "en": "✏️ Edit terms — {value}",
    "es": "✏️ Editar condiciones — {value}"
  },
  {
    "en": "{value} new application",
    "es": "{value} nueva solicitud"
  },
  {
    "en": "{v0} · {v1} · card {v2} •• ·",
    "es": "{v0} · {v1} · tarjeta {v2} •• ·"
  },
  {
    "en": "{v0} · {v1} · card {v2} ••{v3} ·",
    "es": "{v0} · {v1} · tarjeta {v2} ••{v3} ·"
  },
  {
    "en": "Invoice {value} created",
    "es": "Factura {value} creada"
  },
  {
    "en": "Next follow-up: {date}",
    "es": "Próximo seguimiento: {date}"
  },
  {
    "en": "Prep started · {v0}",
    "es": "Preparación iniciada · {v0}"
  },
  {
    "en": "Confirm date · {v0}",
    "es": "Confirmar fecha · {v0}"
  },
  {
    "en": "Unknown {v0} {v1} · {v2} · {v3}",
    "es": "Desconocido {v0} {v1} · {v2} · {v3}"
  },
  {
    "en": "Offer: {v0} · CTA: {v1}",
    "es": "Oferta: {v0} · Llamada a la acción: {v1}"
  },
  {
    "en": "Selected photo {v0}{v1}",
    "es": "Foto seleccionada {v0}{v1}"
  },
  {
    "en": "Selected video {v0}{v1}",
    "es": "Video seleccionado {v0}{v1}"
  },
  {
    "en": "{value} · Format unset",
    "es": "{value} · formato sin definir"
  },
  {
    "en": "🔎 Market intel{value}:",
    "es": "🔎 Información de mercado{value}:"
  },
  {
    "en": "Final count by {value}",
    "es": "Recuento final para el {value}"
  },
  {
    "en": "{v0} · {v1} · {v2} · unpaid",
    "es": "{v0} · {v1} · {v2} · impago"
  },
  {
    "en": "{value} — next 2 weeks",
    "es": "{value} — próximas 2 semanas"
  },
  {
    "en": "{v0} · {v1} · added {v2} ({v3})",
    "es": "{v0} · {v1} · añadido {v2} ({v3})"
  },
  {
    "en": "{value} files selected",
    "es": "{value} archivos seleccionados"
  },
  {
    "en": "Proposed by {v0} · {v1}",
    "es": "Propuesto por {v0} · {v1}"
  },
  {
    "en": "{v0} · {v1} stops · {v2} mi",
    "es": "{v0} · {v1} paradas · {v2} mi"
  },
  {
    "en": "{v0} · {v1} · card •• ·",
    "es": "{v0} · {v1} · tarjeta •• ·"
  },
  {
    "en": "{v0} · {v1} · card ••{v2} ·",
    "es": "{v0} · {v1} · tarjeta ••{v2} ·"
  },
  {
    "en": "· {v0} · card {v1} •• ·",
    "es": "· {v0} · tarjeta {v1} •• ·"
  },
  {
    "en": "✓ Up to date · {date}",
    "es": "✓ Al día · {date}"
  },
  {
    "en": "Deposit paid · {date}",
    "es": "Depósito pagado · {date}"
  },
  {
    "en": "🔔 New order — {v0}",
    "es": "🔔 Nuevo pedido: {v0}"
  },
  {
    "en": "Saved plans ({v0})",
    "es": "Planes guardados ({v0})"
  },
  {
    "en": "Order · {v0} items{v1}",
    "es": "Pedido · {v0} artículos{v1}"
  },
  {
    "en": "Connected as @{value}",
    "es": "Conectado como @{value}"
  },
  {
    "en": "{v0} · version {v1} · {v2}",
    "es": "{v0} · versión {v1} · {v2}"
  },
  {
    "en": "· {v0} of {v1} checked",
    "es": "· {v0} de {v1} comprobados"
  },
  {
    "en": "Scheduled for {value}",
    "es": "Programado para {value}"
  },
  {
    "en": "{v0} · {v1} · version {v2}",
    "es": "{v0} · {v1} · versión {v2}"
  },
  {
    "en": "Erase {value} records",
    "es": "Borrar {value} registros"
  },
  {
    "en": "Order · {v0} items",
    "es": "Pedido · {v0} artículos"
  },
  {
    "en": "{value} (no dish set)",
    "es": "{value} (sin plato asignado)"
  },
  {
    "en": "{value} min per lunch",
    "es": "{value} min por almuerzo"
  },
  {
    "en": "2 · Mark {value} paid",
    "es": "2 · Marcar {value} como pagado"
  },
  {
    "en": "Read live at {value}.",
    "es": "Leído en vivo a las {value}."
  },
  {
    "en": "Order · {value} items",
    "es": "Pedido · {value} artículos"
  },
  {
    "en": "· {v0} stops · {v1} mi",
    "es": "· {v0} paradas · {v1} mi"
  },
  {
    "en": "Disqualified: {value}",
    "es": "Descalificado: {value}"
  },
  {
    "en": "· confirmed {value} ·",
    "es": "· confirmado {value} ·"
  },
  {
    "en": "{v0} · {v1} confidence",
    "es": "{v0} · {v1} de confianza"
  },
  {
    "en": "active — step {value}",
    "es": "activo — paso {value}"
  },
  {
    "en": "from {value} per meal",
    "es": "desde {value} por comida"
  },
  {
    "en": "· last error: {value}",
    "es": "· último error: {value}"
  },
  {
    "en": "· {value} · card •• ·",
    "es": "· {value} · tarjeta •• ·"
  },
  {
    "en": "{v0} · · added {v1} ({v2})",
    "es": "{v0} · · añadido {v1} ({v2})"
  },
  {
    "en": "· {v0} · added {v1} ({v2})",
    "es": "· {v0} · añadido {v1} ({v2})"
  },
  {
    "en": "· {v0} · card ••{v1} ·",
    "es": "· {v0} · tarjeta ••{v1} ·"
  },
  {
    "en": "Handed off · {v0}",
    "es": "Entregado al siguiente responsable · {v0}"
  },
  {
    "en": "{v0} active items",
    "es": "{v0} artículos activos"
  },
  {
    "en": "Order · {v0} item{v1}",
    "es": "Pedido · {v0} artículo{v1}"
  },
  {
    "en": "Move {value} earlier",
    "es": "Mover {value} antes"
  },
  {
    "en": "Validation: {value}.",
    "es": "Validación: {value}."
  },
  {
    "en": "{value} photos total",
    "es": "{value} fotos en total"
  },
  {
    "en": "{count} in the order",
    "es": "{count} en el pedido"
  },
  {
    "en": "Load more ({v0}/{v1})",
    "es": "Cargar más ({v0}/{v1})"
  },
  {
    "en": "{v0} · {v1} · on time",
    "es": "{v0} · {v1} · a tiempo"
  },
  {
    "en": "{v0}{v1}/{v2} stops · {v3} mi{v4}",
    "es": "{v0}{v1}/{v2} paradas · {v3} mi{v4}"
  },
  {
    "en": "Week total · {value}",
    "es": "Total de la semana · {value}"
  },
  {
    "en": "Reading {v0}{v1} of {v2}:",
    "es": "Leyendo {v0}{v1} de {v2}:"
  },
  {
    "en": "{v0} of {v1} indexed.",
    "es": "{v0} de {v1} indexados."
  },
  {
    "en": "{v0} · {v1} · {v2} guests",
    "es": "{v0} · {v1} · {v2} invitados"
  },
  {
    "en": "· · added {v0} ({v1})",
    "es": "· · añadido {v0} ({v1})"
  },
  {
    "en": "{v0} active item",
    "es": "{v0} artículo activo"
  },
  {
    "en": "Serve at {v0} ET",
    "es": "Servir a las {v0} ET"
  },
  {
    "en": "Unknown {v0} {v1} · {v2}",
    "es": "Desconocido {v0} {v1} · {v2}"
  },
  {
    "en": "{v0} · optimized",
    "es": "{v0} · optimizado"
  },
  {
    "en": "Aña’s inbox {value}",
    "es": "Bandeja de Aña {value}"
  },
  {
    "en": "Success: {v0} · {v1}",
    "es": "Éxito: {v0} · {v1}"
  },
  {
    "en": "{v0} · {v1} · slide {v2}",
    "es": "{v0} · {v1} · diapositiva {v2}"
  },
  {
    "en": "Actions for {person}",
    "es": "Acciones para {person}"
  },
  {
    "en": "Last error: {value}",
    "es": "Último error: {value}"
  },
  {
    "en": "Live now · v{value}",
    "es": "Activo ahora · v{value}"
  },
  {
    "en": "Saved file: {value}",
    "es": "Archivo guardado: {value}"
  },
  {
    "en": "(median of {value})",
    "es": "(mediana de {value})"
  },
  {
    "en": "1 · Approve {value}",
    "es": "1 · Aprobar {value}"
  },
  {
    "en": "{value} — rush fees",
    "es": "{value} — cargos por urgencia"
  },
  {
    "en": "pay · {value} stops",
    "es": "pago · {value} paradas"
  },
  {
    "en": "{v0} · {v1} · added {v2}",
    "es": "{v0} · {v1} · añadido {v2}"
  },
  {
    "en": "· — · asked {value}",
    "es": "· — · solicitado {value}"
  },
  {
    "en": "{value} routes done",
    "es": "{value} rutas completadas"
  },
  {
    "en": "· confirmed {value}",
    "es": "· confirmado {value}"
  },
  {
    "en": "{v0} {v1} confidence",
    "es": "{v0} {v1} de confianza"
  },
  {
    "en": "(median of {v0}{v1})",
    "es": "(mediana de {v0}{v1})"
  },
  {
    "en": "{v0} · {v1} · in {v2} ({v3})",
    "es": "{v0} · {v1} · a las {v2} ({v3})"
  },
  {
    "en": "{v0} · {v1} items · {v2}",
    "es": "{v0} · {v1} artículos · {v2}"
  },
  {
    "en": "Gift on for {value}",
    "es": "Regalo activado para {value}"
  },
  {
    "en": "Requested {v0}.",
    "es": "Solicitado {v0}."
  },
  {
    "en": "{v0} / {v1} minutes",
    "es": "{v0} / {v1} minutos"
  },
  {
    "en": "{v0} · Inactive",
    "es": "{v0} · Inactivo"
  },
  {
    "en": "{v0} · planned {v1}",
    "es": "{v0} · planificado {v1}"
  },
  {
    "en": "Media {v0}{v1} for {v2}",
    "es": "Archivo {v0}{v1} para {v2}"
  },
  {
    "en": "Move {value} later",
    "es": "Mover {value} después"
  },
  {
    "en": "Open media {v0}{v1}",
    "es": "Abrir archivo {v0}{v1}"
  },
  {
    "en": "· {v0} · slide {v1}",
    "es": "· {v0} · diapositiva {v1}"
  },
  {
    "en": "Deposit {v0} · {v1}",
    "es": "Depósito de {v0} · {v1}"
  },
  {
    "en": "Quantity · {value}",
    "es": "Cantidad · {value}"
  },
  {
    "en": "{value} · — guests",
    "es": "{value} · — invitados"
  },
  {
    "en": "Calendar: {value}.",
    "es": "Calendario: {value}."
  },
  {
    "en": "· {value} min each",
    "es": "· {value} min cada uno"
  },
  {
    "en": "{value} characters",
    "es": "{value} caracteres"
  },
  {
    "en": "Code {v0} · {v1} · {v2}",
    "es": "Código {v0} · {v1} · {v2}"
  },
  {
    "en": "· {v0} · asked {v1}",
    "es": "· {v0} · solicitado {v1}"
  },
  {
    "en": "other · {v0} · {v1}",
    "es": "otro · {v0} · {v1}"
  },
  {
    "en": "{v0} · · added {v1}",
    "es": "{v0} · · añadido {v1}"
  },
  {
    "en": "· {v0} · added {v1}",
    "es": "· {v0} · añadido {v1}"
  },
  {
    "en": "· {v0} · in {v1} ({v2})",
    "es": "· {v0} · a las {v1} ({v2})"
  },
  {
    "en": "{v0} checklist",
    "es": "{v0} lista de verificación"
  },
  {
    "en": "{v0}/{v1} · closed",
    "es": "{v0}/{v1} · cerrado"
  },
  {
    "en": "· {v0} ordered",
    "es": "· {v0} pedidos"
  },
  {
    "en": "{value} · unknown",
    "es": "{value} · desconocido"
  },
  {
    "en": "{v0} · {v1} slides",
    "es": "{v0} · {v1} diapositivas"
  },
  {
    "en": "· deposit {value}",
    "es": "· depósito de {value}"
  },
  {
    "en": "{value} · Eastern",
    "es": "{value} · hora del Este"
  },
  {
    "en": "{value} scheduled",
    "es": "{value} programado"
  },
  {
    "en": "· updated {value}",
    "es": "· actualizado {value}"
  },
  {
    "en": "BLOCKED — {value}",
    "es": "BLOQUEADO — {value}"
  },
  {
    "en": "Lunches ({value})",
    "es": "Almuerzos ({value})"
  },
  {
    "en": "pending · {value}",
    "es": "pendiente · {value}"
  },
  {
    "en": "{value} · on time",
    "es": "{value} · a tiempo"
  },
  {
    "en": "{v0} · {v1} · late",
    "es": "{v0} · {v1} · tarde"
  },
  {
    "en": "Proposed: {value}",
    "es": "Propuesto: {value}"
  },
  {
    "en": "Last {value} days",
    "es": "Últimos {value} días"
  },
  {
    "en": "· {v0} pts · {v1}×",
    "es": "· {v0} pts · {v1}×"
  },
  {
    "en": "${value} location",
    "es": "${value} ubicación"
  },
  {
    "en": "{v0} {v1} · last: {v2}",
    "es": "{v0} {v1} · último: {v2}"
  },
  {
    "en": "· · added {value}",
    "es": "· · añadido {value}"
  },
  {
    "en": "Refunded {value}.",
    "es": "Se reembolsó {value}."
  },
  {
    "en": "Saved {v0} of {v1}",
    "es": "Guardado {v0} de {v1}"
  },
  {
    "en": "On hand ({unit})",
    "es": "Disponible ({unit})"
  },
  {
    "en": "{v0} stops · {v1}",
    "es": "{v0} paradas · {v1}"
  },
  {
    "en": "{v0} · Active",
    "es": "{v0} · Activo"
  },
  {
    "en": "{v0} · legacy",
    "es": "{v0} · heredado"
  },
  {
    "en": "{v0} · {v1} items{v2}",
    "es": "{v0} · {v1} artículos{v2}"
  },
  {
    "en": "Caption: {value}",
    "es": "Texto: {value}"
  },
  {
    "en": "Checked: {value}",
    "es": "Comprobado: {value}"
  },
  {
    "en": "{value} selected",
    "es": "{value} seleccionados"
  },
  {
    "en": "Loaded “{value}”",
    "es": "Se cargó «{value}»"
  },
  {
    "en": "Received {value}",
    "es": "Recibido el {value}"
  },
  {
    "en": "{v0} · Event {v1}",
    "es": "{v0} · Evento {v1}"
  },
  {
    "en": "approved {value}",
    "es": "aprobado {value}"
  },
  {
    "en": "{v0} · {v1} items",
    "es": "{v0} · {v1} artículos"
  },
  {
    "en": "{value} delivery",
    "es": "entrega de {value}"
  },
  {
    "en": "PIN for {value}:",
    "es": "PIN para {value}:"
  },
  {
    "en": "{v0} · match {v1}",
    "es": "{v0} · coincidencia {v1}"
  },
  {
    "en": "{v0} · {v1} stops",
    "es": "{v0} · {v1} paradas"
  },
  {
    "en": "· edited {value}",
    "es": "· editado {value}"
  },
  {
    "en": "· {value} active",
    "es": "· {value} activos"
  },
  {
    "en": "{v0} · in {v1} ({v2})",
    "es": "{v0} · a las {v1} ({v2})"
  },
  {
    "en": "Approved {value}",
    "es": "Aprobado {value}"
  },
  {
    "en": "Received {date}",
    "es": "Recibido el {date}"
  },
  {
    "en": "{name} · {count} items",
    "es": "{name} · {count} artículos"
  },
  {
    "en": "Vendor: {v0}",
    "es": "Proveedor: {v0}"
  },
  {
    "en": "Week {v0} · {v1}",
    "es": "Semana {v0} · {v1}"
  },
  {
    "en": "{v0} + ½ avo",
    "es": "{v0} + ½ aguacate"
  },
  {
    "en": "{v0} · {v1} item{v2}",
    "es": "{v0} · {v1} artículo{v2}"
  },
  {
    "en": "Slides: {value}",
    "es": "Diapositivas: {value}"
  },
  {
    "en": "{value} item(s)",
    "es": "{value} elemento(s)"
  },
  {
    "en": "Saved “{value}”",
    "es": "Se guardó «{value}»"
  },
  {
    "en": "Deposit {value}",
    "es": "Depósito de {value}"
  },
  {
    "en": "Use {value} min",
    "es": "Usar {value} min"
  },
  {
    "en": "cut-off {value}",
    "es": "fecha límite {value}"
  },
  {
    "en": "{value}% margin",
    "es": "margen de {value}%"
  },
  {
    "en": "Send to {value}",
    "es": "Enviar a {value}"
  },
  {
    "en": "Route {v0}{v1} ⚡",
    "es": "Ruta {v0}{v1} ⚡"
  },
  {
    "en": "{v0} {v1} · ETA {v2}",
    "es": "{v0} {v1} · llegada estimada {v2}"
  },
  {
    "en": "· match {value}",
    "es": "· coincidencia {value}"
  },
  {
    "en": "· {value} stops",
    "es": "· {value} paradas"
  },
  {
    "en": "Code {v0} · {v1}",
    "es": "Código {v0} · {v1}"
  },
  {
    "en": "Step {v0} · {v1}",
    "es": "Paso {v0} · {v1}"
  },
  {
    "en": "company {value}",
    "es": "empresa {value}"
  },
  {
    "en": "· in {v0} ({v1})",
    "es": "· a las {v0} ({v1})"
  },
  {
    "en": "{v0} · last {v1}",
    "es": "{v0} · último {v1}"
  },
  {
    "en": "owner · {detail}",
    "es": "propietario · {detail}"
  },
  {
    "en": "Approve {amount}",
    "es": "Aprobar {amount}"
  },
  {
    "en": "{name} · {count} item",
    "es": "{name} · {count} artículo"
  },
  {
    "en": "Marked {v0}",
    "es": "Marcado {v0}"
  },
  {
    "en": "{v0} mi est",
    "es": "{v0} mi estimadas"
  },
  {
    "en": "{v0} waived",
    "es": "{v0} exonerado"
  },
  {
    "en": "＋ Add: {v0}",
    "es": "＋ Agregar: {v0}"
  },
  {
    "en": "Frame {v0}{v1}:",
    "es": "Fotograma {v0}{v1}:"
  },
  {
    "en": "Loaded {value}",
    "es": "Cargado {value}"
  },
  {
    "en": "Remove {value}",
    "es": "Quitar {value}"
  },
  {
    "en": "{value} / unit",
    "es": "{value} / unidad"
  },
  {
    "en": "{v0} {v1} · {v2} KB",
    "es": "{v0} {v1} · {v2} KB"
  },
  {
    "en": "{value} orders",
    "es": "{value} pedidos"
  },
  {
    "en": "· last {value}",
    "es": "· últimos {value}"
  },
  {
    "en": "({value} min).",
    "es": "({value} min)."
  },
  {
    "en": "{value} · RUSH",
    "es": "{value} · URGENTE"
  },
  {
    "en": "{value} · late",
    "es": "{value} · tarde"
  },
  {
    "en": "{v0}{v1}/{v2} stops{v3}",
    "es": "{v0}{v1}/{v2} paradas{v3}"
  },
  {
    "en": "{value} so far",
    "es": "{value} hasta ahora"
  },
  {
    "en": "{value} active",
    "es": "{value} activos"
  },
  {
    "en": "card ••{value}",
    "es": "tarjeta ••{value}"
  },
  {
    "en": "{count} ROUTES",
    "es": "{count} RUTAS"
  },
  {
    "en": "{count} guests",
    "es": "{count} invitados"
  },
  {
    "en": "{name} — prep",
    "es": "{name} — preparación"
  },
  {
    "en": "{count} · Par {par}",
    "es": "{count} · Mínimo {par}"
  },
  {
    "en": "{v0}{v1}. Stop",
    "es": "{v0}{v1}. Parada"
  },
  {
    "en": "Rule: {value}",
    "es": "Regla: {value}"
  },
  {
    "en": "Slide {value}",
    "es": "Diapositiva {value}"
  },
  {
    "en": "Slide {v0}{v1}",
    "es": "Diapositiva {v0}{v1}"
  },
  {
    "en": "{v0} · to {v1}",
    "es": "{v0} · para {v1}"
  },
  {
    "en": "{value} weeks",
    "es": "{value} semanas"
  },
  {
    "en": "{value}/lunch",
    "es": "{value}/almuerzo"
  },
  {
    "en": "Route {v0}{v1}",
    "es": "Ruta {v0}{v1}"
  },
  {
    "en": "· {value} pts",
    "es": "· {value} pts"
  },
  {
    "en": "{value} stops",
    "es": "{value} paradas"
  },
  {
    "en": "Order{v0} {v1}",
    "es": "Pedido {v0} {v1}"
  },
  {
    "en": "(max {value})",
    "es": "(máximo {value})"
  },
  {
    "en": "since {value}",
    "es": "desde {value}"
  },
  {
    "en": "Call {value}",
    "es": "Llamar a {value}"
  },
  {
    "en": "Week {value}",
    "es": "Semana {value}"
  },
  {
    "en": "week {value}",
    "es": "semana {value}"
  },
  {
    "en": "{value} paid",
    "es": "{value} pagado"
  },
  {
    "en": "+{value} min",
    "es": "+{value} min"
  },
  {
    "en": "{value} · ai",
    "es": "{value} · IA"
  },
  {
    "en": "Code {value}",
    "es": "Código {value}"
  },
  {
    "en": "Step {value}",
    "es": "Paso {value}"
  },
  {
    "en": "{value}% fit",
    "es": "afinidad del {value}%"
  },
  {
    "en": "{count}m ago",
    "es": "hace {count} min"
  },
  {
    "en": "{count}d ago",
    "es": "hace {count} días"
  },
  {
    "en": "ETA {v0}",
    "es": "Llegada estimada {v0}"
  },
  {
    "en": "{v0} vs {v1}",
    "es": "{v0} frente a {v1}"
  },
  {
    "en": "{value} min",
    "es": "{value} min"
  },
  {
    "en": "{value} pts",
    "es": "{value} pts"
  },
  {
    "en": "by {value}",
    "es": "por {value}"
  },
  {
    "en": "{value} KB",
    "es": "{value} KB"
  },
  {
    "en": "{value}/wk",
    "es": "{value}/sem"
  },
  {
    "en": "{value} mi",
    "es": "{value} mi"
  },
  {
    "en": "to {value}",
    "es": "a {value}"
  }
];
  if (window.AnejoI18n && typeof window.AnejoI18n.extend === "function") window.AnejoI18n.extend(fragmentDictionary);
  else (window.__hubI18nQueue = window.__hubI18nQueue || []).push(fragmentDictionary);
  if (window.AnejoI18n && typeof window.AnejoI18n.extendPatterns === "function") window.AnejoI18n.extendPatterns(fragmentPatterns);
  else window.__anejoI18nPatterns = (window.__anejoI18nPatterns || []).concat(fragmentPatterns);

})();
