/* Explicit bilingual operator training. Read-only instructions; no completion, sends or business writes. */
(function(window, document) {
'use strict';
var AREAS = [
  {
    "id": "overview",
    "path": "/hub/owner/",
    "en": {
      "title": "Overview",
      "purpose": "See orders, alerts, staffing and recent activity together.",
      "when": "At opening, before the busy period and before handing over.",
      "actions": [
        "Check the date and refresh the overview.",
        "Open each urgent alert in its source screen.",
        "Name the person and next step for unresolved work."
      ],
      "evidence": "The underlying order, route or ticket shows the saved update.",
      "escalation": "A failed load is not zero work. Open the source screen; report unavailable information to Dayan."
    },
    "es": {
      "title": "Resumen",
      "purpose": "Consulta juntos pedidos, alertas, personal y actividad reciente.",
      "when": "Al abrir, antes de la hora de mayor trabajo y antes del relevo.",
      "actions": [
        "Comprueba la fecha y actualiza el resumen.",
        "Abre cada alerta urgente en su pantalla de origen.",
        "Define responsable y siguiente paso para lo pendiente."
      ],
      "evidence": "El pedido, la ruta o el ticket original muestra la actualización guardada.",
      "escalation": "Un error de carga no significa que no haya trabajo. Abre la pantalla de origen y avisa a Dayan si faltan datos."
    }
  },
  {
    "id": "customers",
    "path": "/hub/owner/customers.html",
    "en": {
      "title": "Customers",
      "purpose": "Look up a customer, order history and upcoming preparation.",
      "when": "When answering an order question or preparing a repeat order.",
      "actions": [
        "Find the customer by the actual email or name; avoid duplicates.",
        "Read history and delivery details before offering the next order.",
        "For an authorized manual order, review every item and total before creating it."
      ],
      "evidence": "The correct customer and saved order detail show the intended information.",
      "escalation": "Escalate disputed charges, duplicate profiles or an unclear delivery address. A login link is an external send; review its recipient first."
    },
    "es": {
      "title": "Clientes",
      "purpose": "Busca clientes, historial de pedidos y preparación próxima.",
      "when": "Al responder sobre un pedido o preparar una compra recurrente.",
      "actions": [
        "Busca por el correo o nombre real; evita duplicados.",
        "Lee el historial y los datos de entrega antes de ofrecer otro pedido.",
        "En un pedido manual autorizado, revisa cada artículo y el total antes de crearlo."
      ],
      "evidence": "La ficha correcta y el detalle guardado muestran la información prevista.",
      "escalation": "Escala cobros disputados, perfiles duplicados o direcciones dudosas. Un enlace de acceso se envía al cliente: revisa el destinatario."
    }
  },
  {
    "id": "rewards",
    "path": "/hub/owner/rewards.html",
    "en": {
      "title": "Rewards",
      "purpose": "Review the current rewards program, tiers and recorded members.",
      "when": "When a customer asks about points or during a program review.",
      "actions": [
        "Read the current settings rather than quoting an old reward rate.",
        "Compare the member record with the actual purchase.",
        "Prepare proposed changes for Dayan before saving program terms."
      ],
      "evidence": "The member record and current settings support the answer you give.",
      "escalation": "Do not promise unrecorded points or automatic catering rewards. Escalate discrepancies before changing terms."
    },
    "es": {
      "title": "Recompensas",
      "purpose": "Consulta el programa vigente, niveles y miembros registrados.",
      "when": "Cuando pregunten por puntos o al revisar el programa.",
      "actions": [
        "Lee la configuración actual; no cites una tasa antigua.",
        "Compara el registro del miembro con la compra real.",
        "Prepara los cambios de condiciones para Dayan antes de guardarlos."
      ],
      "evidence": "El registro del miembro y la configuración vigente respaldan tu respuesta.",
      "escalation": "No prometas puntos no registrados ni puntos automáticos por catering. Escala las diferencias antes de cambiar condiciones."
    }
  },
  {
    "id": "deliveries",
    "path": "/hub/owner/deliveries.html",
    "en": {
      "title": "Deliveries",
      "purpose": "Assign ready orders and monitor routes and delivery issues.",
      "when": "Before dispatch and whenever a route is delayed.",
      "actions": [
        "Check the service date, ready orders and available driver.",
        "Review stops and assignment before confirming a route.",
        "Reopen the route to check its saved driver and status."
      ],
      "evidence": "The saved route lists the right driver and stops; delivery evidence comes from the actual stop record.",
      "escalation": "Escalate missing addresses, unsafe delivery conditions or conflicting assignments. Assignment is not completed delivery."
    },
    "es": {
      "title": "Entregas",
      "purpose": "Asigna pedidos listos y supervisa rutas e incidencias.",
      "when": "Antes del despacho y cuando se retrase una ruta.",
      "actions": [
        "Revisa fecha de servicio, pedidos listos y conductor disponible.",
        "Comprueba paradas y asignación antes de confirmar la ruta.",
        "Vuelve a abrirla para comprobar conductor y estado guardados."
      ],
      "evidence": "La ruta guardada incluye conductor y paradas correctos; la evidencia de entrega está en el registro real de la parada.",
      "escalation": "Escala direcciones incompletas, condiciones inseguras o asignaciones contradictorias. Asignar no equivale a entregar."
    }
  },
  {
    "id": "kitchen",
    "path": "/hub/owner/kitchen.html",
    "en": {
      "title": "Kitchen",
      "purpose": "Coordinate open orders, production activity and catering events.",
      "when": "At the kitchen briefing and whenever capacity changes.",
      "actions": [
        "Compare open orders with staff, stock and the service date.",
        "Open the relevant event or order instead of working from a summary alone.",
        "Agree on preparation priorities with the kitchen lead."
      ],
      "evidence": "Order and event records match the agreed plan; unresolved shortages have a named owner.",
      "escalation": "Escalate a stock gap, food-safety issue or workload beyond capacity before promising fulfillment."
    },
    "es": {
      "title": "Cocina",
      "purpose": "Coordina pedidos abiertos, actividad de producción y eventos.",
      "when": "En la reunión inicial y cuando cambie la capacidad.",
      "actions": [
        "Compara pedidos abiertos con personal, inventario y fecha de servicio.",
        "Abre el evento o pedido correspondiente; no trabajes solo con el resumen.",
        "Acuerda prioridades de preparación con quien dirige la cocina."
      ],
      "evidence": "Los pedidos y eventos coinciden con el plan; cada faltante pendiente tiene responsable.",
      "escalation": "Escala faltantes, problemas de seguridad alimentaria o exceso de trabajo antes de prometer el servicio."
    }
  },
  {
    "id": "menu",
    "path": "/hub/owner/menu.html",
    "en": {
      "title": "Menu & prices",
      "purpose": "Maintain catalog items, prices, availability and ordering settings.",
      "when": "After an approved product change or a confirmed stock change.",
      "actions": [
        "Find the exact item and review its current values.",
        "Change only the approved fields; check price units and availability.",
        "Save, reload and inspect the affected public item."
      ],
      "evidence": "Reloaded catalog values and the customer-facing item agree.",
      "escalation": "Ask Dayan before changing prices or ordering rules. A saved edit alone does not prove the public menu updated."
    },
    "es": {
      "title": "Menú y precios",
      "purpose": "Mantén productos, precios, disponibilidad y reglas de pedido.",
      "when": "Tras un cambio aprobado o un cambio de inventario confirmado.",
      "actions": [
        "Busca el artículo exacto y revisa sus valores actuales.",
        "Cambia solo los campos aprobados; verifica unidades y disponibilidad.",
        "Guarda, recarga y revisa el producto en el menú público."
      ],
      "evidence": "Los valores recargados y el producto visible al cliente coinciden.",
      "escalation": "Consulta a Dayan antes de cambiar precios o reglas. Guardar no demuestra por sí solo que el menú público cambió."
    }
  },
  {
    "id": "staff",
    "path": "/hub/owner/staff.html",
    "en": {
      "title": "Staff",
      "purpose": "Review staff access, active shifts and missing EOD reports.",
      "when": "At opening, shift changes and closing.",
      "actions": [
        "Check who is on shift and who has not filed a report.",
        "Confirm the person and role before an approved access change.",
        "Ask the responsible person to resolve missing shift records."
      ],
      "evidence": "The correct staff record and shift/report status appear after reload.",
      "escalation": "Escalate unknown access or a missing worker. PIN resets and deactivation affect access; confirm the exact person with Dayan."
    },
    "es": {
      "title": "Personal",
      "purpose": "Revisa acceso, turnos activos e informes EOD pendientes.",
      "when": "Al abrir, cambiar turno y cerrar.",
      "actions": [
        "Comprueba quién está de turno y quién no ha entregado su informe.",
        "Confirma persona y función antes de un cambio de acceso aprobado.",
        "Pide al responsable que resuelva los registros de turno pendientes."
      ],
      "evidence": "La ficha correcta y el estado del turno o informe aparecen al recargar.",
      "escalation": "Escala accesos desconocidos o ausencias. Reiniciar PIN o desactivar afecta el acceso: confirma la persona con Dayan."
    }
  },
  {
    "id": "finance",
    "path": "/hub/owner/finance.html",
    "en": {
      "title": "Finance",
      "purpose": "Review payments, expenses, invoices, reports and reconciliation.",
      "when": "Daily for exceptions and at the agreed reconciliation time.",
      "actions": [
        "Choose the correct reporting window.",
        "Compare expenses and payments with receipts and provider records.",
        "Review pending items individually; export the selected report if needed."
      ],
      "evidence": "Receipt, saved record and provider transaction agree; report dates are correct.",
      "escalation": "Escalate mismatches or missing receipts. Charges, automatic payments, approvals and financial connections need Dayan’s explicit authorization."
    },
    "es": {
      "title": "Finanzas",
      "purpose": "Revisa pagos, gastos, facturas, informes y conciliación.",
      "when": "Cada día para incidencias y a la hora acordada de conciliación.",
      "actions": [
        "Selecciona el período correcto.",
        "Compara gastos y pagos con recibos y registros del proveedor.",
        "Revisa cada pendiente; exporta el informe del período si hace falta."
      ],
      "evidence": "Recibo, registro guardado y transacción del proveedor coinciden; las fechas del informe son correctas.",
      "escalation": "Escala diferencias o recibos ausentes. Cobros, pagos automáticos, aprobaciones y conexiones financieras requieren autorización expresa de Dayan."
    }
  },
  {
    "id": "catering",
    "path": "/hub/owner/catering.html",
    "en": {
      "title": "Catering & quotes",
      "purpose": "Build and review catering quotes, deposits and final balances.",
      "when": "After clarifying an inquiry and before any customer commitment.",
      "actions": [
        "Confirm date, guest count, menu, delivery and service requirements.",
        "Prepare the exact quote and review items, totals and payment terms.",
        "Show Dayan the recipient and final preview before sending or charging."
      ],
      "evidence": "The saved quote matches the agreed scope; payment status is checked against the provider.",
      "escalation": "Do not promise availability or mark a balance paid from a verbal report. Escalate changes, refunds and payment disputes."
    },
    "es": {
      "title": "Catering y cotizaciones",
      "purpose": "Prepara y revisa cotizaciones, depósitos y saldos finales.",
      "when": "Después de aclarar una solicitud y antes de comprometer el servicio.",
      "actions": [
        "Confirma fecha, invitados, menú, entrega y servicios necesarios.",
        "Prepara la cotización exacta y revisa artículos, total y condiciones de pago.",
        "Muestra a Dayan destinatario y vista previa final antes de enviar o cobrar."
      ],
      "evidence": "La cotización guardada coincide con lo acordado; el estado de pago se contrasta con el proveedor.",
      "escalation": "No prometas disponibilidad ni marques un saldo pagado por un comentario verbal. Escala cambios, reembolsos y disputas."
    }
  },
  {
    "id": "sales",
    "path": "/hub/owner/sales.html",
    "en": {
      "title": "Sales",
      "purpose": "Work institutional prospects toward a real recurring account.",
      "when": "During a protected daily sales block and when replies arrive.",
      "actions": [
        "Dashboard: review the funnel; Prospects: research the next suitable organization.",
        "Calls: record what was actually said and a next action.",
        "Approvals: review recipient and rendered email; Replies: handle real responses.",
        "Readiness and Launch review: resolve blockers before sending; Settings: change rules only with approval."
      ],
      "evidence": "A prospect has verified contact facts, a recorded interaction and a dated next step. Won status needs an actual activated account.",
      "escalation": "Research and drafts are not outreach. Dayan must approve the exact preview before a send; do not invent clients or mark a prospect won without account evidence."
    },
    "es": {
      "title": "Ventas",
      "purpose": "Trabaja prospectos institucionales hasta lograr una cuenta recurrente real.",
      "when": "En un bloque diario de ventas y cuando lleguen respuestas.",
      "actions": [
        "Resumen: revisa el embudo; Prospectos: investiga la siguiente organización adecuada.",
        "Llamadas: registra lo que realmente dijeron y la próxima acción.",
        "Aprobaciones: revisa destinatario y correo renderizado; Respuestas: atiende respuestas reales.",
        "Preparación y Revisión de lanzamiento: resuelve bloqueos antes de enviar; Configuración: cambia reglas solo con aprobación."
      ],
      "evidence": "El prospecto tiene contacto verificado, interacción registrada y próximo paso con fecha. Ganado requiere una cuenta realmente activada.",
      "escalation": "Investigar y redactar no es contactar. Dayan aprueba la vista previa exacta antes del envío; no inventes clientes ni marques una venta sin evidencia."
    }
  },
  {
    "id": "trainers",
    "path": "/hub/owner/trainers.html",
    "en": {
      "title": "Trainer partners",
      "purpose": "Review trainer partners, invitations and recorded balances.",
      "when": "For a qualified partner inquiry or an agreed payout review.",
      "actions": [
        "Check the correct partner and current terms.",
        "Prepare an invitation only for the intended recipient.",
        "Reconcile any balance before requesting payout approval."
      ],
      "evidence": "The saved partner record and provider payment evidence support the status.",
      "escalation": "Do not promise an unapproved commission or mark a payout paid before actual payment."
    },
    "es": {
      "title": "Entrenadores asociados",
      "purpose": "Revisa entrenadores, invitaciones y saldos registrados.",
      "when": "Ante un posible colaborador o una revisión de pagos acordada.",
      "actions": [
        "Comprueba el colaborador correcto y sus condiciones actuales.",
        "Prepara la invitación solo para el destinatario previsto.",
        "Concilia el saldo antes de pedir aprobación del pago."
      ],
      "evidence": "El registro guardado y la evidencia del pago respaldan el estado.",
      "escalation": "No prometas comisiones no aprobadas ni marques pagado antes del pago real."
    }
  },
  {
    "id": "partners",
    "path": "/hub/owner/partners.html",
    "en": {
      "title": "Affiliates",
      "purpose": "Review applications, approved partners and promotion codes.",
      "when": "When an application arrives and during partner follow-up.",
      "actions": [
        "Read the application and confirm the proposed collaboration.",
        "Ask Dayan to approve conditions before onboarding or creating a code.",
        "Check the partner record and any attributed activity before discussing a balance."
      ],
      "evidence": "The application decision, approved terms and saved partner/code record agree.",
      "escalation": "Application is not approval. Do not promise rates, automatic payouts or rewards not supported by approved terms."
    },
    "es": {
      "title": "Afiliados",
      "purpose": "Revisa solicitudes, colaboradores aprobados y códigos promocionales.",
      "when": "Cuando llegue una solicitud y al dar seguimiento.",
      "actions": [
        "Lee la solicitud y confirma la colaboración propuesta.",
        "Pide a Dayan aprobar condiciones antes del alta o de crear un código.",
        "Revisa la ficha y la actividad atribuida antes de hablar de saldos."
      ],
      "evidence": "La decisión, las condiciones aprobadas y el registro del colaborador o código coinciden.",
      "escalation": "Solicitar no equivale a estar aprobado. No prometas tasas, pagos automáticos ni beneficios fuera de las condiciones aprobadas."
    }
  },
  {
    "id": "marketing",
    "path": "/hub/owner/marketing.html",
    "en": {
      "title": "Marketing",
      "purpose": "Review results, teach brand rules and prepare approved outreach.",
      "when": "During the daily demand-generation and follow-up block.",
      "actions": [
        "Today: inspect actual results, inbox items and failures.",
        "Photos: review source images and usage; Teach: add factual rules and examples.",
        "Create & schedule: choose Instagram or email and review the exact audience, caption and asset.",
        "Bring the final preview to Dayan before sending, scheduling or publishing."
      ],
      "evidence": "A saved draft is visible after reload; sent or published status needs the actual channel result.",
      "escalation": "Do not treat AI suggestions as facts or a draft as a live campaign. Preserve customer consent and escalate provider failures before retrying."
    },
    "es": {
      "title": "Marketing",
      "purpose": "Revisa resultados, enseña reglas de marca y prepara comunicación aprobada.",
      "when": "En el bloque diario de captación y seguimiento.",
      "actions": [
        "Hoy: revisa resultados reales, bandeja e incidencias.",
        "Fotos: revisa imágenes y uso; Enseñar: agrega reglas y ejemplos verificables.",
        "Crear y programar: elige Instagram o correo y revisa audiencia, texto y pieza exactos.",
        "Lleva la vista previa final a Dayan antes de enviar, programar o publicar."
      ],
      "evidence": "El borrador guardado aparece al recargar; enviado o publicado necesita el resultado real del canal.",
      "escalation": "No tomes sugerencias de IA como hechos ni borradores como campañas activas. Respeta el consentimiento y escala fallos del proveedor antes de reintentar."
    }
  },
  {
    "id": "inventory",
    "path": "/hub/kitchen/inventory.html",
    "en": {
      "title": "Inventory",
      "purpose": "Record counted stock, purchases and ready-to-sell production.",
      "when": "Before promising capacity and after receiving or using stock.",
      "actions": [
        "Count the actual item using its listed unit.",
        "Record the count or production change with the correct item.",
        "Check the reloaded quantity and identify shortages for restocking."
      ],
      "evidence": "Saved quantities match the physical count and purchase records.",
      "escalation": "Never estimate a count as measured. Escalate spoilage, unexplained differences or missing purchase evidence."
    },
    "es": {
      "title": "Inventario",
      "purpose": "Registra existencias contadas, compras y producción lista para vender.",
      "when": "Antes de prometer capacidad y después de recibir o usar existencias.",
      "actions": [
        "Cuenta el artículo real en la unidad indicada.",
        "Registra el conteo o cambio de producción en el artículo correcto.",
        "Comprueba la cantidad recargada y señala faltantes para reponer."
      ],
      "evidence": "Las cantidades guardadas coinciden con el conteo físico y los comprobantes de compra.",
      "escalation": "No presentes una estimación como conteo. Escala deterioro, diferencias sin explicar o compras sin comprobante."
    }
  },
  {
    "id": "studio",
    "path": "/studio/",
    "en": {
      "title": "Studio",
      "purpose": "Prepare creative work in the separate Studio workspace.",
      "when": "When an approved brief needs a visual or content draft.",
      "actions": [
        "Start from the current brief, product references and language.",
        "Use the tools actually available to prepare a draft.",
        "Review the exported file and final caption before requesting approval."
      ],
      "evidence": "The actual saved/exported asset opens correctly and matches the brief.",
      "escalation": "Do not assume a generated preview is exported, licensed, scheduled or published. Escalate missing sources and paid-tool requests."
    },
    "es": {
      "title": "Estudio",
      "purpose": "Prepara piezas creativas en el espacio separado de Estudio.",
      "when": "Cuando un brief aprobado necesite diseño o contenido.",
      "actions": [
        "Parte del brief actual, referencias de producto e idioma.",
        "Usa las herramientas disponibles para preparar el borrador.",
        "Revisa el archivo exportado y texto final antes de pedir aprobación."
      ],
      "evidence": "La pieza guardada o exportada abre correctamente y coincide con el brief.",
      "escalation": "No supongas que una vista generada está exportada, autorizada, programada o publicada. Escala fuentes ausentes y solicitudes de herramientas pagadas."
    }
  },
  {
    "id": "brief",
    "path": "/hub/owner/brief-proposals.html",
    "en": {
      "title": "Reviews",
      "purpose": "Review proposed brief changes and version history.",
      "when": "When a proposed rule or brief change needs a decision.",
      "actions": [
        "Read the proposal and compare it with the current brief.",
        "Ask for missing facts or prepare a clear recommendation.",
        "Confirm Dayan’s decision before applying a brief change or restoration."
      ],
      "evidence": "The selected proposal and saved brief version show the intended decision.",
      "escalation": "A proposal is not authority. Escalate conflicting source facts; never restore an old version merely to clear a queue."
    },
    "es": {
      "title": "Revisiones",
      "purpose": "Revisa propuestas de cambio del brief y su historial.",
      "when": "Cuando una regla o cambio de brief necesite decisión.",
      "actions": [
        "Lee la propuesta y compárala con el brief actual.",
        "Pide los datos que falten o prepara una recomendación clara.",
        "Confirma la decisión de Dayan antes de aplicar o restaurar una versión."
      ],
      "evidence": "La propuesta y versión guardada del brief reflejan la decisión prevista.",
      "escalation": "Una propuesta no es autoridad. Escala datos contradictorios; no restaures una versión solo para vaciar la cola."
    }
  },
  {
    "id": "comms",
    "path": "/hub/owner/comms.html",
    "en": {
      "title": "Communications",
      "purpose": "Review open tickets, alerts and communication activity.",
      "when": "At opening, during service and before closing.",
      "actions": [
        "Read the ticket and message history before acting.",
        "Resolve the underlying issue and record the useful next step.",
        "Check the saved ticket status and actual message outcome."
      ],
      "evidence": "The correct ticket contains the action taken; any send has channel evidence.",
      "escalation": "Acknowledging an alert is not resolving the issue. Escalate complaints, payment disputes and uncertain AI replies; review recipients before sends."
    },
    "es": {
      "title": "Comunicaciones",
      "purpose": "Revisa tickets abiertos, alertas y actividad de mensajes.",
      "when": "Al abrir, durante el servicio y antes de cerrar.",
      "actions": [
        "Lee el ticket y el historial antes de actuar.",
        "Resuelve la causa y deja un siguiente paso útil.",
        "Comprueba el estado guardado y el resultado real del mensaje."
      ],
      "evidence": "El ticket correcto contiene la acción realizada; cualquier envío tiene evidencia del canal.",
      "escalation": "Confirmar una alerta no resuelve el problema. Escala quejas, disputas y respuestas dudosas de IA; revisa destinatarios antes de enviar."
    }
  },
  {
    "id": "daily-lunch",
    "path": "/hub/owner/daily-lunch.html",
    "en": {
      "title": "Daily Lunch",
      "purpose": "Manage reusable meals, weekday templates and dated service availability.",
      "when": "Before opening or changing an actual lunch service date.",
      "actions": [
        "Review the dated menu and Eastern-time ordering cutoffs.",
        "Confirm kitchen capacity and the exact meal before changing a date.",
        "Save, reload and check the public date and product."
      ],
      "evidence": "The saved dated service entry and public availability agree.",
      "escalation": "A weekday template is not a confirmed service date. Escalate unclear rotation, capacity or cutoff changes before promising a meal."
    },
    "es": {
      "title": "Almuerzo Diario",
      "purpose": "Gestiona platos reutilizables, plantillas semanales y fechas de servicio.",
      "when": "Antes de abrir o cambiar una fecha real de almuerzo.",
      "actions": [
        "Revisa el menú fechado y los cierres de pedido en hora del Este.",
        "Confirma capacidad y plato exacto antes de cambiar una fecha.",
        "Guarda, recarga y comprueba la fecha y producto públicos."
      ],
      "evidence": "La fecha de servicio guardada y la disponibilidad pública coinciden.",
      "escalation": "Una plantilla semanal no confirma una fecha de servicio. Escala dudas de rotación, capacidad o cierre antes de prometer un plato."
    }
  },
  {
    "id": "orders",
    "path": "/hub/owner/orders.html",
    "en": {
      "title": "Order history",
      "purpose": "Find orders and inspect their recorded fulfillment details.",
      "when": "When investigating a customer question or a kitchen mismatch.",
      "actions": [
        "Search the correct period and customer/order reference.",
        "Open the full order and compare items, date and status.",
        "Use its source record when coordinating the next action."
      ],
      "evidence": "The actual order reference and current recorded details support the answer.",
      "escalation": "Do not infer payment or delivery from an order’s existence. Escalate missing, duplicated or conflicting records."
    },
    "es": {
      "title": "Historial de pedidos",
      "purpose": "Busca pedidos y revisa sus datos de preparación y entrega.",
      "when": "Al investigar una consulta o diferencia con cocina.",
      "actions": [
        "Busca el período y la referencia de cliente o pedido correctos.",
        "Abre el pedido completo y compara artículos, fecha y estado.",
        "Usa el registro original para coordinar la próxima acción."
      ],
      "evidence": "La referencia real y los datos actuales respaldan la respuesta.",
      "escalation": "La existencia de un pedido no confirma pago ni entrega. Escala registros ausentes, duplicados o contradictorios."
    }
  },
  {
    "id": "catering-service",
    "path": "/hub/owner/catering-service.html",
    "en": {
      "title": "Catering follow-up",
      "purpose": "Track inquiry acknowledgement and review quote reminders.",
      "when": "For new catering inquiries and due quote follow-ups.",
      "actions": [
        "Read the inquiry and confirm who owns the next response.",
        "Open the reminder preview in the customer’s language.",
        "Ask Dayan to approve the exact recipient and preview before sending once."
      ],
      "evidence": "The inquiry history and actual send result show what happened.",
      "escalation": "Do not enable automatic acknowledgement or retry an uncertain send without review. Escalate wrong addresses and missing previews."
    },
    "es": {
      "title": "Seguimiento de catering",
      "purpose": "Sigue la recepción de solicitudes y revisa recordatorios de cotización.",
      "when": "Ante solicitudes nuevas y seguimientos pendientes.",
      "actions": [
        "Lee la solicitud y confirma quién dará la próxima respuesta.",
        "Abre la vista previa en el idioma del cliente.",
        "Pide a Dayan aprobar destinatario y vista exactos antes de enviar una vez."
      ],
      "evidence": "El historial de la solicitud y el resultado real muestran lo ocurrido.",
      "escalation": "No actives respuestas automáticas ni repitas un envío incierto sin revisar. Escala direcciones incorrectas y vistas previas ausentes."
    }
  },
  {
    "id": "social-campaigns",
    "path": "/hub/owner/social-campaigns.html",
    "en": {
      "title": "Social campaigns",
      "purpose": "Review a month’s exact drafts, media and posting schedule.",
      "when": "When preparing a campaign or reviewing a changed asset.",
      "actions": [
        "Import the reviewed plan, save captions and attach the correct ordered media.",
        "Validate and resume until the current manifest finishes; inspect every post, asset, language, date and timezone.",
        "Present the exact final preview to Dayan before approval and scheduling."
      ],
      "evidence": "Saved captions/media and exported manifest match the reviewed version; scheduling requires the server’s exact approval receipt.",
      "escalation": "Prepared is not approved. Stale versions, unknown uploads and technical blockers need review; do not silently retry or claim a video was AI-audited."
    },
    "es": {
      "title": "Campañas sociales",
      "purpose": "Revisa borradores, medios y calendario exactos de un mes.",
      "when": "Al preparar una campaña o revisar una pieza modificada.",
      "actions": [
        "Importa el plan revisado, guarda textos y adjunta los medios en orden correcto.",
        "Valida y reanuda hasta terminar el manifiesto actual; inspecciona cada pieza, idioma, fecha y zona horaria.",
        "Presenta la vista final exacta a Dayan antes de aprobar y programar."
      ],
      "evidence": "Textos, medios y manifiesto exportado coinciden con la versión revisada; programar exige el recibo de aprobación exacta del servidor.",
      "escalation": "Preparado no significa aprobado. Versiones antiguas, subidas inciertas y bloqueos técnicos requieren revisión; no reintentes a ciegas ni afirmes auditoría IA del video."
    }
  },
  {
    "id": "payouts",
    "path": "/hub/owner/payouts.html",
    "en": {
      "title": "Driver payouts",
      "purpose": "Review driver amounts and their approval/payment records.",
      "when": "At the agreed payout review, after checking completed work.",
      "actions": [
        "Select the correct driver and reporting period.",
        "Reconcile deliveries and the amount owed.",
        "Obtain approval; record paid only after the actual payment."
      ],
      "evidence": "The approved amount agrees with delivery records and payment evidence.",
      "escalation": "Approve and Mark paid are different actions. Escalate disputed work or missing payment evidence; never use Mark paid as a reminder."
    },
    "es": {
      "title": "Pagos a conductores",
      "purpose": "Revisa importes y registros de aprobación y pago.",
      "when": "En la revisión de pagos acordada, después de comprobar el trabajo.",
      "actions": [
        "Selecciona conductor y período correctos.",
        "Concilia entregas e importe pendiente.",
        "Obtén aprobación; registra pagado solo tras el pago real."
      ],
      "evidence": "El importe aprobado coincide con entregas y comprobante de pago.",
      "escalation": "Aprobar y Marcar pagado son acciones distintas. Escala trabajo disputado o comprobantes ausentes; no marques pagado como recordatorio."
    }
  },
  {
    "id": "leads",
    "path": "/hub/owner/leads.html",
    "en": {
      "title": "Leads",
      "purpose": "Review website and Instagram-sourced inquiries.",
      "when": "At opening and during the daily sales block.",
      "actions": [
        "Filter the list and read the original inquiry.",
        "Verify contact, occasion, date and purchasing need.",
        "Add a qualified inquiry to CRM when appropriate; leave a named follow-up in the agreed record."
      ],
      "evidence": "The correct inquiry/customer record and a dated follow-up support the next action.",
      "escalation": "An inferred Instagram intent is not a confirmed order. Avoid duplicate CRM entries and escalate missing contact consent or unclear requests."
    },
    "es": {
      "title": "Prospectos",
      "purpose": "Revisa consultas del sitio web y de Instagram.",
      "when": "Al abrir y en el bloque diario de ventas.",
      "actions": [
        "Filtra la lista y lee la consulta original.",
        "Verifica contacto, ocasión, fecha y necesidad de compra.",
        "Agrega una consulta calificada al CRM cuando corresponda; deja responsable y fecha de seguimiento en el registro acordado."
      ],
      "evidence": "La consulta o ficha correcta y el seguimiento fechado respaldan la próxima acción.",
      "escalation": "La intención inferida de Instagram no confirma un pedido. Evita duplicados y escala consentimiento o solicitudes dudosas."
    }
  },
  {
    "id": "knowledge",
    "path": "/hub/owner/knowledge.html",
    "en": {
      "title": "Knowledge",
      "purpose": "Maintain reference documents and test what AI can retrieve.",
      "when": "After an approved source change or when an answer is wrong.",
      "actions": [
        "Find the current authoritative document and confirm its version.",
        "Prepare the approved document for upload/indexing.",
        "Run a focused search and inspect the retrieved source."
      ],
      "evidence": "Search results retrieve the intended current document; a saved upload alone is insufficient.",
      "escalation": "Escalate conflicting documents or unsupported claims. Do not remove sources or upload sensitive customer material without authorization."
    },
    "es": {
      "title": "Conocimiento",
      "purpose": "Mantén referencias y prueba qué puede recuperar la IA.",
      "when": "Tras un cambio aprobado de fuente o una respuesta incorrecta.",
      "actions": [
        "Busca el documento autorizado actual y confirma su versión.",
        "Prepara el documento aprobado para subir e indexar.",
        "Haz una búsqueda concreta e inspecciona la fuente recuperada."
      ],
      "evidence": "La búsqueda recupera el documento vigente previsto; subirlo no basta.",
      "escalation": "Escala documentos contradictorios o afirmaciones sin fuente. No elimines fuentes ni subas datos sensibles de clientes sin autorización."
    }
  },
  {
    "id": "aiops",
    "path": "/hub/owner/aiops.html",
    "en": {
      "title": "AI operations",
      "purpose": "Inspect AI suggestions, forecasts, schedule health and run history.",
      "when": "When investigating an automation issue or reviewing a proposed action.",
      "actions": [
        "Read the suggestion and the source data behind it.",
        "Check recent run time, result and any error.",
        "Prepare an action for Dayan rather than assuming it ran."
      ],
      "evidence": "A current run log and its actual resulting record establish execution.",
      "escalation": "A configured schedule or forecast is not execution or guaranteed demand. Escalate failures; do not run backups or costly/production actions without approval."
    },
    "es": {
      "title": "Operaciones de IA",
      "purpose": "Inspecciona sugerencias, pronósticos, programación e historial de ejecuciones.",
      "when": "Al investigar automatizaciones o revisar una propuesta.",
      "actions": [
        "Lee la sugerencia y los datos que la respaldan.",
        "Comprueba hora, resultado y errores de la ejecución reciente.",
        "Prepara la acción para Dayan; no supongas que se ejecutó."
      ],
      "evidence": "Un registro reciente y su resultado real demuestran la ejecución.",
      "escalation": "Una programación o pronóstico no es ejecución ni demanda garantizada. Escala fallos; no ejecutes respaldos ni acciones costosas o de producción sin aprobación."
    }
  },
  {
    "id": "schedule",
    "path": "/hub/owner/schedule.html",
    "en": {
      "title": "Driver schedule",
      "purpose": "Review and assign weekly driver shifts.",
      "when": "Before the coming service week and when coverage changes.",
      "actions": [
        "Choose the correct week.",
        "Check availability and confirm coverage with the driver.",
        "Save the approved shift and reopen the week."
      ],
      "evidence": "The saved shift lists the intended person, day and time.",
      "escalation": "A shift is not a delivery route. Escalate unavailable drivers or overlapping coverage before dispatch."
    },
    "es": {
      "title": "Horario de conductores",
      "purpose": "Revisa y asigna turnos semanales de conductores.",
      "when": "Antes de la semana de servicio y cuando cambie la cobertura.",
      "actions": [
        "Selecciona la semana correcta.",
        "Comprueba disponibilidad y confirma cobertura con el conductor.",
        "Guarda el turno aprobado y vuelve a abrir la semana."
      ],
      "evidence": "El turno guardado muestra persona, día y hora previstos.",
      "escalation": "Un turno no es una ruta de entrega. Escala ausencias o solapamientos antes del despacho."
    }
  },
  {
    "id": "site-copy",
    "path": "/hub/owner/site-copy.html",
    "en": {
      "title": "Site copy",
      "purpose": "Prepare and publish approved website wording.",
      "when": "When an offer, service description or public message changes.",
      "actions": [
        "Locate the exact section and read the existing public copy.",
        "Prepare factual wording in both languages and preview the result.",
        "Obtain Dayan’s approval before Publish; then inspect the actual public page."
      ],
      "evidence": "The correct public page displays the approved version after reload.",
      "escalation": "Saving or queuing copy is not publishing. Escalate legal text, price or offer conflicts before any public change."
    },
    "es": {
      "title": "Textos del sitio",
      "purpose": "Prepara y publica textos web aprobados.",
      "when": "Cuando cambie una oferta, descripción o mensaje público.",
      "actions": [
        "Busca la sección exacta y lee el texto publicado.",
        "Prepara texto verificable en ambos idiomas y revisa el resultado.",
        "Obtén aprobación de Dayan antes de Publicar; después inspecciona la página pública."
      ],
      "evidence": "La página pública correcta muestra la versión aprobada al recargar.",
      "escalation": "Guardar o poner en cola no es publicar. Escala textos legales o conflictos de precio u oferta antes de cambiar lo público."
    }
  },
  {
    "id": "content",
    "path": "/hub/owner/content.html",
    "en": {
      "title": "Content",
      "purpose": "Manage reference content, success-story drafts and reminders.",
      "when": "When preparing a reusable source or a due follow-up.",
      "actions": [
        "Library: find and read the source before editing.",
        "Success Stories: use actual supported conversations; prepare the draft and receipt.",
        "Reminders: review recipient, time and recurring template before an authorized send."
      ],
      "evidence": "The saved source/draft or reminder record contains the intended content and timing.",
      "escalation": "A success-story draft is not client permission or a testimonial approval. Escalate missing consent and review every external reminder."
    },
    "es": {
      "title": "Contenido",
      "purpose": "Gestiona referencias, borradores de historias de éxito y recordatorios.",
      "when": "Al preparar una fuente reutilizable o un seguimiento pendiente.",
      "actions": [
        "Biblioteca: busca y lee la fuente antes de editar.",
        "Historias de éxito: usa conversaciones reales respaldadas; prepara borrador y recibo.",
        "Recordatorios: revisa destinatario, hora y plantilla recurrente antes de un envío autorizado."
      ],
      "evidence": "La fuente, borrador o recordatorio guardado contiene texto y horario previstos.",
      "escalation": "Un borrador no equivale a permiso del cliente ni aprobación de testimonio. Escala consentimiento ausente y revisa todo recordatorio externo."
    }
  },
  {
    "id": "traffic",
    "path": "/hub/owner/traffic.html",
    "en": {
      "title": "Traffic",
      "purpose": "Compare traffic sources, pages and audience over a selected period.",
      "when": "During the weekly growth review or when a link underperforms.",
      "actions": [
        "Select a comparable date window.",
        "Read sources and top pages alongside actual inquiries or orders.",
        "Propose one specific content or landing-page improvement."
      ],
      "evidence": "The report period, source and observed inquiry/order evidence support the conclusion.",
      "escalation": "Visits are not sales. Escalate missing data or tracking gaps; do not invent attribution from an untracked link."
    },
    "es": {
      "title": "Tráfico",
      "purpose": "Compara fuentes, páginas y audiencia en un período.",
      "when": "En la revisión semanal de crecimiento o si un enlace rinde poco.",
      "actions": [
        "Selecciona períodos comparables.",
        "Lee fuentes y páginas junto con consultas o pedidos reales.",
        "Propón una mejora concreta de contenido o página de destino."
      ],
      "evidence": "Período, fuente y evidencia de consultas o pedidos respaldan la conclusión.",
      "escalation": "Visitas no son ventas. Escala datos ausentes o fallos de seguimiento; no inventes atribución de un enlace sin medir."
    }
  },
  {
    "id": "adoption",
    "path": "/hub/owner/adoption.html",
    "en": {
      "title": "Adoption",
      "purpose": "Review human Hub use and EOD compliance by role.",
      "when": "At the weekly team review and after missed reports.",
      "actions": [
        "Choose the reporting window.",
        "Check missing reports and activity for the relevant role.",
        "Ask the person about the blocker before assigning training."
      ],
      "evidence": "The actual report/activity record supports the coaching action.",
      "escalation": "Activity is not competence. Escalate access problems or incomplete data; do not label a team member trained from clicks alone."
    },
    "es": {
      "title": "Uso del Hub",
      "purpose": "Revisa uso humano del Hub y cumplimiento EOD por función.",
      "when": "En la revisión semanal y cuando falten informes.",
      "actions": [
        "Elige el período.",
        "Revisa informes pendientes y actividad de la función correspondiente.",
        "Pregunta por el bloqueo antes de asignar capacitación."
      ],
      "evidence": "El informe o actividad real respalda la acción de acompañamiento.",
      "escalation": "Actividad no equivale a competencia. Escala problemas de acceso o datos incompletos; los clics no demuestran capacitación."
    }
  },
  {
    "id": "purge",
    "path": "/hub/owner/purge.html",
    "en": {
      "title": "Data requests",
      "purpose": "Review erasure requests and their affected-record preview.",
      "when": "Only when an actual data request needs authorized handling.",
      "actions": [
        "Confirm the requester and exact scope with Dayan.",
        "Read the preview and identify affected records and exceptions.",
        "Leave execution to the explicitly authorized person."
      ],
      "evidence": "The reviewed request, scope and resulting audit record agree.",
      "escalation": "Erasure is destructive. Do not press Erase while learning; escalate uncertain identity, retention duties or an incorrect preview."
    },
    "es": {
      "title": "Solicitudes de datos",
      "purpose": "Revisa solicitudes de eliminación y vista de registros afectados.",
      "when": "Solo cuando una solicitud real requiera atención autorizada.",
      "actions": [
        "Confirma con Dayan la identidad y el alcance exacto.",
        "Lee la vista previa y reconoce registros afectados y excepciones.",
        "Deja la ejecución a la persona expresamente autorizada."
      ],
      "evidence": "La solicitud, alcance revisado y registro de auditoría resultante coinciden.",
      "escalation": "Eliminar es destructivo. No pulses Eliminar para practicar; escala identidad dudosa, retención o vistas incorrectas."
    }
  },
  {
    "id": "marketing-settings",
    "path": "/hub/owner/marketing-settings.html",
    "en": {
      "title": "Marketing settings",
      "purpose": "Review cadence, posting times, providers and research questions.",
      "when": "When reviewing a proposed operating change.",
      "actions": [
        "Read the current cadence and posting-time settings.",
        "Check that product/source facts support any research answer.",
        "Prepare the exact change for Dayan before saving rules or running a queue."
      ],
      "evidence": "Reloaded settings match the approved change; provider execution needs its own result.",
      "escalation": "Do not treat a provider choice as usable credentials or purchase authority. Escalate cost, availability and source conflicts."
    },
    "es": {
      "title": "Configuración de marketing",
      "purpose": "Revisa frecuencia, horarios, proveedores y preguntas de investigación.",
      "when": "Al revisar un cambio operativo propuesto.",
      "actions": [
        "Lee frecuencia y horarios actuales.",
        "Comprueba que fuentes reales respalden cualquier respuesta de investigación.",
        "Prepara el cambio exacto para Dayan antes de guardar reglas o ejecutar colas."
      ],
      "evidence": "La configuración recargada coincide con el cambio aprobado; ejecutar un proveedor exige su propio resultado.",
      "escalation": "Elegir proveedor no demuestra credenciales válidas ni autorización de compra. Escala costos, disponibilidad y conflictos de fuentes."
    }
  },
  {
    "id": "training-status",
    "path": "/hub/owner/training-status.html",
    "en": {
      "title": "Training compliance",
      "purpose": "Review recorded training status for the team.",
      "when": "At onboarding and when following up on an assigned lesson.",
      "actions": [
        "Find the person and assigned role.",
        "Check the recorded lesson status and date.",
        "Ask them to demonstrate the actual task before treating them as ready."
      ],
      "evidence": "The training record and observed task demonstration support readiness.",
      "escalation": "A lesson completion is not permission to charge, publish or administer access. Escalate missing records or unclear role scope."
    },
    "es": {
      "title": "Cumplimiento de capacitación",
      "purpose": "Revisa el estado de capacitación registrado del equipo.",
      "when": "Durante el ingreso y seguimiento de lecciones asignadas.",
      "actions": [
        "Busca persona y función asignada.",
        "Comprueba estado y fecha de la lección.",
        "Pide una demostración real de la tarea antes de considerarla preparada."
      ],
      "evidence": "El registro y la demostración observada respaldan la preparación.",
      "escalation": "Completar una lección no autoriza cobrar, publicar ni administrar accesos. Escala registros ausentes o funciones poco claras."
    }
  },
  {
    "id": "sms-test",
    "path": "/hub/owner/sms-test.html",
    "en": {
      "title": "SMS test",
      "purpose": "Send a controlled diagnostic text to a reviewed destination.",
      "when": "Only when Dayan authorizes an actual messaging test.",
      "actions": [
        "Confirm the test phone number and exact message.",
        "Review the preview and obtain send approval.",
        "Check the actual provider result before reporting delivery."
      ],
      "evidence": "The provider result identifies the intended test and outcome.",
      "escalation": "This sends a real text. Do not use customer numbers for practice or infer delivery from a button click."
    },
    "es": {
      "title": "Prueba SMS",
      "purpose": "Envía un mensaje de diagnóstico controlado a un destino revisado.",
      "when": "Solo cuando Dayan autorice una prueba real.",
      "actions": [
        "Confirma teléfono de prueba y mensaje exacto.",
        "Revisa la vista previa y obtén aprobación de envío.",
        "Comprueba el resultado real del proveedor antes de informar entrega."
      ],
      "evidence": "El resultado del proveedor identifica prueba y resultado previstos.",
      "escalation": "Esto envía un mensaje real. No uses números de clientes para practicar ni supongas entrega por pulsar un botón."
    }
  },
  {
    "id": "checklists",
    "path": "/hub/kitchen/checklists.html",
    "en": {
      "title": "Kitchen checklists",
      "purpose": "Record opening, service or closing checks.",
      "when": "At the actual checklist stage of the shift.",
      "actions": [
        "Choose the correct checklist and service date.",
        "Perform each check before marking its item.",
        "Save and inspect the recorded checklist."
      ],
      "evidence": "The saved checklist reflects checks actually performed.",
      "escalation": "Do not tick unchecked work. Escalate failed equipment or food-safety checks before continuing service."
    },
    "es": {
      "title": "Listas de cocina",
      "purpose": "Registra controles de apertura, servicio o cierre.",
      "when": "En la etapa real del turno que corresponda.",
      "actions": [
        "Elige lista y fecha de servicio correctas.",
        "Realiza cada control antes de marcarlo.",
        "Guarda y revisa la lista registrada."
      ],
      "evidence": "La lista guardada refleja controles realmente realizados.",
      "escalation": "No marques trabajo sin comprobar. Escala fallos de equipo o seguridad alimentaria antes de continuar."
    }
  },
  {
    "id": "restock",
    "path": "/hub/kitchen/restock.html",
    "en": {
      "title": "Restock orders",
      "purpose": "Prepare replenishment requests and inspect recent orders.",
      "when": "After a counted shortage is identified.",
      "actions": [
        "Confirm the item, unit, required quantity and supplier.",
        "Compare with recent orders to avoid a duplicate purchase.",
        "Review the exact request with Dayan before submitting."
      ],
      "evidence": "The saved restock order matches the approved items and quantities.",
      "escalation": "An order request is not receipt of goods. Escalate unknown prices, duplicate orders or missing supplier confirmation."
    },
    "es": {
      "title": "Reposición",
      "purpose": "Prepara solicitudes de compra y revisa órdenes recientes.",
      "when": "Después de identificar un faltante contado.",
      "actions": [
        "Confirma artículo, unidad, cantidad necesaria y proveedor.",
        "Compara órdenes recientes para evitar compras duplicadas.",
        "Revisa la solicitud exacta con Dayan antes de enviarla."
      ],
      "evidence": "La orden guardada coincide con artículos y cantidades aprobados.",
      "escalation": "Solicitar no equivale a recibir mercancía. Escala precios desconocidos, duplicados o confirmación de proveedor ausente."
    }
  },
  {
    "id": "eod",
    "path": "/hub/kitchen/eod.html",
    "en": {
      "title": "Kitchen EOD",
      "purpose": "Record the real shift summary and unresolved handoff.",
      "when": "At the end of the kitchen shift.",
      "actions": [
        "Review actual production, waste, shortages and incidents.",
        "Enter the shift’s actual summary and blockers.",
        "Save, reopen and name the person and next step for each unresolved issue."
      ],
      "evidence": "The saved report contains the real shift and a usable next action.",
      "escalation": "Do not copy yesterday’s counts or hide an unresolved safety issue. Escalate urgent incidents immediately rather than waiting for closing."
    },
    "es": {
      "title": "Cierre EOD de cocina",
      "purpose": "Registra el resumen real del turno y el relevo pendiente.",
      "when": "Al terminar el turno de cocina.",
      "actions": [
        "Revisa producción, desperdicio, faltantes e incidencias reales.",
        "Agrega el resumen real del turno y sus bloqueos.",
        "Guarda, vuelve a abrir y define responsable y próximo paso de cada pendiente."
      ],
      "evidence": "El informe guardado contiene el turno real y una acción útil.",
      "escalation": "No copies cifras de ayer ni ocultes riesgos. Escala incidencias urgentes de inmediato, sin esperar al cierre."
    }
  },
  {
    "id": "program",
    "path": "/hub/kitchen/program.html",
    "en": {
      "title": "Kitchen program",
      "purpose": "Read today’s program meals and associated preparation references.",
      "when": "Before preparing scheduled program meals.",
      "actions": [
        "Check the actual service date and listed meals.",
        "Read the relevant recipe and portion reference.",
        "Compare the program with confirmed orders and available stock."
      ],
      "evidence": "The dated program, orders and preparation plan agree.",
      "escalation": "Do not substitute a dish or infer a future rotation from today. Escalate missing standards or stock."
    },
    "es": {
      "title": "Programa de cocina",
      "purpose": "Consulta platos programados de hoy y referencias de preparación.",
      "when": "Antes de preparar comidas del programa.",
      "actions": [
        "Comprueba fecha real y platos listados.",
        "Lee receta y referencia de porción correspondientes.",
        "Compara programa, pedidos confirmados e inventario."
      ],
      "evidence": "Programa fechado, pedidos y plan de preparación coinciden.",
      "escalation": "No sustituyas platos ni infieras rotaciones futuras. Escala estándares o existencias ausentes."
    }
  },
  {
    "id": "event",
    "path": "/hub/kitchen/event.html",
    "en": {
      "title": "Catering event",
      "purpose": "Coordinate an event brief, timeline, shopping and packaging.",
      "when": "For the exact booked event, before preparation and dispatch.",
      "actions": [
        "Open the event from its actual booking or kitchen link.",
        "Review brief, timeline, shopping, packaging and assigned delivery.",
        "Check each saved operational update against the approved scope."
      ],
      "evidence": "The event record contains the correct quantities, assignments and actual status.",
      "escalation": "Do not invent an event ID or promise extras absent from the quote. Escalate scope changes and missing driver or food-safety evidence."
    },
    "es": {
      "title": "Evento de catering",
      "purpose": "Coordina brief, cronograma, compras y empaque de un evento.",
      "when": "Para el evento contratado exacto, antes de preparar y despachar.",
      "actions": [
        "Abre el evento desde su reserva o enlace de cocina real.",
        "Revisa brief, cronograma, compras, empaque y entrega asignada.",
        "Contrasta cada cambio operativo guardado con el alcance aprobado."
      ],
      "evidence": "El evento contiene cantidades, asignaciones y estado reales correctos.",
      "escalation": "No inventes identificadores ni prometas extras fuera de cotización. Escala cambios de alcance o evidencia de entrega y seguridad ausente."
    }
  },
  {
    "id": "recipes",
    "path": "/hub/kitchen/recipes.html",
    "en": {
      "title": "Recipe standards",
      "purpose": "Review recipe coverage and drafts awaiting final review.",
      "when": "Before preparing a product or proposing a recipe change.",
      "actions": [
        "Find the exact menu item and current standard.",
        "Read ingredients, method, portion and yield before preparation.",
        "Prepare a draft change for Dayan’s final review."
      ],
      "evidence": "The current reviewed recipe and actual preparation standard agree.",
      "escalation": "A draft recipe is not an approved standard. Escalate allergens, missing yields and substitutions before service."
    },
    "es": {
      "title": "Estándares de recetas",
      "purpose": "Revisa cobertura de recetas y borradores pendientes.",
      "when": "Antes de preparar un producto o proponer un cambio.",
      "actions": [
        "Busca producto exacto y estándar actual.",
        "Lee ingredientes, método, porción y rendimiento antes de preparar.",
        "Prepara el cambio como borrador para revisión final de Dayan."
      ],
      "evidence": "La receta revisada vigente y el estándar usado coinciden.",
      "escalation": "Un borrador no es un estándar aprobado. Escala alérgenos, rendimientos ausentes y sustituciones antes de servir."
    }
  },
  {
    "id": "commissary",
    "path": "/hub/kitchen/commissary.html",
    "en": {
      "title": "Commissary visits",
      "purpose": "Record actual commissary use and inspect visit history.",
      "when": "At the real visit and during usage reconciliation.",
      "actions": [
        "Use the correct location and visit date.",
        "Record actual usage rather than a planned visit.",
        "Review the saved visit in usage history."
      ],
      "evidence": "The saved visit matches the actual time and location.",
      "escalation": "Do not record a planned visit as completed. Escalate an incorrect clock or duplicate visit."
    },
    "es": {
      "title": "Visitas a cocina comercial",
      "purpose": "Registra uso real de la cocina comercial e historial.",
      "when": "Durante la visita real y al conciliar uso.",
      "actions": [
        "Usa ubicación y fecha correctas.",
        "Registra uso real, no una visita planeada.",
        "Comprueba la visita guardada en el historial."
      ],
      "evidence": "La visita guardada coincide con hora y ubicación reales.",
      "escalation": "No registres una visita planeada como realizada. Escala relojes incorrectos o visitas duplicadas."
    }
  },
  {
    "id": "library",
    "path": "/hub/kitchen/library.html",
    "en": {
      "title": "Kitchen library",
      "purpose": "Look up recipe references, approximate nutrition and kitchen documents.",
      "when": "When checking a preparation reference.",
      "actions": [
        "Find the exact recipe or document.",
        "Read portion, yield and ingredients together.",
        "Use the current standard and report missing or conflicting details."
      ],
      "evidence": "The referenced document identifies the actual product and current preparation.",
      "escalation": "Approximate nutrition is not a medical promise. Escalate allergen or standard conflicts instead of guessing."
    },
    "es": {
      "title": "Biblioteca de cocina",
      "purpose": "Consulta recetas, nutrición aproximada y documentos de cocina.",
      "when": "Al comprobar una referencia de preparación.",
      "actions": [
        "Busca receta o documento exactos.",
        "Lee juntos porción, rendimiento e ingredientes.",
        "Usa el estándar vigente e informa datos ausentes o contradictorios."
      ],
      "evidence": "El documento identifica producto y preparación vigentes reales.",
      "escalation": "La nutrición aproximada no es una promesa médica. Escala conflictos de alérgenos o estándares, sin adivinar."
    }
  },
  {
    "id": "temperature",
    "path": "/hub/driver/temp.html",
    "en": {
      "title": "Temperature log",
      "purpose": "Record a real measured temperature for the correct delivery.",
      "when": "At the required food check, using the actual reading.",
      "actions": [
        "Select the correct delivery or log context.",
        "Record the temperature you actually read and the correct unit.",
        "Save and inspect the recorded reading; follow the operating food-safety procedure."
      ],
      "evidence": "The saved reading identifies the actual measurement and delivery context.",
      "escalation": "Never invent a reading or mark an unsafe condition resolved. Follow the approved safety procedure and notify the responsible lead immediately."
    },
    "es": {
      "title": "Temperaturas",
      "purpose": "Registra una temperatura medida para la entrega correcta.",
      "when": "En el control requerido, con una lectura real.",
      "actions": [
        "Selecciona la entrega o contexto correctos.",
        "Registra la temperatura que leíste y la unidad correcta.",
        "Guarda y revisa el registro; sigue el procedimiento de seguridad alimentaria."
      ],
      "evidence": "El registro identifica la medición real y su entrega.",
      "escalation": "No inventes lecturas ni marques resuelto un riesgo. Sigue el procedimiento aprobado y avisa de inmediato al responsable."
    }
  },
  {
    "id": "account",
    "path": "/hub/account.html",
    "en": {
      "title": "Account",
      "purpose": "Review your profile, access and account settings.",
      "when": "At onboarding or when your details need correction.",
      "actions": [
        "Check the account and role shown are yours.",
        "Review your language preference and profile details.",
        "Change your own PIN only through the account flow when authorized."
      ],
      "evidence": "Reloaded account details and language match the intended setting.",
      "escalation": "Do not share PINs or change another person’s access here. Escalate a wrong role or failed sign-in."
    },
    "es": {
      "title": "Cuenta",
      "purpose": "Revisa tu perfil, acceso y configuración de cuenta.",
      "when": "Al ingresar o cuando tus datos necesiten corrección.",
      "actions": [
        "Comprueba que cuenta y función sean tuyas.",
        "Revisa preferencia de idioma y datos de perfil.",
        "Cambia tu propio PIN solo mediante el flujo de cuenta autorizado."
      ],
      "evidence": "Los datos e idioma recargados coinciden con lo previsto.",
      "escalation": "No compartas PIN ni cambies aquí el acceso de otra persona. Escala función incorrecta o fallo de acceso."
    }
  },
  {
    "id": "team",
    "path": "/hub/team.html",
    "en": {
      "title": "Team",
      "purpose": "Find the team information available to your role.",
      "when": "When locating the responsible person for a handoff.",
      "actions": [
        "Find the actual team member and role.",
        "Use the correct internal communication path.",
        "Leave a clear issue, context and next action with its owner."
      ],
      "evidence": "The responsible person receives the intended handoff through the agreed channel.",
      "escalation": "Do not expose team contact details publicly. Escalate missing or incorrect access to Dayan."
    },
    "es": {
      "title": "Equipo",
      "purpose": "Busca la información del equipo disponible para tu función.",
      "when": "Al localizar al responsable de un relevo.",
      "actions": [
        "Busca persona y función reales.",
        "Usa el canal interno correcto.",
        "Entrega problema, contexto y próxima acción al responsable."
      ],
      "evidence": "La persona responsable recibe el relevo previsto por el canal acordado.",
      "escalation": "No publiques datos de contacto del equipo. Escala a Dayan accesos ausentes o incorrectos."
    }
  },
  {
    "id": "my-activity",
    "path": "/hub/my-activity.html",
    "en": {
      "title": "My data",
      "purpose": "Review your own activity and data-request options.",
      "when": "When checking your recorded activity or requesting help with your data.",
      "actions": [
        "Check that the account is yours.",
        "Read the recorded activity and any available request options.",
        "Confirm the exact request scope before submitting it."
      ],
      "evidence": "The activity or saved request record matches your account and intent.",
      "escalation": "A request is not completed erasure. Escalate incorrect records; do not use another person’s account."
    },
    "es": {
      "title": "Mis datos",
      "purpose": "Revisa tu actividad y opciones de solicitudes de datos.",
      "when": "Al comprobar tu actividad o pedir ayuda con tus datos.",
      "actions": [
        "Comprueba que la cuenta sea tuya.",
        "Lee actividad registrada y opciones de solicitud disponibles.",
        "Confirma el alcance exacto antes de enviar una solicitud."
      ],
      "evidence": "La actividad o solicitud guardada coincide con tu cuenta e intención.",
      "escalation": "Solicitar no equivale a eliminar. Escala registros incorrectos y no uses la cuenta de otra persona."
    }
  },
  {
    "id": "training",
    "path": "/hub/training.html",
    "en": {
      "title": "Training",
      "purpose": "Read role training and the bilingual operations guide.",
      "when": "At onboarding and when learning an unfamiliar task.",
      "actions": [
        "Choose your actual role and language.",
        "Read the relevant guide before using a real customer record.",
        "Demonstrate the task safely with the supervisor; check any recorded lesson result."
      ],
      "evidence": "The lesson record and an observed task support the next training step.",
      "escalation": "Do not practice sends, charges, erasure or public publishing on real records. Ask Dayan for a safe example."
    },
    "es": {
      "title": "Capacitación",
      "purpose": "Lee formación por función y la guía bilingüe de operaciones.",
      "when": "Al ingresar y al aprender una tarea nueva.",
      "actions": [
        "Elige tu función real e idioma.",
        "Lee la guía correspondiente antes de usar un registro de cliente.",
        "Demuestra la tarea de forma segura con supervisión y revisa el registro de lección."
      ],
      "evidence": "El registro y una tarea observada respaldan el próximo paso formativo.",
      "escalation": "No practiques envíos, cobros, eliminación ni publicación con registros reales. Pide a Dayan un ejemplo seguro."
    }
  },
  {
    "id": "marketing-today",
    "path": "/hub/marketing/",
    "en": {
      "title": "Marketing desk",
      "purpose": "Review the marketing role’s daily work and requests.",
      "when": "When coordinating demand-generation work with the marketing specialist.",
      "actions": [
        "Read the current daily items and their actual status.",
        "Clarify the brief, customer need and next responsible person.",
        "Use Marketing for drafts and owner review before external action."
      ],
      "evidence": "The actual request or draft record shows the agreed next step.",
      "escalation": "This desk does not transfer owner financial or access authority to marketing staff. Escalate blocked actions through Dayan."
    },
    "es": {
      "title": "Mesa de marketing",
      "purpose": "Revisa trabajo diario y solicitudes de la función de marketing.",
      "when": "Al coordinar captación con la especialista de marketing.",
      "actions": [
        "Lee tareas actuales y su estado real.",
        "Aclara brief, necesidad del cliente y próximo responsable.",
        "Usa Marketing para borradores y revisión de dueña antes de actuar externamente."
      ],
      "evidence": "La solicitud o borrador real muestra el próximo paso acordado.",
      "escalation": "Esta mesa no concede al personal de marketing autoridad financiera ni de acceso. Escala bloqueos mediante Dayan."
    }
  }
];
var DAILY = {
  "en": {
    "back": "Owner home",
    "title": "Your day at Añejo",
    "intro": "Serve customers, prepare today’s work, and close with a clear handoff.",
    "stepsLabel": "Today, in seven steps",
    "related": "Other Hub screens",
    "care": "Before sending, check the recipient and preview.",
    "steps": [
      {
        "title": "Handle requests & quotes",
        "subtitle": "Start with the next customer waiting.",
        "actions": [
          "Check new inquiries, then work one qualified prospect in Sales.",
          "Confirm the date, guest count, menu, and total before preparing a quote.",
          "Before sending, check the recipient and preview."
        ],
        "button": "Open requests",
        "href": "/hub/owner/catering-service.html",
        "related": [
          [
            "Quotes & deposits",
            "/hub/owner/catering.html"
          ],
          [
            "Sales",
            "/hub/owner/sales.html"
          ],
          [
            "Leads",
            "/hub/owner/leads.html"
          ]
        ]
      },
      {
        "title": "Plan orders & stock",
        "subtitle": "Match orders to today’s kitchen capacity.",
        "actions": [
          "Compare confirmed orders with today’s team and counted stock.",
          "Check dated lunch availability before promising more.",
          "Review item, amount, and supplier before submitting a restock order."
        ],
        "button": "Open orders & kitchen",
        "href": "/hub/owner/kitchen.html",
        "related": [
          [
            "Daily Lunch",
            "/hub/owner/daily-lunch.html"
          ],
          [
            "Inventory",
            "/hub/kitchen/inventory.html"
          ],
          [
            "Restock orders",
            "/hub/kitchen/restock.html"
          ]
        ]
      },
      {
        "title": "Run the kitchen & check temperatures",
        "subtitle": "Keep preparation and food checks on track.",
        "actions": [
          "Check open orders and production plans with the kitchen team.",
          "Review staff access and PIN resets in Staff.",
          "Record the temperature you actually read; follow food-safety steps for an out-of-range reading."
        ],
        "button": "Open kitchen",
        "href": "/hub/owner/kitchen.html",
        "related": [
          [
            "Staff",
            "/hub/owner/staff.html"
          ],
          [
            "Temperature entry",
            "/hub/driver/temp.html"
          ],
          [
            "Temperature report",
            "/hub/owner/finance.html"
          ]
        ]
      },
      {
        "title": "Assign & follow deliveries",
        "subtitle": "Keep each ready order moving.",
        "actions": [
          "Review ready orders and routes in Deliveries.",
          "Assign a driver, then check the saved route status.",
          "Read the customer conversation before replying."
        ],
        "button": "Open deliveries",
        "href": "/hub/owner/deliveries.html",
        "related": [
          [
            "Customer messages",
            "/hub/owner/comms.html"
          ]
        ]
      },
      {
        "title": "Record costs & payouts",
        "subtitle": "Keep receipts and payment records together.",
        "actions": [
          "Add a receipt or short note to each expense.",
          "Compare payment records with the provider record during reconciliation.",
          "Check the exact payout amount before recording it."
        ],
        "button": "Open finance",
        "href": "/hub/owner/finance.html",
        "related": [
          [
            "Driver payouts",
            "/hub/owner/payouts.html"
          ]
        ]
      },
      {
        "title": "Review marketing & follow up",
        "subtitle": "Check the final details before action.",
        "actions": [
          "Review the final copy, image, language, price, and date.",
          "Check the recipient and preview before sending a follow-up.",
          "Review the final campaign asset before scheduling or publishing."
        ],
        "button": "Open marketing",
        "href": "/hub/owner/marketing.html",
        "related": [
          [
            "Social campaigns",
            "/hub/owner/social-campaigns.html"
          ],
          [
            "Quote follow-up",
            "/hub/owner/catering-service.html"
          ]
        ]
      },
      {
        "title": "Close the day",
        "subtitle": "Leave a clear record and next step.",
        "actions": [
          "Scan open alerts, recent activity, and delivery issues.",
          "Add the shift’s actual summary and blockers to the EOD report.",
          "Confirm it is saved and leave a named next step."
        ],
        "button": "Open EOD report",
        "href": "/hub/kitchen/eod.html",
        "related": [
          [
            "Owner overview",
            "/hub/owner/"
          ]
        ]
      }
    ]
  },
  "es": {
    "back": "Inicio de dueña",
    "title": "Tu día en Añejo",
    "intro": "Atiende a tus clientes, prepara el trabajo de hoy y deja un traspaso claro al cerrar.",
    "stepsLabel": "Siete pasos para hoy",
    "related": "Otras pantallas del Hub",
    "steps": [
      {
        "title": "Atiende solicitudes y cotizaciones",
        "subtitle": "Empieza con el próximo cliente que espera.",
        "actions": [
          "Revisa consultas nuevas y trabaja un prospecto calificado en Ventas.",
          "Confirma fecha, invitados, menú y total antes de preparar una cotización.",
          "Antes de enviar, revisa el destinatario y la vista previa."
        ],
        "button": "Abrir solicitudes",
        "href": "/hub/owner/catering-service.html",
        "related": [
          [
            "Cotizaciones y depósitos",
            "/hub/owner/catering.html"
          ],
          [
            "Ventas",
            "/hub/owner/sales.html"
          ],
          [
            "Prospectos",
            "/hub/owner/leads.html"
          ]
        ]
      },
      {
        "title": "Planifica pedidos e inventario",
        "subtitle": "Ajusta los pedidos a la capacidad de hoy.",
        "actions": [
          "Compara los pedidos confirmados con el equipo y el inventario contado.",
          "Revisa las fechas de almuerzo antes de prometer más.",
          "Revisa artículo, cantidad y proveedor antes de enviar una orden de compra."
        ],
        "button": "Abrir pedidos y cocina",
        "href": "/hub/owner/kitchen.html",
        "related": [
          [
            "Almuerzo Diario",
            "/hub/owner/daily-lunch.html"
          ],
          [
            "Inventario",
            "/hub/kitchen/inventory.html"
          ],
          [
            "Órdenes de compra",
            "/hub/kitchen/restock.html"
          ]
        ]
      },
      {
        "title": "Dirige la cocina y revisa temperaturas",
        "subtitle": "Mantén la preparación y los controles al día.",
        "actions": [
          "Revisa los pedidos abiertos y planes de producción con el equipo.",
          "Revisa el acceso del personal y los reinicios de PIN en Personal.",
          "Registra la temperatura que leíste; sigue los pasos de seguridad alimentaria si está fuera de rango."
        ],
        "button": "Abrir cocina",
        "href": "/hub/owner/kitchen.html",
        "related": [
          [
            "Personal",
            "/hub/owner/staff.html"
          ],
          [
            "Registrar temperatura",
            "/hub/driver/temp.html"
          ],
          [
            "Informe de temperaturas",
            "/hub/owner/finance.html"
          ]
        ]
      },
      {
        "title": "Asigna y sigue las entregas",
        "subtitle": "Mantén cada pedido listo en movimiento.",
        "actions": [
          "Revisa los pedidos listos y las rutas en Entregas.",
          "Asigna un conductor y luego revisa el estado guardado de la ruta.",
          "Lee la conversación con el cliente antes de responder."
        ],
        "button": "Abrir entregas",
        "href": "/hub/owner/deliveries.html",
        "related": [
          [
            "Mensajes con clientes",
            "/hub/owner/comms.html"
          ]
        ]
      },
      {
        "title": "Registra gastos y pagos",
        "subtitle": "Mantén juntos los recibos y pagos.",
        "actions": [
          "Adjunta un recibo o una nota breve a cada gasto.",
          "Compara los pagos registrados con el proveedor al conciliarlos.",
          "Revisa la cantidad exacta antes de registrar un pago."
        ],
        "button": "Abrir finanzas",
        "href": "/hub/owner/finance.html",
        "related": [
          [
            "Pagos a conductores",
            "/hub/owner/payouts.html"
          ]
        ]
      },
      {
        "title": "Revisa marketing y da seguimiento",
        "subtitle": "Comprueba los detalles antes de actuar.",
        "actions": [
          "Revisa el texto, la imagen, el idioma, el precio y la fecha finales.",
          "Revisa el destinatario y la vista previa antes de enviar un seguimiento.",
          "Revisa la pieza final antes de programar o publicar una campaña."
        ],
        "button": "Abrir marketing",
        "href": "/hub/owner/marketing.html",
        "related": [
          [
            "Campañas sociales",
            "/hub/owner/social-campaigns.html"
          ],
          [
            "Seguimiento de cotizaciones",
            "/hub/owner/catering-service.html"
          ]
        ]
      },
      {
        "title": "Cierra el día",
        "subtitle": "Deja un registro claro y el siguiente paso.",
        "actions": [
          "Revisa alertas abiertas, actividad reciente y problemas de entrega.",
          "Agrega al informe EOD el resumen real del turno y sus bloqueos.",
          "Confirma que se guardó y deja indicado quién sigue."
        ],
        "button": "Abrir informe EOD",
        "href": "/hub/kitchen/eod.html",
        "related": [
          [
            "Resumen de la dueña",
            "/hub/owner/"
          ]
        ]
      }
    ]
  }
};
var LABELS = {
  en:{how:'How to use this screen',purpose:'What it does',when:'When to use it',steps:'Do this',evidence:'How to check it is finished',escalation:'If something goes wrong',open:'Open screen',directory:'Every screen, one clear job',search:'Find a screen or task',empty:'No matching screens. Try another word.',count:'screens',guide:'Open the full operating guide',routine:'Daily operating rhythm',salesTitle:'Build tomorrow’s orders, every day',sales:'Protect a daily sales block: qualify inquiries, research suitable offices or organizations, prepare a relevant offer and record the next follow-up. Measure actual conversations, quotes and activated accounts, not drafts or visits.',handoff:'Before closing: name the pending issue, its owner, the next action and its due time.',introLabel:'Arianne · owner operations',title:'Añejo Hub · Operating guide',toggle:'Change language to Spanish'},
  es:{how:'Cómo usar esta pantalla',purpose:'Para qué sirve',when:'Cuándo usarla',steps:'Qué hacer',evidence:'Cómo comprobar que terminó',escalation:'Si algo no sale bien',open:'Abrir pantalla',directory:'Cada pantalla, una tarea clara',search:'Buscar pantalla o tarea',empty:'No hay coincidencias. Prueba otra palabra.',count:'pantallas',guide:'Abrir la guía completa',routine:'Rutina diaria de operaciones',salesTitle:'Genera los pedidos de mañana, cada día',sales:'Reserva un bloque diario de ventas: califica consultas, investiga oficinas u organizaciones adecuadas, prepara una oferta relevante y registra el próximo seguimiento. Mide conversaciones, cotizaciones y cuentas activadas reales, no borradores ni visitas.',handoff:'Antes de cerrar: deja problema pendiente, responsable, próxima acción y hora límite.',introLabel:'Arianne · operaciones de dueña',title:'Añejo Hub · Guía de operaciones',toggle:'Cambiar idioma a inglés'}
};
var STYLE = '.operator-playbooks{color:var(--green,#1b3a2b);font-size:16px;line-height:1.55;overflow-wrap:anywhere}.operator-playbooks summary{cursor:pointer;min-height:48px;padding:12px 14px}.operator-playbooks summary:focus-visible,.operator-playbooks a:focus-visible,.operator-playbooks input:focus-visible{outline:3px solid #846729;outline-offset:3px}.operator-playbooks details{scroll-margin-top:90px;border:1px solid var(--line,#dedbd2);border-radius:12px;background:var(--white,#fffdf8);margin:10px 0}.operator-playbooks details[open]>summary{border-bottom:1px solid var(--line,#dedbd2)}.operator-playbooks summary strong{font-size:16px}.operator-playbooks .op-content{padding:4px 16px 16px}.operator-playbooks .op-content p{margin:8px 0 12px}.operator-playbooks h4{font-size:14px;margin:16px 0 4px;color:var(--green,#1b3a2b)}.operator-playbooks ol{margin:4px 0 12px;padding-left:22px}.operator-playbooks li{padding:4px 0}.operator-playbooks .op-link{display:inline-flex;align-items:center;min-height:44px;padding:8px 11px;margin:4px 8px 0 0;border:1px solid var(--line,#dedbd2);border-radius:8px;color:var(--green,#1b3a2b);font-weight:650;text-decoration:none}.operator-playbooks .op-link:hover{background:var(--cream,#f5f2ec)}.operator-playbooks label{display:block;font-size:15px;font-weight:650;margin:16px 0 5px}.operator-playbooks input{font:inherit;width:100%;min-height:48px;padding:10px 12px;border:1px solid #809085;border-radius:8px;background:#fffdf8;color:#1b3a2b}.operator-playbooks .op-meta{font-size:14px;color:#4f5d55}.operator-playbooks .op-meta strong{color:var(--green,#1b3a2b)}.operator-context{margin-bottom:12px}.operator-context>summary{font-weight:650}.operator-playbooks [hidden]{display:none!important}.operator-playbooks .op-sales{border-left:3px solid #9a7b37;padding:2px 16px;margin:22px 0}.operator-playbooks .op-sales h3{font-size:19px;margin:5px 0}.operator-playbooks .op-sales p{margin:6px 0}.operator-playbooks .op-count{font-size:14px;color:#4f5d55;margin:8px 0}.operator-playbooks .op-directory{margin-top:26px}.operator-playbooks h3{color:var(--green,#1b3a2b)}@media(prefers-reduced-motion:reduce){.operator-playbooks *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}';
var contexts = [];
function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];}); }
function lang() { return window.AnejoLang && window.AnejoLang.get() === 'en' ? 'en' : 'es'; }
function normalize(pathname) {
  var p = String(pathname || '').split(/[?#]/)[0];
  if (p === '/hub/owner/index.html' || p === '/hub/owner') return '/hub/owner/';
  if (p === '/hub/owner/operations-guide') return '/hub/owner/operations-guide.html';
  if (p === '/studio/index.html' || p === '/studio') return '/studio/';
  if (p === '/hub/marketing/index.html' || p === '/hub/marketing') return '/hub/marketing/';
  if (p === '/hub/training') return '/hub/training.html';
  if (p === '/hub/comms.html' || p === '/hub/comms') return '/hub/owner/comms.html';
  if(AREAS.some(function(a){return a.path===p+'.html';}))return p+'.html';
  return p;
}
function resolve(pathname) { var p=normalize(pathname); return AREAS.find(function(a){return a.path === p;}) || null; }
function style() {
  if (document.getElementById('operator-playbook-style')) return;
  var s=document.createElement('style'); s.id='operator-playbook-style'; s.textContent=STYLE; document.head.appendChild(s);
}
function body(area, locale, includeLink) {
  var c=area[locale],l=LABELS[locale];
  // Events are opened from a real booking, not an invented event identifier.
  var href=area.id === 'event' ? '/hub/owner/kitchen.html' : area.path;
  return '<div class="op-content"><h4>'+esc(l.purpose)+'</h4><p>'+esc(c.purpose)+'</p><h4>'+esc(l.when)+'</h4><p>'+esc(c.when)+'</p><h4>'+esc(l.steps)+'</h4><ol>'+c.actions.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ol><h4>'+esc(l.evidence)+'</h4><p>'+esc(c.evidence)+'</p><h4>'+esc(l.escalation)+'</h4><p>'+esc(c.escalation)+'</p>'+(includeLink?'<a class="op-link" href="'+esc(href)+'">'+esc(l.open)+' <span aria-hidden="true">›</span></a>':'')+'</div>';
}
function remember(root) {
  var focused=document.activeElement;
  return {open:Array.from(root.querySelectorAll('details[data-op-key][open]')).map(function(e){return e.getAttribute('data-op-key');}),focus:focused && root.contains(focused) ? focused.getAttribute('data-op-focus') : null};
}
function restore(root, state) {
  if (!state) return;
  root.querySelectorAll('details[data-op-key]').forEach(function(e){e.open=state.open.indexOf(e.getAttribute('data-op-key')) !== -1;});
  if (state.focus) { var focus=root.querySelector('[data-op-focus="'+state.focus+'"]'); if(focus)focus.focus({preventScroll:true}); }
}
function drawContext(record) {
  var root=record.root,state=root.innerHTML?remember(root):null,locale=lang(),l=LABELS[locale],area=record.area;
  root.lang=locale;root.setAttribute('translate','no');
  root.innerHTML='<details class="operator-context" data-op-key="context"><summary data-op-focus="context">'+esc(l.how)+' · '+esc(area[locale].title)+'</summary>'+body(area,locale,false)+'<div class="op-content"><a class="op-link" href="/hub/owner/operations-guide.html#screen-'+area.id+'">'+esc(l.guide)+'</a></div></details>';
  restore(root,state);
}
function removeContext(existing) {
  if(existing){var parent=existing.parentNode;if(parent && parent.classList.contains('operator-playbook-wrap'))parent.remove();else existing.remove();}
  contexts=[];
}
function mount(options) {
  options=options || {};
  var role=options.role;
  var existing=document.getElementById('operator-playbook');
  if (role !== 'owner') { removeContext(existing); return null; }
  var area=resolve(options.pathname || (window.location && window.location.pathname));
  if (!area) { removeContext(existing); return null; }
  style();
  var root=existing;
  if(!root){
    root=document.createElement('aside');root.id='operator-playbook';root.className='operator-playbooks';
    var container=options.container;
    if(typeof container === 'string')container=document.querySelector(container);
    if(container)container.appendChild(root);
    else {
      var anchor=document.querySelector('.hub-wrap') || document.querySelector('main');
      if(!anchor || !anchor.parentNode)return null;
      var wrap=document.createElement('div');wrap.className='hub-wrap operator-playbook-wrap';wrap.appendChild(root);anchor.parentNode.insertBefore(wrap,anchor);
    }
  }
  var record={root:root,area:area};contexts=[record];drawContext(record);return root;
}
function render() {
  var root=document.getElementById('owner-root');if(!root)return;
  style();var state=root.querySelector('.operator-playbooks')?remember(root):null;
  var search=root.querySelector('#op-search'),query=search?search.value:'',selection=search?search.selectionStart:null;
  var locale=lang(),c=DAILY[locale],l=LABELS[locale];root.setAttribute('translate','no');root.lang=locale;
  var evidenceIds=['catering-service','inventory','temperature','deliveries','finance','marketing','eod'];
  var html='<div class="operator-playbooks"><a class="guide-back" href="/hub/owner/">‹ '+esc(c.back)+'</a><header class="guide-hero"><div class="guide-eyebrow"><img src="/assets/img/emblem.png" alt="" aria-hidden="true"><span>'+esc(l.introLabel)+'</span></div><h2>'+esc(c.title)+'</h2><p>'+esc(c.intro)+'</p></header><h3 class="guide-section-title">'+esc(l.routine)+'</h3><div class="guide-list">';
  c.steps.forEach(function(step,i){var area=AREAS.find(function(a){return a.id===evidenceIds[i];})[locale];html+='<details class="guide-card" data-op-key="daily-'+i+'"'+(!state && i===0?' open':'')+'><summary data-op-focus="daily-'+i+'"><span class="guide-number" aria-hidden="true">'+(i+1)+'</span><span class="guide-heading"><strong>'+esc(step.title)+'</strong><span>'+esc(step.subtitle)+'</span></span></summary><div class="guide-details"><ol>'+step.actions.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ol><details data-op-key="daily-proof-'+i+'"><summary data-op-focus="daily-proof-'+i+'">'+esc(l.evidence)+'</summary><div class="op-content"><p>'+esc(area.evidence)+'</p><h4>'+esc(l.escalation)+'</h4><p>'+esc(area.escalation)+'</p></div></details><a class="guide-primary" href="'+esc(step.href)+'">'+esc(step.button)+' <span aria-hidden="true">›</span></a><details class="guide-related" data-op-key="daily-related-'+i+'"><summary data-op-focus="daily-related-'+i+'">'+esc(c.related)+'</summary><div>'+step.related.map(function(a){return '<a href="'+esc(a[1])+'">'+esc(a[0])+'</a>';}).join('')+'</div></details></div></details>';});
  html+='</div><section class="op-sales"><h3>'+esc(l.salesTitle)+'</h3><p>'+esc(l.sales)+'</p><a class="op-link" href="/hub/owner/sales.html">'+esc(AREAS.find(function(a){return a.id==='sales';})[locale].title)+'</a><a class="op-link" href="/hub/owner/leads.html">'+esc(AREAS.find(function(a){return a.id==='leads';})[locale].title)+'</a></section><section class="op-directory"><h3 class="guide-section-title">'+esc(l.directory)+'</h3><label for="op-search">'+esc(l.search)+'</label><input id="op-search" type="search" data-op-focus="search" autocomplete="off" value="'+esc(query)+'"><p id="op-count" class="op-count" role="status"></p><p id="op-empty" hidden>'+esc(l.empty)+'</p><div id="op-directory">';
  AREAS.forEach(function(area){html+='<details id="screen-'+area.id+'" data-area="'+area.id+'" data-op-key="screen-'+area.id+'"><summary data-op-focus="screen-'+area.id+'"><strong>'+esc(area[locale].title)+'</strong></summary>'+body(area,locale,true)+'</details>';});
  root.innerHTML=html+'</div></section><p class="op-meta">'+esc(l.handoff)+'</p></div>';
  restore(root,state);var field=root.querySelector('#op-search');field.addEventListener('input',filter);filter();if(selection!=null && document.activeElement===field)field.setSelectionRange(selection,selection);
  if(!state)openAnchor();
  document.title=l.title;var nav=document.getElementById('owner-nav');if(nav)nav.setAttribute('aria-label',locale==='es'?'Navegación de dueña':'Owner navigation');updateToggle();
}
function openAnchor() {
  if(!isGuide())return;var root=document.getElementById('owner-root'),hash=window.location && window.location.hash;
  if(!root || !hash || !/^#screen-[a-z-]+$/.test(hash))return;
  var linked=root.querySelector(hash);if(!linked)return;var field=root.querySelector('#op-search');if(field && linked.hidden){field.value='';filter();}
  linked.hidden=false;linked.open=true;linked.scrollIntoView({block:'start'});
}
function filter() {
  var root=document.getElementById('owner-root');if(!root)return;var field=root.querySelector('#op-search');if(!field)return;
  var q=field.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(),shown=0;
  root.querySelectorAll('[data-area]').forEach(function(node){var id=node.getAttribute('data-area'),area=AREAS.find(function(a){return a.id===id;}),text=JSON.stringify(area).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();node.hidden=!!q && text.indexOf(q)===-1;if(!node.hidden)shown++;});
  root.querySelector('#op-count').textContent=shown+' / '+AREAS.length+' '+LABELS[lang()].count;root.querySelector('#op-empty').hidden=shown!==0;
}
function updateToggle(){var toggle=document.getElementById('lang-toggle');if(toggle){toggle.textContent=lang()==='es'?'EN':'ES';toggle.setAttribute('aria-label',LABELS[lang()].toggle);}}
function isGuide(){return normalize(window.location && window.location.pathname)==='/hub/owner/operations-guide.html';}
function changed(){contexts=contexts.filter(function(r){return r.root.isConnected;});contexts.forEach(drawContext);if(isGuide())render();}
document.addEventListener('anejo:langchange',changed);
if(window.addEventListener)window.addEventListener('hashchange',openAnchor);
window.AnejoOperatorPlaybooks={mount:mount,resolve:resolve,areas:AREAS,renderGuide:render,currentLang:lang};
window.AnejoOwnerOperationsGuide={copy:DAILY,render:render,currentLang:lang};
if(isGuide() && window.Owner && window.Hub){
  var toggle=document.getElementById('lang-toggle');updateToggle();
  if(toggle)toggle.addEventListener('click',function(){if(window.AnejoLang)window.AnejoLang.set(lang()==='es'?'en':'es');});
  window.Owner.init('operations-guide', render);
}
})(window, document);
