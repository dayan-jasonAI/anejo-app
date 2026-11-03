/* Añejo read-only Spanish editions. Source/editor/approval fields stay unchanged. */
(function () {
  'use strict';
  var copy = {
    loading: ['Loading Spanish reading edition…', 'Cargando la versión de lectura en español…'],
    current: ['Spanish reading edition · read only', 'Versión de lectura en español · solo lectura'],
    unchanged: ['Translation does not change source approval or editable recipe values.', 'La traducción no cambia la aprobación de la fuente ni los valores editables de la receta.'],
    stale: ['The Spanish reading edition is out of date. Ask for an updated edition before using it.', 'La versión de lectura en español está desactualizada. Solicita una versión actual antes de usarla.'],
    unavailable: ['A current Spanish reading edition is unavailable. Ask for help before using the original source.', 'No hay una versión de lectura actual en español. Solicita ayuda antes de usar la fuente original.'],
    failed: ['The Spanish reading edition could not be loaded. Retry by selecting the record again.', 'No se pudo cargar la versión de lectura en español. Vuelve a seleccionar el registro para reintentar.'],
    source: ['Original source', 'Fuente original'],
    ingredients: ['Ingredients', 'Ingredientes'], steps: ['Steps', 'Pasos']
  };
  function lang() { return window.AnejoLang && window.AnejoLang.get() === 'es' ? 'es' : 'en'; }
  function text(key) { return copy[key][lang() === 'es' ? 1 : 0]; }
  var gapNames = {
    name:['Recipe name','Nombre de la receta'], portion:['Ready-to-serve portion','Porción lista para servir'], yield_unit:['Yield unit','Unidad de rendimiento'],
    cook_temperature:['Cook temperature and doneness','Temperatura y punto de cocción'], holding:['Holding and service','Conservación para el servicio'], cooling_reheating:['Cooling and reheating','Enfriamiento y recalentamiento'],
    storage:['Storage','Almacenamiento'], shelf_life:['Shelf life','Vida útil'], allergens:['Allergens and cross-contact','Alérgenos y contacto cruzado'], packaging:['Packaging and plating','Envases y presentación'], source_reference:['Verified source','Fuente verificada'],
    yield_count:['Batch yield count','Cantidad de porciones por lote'], prep_minutes:['Preparation minutes','Minutos de preparación'], cook_minutes:['Cooking minutes','Minutos de cocción'], ingredients:['Ingredients','Ingredientes'], steps:['Method steps','Pasos de preparación'], equipment:['Equipment','Equipo'], photos:['Reference photos','Fotos de referencia'], unresolved_unknowns:['Unresolved questions','Preguntas pendientes'], catalog_unit_mapping:['Menu unit conversions','Conversión de unidades del menú']
  };
  function gapLabel(key) {
    var es = lang() === 'es', match = /^ingredient_(\d+)_quantity_unit_basis$/.exec(String(key));
    if (match) return (es ? 'Ingrediente ' : 'Ingredient ') + match[1] + (es ? ': cantidad, unidad y tipo de peso' : ': quantity, unit and weight basis');
    return gapNames[key] ? gapNames[key][es ? 1 : 0] : (es ? 'Requisito no reconocido: ' : 'Unrecognized requirement: ') + key;
  }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function query(path, locale) { return path + (path.indexOf('?') < 0 ? '?' : '&') + 'lang=' + (locale || lang()); }
  function lines(items, ordered) {
    if (!Array.isArray(items) || !items.length) return '';
    var tag = ordered ? 'ol' : 'ul';
    return '<' + tag + '>' + items.map(function (item) {
      var value = typeof item === 'string' ? item : item.text || [(item.quantity == null ? item.qty : item.quantity), item.unit, item.item || item.name, item.basis].filter(function (v) { return v != null && v !== ''; }).join(' · ');
      return '<li>' + esc(value) + '</li>';
    }).join('') + '</' + tag + '>';
  }
  function html(edition, state) {
    var current = edition && edition.status === 'current' && edition.locale === 'es';
    var message = state || (current ? 'current' : edition && edition.status === 'stale' ? 'stale' : 'unavailable');
    return '<section class="reading-edition" lang="' + (current ? 'es' : lang()) + '" translate="no" data-reading-state="' + esc(message) + '"><p class="row-sub" role="status">' + esc(text(message)) + '</p>' +
      (current && !state ? '<div class="reading-content">' + (edition.title || edition.name ? '<h3>' + esc(edition.title || edition.name) + '</h3>' : '') +
        (edition.body ? '<div class="doc-body">' + esc(edition.body) + '</div>' : '') +
        (edition.ingredients && edition.ingredients.length ? '<h4>' + text('ingredients') + '</h4>' + lines(edition.ingredients, false) : '') +
        (edition.steps && edition.steps.length ? '<h4>' + text('steps') + '</h4>' + lines(edition.steps, true) : '') + '</div>' : '') +
      '<p class="row-sub">' + esc(text('unchanged')) + '</p></section>';
  }
  function gate() { var version = 0; return {next:function () { return ++version; }, current:function (token) { return token === version; }}; }
  var style = document.createElement('style');
  style.textContent = '.reading-edition{border-left:3px solid var(--gold,#b69b49);padding:12px 16px;background:var(--cream,#f8f5ea);margin:16px 0;overflow-wrap:anywhere}.reading-content{max-width:72ch;line-height:1.65}.reading-content li{margin-bottom:8px}.reading-content ul,.reading-content ol{padding-left:24px}.reading-source summary{min-height:44px;cursor:pointer;display:flex;align-items:center}.reading-source{margin:16px 0}.reading-edition h3{margin-top:8px}';
  document.head.appendChild(style);
  window.AnejoReadingEdition = {lang:lang,text:text,query:query,html:html,gate:gate,gapLabel:gapLabel};
})();
