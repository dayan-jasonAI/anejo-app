/* Deterministic bilingual Cajita review. Customer content never enters translation APIs. */
(function () {
  'use strict';
  var dict = {
    'Catering design requests': 'Solicitudes de diseño de catering',
    'Catering production · Añejo Hub': 'Producción de catering · Añejo Hub',
    'Review Cajita versions and ingredient totals. Requests require management approval before preparation.': 'Revisa las versiones de La Cajita y los totales de ingredientes. Las solicitudes requieren aprobación de gerencia antes de prepararse.',
    'Kitchen review — these are quote requests, not confirmed production orders. Management must approve the final menu, design, quantities and date before preparation. Customer contact details are intentionally omitted.': 'Revisión de cocina: estas son solicitudes de cotización, no órdenes de producción confirmadas. Gerencia debe aprobar el menú final, el diseño, las cantidades y la fecha antes de la preparación. Los datos de contacto del cliente se omiten intencionalmente.',
    'Loading…': 'Cargando…', 'Could not load requests.': 'No se pudieron cargar las solicitudes.',
    'No catering requests.': 'No hay solicitudes de catering.', 'Catering request': 'Solicitud de catering',
    'Dietary/allergy notes:': 'Necesidades alimentarias y alergias:', 'Event details:': 'Detalles del evento:',
    'None provided': 'No se proporcionaron', 'not provided': 'sin especificar',
    'guests': 'personas', 'serving': 'hora de servicio', 'No Cajita configuration.': 'No hay configuración de La Cajita.',
    'Website quote requests': 'Solicitudes de cotización del sitio web',
    'Open kitchen design-request summary': 'Abrir el resumen de diseños para cocina',
    'No website catering requests yet.': 'Aún no hay solicitudes de catering del sitio web.',
    'Website requests': 'Solicitudes del sitio web',
    'Menu not specified': 'Menú sin especificar', 'received': 'recibida',
    'No event details provided.': 'No se proporcionaron detalles del evento.',
    'Exact Cajita configuration': 'Configuración exacta de La Cajita',
    'Private design files · owner only': 'Archivos de diseño privados · solo para el propietario',
    'Preview': 'Vista previa', 'Download': 'Descargar', 'Start a quote': 'Crear una cotización',
    'Email customer': 'Enviar correo al cliente', 'Original request (as submitted)': 'Solicitud original (tal como se recibió)',
    'Request copied into a new quote — enter the agreed total': 'Solicitud copiada a una nueva cotización: ingresa el total acordado',
    'Cajita configuration': 'Configuración de La Cajita', 'Versions': 'Versiones', 'Version': 'Versión',
    'boxes': 'cajitas', 'Total boxes': 'Total de cajitas', 'Items per box': 'Artículos por cajita',
    'Omitted items': 'Artículos omitidos', 'Event ingredient totals': 'Totales de ingredientes del evento',
    'Theme': 'Tema', 'Colors': 'Colores', 'Pattern': 'Patrón', 'Pick shape': 'Forma del palillo',
    'Theme description': 'Descripción del tema', 'Background artwork': 'Diseño de fondo',
    'Label text': 'Texto de la etiqueta redonda', 'Tag text': 'Texto de la etiqueta colgante',
    'Pick text': 'Texto del palillo', 'Text placements': 'Posiciones del texto',
    'Artwork placements': 'Posiciones de los diseños', 'Packaging request': 'Solicitud de empaque',
    'Notes': 'Notas', 'none': 'ninguno', 'default': 'predeterminado', 'scale': 'escala', 'rotation': 'rotación',
    'Mini sandwich': 'Mini sándwich', 'Party salad': 'Ensalada de fiesta', 'Grazing bites': 'Bocaditos para picar',
    'Fruit & ham skewer': 'Brocheta de frutas y jamón',
    'Añejo Signature': 'Añejo Original', 'Gender reveal': 'Revelación de género', 'Birthday': 'Cumpleaños',
    'Christmas': 'Navidad', 'Hanukkah': 'Janucá', 'New Year / New Year’s Eve': 'Año Nuevo / Nochevieja',
    'Valentine’s Day': 'San Valentín', 'Easter': 'Pascua', 'Mother’s Day': 'Día de las Madres',
    'Father’s Day': 'Día de los Padres', 'Veterans Day': 'Día de los Veteranos',
    'Independence Day': 'Día de la Independencia', 'Labor Day': 'Día del Trabajo',
    'Thanksgiving': 'Acción de Gracias', 'Quinceañera / 15th birthday': 'Quinceañera / Cumpleaños de 15',
    'Sweet sixteen': 'Dulces 16', 'Special occasion': 'Ocasión especial', 'Just because': 'Porque sí',
    'Your own theme': 'Tu propio tema', 'background': 'fondo', 'box': 'caja', 'liner': 'papel interior',
    'label': 'etiqueta redonda', 'tag': 'etiqueta colgante', 'logo': 'logotipo', 'ribbon': 'cinta', 'pick': 'palillo',
    'botanical': 'botánico', 'hearts': 'corazones', 'flowers': 'flores', 'fall': 'otoñal', 'stars': 'estrellas',
    'circle': 'círculo', 'heart': 'corazón', 'star': 'estrella', 'bow': 'lazo', 'leaf': 'hoja', 'flag': 'bandera',
    'butterfly': 'mariposa'
  };
  var foods = { sandwich: 'Mini sandwich', empanada: 'Empanada', croqueta: 'Croqueta', salad: 'Party salad', grazing: 'Grazing bites', 'tres-leches': 'Tres leches', skewer: 'Fruit & ham skewer' };
  var presets = { signature: 'Añejo Signature', 'gender-reveal': 'Gender reveal', birthday: 'Birthday', halloween: 'Halloween', christmas: 'Christmas', hanukkah: 'Hanukkah', 'new-year': 'New Year / New Year’s Eve', valentine: 'Valentine’s Day', easter: 'Easter', mother: 'Mother’s Day', father: 'Father’s Day', veterans: 'Veterans Day', independence: 'Independence Day', labor: 'Labor Day', thanksgiving: 'Thanksgiving', quince: 'Quinceañera / 15th birthday', sweet16: 'Sweet sixteen', special: 'Special occasion', 'just-because': 'Just because', custom: 'Your own theme' };
  function language() { return window.AnejoLang && window.AnejoLang.get() === 'es' ? 'es' : 'en'; }
  function t(s, lang) { return (lang || language()) === 'es' && dict[s] ? dict[s] : s; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function label(s) { return '<span translate="no" data-catering-label="' + esc(s) + '">' + esc(t(s)) + '</span>'; }
  function summary(config, lang) {
    if (!config || !Array.isArray(config.variants)) return t('No Cajita configuration.', lang);
    function tr(s) { return t(s, lang); }
    var totals = {}, boxes = 0, lines = [tr('Cajita configuration') + ' v' + config.version, tr('Versions') + ': ' + config.variants.length];
    function entries(items) { return items.map(function(i) { return tr(foods[i.id] || i.id) + ' ×' + i.quantity; }).join(', '); }
    config.variants.forEach(function(v) {
      boxes += v.quantity;
      lines.push('\n' + tr('Version') + ' ' + v.name + ' (' + v.quantity + ' ' + tr('boxes') + ')');
      lines.push(tr('Items per box') + ': ' + entries(v.items.filter(function(i) { return i.quantity > 0; })));
      lines.push(tr('Omitted items') + ': ' + (entries(v.items.filter(function(i) { return i.quantity === 0; })) || tr('none')));
      v.items.forEach(function(i) { totals[i.id] = (totals[i.id] || 0) + i.quantity * v.quantity; });
      var theme = v.theme || {}, p = v.personalization || {};
      // Only canonical preset names are translated. Custom theme names and all customer text remain exact.
      var preset = presets[theme.preset], name = theme.name;
      lines.push(tr('Theme') + ': ' + (name && name !== preset ? name : tr(preset || name || 'Your own theme')));
      lines.push(tr('Colors') + ': ' + (Object.keys(theme.colors || {}).filter(function(k) { return theme.colors[k]; }).map(function(k) { return tr(k) + '=' + theme.colors[k]; }).join(', ') || tr('none')));
      lines.push(tr('Pattern') + ': ' + tr(theme.pattern || 'none') + '; ' + tr('Pick shape') + ': ' + tr(theme.pickShape || 'default'));
      [['Theme description',theme.prompt], ['Background artwork',theme.artworkAttachmentId], ['Label text',p.labelText], ['Tag text',p.tagText], ['Pick text',p.pickText]].forEach(function(pair) { lines.push(tr(pair[0]) + ': ' + (pair[1] || tr('none'))); });
      function placements(list, art) { return (list || []).map(function(x) { return (art ? x.attachmentId + '@' : '') + tr(x.surface) + '@' + x.x + ',' + x.y + ' ' + tr('scale') + ' ' + x.scale + ' ' + tr('rotation') + ' ' + x.rotation; }).join(' | ') || tr('none'); }
      lines.push(tr('Text placements') + ': ' + placements(p.textPlacements, false));
      lines.push(tr('Artwork placements') + ': ' + placements(p.artworks, true));
      if (v.packagingRequest) lines.push(tr('Packaging request') + ': ' + v.packagingRequest);
      if (v.notes) lines.push(tr('Notes') + ': ' + v.notes);
    });
    lines.push('\n' + tr('Total boxes') + ': ' + boxes);
    lines.push(tr('Event ingredient totals') + ': ' + entries(Object.keys(totals).map(function(id) { return { id:id, quantity:totals[id] }; })));
    return lines.join('\n');
  }
  function summaryHtml(config, fallback) {
    return '<pre translate="no" class="cajita-review-summary"' + (config ? ' data-cajita-config="' + esc(JSON.stringify(config)) + '"' : '') + '>' + esc(config ? summary(config) : fallback || t('No Cajita configuration.')) + '</pre>';
  }
  function refresh(root) {
    root = root || document;
    root.querySelectorAll('[data-catering-label]').forEach(function(el) { el.textContent = t(el.getAttribute('data-catering-label')); });
    root.querySelectorAll('[data-cajita-config]').forEach(function(el) { try { el.textContent = summary(JSON.parse(el.getAttribute('data-cajita-config'))); } catch (_) { /* Keep original review text if malformed. */ } });
  }
  if (window.AnejoI18n) window.AnejoI18n.extend(dict);
  else (window.__hubI18nQueue || (window.__hubI18nQueue = [])).push(dict);
  window.CateringI18n = { text:t, label:label, summary:summary, summaryHtml:summaryHtml, refresh:refresh };
  document.addEventListener('anejo:langchange', function() { refresh(); });
})();
