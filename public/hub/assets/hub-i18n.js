/* Añejo HUB — Spanish dictionary for the internal app. Merged into the shared i18n
   engine via AnejoI18n.extend(). Loaded on every HUB page by hub.js. English text that
   appears verbatim in the UI maps to Spanish; brand names (Añejo, Añejo HUB) stay as-is. */
(function () {
  var HUB = {
    // ---- top bars (AÑEJO · X) ----
    "AÑEJO · ACCOUNT": "AÑEJO · CUENTA", "AÑEJO · CHECKLIST": "AÑEJO · LISTA",
    "AÑEJO · CHECKLISTS": "AÑEJO · LISTAS", "AÑEJO · COMMAND": "AÑEJO · COMANDO",
    "AÑEJO · COMMS": "AÑEJO · MENSAJES", "AÑEJO · DELIVERIES": "AÑEJO · ENTREGAS",
    "AÑEJO · DRIVER": "AÑEJO · CONDUCTOR", "AÑEJO · END OF DAY": "AÑEJO · FIN DE DÍA",
    "AÑEJO · EOD": "AÑEJO · FIN DE DÍA", "AÑEJO · EXPENSES": "AÑEJO · GASTOS",
    "AÑEJO · FINANCE": "AÑEJO · FINANZAS", "AÑEJO · KITCHEN": "AÑEJO · COCINA",
    "AÑEJO · LIBRARY": "AÑEJO · BIBLIOTECA", "AÑEJO · REPORT ISSUE": "AÑEJO · REPORTAR PROBLEMA",
    "AÑEJO · RESTOCK": "AÑEJO · REABASTECIMIENTO", "AÑEJO · ROUTE": "AÑEJO · RUTA",
    "AÑEJO · STAFF": "AÑEJO · PERSONAL", "AÑEJO · STUDIO": "AÑEJO · ESTUDIO",
    "AÑEJO · SUMMARY": "AÑEJO · RESUMEN", "AÑEJO · TEMP LOG": "AÑEJO · TEMPERATURA",

    // ---- page titles ----
    "Añejo HUB · Account": "Añejo HUB · Cuenta", "Añejo HUB · Checklists": "Añejo HUB · Listas",
    "Añejo HUB · Command Center": "Añejo HUB · Centro de Comando", "Añejo HUB · Comms": "Añejo HUB · Mensajes",
    "Añejo HUB · Creative Studio": "Añejo HUB · Estudio Creativo", "Añejo HUB · Daily Summary": "Añejo HUB · Resumen Diario",
    "Añejo HUB · Deliveries": "Añejo HUB · Entregas", "Añejo HUB · End of Day": "Añejo HUB · Fin de Día",
    "Añejo HUB · Finance": "Añejo HUB · Finanzas", "Añejo HUB · Kitchen": "Añejo HUB · Cocina",
    "Añejo HUB · Library": "Añejo HUB · Biblioteca", "Añejo HUB · Restock": "Añejo HUB · Reabastecimiento",
    "Añejo HUB · Staff": "Añejo HUB · Personal", "Checklist · Añejo Driver": "Lista · Añejo Conductor",
    "Driver · Añejo HUB": "Conductor · Añejo HUB", "End of Day · Añejo Driver": "Fin de Día · Añejo Conductor",
    "Expenses · Añejo Driver": "Gastos · Añejo Conductor", "Offline — Añejo HUB": "Sin conexión — Añejo HUB",
    "Report Issue · Añejo Driver": "Reportar Problema · Añejo Conductor", "Route · Añejo Driver": "Ruta · Añejo Conductor",
    "Temp Log · Añejo Driver": "Temperatura · Añejo Conductor", "Sign in · Añejo": "Iniciar sesión · Añejo",

    // ---- nav + sections ----
    "Overview": "Resumen", "Deliveries": "Entregas", "Kitchen": "Cocina", "Staff": "Personal",
    "Finance": "Finanzas", "Comms": "Mensajes", "Orders": "Pedidos", "Checklists": "Listas",
    "Studio": "Estudio", "Library": "Biblioteca", "EOD": "Fin de día", "Today": "Hoy",
    "Route": "Ruta", "Temp": "Temp.", "Expenses": "Gastos", "Routes": "Rutas", "Account": "Cuenta",
    "Checklist": "Lista", "Summary": "Resumen", "Creative Studio": "Estudio Creativo",
    "Daily summary": "Resumen diario", "Report issue": "Reportar problema", "Temp log": "Registro de temperatura",
    "Mileage / Expense": "Millaje / Gasto", "Recipes": "Recetas", "Manuals": "Manuales",
    "Policies": "Políticas", "Procedures": "Procedimientos", "Bowls": "Bowls",

    // ---- dashboard tiles / labels ----
    "Orders open": "Pedidos abiertos", "Deliveries today": "Entregas hoy", "On shift now": "En turno ahora",
    "Open tickets": "Tickets abiertos", "Pending expenses": "Gastos pendientes",
    "Temp excursions": "Excursiones de temp.", "Temp excursions today": "Excursiones de temp. hoy",
    "Open alerts": "Alertas abiertas", "Excursions": "Excursiones", "Orders pending": "Pedidos pendientes",
    "Orders to fulfill": "Pedidos por cumplir", "Restock orders open": "Reabastecimientos abiertos",
    "Revenue": "Ingresos", "Net (est)": "Neto (est.)", "Rev-share owed": "Reparto adeudado",
    "Quick actions": "Acciones rápidas", "Recent orders": "Pedidos recientes", "Live orders": "Pedidos en vivo",
    "Today's reminders": "Recordatorios de hoy", "Today's route": "Ruta de hoy", "Missing": "Faltante",
    "Unassigned": "Sin asignar", "AI-optimized ·": "Optimizado por IA ·",

    // ---- clock ----
    "Clock in": "Marcar entrada", "Clock out": "Marcar salida", "Clocked in": "Entrada marcada",
    "Clocked out": "Salida marcada", "On the clock": "En turno", "Off the clock": "Fuera de turno",
    "Tap to start your shift": "Toca para iniciar tu turno", "Since": "Desde",

    // ---- buttons / actions ----
    "← Back": "← Atrás", "‹ Back to library": "‹ Volver a la biblioteca", "Back to orders": "Volver a pedidos",
    "Close": "Cerrar", "Dismiss": "Descartar", "Retry": "Reintentar", "Install": "Instalar", "Stop": "Detener",
    "+ Add item": "+ Agregar artículo", "+ Add a staff member": "+ Agregar miembro del personal",
    "Add photo": "Agregar foto", "Add a title or details": "Agrega un título o detalles",
    "Mark delivered": "Marcar entregado", "Mark failed": "Marcar fallido", "Switch to failed": "Cambiar a fallido",
    "Switch to delivered": "Cambiar a entregado", "Submit checklist": "Enviar lista", "Submit expense": "Enviar gasto",
    "Submit mileage": "Enviar millaje", "Submit report": "Enviar reporte", "Submit ticket": "Enviar ticket",
    "Save draft": "Guardar borrador", "Finalize": "Finalizar", "Flag issue": "Reportar problema",
    "Pre-draft with AI": "Pre-borrador con IA", "✨ AI draft recipe": "✨ Receta con IA",
    "✨ AI pre-draft from today": "✨ Pre-borrador de IA con hoy", "✨ AI-suggest quantities": "✨ Sugerir cantidades con IA",
    "Log temperature": "Registrar temperatura", "Start a session": "Iniciar una sesión", "Record voice": "Grabar voz",
    "New restock order": "Nueva orden de reabastecimiento", "Make lead": "Hacer líder", "Unset lead": "Quitar líder",
    "Reset PIN": "Restablecer PIN", "Deactivate": "Desactivar", "Reactivate": "Reactivar",
    "Update PIN": "Actualizar PIN", "Sign in": "Iniciar sesión", "Sign out": "Cerrar sesión",
    "Continue": "Continuar", "Use a different account": "Usar otra cuenta", "Back to portal": "Volver al portal",

    // ---- status words ----
    "Pending": "Pendiente", "Completed": "Completado", "Failed": "Fallido", "Ready": "Listo",
    "In prep": "En preparación", "Prep started": "Preparación iniciada", "Marked ready": "Marcado listo",
    "Marked failed": "Marcado fallido", "Delivered": "Entregado", "Acknowledged": "Confirmado",
    "Submitted": "Enviado",

    // ---- forms / labels ----
    "Full name": "Nombre completo", "Phone (for PIN sign-in)": "Teléfono (para iniciar con PIN)",
    "Email (optional)": "Correo (opcional)", "Initial PIN (optional)": "PIN inicial (opcional)",
    "Current PIN": "PIN actual", "New PIN (4–8 digits)": "Nuevo PIN (4–8 dígitos)",
    "Confirm new PIN": "Confirmar nuevo PIN", "Amount (USD)": "Monto (USD)", "Miles": "Millas",
    "Mileage": "Millaje", "Receipt photo": "Foto del recibo", "Note (optional)": "Nota (opcional)",
    "Photo (optional)": "Foto (opcional)", "Proof photo": "Foto de comprobante",
    "Signature (optional)": "Firma (opcional)", "Severity": "Severidad", "Reason": "Motivo",
    "Type": "Tipo", "Title": "Título", "Date": "Fecha", "Details": "Detalles", "Context": "Contexto",
    "Short summary": "Resumen breve", "Blockers": "Obstáculos", "Item": "Artículo",
    "Working title (optional)": "Título de trabajo (opcional)", "Order ID (optional)": "ID de pedido (opcional)",
    "Temperature (°F)": "Temperatura (°F)", "Item tally (batch prep)": "Conteo de artículos (preparación)",
    "Phone number or email": "Teléfono o correo", "Your PIN": "Tu PIN",

    // ---- enums ----
    "Low": "Baja", "Medium": "Media", "High": "Alta", "Urgent": "Urgente", "Lunch": "Almuerzo",
    "Dinner": "Cena", "Loadout": "Carga", "Transit": "Tránsito", "Dropoff": "Entrega", "Vehicle": "Vehículo",
    "Route + return": "Ruta + regreso", "Opening": "Apertura", "Closing": "Cierre", "Prep": "Preparación",
    "Sanitation": "Sanitización", "Procedure": "Procedimiento", "Fuel": "Combustible", "Supplies": "Suministros",
    "Maintenance": "Mantenimiento", "Other": "Otro", "All": "Todos", "By status": "Por estado",
    "No answer": "Sin respuesta", "Wrong address": "Dirección incorrecta", "Refused": "Rechazado",
    "Damaged": "Dañado", "Customer complaint": "Queja del cliente", "Equipment": "Equipo",
    "Safety": "Seguridad", "Scheduling": "Horario", "Guidance": "Orientación", "Research": "Investigación",
    "Critique": "Crítica", "Scaling": "Escalar", "Substitution": "Sustitución",

    // ---- studio / headings / prompts ----
    "Ask your sous-chef…": "Pregúntale a tu sous-chef…", "Kitchen end-of-day report": "Reporte de fin de día de cocina",
    "How did the day go?": "¿Cómo estuvo el día?", "What happened?": "¿Qué pasó?", "What went wrong?": "¿Qué salió mal?",
    "What's blocking the team?": "¿Qué está bloqueando al equipo?", "Write a summary": "Escribe un resumen",
    "I have blockers / issues": "Tengo obstáculos / problemas", "I have blockers to flag": "Tengo obstáculos que reportar",
    "Capture voice + photos and develop a recipe with your AI sous-chef. When you're done, finalize it into a recipe and publish to the library.": "Captura voz + fotos y desarrolla una receta con tu sous-chef IA. Cuando termines, finalízala como receta y publícala en la biblioteca.",
    "Cooler A / Bowls / etc.": "Nevera A / Bowls / etc.",

    // ---- loading / empty ----
    "Loading…": "Cargando…", "Signing you in…": "Iniciando sesión…", "Loading command center…": "Cargando centro de comando…",
    "Loading comms…": "Cargando mensajes…", "Loading deliveries…": "Cargando entregas…", "Loading finance…": "Cargando finanzas…",
    "Loading kitchen…": "Cargando cocina…", "Loading route…": "Cargando ruta…", "Loading staff…": "Cargando personal…",
    "Thinking…": "Pensando…", "Drafting…": "Redactando…", "Today's report is already submitted.": "El reporte de hoy ya fue enviado.",
    "Search the library…": "Buscar en la biblioteca…", "Sign in to continue": "Inicia sesión para continuar",
    "Staff sign in with a PIN. Trainers & clients get an email link.": "El personal inicia con un PIN. Entrenadores y clientes reciben un enlace por correo.",

    // ---- toasts / confirmations ----
    "Checklist submitted": "Lista enviada", "Expense submitted": "Gasto enviado", "Mileage submitted": "Millaje enviado",
    "Ticket submitted": "Ticket enviado", "Report submitted": "Reporte enviado", "EOD report submitted": "Reporte de fin de día enviado",
    "Issue flagged": "Problema reportado", "Blockers flagged": "Obstáculos reportados", "Photo added": "Foto agregada",
    "Voice added": "Voz agregada", "Voice added (transcription pending)": "Voz agregada (transcripción pendiente)",
    "AI draft inserted": "Borrador de IA insertado", "Demo draft inserted": "Borrador de demostración insertado",
    "AI suggestions added": "Sugerencias de IA agregadas", "Demo suggestions added": "Sugerencias de demostración agregadas",
    "AI draft ready — edit as needed": "Borrador de IA listo — edita lo necesario", "Draft built from your day": "Borrador creado con tu día",
    "Draft saved": "Borrador guardado", "Recipe saved as draft": "Receta guardada como borrador",
    "Published to library": "Publicado en la biblioteca", "PIN updated.": "PIN actualizado.",
    "Route started": "Ruta iniciada", "Route completed": "Ruta completada", "Proof captured": "Comprobante capturado",
    "All orders loaded": "Todos los pedidos cargados", "Recipe created. Publish it to the library now?": "Receta creada. ¿Publicarla en la biblioteca ahora?",
    "Recipe name?": "¿Nombre de la receta?", "Logged (in range)": "Registrado (en rango)",
    "Logged (OUT of range)": "Registrado (FUERA de rango)", "Updated": "Actualizado",

    // ---- errors ----
    "Error": "Error", "Something went wrong.": "Algo salió mal.", "Could not acknowledge": "No se pudo confirmar",
    "Could not attach photo.": "No se pudo adjuntar la foto.", "Could not attach voice.": "No se pudo adjuntar la voz.",
    "Could not clock in": "No se pudo marcar entrada", "Could not clock in.": "No se pudo marcar entrada.",
    "Could not clock out": "No se pudo marcar salida", "Could not clock out.": "No se pudo marcar salida.",
    "Could not draft": "No se pudo redactar", "Could not draft.": "No se pudo redactar.",
    "Could not finalize.": "No se pudo finalizar.", "Could not load summary.": "No se pudo cargar el resumen.",
    "Could not open doc.": "No se pudo abrir el documento.", "Could not save.": "No se pudo guardar.",
    "Could not start session.": "No se pudo iniciar la sesión.", "Could not submit.": "No se pudo enviar.",
    "Could not update PIN.": "No se pudo actualizar el PIN.", "Created but publish failed.": "Creado pero falló la publicación.",
    "Export failed": "Falló la exportación", "Export queued (stub)": "Exportación en cola (demo)",
    "No suggestions available.": "No hay sugerencias disponibles.", "Microphone permission denied.": "Permiso de micrófono denegado.",
    "Recording not supported on this device.": "Grabación no soportada en este dispositivo.",
    "Add at least one item.": "Agrega al menos un artículo.", "Enter a temperature": "Ingresa una temperatura",
    "Enter an amount": "Ingresa un monto", "Enter miles": "Ingresa millas",
    "New PIN must be 4–8 digits.": "El nuevo PIN debe tener 4–8 dígitos.", "New PINs do not match.": "Los nuevos PIN no coinciden.",
    "Write a summary first.": "Escribe un resumen primero.",

    // ---- install / offline banners ----
    "Install Añejo HUB to your home screen for quick access.": "Instala Añejo HUB en tu pantalla de inicio para acceso rápido.",
    "Install Añejo Kitchen to your home screen.": "Instala Añejo Cocina en tu pantalla de inicio.",
    "You're offline": "Estás sin conexión",
    "The HUB needs a connection to load live ops data. Your last-viewed screens may still be available.": "El HUB necesita conexión para cargar datos en vivo. Tus pantallas recientes pueden seguir disponibles.",

    // ---- checklist items (driver + kitchen) ----
    "Cargo area clean": "Área de carga limpia", "Doors locked": "Puertas con seguro", "Fuel level OK": "Nivel de combustible OK",
    "Lights working": "Luces funcionando", "Cold items at temp": "Artículos fríos a temperatura",
    "Labels match manifest": "Etiquetas coinciden con el manifiesto", "Packaging sealed": "Empaque sellado",
    "Correct address confirmed": "Dirección correcta confirmada", "Allergen separation verified": "Separación de alérgenos verificada",
    "Cold-chain holding temps OK": "Temperaturas de cadena de frío OK", "Prep surfaces sanitized": "Superficies de preparación sanitizadas",
    "Hand-wash station stocked": "Estación de lavado abastecida", "Sanitizer buckets prepared": "Cubetas de sanitizante preparadas",
    "Sanitizer concentration verified": "Concentración de sanitizante verificada", "FIFO rotation checked": "Rotación PEPS verificada",
    "Proteins portioned": "Proteínas porcionadas", "Quinoa batches cooked": "Lotes de quinoa cocidos",
    "Date labels applied": "Etiquetas de fecha aplicadas", "Labels accurate": "Etiquetas correctas",
    "Walk-in fridge temp logged": "Temp. del refrigerador registrada", "Walk-in temp logged": "Temp. de cámara registrada",
    "Closing temps recorded": "Temps de cierre registradas", "Surfaces sanitized": "Superficies sanitizadas",
    "Dish area cleared": "Área de platos despejada", "Floors cleaned": "Pisos limpios", "Trash emptied": "Basura vaciada",

    // ---- section headings + small labels ----
    "At a glance": "De un vistazo", "Alerts": "Alertas", "Activity": "Actividad", "EOD filed": "EOD enviados",
    "Staff management": "Gestión de personal", "Recent activity": "Actividad reciente", "Ack": "Visto",
    "Open orders": "Pedidos abiertos", "No open orders.": "Sin pedidos abiertos.",
    "Recent kitchen activity": "Actividad reciente de cocina", "No kitchen activity yet.": "Sin actividad de cocina aún.",
    "Incoming orders": "Pedidos entrantes", "Start prep": "Iniciar preparación", "Mark ready": "Marcar listo",
    "Upcoming": "Próximos", "Overdue": "Atrasados",

    // ---- status + severity badge words (rendered lowercase, CSS uppercases) ----
    "critical": "crítico", "warning": "advertencia", "info": "info", "open": "abierto",
    "acknowledged": "confirmado", "missing": "faltante", "paid": "pagado", "pending": "pendiente",
    "completed": "completado", "failed": "fallido", "started": "iniciado", "ready": "listo",
    "fulfilled": "cumplido", "canceled": "cancelado", "arrived": "llegó", "done": "hecho",

    // ---- system-generated alert titles (fixed strings from the server) ----
    "Urgent safety ticket": "Ticket de seguridad urgente", "High-priority safety ticket": "Ticket de seguridad prioritario",
    "Temperature excursion": "Excursión de temperatura", "End-of-day report missing": "Falta reporte de fin de día",
    "EOD compliance low": "Cumplimiento de EOD bajo", "Expense awaiting review": "Gasto pendiente de revisión",
    "Delivery failed": "Entrega fallida", "Late clock-in": "Entrada tardía",

    // ---- empty states + small UI ----
    "Got it": "Entendido", "Nothing here.": "Nada por aquí.", "No route assigned for today.": "No hay ruta asignada para hoy.",
    "Welcome back,": "Bienvenido,", "Nobody clocked in.": "Nadie ha marcado entrada.", "No alerts.": "Sin alertas.",
    "No open alerts.": "Sin alertas abiertas.", "Nothing to fulfill right now.": "Nada por cumplir ahora.",

    // ---- role / team enum labels (dropdowns + badges) ----
    "owner": "dueño", "driver": "conductor", "kitchen": "cocina", "vendor": "proveedor",
    "delivery": "reparto", "training": "entrenamiento", "front_office": "oficina", "vendors": "proveedores",
    "trainer": "entrenador", "client": "cliente",

    // ---- login / PIN flow ----
    "Staff sign-in": "Acceso de personal", "Email sign-in": "Acceso por correo",
    "Enter your PIN": "Ingresa tu PIN", "Confirm PIN": "Confirmar PIN", "Tu PIN": "Tu PIN",
    "Set your personal PIN": "Establece tu PIN personal", "Save & continue": "Guardar y continuar",
    "Signing in…": "Iniciando sesión…", "Signed in": "Sesión iniciada",
    "Checking…": "Verificando…", "Saving…": "Guardando…",
    "Signed in. Please set a personal PIN.": "Sesión iniciada. Establece un PIN personal.",
    "← Use a different account": "← Usar otra cuenta", "Use a different account": "Usar otra cuenta",
    "We emailed a sign-in link to": "Te enviamos un enlace de acceso a",
    "Check your email for a sign-in link.": "Revisa tu correo para el enlace de acceso.",
    "Incorrect PIN.": "PIN incorrecto.", "No account found.": "No se encontró ninguna cuenta.",
    "PINs do not match.": "Los PIN no coinciden.", "PIN is 4–8 digits.": "El PIN tiene 4–8 dígitos.",
    "Could not save PIN.": "No se pudo guardar el PIN.", "Network error.": "Error de red.",
    "Network error. Try again.": "Error de red. Inténtalo de nuevo.",
    "Could not load. Pull to refresh.": "No se pudo cargar. Desliza para actualizar.",
    "e.g. Citrus Mojo Salmon Bowl": "ej. Bowl de Salmón Mojo Cítrico",

    // ---- finance / expense status + misc labels ----
    "Expense": "Gasto", "Expenses approved": "Gastos aprobados", "Expenses pending": "Gastos pendientes",
    "Mileage pending": "Millaje pendiente", "Reset PIN for": "Restablecer PIN de",
    "Temp checks": "Chequeos de temp.", "Submitted for": "Enviado para",

    // ---- remaining checklist items (driver loadout/dropoff) ----
    "Cooler / ice packs ready": "Nevera / paquetes de hielo listos",
    "Handed to customer/contact": "Entregado al cliente/contacto",
    "Placed safely / refrigerated note left": "Colocado de forma segura / nota de refrigeración dejada",
    "Tires / pressure OK": "Llantas / presión OK"
  };

  // Register with the shared i18n engine; queue if it hasn't loaded yet.
  if (window.AnejoI18n && typeof window.AnejoI18n.extend === 'function') {
    window.AnejoI18n.extend(HUB);
  } else {
    window.__hubI18nQueue = (window.__hubI18nQueue || []).concat([HUB]);
  }
})();
