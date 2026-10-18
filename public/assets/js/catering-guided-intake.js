/* Guided catering choices. No contact drafts are stored; every suggestion is opt-in. */
(function () {
  'use strict';
  var form=document.getElementById('cateringForm');if(!form)return;
  var fields=form.querySelector('.fields');if(!fields)return;
  var spanish=function(){return document.documentElement.lang.indexOf('es')===0;};
  function text(en,es){return spanish()?es:en;}
  function node(tag,cls,parent){var el=document.createElement(tag);if(cls)el.className=cls;if(parent)parent.appendChild(el);return el;}
  function field(id){var el=document.getElementById(id);return el&&el.closest('.field');}
  function group(title,sub,ids){var box=node('section','guided-section field full');box.setAttribute('translate','no');var head=node('h4','',box),intro=node('p','guided-help',box),body=node('div','guided-fields',box);box._copy=function(){head.textContent=text(title[0],title[1]);intro.textContent=text(sub[0],sub[1]);};ids.forEach(function(id){var el=field(id);if(el)body.appendChild(el);});return box;}
  var menu=form.querySelector('fieldset.field');
  var eventGroup=group(['1 · Your gathering','1 · Tu celebración'],['Choose a few details. You can always enter a different answer.','Elige algunos detalles. Siempre puedes escribir otra respuesta.'],['event-type','event-date','event-time','guests','location']);
  var foodGroup=group(['2 · Set your table','2 · Prepara tu mesa'],['Choose your dishes, then check the total quantities for your group. Suggestions are optional.','Elige los platos y revisa las cantidades totales para tu grupo. Las sugerencias son opcionales.'],[]);
  foodGroup.querySelector('.guided-fields').appendChild(menu);foodGroup.querySelector('.guided-fields').appendChild(document.getElementById('quote-products'));
  var extras=node('details','guided-extras field full');extras.setAttribute('translate','no');var summary=node('summary','',extras),extraBody=node('div','guided-fields',extras);
  ['event-theme','theme-colors','design-notes','design-files'].forEach(function(id){var el=field(id);if(el)extraBody.appendChild(el);});
  var contactGroup=group(['3 · Where can we reach you?','3 · ¿Cómo te contactamos?'],['Your browser can autofill your contact details. No payment is taken by this request.','Tu navegador puede completar tus datos. Esta solicitud no cobra ningún pago.'],['name','email','phone','company','dietary','details']);
  var first=fields.firstElementChild;fields.insertBefore(eventGroup,first);fields.insertBefore(foodGroup,first);fields.insertBefore(extras,first);fields.insertBefore(contactGroup,first);
  var review=node('div','guided-review field full');review.setAttribute('translate','no');review.setAttribute('aria-live','polite');var reviewTitle=node('h4','',review),reviewText=node('p','',review),reviewDelivery=node('p','guided-help',review);var consent=field('sms-consent');fields.insertBefore(review,consent||fields.lastElementChild);
  var definitions=[
    {id:'event-type',label:['Popular occasions','Celebraciones populares'],values:[['Birthday party','Birthday','Cumpleaños'],['Office or team meal','Office / team','Oficina / equipo'],['Wedding or formal event','Wedding','Boda'],['Baby shower or gender reveal','Baby shower','Baby shower'],['Private celebration','Celebration','Celebración']]},
    {id:'guests',label:['Quick guest counts','Invitados'],values:[25,35,50,75,100].map(function(v){return [String(v),String(v),String(v)];})},
    {id:'event-time',label:['Popular serving times','Horas para servir'],values:[['12:00','Noon','Mediodía'],['15:00','3 PM','3 PM'],['18:00','6 PM','6 PM']]},
    {id:'location',label:['Nearby cities — or enter your city / ZIP','Ciudades cercanas — o escribe ciudad / ZIP'],values:[['West Palm Beach','West Palm Beach','West Palm Beach'],['Wellington','Wellington','Wellington'],['Lake Worth Beach','Lake Worth','Lake Worth'],['Boynton Beach','Boynton Beach','Boynton Beach'],['Boca Raton','Boca Raton','Boca Raton']]}
  ];
  var groups=[];
  definitions.forEach(function(def){var input=document.getElementById(def.id),host=field(def.id);if(!input||!host)return;var wrap=node('div','guided-choices',host);wrap.setAttribute('role','group');var buttons=def.values.map(function(v){var b=node('button','guided-chip',wrap);b.type='button';b.addEventListener('click',function(){input.value=v[0];input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));update();});return {el:b,value:v};});groups.push({def:def,input:input,wrap:wrap,buttons:buttons});});
  var need=field('dietary'),diet=document.getElementById('dietary');var noNeeds=node('button','guided-chip',need);noNeeds.type='button';noNeeds.addEventListener('click',function(){if(diet.value.trim()&&!['No dietary needs reported','Sin necesidades alimentarias reportadas'].includes(diet.value.trim())){diet.focus();return;}diet.value=text('No dietary needs reported','Sin necesidades alimentarias reportadas');diet.dispatchEvent(new Event('input',{bubbles:true}));update();});
  function update(){
    [eventGroup,foodGroup,contactGroup].forEach(function(g){g._copy();});summary.textContent=text('Optional · Theme, labels and design inspiration','Opcional · Tema, etiquetas e inspiración');
    groups.forEach(function(g){g.wrap.setAttribute('aria-label',text(g.def.label[0],g.def.label[1]));g.buttons.forEach(function(b){b.el.textContent=text(b.value[1],b.value[2]);b.el.setAttribute('aria-pressed',String(g.input.value===b.value[0]));});});
    noNeeds.textContent=text('No dietary needs to report','Sin necesidades alimentarias');
    reviewTitle.textContent=text('Your request, at a glance','Tu solicitud, en resumen');var guests=document.getElementById('guests').value,day=document.getElementById('event-date').value,city=document.getElementById('location').value;
    var products=window.AnejoQuoteProducts&&window.AnejoQuoteProducts.read?window.AnejoQuoteProducts.read():[];
    reviewText.textContent=[guests?guests+' '+text('guests','invitados'):text('Add your guest count','Añade invitados'),day||text('Choose a date','Elige fecha'),city||text('Add city / ZIP','Añade ciudad / ZIP'),products.length+' '+text('menu selections','selecciones de menú')].join(' · ');
    reviewDelivery.textContent=text('Delivery only. The delivery fee depends on distance and order size and will be confirmed with your quote. Review each dish quantity above; the guest count does not automatically change your food quantities.','Solo entrega. El cargo depende de la distancia y el tamaño del pedido y se confirma con la cotización. Revisa la cantidad de cada plato; el número de invitados no cambia automáticamente la comida.');
  }
  form.addEventListener('input',update);form.addEventListener('change',update);document.addEventListener('anejo:langchange',update);document.addEventListener('anejo:catering-cartchange',update);update();
})();
