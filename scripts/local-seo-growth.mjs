import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const today = '2026-09-14';
const site = 'https://anejocateringco.com';

const palmBeach = [
  'Atlantis',
  'Belle Glade',
  'Boca Raton',
  'Boynton Beach',
  'Briny Breezes',
  'Cloud Lake',
  'Delray Beach',
  'Glen Ridge',
  'Golf',
  'Greenacres',
  'Gulf Stream',
  'Haverhill',
  'Highland Beach',
  'Hypoluxo',
  'Juno Beach',
  'Jupiter',
  'Jupiter Inlet Colony',
  'Lake Clarke Shores',
  'Lake Park',
  'Lake Worth Beach',
  'Lantana',
  'Loxahatchee Groves',
  'Manalapan',
  'Mangonia Park',
  'North Palm Beach',
  'Ocean Ridge',
  'Pahokee',
  'Palm Beach',
  'Palm Beach Gardens',
  'Palm Beach Shores',
  'Palm Springs',
  'Riviera Beach',
  'Royal Palm Beach',
  'South Bay',
  'South Palm Beach',
  'Tequesta',
  'Wellington',
  'Westlake',
  'West Palm Beach',
].map((name) => ({ name, county: 'Palm Beach County' }));

const broward = [
  'Coconut Creek',
  'Cooper City',
  'Coral Springs',
  'Dania Beach',
  'Davie',
  'Deerfield Beach',
  'Fort Lauderdale',
  'Hallandale Beach',
  'Hillsboro Beach',
  'Hollywood',
  'Lauderdale Lakes',
  'Lauderdale-by-the-Sea',
  'Lauderhill',
  'Lazy Lake',
  'Lighthouse Point',
  'Margate',
  'Miramar',
  'North Lauderdale',
  'Oakland Park',
  'Parkland',
  'Pembroke Park',
  'Pembroke Pines',
  'Plantation',
  'Pompano Beach',
  'Sea Ranch Lakes',
  'Southwest Ranches',
  'Sunrise',
  'Tamarac',
  'West Park',
  'Weston',
  'Wilton Manors',
].map((name) => ({ name, county: 'Broward County' }));

const cities = [...palmBeach, ...broward];

const accentMap = new Map([
  ['ano', 'año'],
  ['AnEJO', 'AÑEJO'],
]);

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function jsonLd(value) {
  return JSON.stringify(value, null, 2).replace(/<\/script/gi, '<\\/script');
}

function htmlShell({
  lang = 'en',
  title,
  description,
  canonical,
  alternateEn,
  alternateEs,
  eyebrow,
  h1,
  intro,
  image = '/assets/img/menu-launch/home-catering.webp',
  imageAlt = 'Añejo Cuban catering trays and event food',
  body,
  schema,
}) {
  const alternates = [
    alternateEn ? `<link rel="alternate" hreflang="en" href="${esc(alternateEn)}">` : '',
    alternateEs ? `<link rel="alternate" hreflang="es" href="${esc(alternateEs)}">` : '',
    alternateEn ? `<link rel="alternate" hreflang="x-default" href="${esc(alternateEn)}">` : '',
  ].filter(Boolean).join('\n');

  const schemaTags = schema.map((entry) => `<script type="application/ld+json">${jsonLd(entry)}</script>`).join('\n');

  return `<!DOCTYPE html>
<html lang="${esc(lang)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5">
<meta name="theme-color" content="#0D0D0D">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${esc(canonical)}">
${alternates}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${site}/assets/img/menu-launch/home-catering.webp">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="/assets/img/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;500;600;700&family=Cormorant+Garamond:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/local-seo.css">
${schemaTags}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<nav aria-label="Main navigation">
  <a class="logo" href="/"><img src="/assets/img/emblem.png" alt=""><span>AÑEJO</span></a>
  <div>
    <a href="/menu/">Menu</a>
    <a href="/catering">Catering</a>
    <a href="/cajita">La Cajita</a>
    <a href="/order" class="nav-cta">Order</a>
  </div>
</nav>
<header class="hero">
  <div class="hero-copy">
    <p class="eyebrow">${esc(eyebrow)}</p>
    <h1>${h1}</h1>
    <p>${intro}</p>
    <div class="actions">
      <a class="btn btn-gold" href="/catering#quote">${lang === 'es' ? 'Pedir cotización' : 'Request catering quote'}</a>
      <a class="btn btn-outline" href="/menu/">${lang === 'es' ? 'Ver menú' : 'View menu'}</a>
    </div>
  </div>
  <img src="${esc(image)}" alt="${esc(imageAlt)}" width="1200" height="900" fetchpriority="high">
</header>
<main id="main">
${body}
</main>
<footer>
  <a href="/">Añejo Catering Co.</a> · <a href="/catering">Catering</a> · <a href="/catering/service-areas">Service areas</a> · <a href="/es/comida-cubana">Español</a>
</footer>
</body>
</html>
`;
}

function serviceSchema({ city, canonical, name, description, lang = 'en' }) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      '@id': `${canonical}#service`,
      name,
      description,
      serviceType: lang === 'es' ? 'Catering cubano y comida cubana para eventos' : 'Cuban catering and event food',
      provider: {
        '@type': 'Restaurant',
        '@id': `${site}/#restaurant`,
        name: 'Añejo Catering Co.',
        url: site,
        telephone: '+1-561-567-1047',
        servesCuisine: ['Cuban', 'Cuban-American', 'Mediterranean', 'Healthy'],
      },
      areaServed: {
        '@type': 'City',
        name: `${city.name}, FL`,
        containedInPlace: { '@type': 'AdministrativeArea', name: `${city.county}, Florida` },
      },
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: lang === 'es' ? 'Servicios de catering Añejo' : 'Añejo catering services',
        itemListElement: [
          { '@type': 'Offer', itemOffered: { '@type': 'Service', name: lang === 'es' ? 'Catering cubano' : 'Cuban catering' } },
          { '@type': 'Offer', itemOffered: { '@type': 'Service', name: lang === 'es' ? 'Cajitas individuales para eventos' : 'Individual event Cajitas' } },
          { '@type': 'Offer', itemOffered: { '@type': 'Service', name: lang === 'es' ? 'Catering Mediterráneo y saludable' : 'Mediterranean and healthy catering' } },
        ],
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${site}/` },
        { '@type': 'ListItem', position: 2, name: 'Catering', item: `${site}/catering` },
        { '@type': 'ListItem', position: 3, name: city.name, item: canonical },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: lang === 'es' ? `¿Añejo ofrece catering cubano en ${city.name}?` : `Does Añejo offer Cuban catering in ${city.name}?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: lang === 'es'
              ? `Sí. Añejo revisa solicitudes de catering cubano, Cajitas, bandejas y menú saludable para eventos en ${city.name}, Florida. La disponibilidad depende de la fecha, la cantidad de invitados y la ruta de entrega.`
              : `Yes. Añejo reviews Cuban catering, Cajita, tray, and healthy menu requests for events in ${city.name}, Florida. Availability depends on the date, guest count, and delivery route.`,
          },
        },
        {
          '@type': 'Question',
          name: lang === 'es' ? '¿La solicitud cobra el pedido?' : 'Does the catering request charge my order?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: lang === 'es'
              ? 'No. La solicitud de catering pide una cotización. El equipo confirma disponibilidad, menú, precio y el próximo paso antes de cualquier pago.'
              : 'No. The catering request is a quote request. The team confirms availability, menu, price, and next steps before any payment.',
          },
        },
      ],
    },
  ];
}

function cityPage(city, lang = 'en') {
  const slug = slugify(city.name);
  const englishUrl = `${site}/catering/${slug}`;
  const spanishUrl = `${site}/es/catering/${slug}`;
  const isEs = lang === 'es';
  const canonical = isEs ? spanishUrl : englishUrl;
  const title = isEs
    ? `Catering Cubano en ${city.name}, FL | Añejo`
    : `Cuban Catering in ${city.name}, FL | Añejo Catering Co.`;
  const description = isEs
    ? `Catering cubano, Cajitas, comida saludable y bandejas para eventos en ${city.name}, ${city.county}. Solicita cotización con Añejo.`
    : `Cuban catering, Cajitas, healthy bowls, and party trays for events in ${city.name}, ${city.county}. Request a custom Añejo quote.`;
  const h1 = isEs
    ? `Catering cubano en <em>${esc(city.name)}</em>`
    : `Cuban catering in <em>${esc(city.name)}</em>`;
  const intro = isEs
    ? `Añejo atiende solicitudes de comida cubana, Cajitas personalizadas, bandejas para fiestas y opciones saludables para eventos en ${esc(city.name)} y ${esc(city.county)}.`
    : `Añejo reviews Cuban food, personalized Cajitas, party tray, and healthy catering requests for events in ${esc(city.name)} and ${esc(city.county)}.`;
  const body = isEs ? `
<section>
  <p class="kicker">Comida cubana para eventos · ${esc(city.county)}</p>
  <h2>Qué puedes pedir para ${esc(city.name)}</h2>
  <div class="cards">
    <article><h3>Bandejas cubanas</h3><p>Lechón, congrí, tamales, croquetas, empanadas, bocaditos y otros clásicos para compartir. El menú final se confirma por fecha, cantidad e inventario.</p></article>
    <article><h3>La Cajita</h3><p>Cajitas individuales con presentación personalizada para cumpleaños, reuniones familiares, activaciones, oficinas y eventos privados.</p></article>
    <article><h3>Añejo Fit</h3><p>Bowls y opciones más ligeras con influencia Mediterránea para grupos que quieren proteína, vegetales, salsas y porciones más claras.</p></article>
  </div>
</section>
<section>
  <h2>Disponible bajo cotización</h2>
  <p>Esta página confirma el área de servicio, no una cocina abierta al público en ${esc(city.name)}. Para evitar pedidos incompletos o precios incorrectos, Añejo confirma disponibilidad, menú, entrega y precio antes del pago.</p>
  <ul class="checklist">
    <li>Catering cubano en ${esc(city.name)}, FL</li>
    <li>Comida cubana para fiestas y oficinas</li>
    <li>Cajitas personalizadas para eventos</li>
    <li>Opciones saludables y Mediterráneas para grupos</li>
  </ul>
  <a class="btn btn-green" href="/catering?city=${encodeURIComponent(city.name)}#quote">Enviar solicitud</a>
</section>
<section>
  <h2>También servimos ciudades cercanas</h2>
  ${nearbyLinks(city, true)}
</section>` : `
<section>
  <p class="kicker">Cuban food for events · ${esc(city.county)}</p>
  <h2>What Añejo can quote for ${esc(city.name)}</h2>
  <div class="cards">
    <article><h3>Cuban catering trays</h3><p>Lechón, congrí, tamales, croquetas, empanadas, bocaditos, and other shareable Cuban party items. The final menu depends on date, count, and inventory.</p></article>
    <article><h3>La Cajita</h3><p>Individual personalized Cajitas for birthdays, family gatherings, activations, offices, showers, and private events.</p></article>
    <article><h3>Añejo Fit</h3><p>Cleaner Mediterranean-influenced bowls and group meals for clients who want protein, vegetables, sauces, and clearer portions.</p></article>
  </div>
</section>
<section>
  <h2>Quote-first service area</h2>
  <p>This page confirms the service area, not a walk-in storefront in ${esc(city.name)}. To avoid incomplete orders or wrong prices, Añejo confirms availability, menu, delivery, and pricing before payment.</p>
  <ul class="checklist">
    <li>Cuban catering in ${esc(city.name)}, FL</li>
    <li>Cuban food for parties, offices, and private events</li>
    <li>Personalized Cajitas for event guests</li>
    <li>Healthy and Mediterranean catering options for groups</li>
  </ul>
  <a class="btn btn-green" href="/catering?city=${encodeURIComponent(city.name)}#quote">Send catering request</a>
</section>
<section>
  <h2>Nearby service areas</h2>
  ${nearbyLinks(city, false)}
</section>`;

  return htmlShell({
    lang,
    title,
    description,
    canonical,
    alternateEn: englishUrl,
    alternateEs: spanishUrl,
    eyebrow: isEs ? `${city.county} · Cotización para eventos` : `${city.county} · Event quote service`,
    h1,
    intro,
    body,
    schema: serviceSchema({
      city,
      canonical,
      lang,
      name: isEs ? `Catering cubano en ${city.name}, Florida` : `Cuban catering in ${city.name}, Florida`,
      description,
    }),
  });
}

function nearbyLinks(city, spanish) {
  const sameCounty = cities.filter((entry) => entry.county === city.county && entry.name !== city.name).slice(0, 8);
  const links = sameCounty.map((entry) => {
    const prefix = spanish ? '/es/catering/' : '/catering/';
    return `<a href="${prefix}${slugify(entry.name)}">${esc(entry.name)}</a>`;
  }).join('');
  return `<div class="link-grid">${links}<a href="${spanish ? '/es/catering/areas-de-servicio' : '/catering/service-areas'}">${spanish ? 'Todas las áreas' : 'All service areas'}</a></div>`;
}

function cityGrid(list, spanish = false) {
  return `<div class="city-grid">${list.map((city) => {
    const prefix = spanish ? '/es/catering/' : '/catering/';
    return `<a href="${prefix}${slugify(city.name)}">${esc(city.name)}</a>`;
  }).join('')}</div>`;
}

function areasPage(spanish = false) {
  const canonical = spanish ? `${site}/es/catering/areas-de-servicio` : `${site}/catering/service-areas`;
  const englishUrl = `${site}/catering/service-areas`;
  const spanishUrl = `${site}/es/catering/areas-de-servicio`;
  const title = spanish
    ? 'Áreas de servicio para catering cubano | Añejo'
    : 'Catering Service Areas in Palm Beach & Broward | Añejo';
  const description = spanish
    ? 'Añejo acepta solicitudes de catering cubano, Cajitas y comida saludable para eventos en Palm Beach County y Broward County.'
    : 'Añejo accepts Cuban catering, Cajita, and healthy catering requests across Palm Beach County and Broward County.';
  const body = spanish ? `
<section>
  <p class="kicker">Palm Beach County</p>
  <h2>Catering cubano en Palm Beach County</h2>
  ${cityGrid(palmBeach, true)}
</section>
<section>
  <p class="kicker">Broward County</p>
  <h2>Catering cubano en Broward County</h2>
  ${cityGrid(broward, true)}
</section>
<section><h2>Cómo se confirma un evento</h2><p>Envía la solicitud con fecha, ciudad, cantidad de invitados, estilo de comida y notas del evento. Añejo confirma disponibilidad, precio y pago después de revisar la solicitud.</p></section>` : `
<section>
  <p class="kicker">Palm Beach County</p>
  <h2>Cuban catering in Palm Beach County</h2>
  ${cityGrid(palmBeach)}
</section>
<section>
  <p class="kicker">Broward County</p>
  <h2>Cuban catering in Broward County</h2>
  ${cityGrid(broward)}
</section>
<section><h2>How event requests are confirmed</h2><p>Send the request with date, city, guest count, food direction, and event notes. Añejo confirms availability, pricing, and payment after reviewing the request.</p></section>`;
  return htmlShell({
    lang: spanish ? 'es' : 'en',
    title,
    description,
    canonical,
    alternateEn: englishUrl,
    alternateEs: spanishUrl,
    eyebrow: spanish ? 'Palm Beach + Broward' : 'Palm Beach + Broward',
    h1: spanish ? 'Áreas de servicio de <em>Añejo</em>' : 'Añejo catering <em>service areas</em>',
    intro: spanish
      ? 'Comida cubana, Cajitas personalizadas, bandejas y opciones saludables para eventos privados, oficinas, celebraciones y activaciones.'
      : 'Cuban food, personalized Cajitas, trays, and healthier group meals for private events, offices, celebrations, and activations.',
    body,
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        description,
        url: canonical,
        about: { '@id': `${site}/#restaurant` },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: cities.map((city, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: city.name,
          url: `${spanish ? `${site}/es/catering/` : `${site}/catering/`}${slugify(city.name)}`,
        })),
      },
    ],
  });
}

function topicPage({ spanish = false, topic }) {
  const isCuban = topic === 'cuban';
  const canonical = spanish
    ? `${site}/es/${isCuban ? 'comida-cubana' : 'catering-mediterraneo'}`
    : `${site}/${isCuban ? 'cuban-food' : 'mediterranean-catering'}`;
  const englishUrl = `${site}/${isCuban ? 'cuban-food' : 'mediterranean-catering'}`;
  const spanishUrl = `${site}/es/${isCuban ? 'comida-cubana' : 'catering-mediterraneo'}`;
  const title = spanish
    ? (isCuban ? 'Comida Cubana y Catering en Palm Beach y Broward | Añejo' : 'Catering Mediterráneo y Saludable | Añejo')
    : (isCuban ? 'Cuban Food and Catering in Palm Beach & Broward | Añejo' : 'Mediterranean Catering and Healthy Bowls | Añejo');
  const description = spanish
    ? (isCuban ? 'Comida cubana, catering cubano, bandejas, Cajitas y comida para eventos en Palm Beach County y Broward County.' : 'Catering saludable con inspiración Mediterránea, bowls, proteína y vegetales para grupos y eventos en Palm Beach y Broward.')
    : (isCuban ? 'Cuban food, Cuban catering, party trays, Cajitas, and event food across Palm Beach County and Broward County.' : 'Healthy Mediterranean-influenced catering, bowls, proteins, vegetables, and sauces for groups across Palm Beach and Broward.');
  const body = spanish ? `
<section>
  <h2>${isCuban ? 'Comida cubana para eventos' : 'Catering saludable para grupos'}</h2>
  <p>${isCuban ? 'Añejo combina sabores cubanos conocidos con presentación limpia para eventos, oficinas y celebraciones. Las solicitudes pueden incluir lechón, congrí, tamales, croquetas, empanadas, bocaditos, Cajitas y otros formatos bajo cotización.' : 'Añejo Fit se enfoca en proteínas, vegetales, salsas y opciones más ligeras para equipos, oficinas y eventos donde los invitados quieren comida clara, fresca y organizada.'}</p>
  <div class="cards">
    <article><h3>Palm Beach County</h3>${cityGrid(palmBeach.slice(0, 12), true)}</article>
    <article><h3>Broward County</h3>${cityGrid(broward.slice(0, 12), true)}</article>
  </div>
</section>
<section><h2>Solicita cotización</h2><p>El formulario de catering no cobra el pedido. Sirve para confirmar fecha, ciudad, invitados, menú, empaque, entrega y precio antes del pago.</p><a class="btn btn-green" href="/catering#quote">Enviar solicitud</a></section>` : `
<section>
  <h2>${isCuban ? 'Cuban food for events' : 'Healthier catering for groups'}</h2>
  <p>${isCuban ? 'Añejo combines familiar Cuban flavors with a cleaner event presentation for offices, private gatherings, birthdays, celebrations, and activations. Requests can include lechón, congrí, tamales, croquetas, empanadas, bocaditos, Cajitas, and quote-only event formats.' : 'Añejo Fit focuses on protein, vegetables, sauces, and cleaner portions for offices, teams, and events where guests want fresh food that is easy to serve and understand.'}</p>
  <div class="cards">
    <article><h3>Palm Beach County</h3>${cityGrid(palmBeach.slice(0, 12))}</article>
    <article><h3>Broward County</h3>${cityGrid(broward.slice(0, 12))}</article>
  </div>
</section>
<section><h2>Request a quote</h2><p>The catering form does not charge the order. It is used to confirm date, city, guest count, menu, packaging, delivery, and pricing before payment.</p><a class="btn btn-green" href="/catering#quote">Send catering request</a></section>`;
  return htmlShell({
    lang: spanish ? 'es' : 'en',
    title,
    description,
    canonical,
    alternateEn: englishUrl,
    alternateEs: spanishUrl,
    eyebrow: isCuban ? 'Cuban catering · Palm Beach + Broward' : 'Mediterranean catering · Palm Beach + Broward',
    h1: spanish
      ? (isCuban ? 'Comida cubana y <em>catering cubano</em>' : 'Catering Mediterráneo y <em>saludable</em>')
      : (isCuban ? 'Cuban food and <em>Cuban catering</em>' : 'Mediterranean catering and <em>healthy bowls</em>'),
    intro: spanish
      ? (isCuban ? 'Para búsquedas como comida cubana, catering cubano, comida cubana cerca de mí y eventos privados en el sur de Florida.' : 'Opciones frescas con influencia Mediterránea para eventos, oficinas, equipos y comidas de grupo.')
      : (isCuban ? 'Built for searches like Cuban food, Cuban catering, Cuban food near me, and private events across South Florida.' : 'Fresh Mediterranean-influenced options for offices, teams, private events, and group meals.'),
    body,
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: title,
        description,
        url: canonical,
        about: { '@id': `${site}/#restaurant` },
      },
    ],
  });
}

function localCss() {
  return `:root{--black:#0D0D0D;--green:#1A3D2E;--green-dark:#0d2419;--gold:#C6A85B;--cream:#F5F2EC;--ink:#1A1A1A;--muted:#5f625d;--line:rgba(26,61,46,.18)}*{box-sizing:border-box}body{margin:0;font-family:'Josefin Sans',-apple-system,BlinkMacSystemFont,sans-serif;background:var(--cream);color:var(--ink);line-height:1.65}a{color:inherit}.skip-link{position:absolute;left:-9999px;top:0;background:var(--gold);color:var(--black);padding:10px 14px;font-weight:700;z-index:10}.skip-link:focus{left:0}nav{position:sticky;top:0;z-index:5;background:rgba(13,13,13,.96);display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px clamp(18px,4vw,46px);border-bottom:1px solid rgba(198,168,91,.22)}nav div{display:flex;align-items:center;gap:18px;flex-wrap:wrap}nav a{color:var(--cream);text-decoration:none;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700}.logo{display:flex;align-items:center;gap:10px;color:var(--gold);font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;letter-spacing:5px}.logo img{width:34px;height:34px}.nav-cta{background:var(--gold);color:var(--black);padding:9px 13px;border-radius:4px}.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.85fr);background:var(--black);color:var(--cream);min-height:480px}.hero-copy{padding:clamp(42px,7vw,86px);display:flex;flex-direction:column;justify-content:center}.hero img{width:100%;height:100%;object-fit:cover}.eyebrow,.kicker{font-size:12px;letter-spacing:3px;text-transform:uppercase;color:var(--gold);font-weight:700}.hero h1{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(42px,7vw,76px);line-height:1;margin:12px 0 18px;font-weight:600}.hero em{color:var(--gold);font-style:normal}.hero p{font-size:clamp(17px,2vw,21px);max-width:660px;color:rgba(245,242,236,.86)}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:13px 22px;border-radius:4px;text-transform:uppercase;font-weight:800;letter-spacing:1.4px;font-size:12px;text-decoration:none}.btn-gold{background:var(--gold);color:var(--black)}.btn-outline{border:1px solid var(--cream);color:var(--cream)}.btn-green{background:var(--green);color:var(--cream);margin-top:14px}main{max-width:1160px;margin:0 auto;padding:42px 22px 72px}section{margin:0 0 44px}h2{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(30px,4vw,48px);line-height:1.08;color:var(--green);margin:8px 0 14px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:22px 0}.cards article{background:#fff;border:1px solid var(--line);border-top:4px solid var(--gold);padding:22px}.cards h3{font-family:'Cormorant Garamond',Georgia,serif;color:var(--green);font-size:28px;margin:0 0 8px}.checklist{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:0;margin:22px 0;list-style:none}.checklist li{background:#fff;border:1px solid var(--line);padding:13px 15px}.link-grid,.city-grid{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.link-grid a,.city-grid a{background:#fff;border:1px solid var(--line);border-radius:4px;color:var(--green);font-weight:700;padding:10px 13px;text-decoration:none}.link-grid a:hover,.city-grid a:hover{border-color:var(--gold)}footer{background:var(--black);color:rgba(245,242,236,.7);padding:30px 22px;text-align:center}footer a{color:var(--gold);text-decoration:none}@media(max-width:860px){nav{align-items:flex-start;flex-direction:column}.hero{grid-template-columns:1fr}.hero img{min-height:280px}.cards,.checklist{grid-template-columns:1fr}}`;
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

function publicUrlFromFile(file) {
  const rel = path.relative(publicDir, file).replaceAll(path.sep, '/');
  if (rel === 'index.html') return `${site}/`;
  if (rel.endsWith('/index.html')) return `${site}/${rel.replace(/\/index\.html$/, '/')}`;
  return `${site}/${rel.replace(/\.html$/, '')}`;
}

async function updateExistingPages() {
  const indexPath = path.join(publicDir, 'index.html');
  let index = await fs.readFile(indexPath, 'utf8');
  index = index
    .replace(
      '<title>Cuban Food, Fit Bowls & Catering in Palm Beach | Añejo</title>',
      '<title>Cuban Catering, Cuban Food & Fit Bowls in Palm Beach and Broward | Añejo</title>',
    )
    .replace(
      '<meta name="description" content="Explore Añejo in Palm Beach County: traditional Cuban meals, customizable Fit bowls, Cajitas and catering trays. Order online or plan your event.">',
      '<meta name="description" content="Añejo serves Cuban catering, Cuban food, Cajitas, Mediterranean-inspired Fit bowls, and party trays across Palm Beach County and Broward County.">',
    )
    .replace(
      '<meta property="og:description" content="Traditional Cuban meals, Fit bowls, Cajitas and catering. One Añejo family for your everyday and every gathering.">',
      '<meta property="og:description" content="Cuban catering, Cuban food, Fit bowls, Cajitas and party trays across Palm Beach County and Broward County.">',
    )
    .replace(
      '<meta name="twitter:description" content="Traditional Cuban meals, Fit bowls, Cajitas and catering. One Añejo family for your everyday and every gathering.">',
      '<meta name="twitter:description" content="Cuban catering, Cuban food, Fit bowls, Cajitas and party trays across Palm Beach County and Broward County.">',
    )
    .replace(
      '"description": "Premium Cuban-American longevity bowls, catering, and wholesale bites in Palm Beach County. Mediterranean nutrition with Cuban soul.",',
      '"description": "Cuban catering, Cuban-American meals, Mediterranean-inspired Fit bowls, Cajitas, party trays, and event food across Palm Beach County and Broward County.",',
    )
    .replace(
      '"areaServed": [{ "@type": "AdministrativeArea", "name": "Palm Beach County, Florida" }, { "@type": "City", "name": "West Palm Beach, FL" }, { "@type": "City", "name": "Boca Raton, FL" }, { "@type": "City", "name": "Delray Beach, FL" }, { "@type": "City", "name": "Boynton Beach, FL" }, { "@type": "City", "name": "Wellington, FL" }, { "@type": "City", "name": "Jupiter, FL" }, { "@type": "City", "name": "Palm Beach Gardens, FL" }, { "@type": "City", "name": "Lake Worth, FL" }],',
      `"areaServed": ${JSON.stringify([
        { '@type': 'AdministrativeArea', name: 'Palm Beach County, Florida' },
        { '@type': 'AdministrativeArea', name: 'Broward County, Florida' },
        ...['West Palm Beach, FL', 'Boca Raton, FL', 'Delray Beach, FL', 'Boynton Beach, FL', 'Wellington, FL', 'Jupiter, FL', 'Palm Beach Gardens, FL', 'Lake Worth Beach, FL', 'Fort Lauderdale, FL', 'Hollywood, FL', 'Pembroke Pines, FL', 'Miramar, FL', 'Coral Springs, FL', 'Pompano Beach, FL', 'Davie, FL', 'Plantation, FL', 'Sunrise, FL', 'Weston, FL'].map((name) => ({ '@type': 'City', name })),
      ])},`,
    )
    .replace(
      '"text": "We deliver across Palm Beach County, Monday through Saturday, in two windows — lunch (11:00 AM–2:00 PM) and dinner (5:00 PM–8:00 PM). Choose your window at checkout."',
      '"text": "Añejo handles orders and catering requests across Palm Beach County and Broward County, depending on date, route, guest count, and product availability. Choose your available delivery window at checkout or submit a catering quote request for events."',
    )
    .replace(
      '"text": "Yes. Añejo offers custom catering across Palm Beach County, including Añejo Fit menu selections, Cuban food, and individually packed Cajitas. Submit the catering quote request with your date, location, and guest count for availability and custom pricing."',
      '"text": "Yes. Añejo offers custom catering across Palm Beach County and Broward County, including Cuban food, lechón, congrí, tamales, croquetas, empanadas, Añejo Fit menu selections, Mediterranean-inspired bowls, and individually packed Cajitas. Submit the quote request with your date, location, and guest count for availability and custom pricing."',
    );

  if (!index.includes('/cuban-food')) {
    index = index.replace(
      '<link rel="canonical" href="https://anejocateringco.com/">',
      `<link rel="canonical" href="https://anejocateringco.com/">
<link rel="alternate" hreflang="en" href="https://anejocateringco.com/">
<link rel="alternate" hreflang="es" href="https://anejocateringco.com/es/">
<link rel="alternate" hreflang="x-default" href="https://anejocateringco.com/">`,
    );
    index = index.replace(
      '</head>',
      `<script type="application/ld+json">${jsonLd({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Añejo local catering search pages',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Cuban food and catering', url: `${site}/cuban-food` },
          { '@type': 'ListItem', position: 2, name: 'Mediterranean catering', url: `${site}/mediterranean-catering` },
          { '@type': 'ListItem', position: 3, name: 'Catering service areas', url: `${site}/catering/service-areas` },
          { '@type': 'ListItem', position: 4, name: 'Comida cubana', url: `${site}/es/comida-cubana` },
        ],
      })}</script>
</head>`,
    );
  }
  await fs.writeFile(indexPath, index);

  const cateringPath = path.join(publicDir, 'catering.html');
  let catering = await fs.readFile(cateringPath, 'utf8');
  catering = catering
    .replace('<title>Catering in Palm Beach County — Añejo Catering Co.</title>', '<title>Cuban Catering in Palm Beach and Broward | Añejo Catering Co.</title>')
    .replace(
      '<meta name="description" content="Request Añejo catering for your next gathering. Choose Añejo Fit, Cuban food, or individually packed Cajitas for groups across Palm Beach County.">',
      '<meta name="description" content="Request Cuban catering, catering cubano, Cajitas, party trays, and Mediterranean-inspired Fit catering across Palm Beach County and Broward County.">',
    )
    .replace('<meta property="og:title" content="Catering — Añejo Catering Co.">', '<meta property="og:title" content="Cuban Catering in Palm Beach and Broward — Añejo">')
    .replace(
      '<meta property="og:description" content="Añejo Fit, Cuban food, and Cajitas for gatherings across Palm Beach County. Tell us what you need and request a custom quote.">',
      '<meta property="og:description" content="Cuban catering, catering cubano, Cajitas, party trays, and Añejo Fit catering across Palm Beach County and Broward County.">',
    )
    .replace('<div class="eyebrow">Palm Beach County · Custom Catering</div>', '<div class="eyebrow">Palm Beach + Broward · Custom Catering</div>')
    .replace('From macro-friendly Añejo Fit selections to Cuban food and individually packed Cajitas, tell us what your gathering needs and we’ll build it with you.', 'From Cuban food and catering cubano to macro-friendly Añejo Fit selections and individually packed Cajitas, tell us what your gathering needs and we’ll build it with you across Palm Beach County and Broward County.')
    .replace('Añejo Fit, Cuban food, and individually packed Cajitas', 'Cuban food, Cajitas, Añejo Fit, and Mediterranean-inspired group meals')
    .replace('Every request is reviewed personally before we confirm availability and pricing.', 'Every request is reviewed before we confirm availability, delivery route, menu, and pricing.');

  const serviceAreaSection = `<section class="intro" aria-labelledby="local-search-heading">
    <div class="section-inner">
      <div class="section-head">
        <div class="eyebrow">Local catering searches</div>
        <h2 id="local-search-heading">Cuban catering across Palm Beach and Broward.</h2>
        <p>Añejo is now mapped on-site for searches like Cuban catering near me, comida cubana en West Palm, catering Cubano en West Palm Beach, Cuban food for events, Mediterranean catering, and party trays.</p>
      </div>
      <div class="options">
        <article class="option"><span class="option-num">PALM BEACH</span><h3>County service areas</h3><p>West Palm Beach, Boca Raton, Delray Beach, Boynton Beach, Wellington, Palm Beach Gardens, Jupiter, Lake Worth Beach, and every incorporated Palm Beach County municipality.</p><a href="/catering/service-areas">See Palm Beach cities →</a></article>
        <article class="option"><span class="option-num">BROWARD</span><h3>Broward expansion</h3><p>Fort Lauderdale, Hollywood, Pembroke Pines, Miramar, Coral Springs, Pompano Beach, Davie, Plantation, Sunrise, Weston, and every Broward municipality.</p><a href="/catering/service-areas">See Broward cities →</a></article>
        <article class="option"><span class="option-num">ESPAÑOL</span><h3>Comida cubana</h3><p>Spanish-language pages now support catering cubano, comida cubana, bandejas, Cajitas, and eventos privados across both counties.</p><a href="/es/comida-cubana">Ver en español →</a></article>
      </div>
    </div>
  </section>`;
  if (!catering.includes('id="local-search-heading"')) {
    catering = catering.replace('<section class="tray-showcase" aria-labelledby="tray-heading">', `${serviceAreaSection}\n\n  <section class="tray-showcase" aria-labelledby="tray-heading">`);
  }
  if (!catering.includes('"@type":"Service"') && !catering.includes('"@type": "Service"')) {
    catering = catering.replace(
      '</head>',
      `<script type="application/ld+json">${jsonLd({
        '@context': 'https://schema.org',
        '@type': 'Service',
        '@id': `${site}/catering#service`,
        name: 'Cuban catering, Cajitas, and Fit catering in Palm Beach and Broward',
        serviceType: 'Cuban catering',
        provider: { '@id': `${site}/#restaurant` },
        areaServed: [
          { '@type': 'AdministrativeArea', name: 'Palm Beach County, Florida' },
          { '@type': 'AdministrativeArea', name: 'Broward County, Florida' },
        ],
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'Añejo catering services',
          itemListElement: [
            { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Cuban catering trays' } },
            { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Personalized Cajitas' } },
            { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Añejo Fit group meals' } },
            { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Mediterranean-inspired catering' } },
          ],
        },
      })}</script>
</head>`,
    );
  }
  await fs.writeFile(cateringPath, catering);

  const mealPath = path.join(publicDir, 'meal-prep/index.html');
  let meal = await fs.readFile(mealPath, 'utf8');
  meal = meal
    .replace('<title>Meal Prep Delivery Areas — Palm Beach County | Añejo</title>', '<title>Meal Prep, Cuban Food & Catering Areas | Añejo Palm Beach + Broward</title>')
    .replace(
      '<meta name="description" content="Añejo Cuban-American meal-prep delivery across Palm Beach County: West Palm Beach, Lake Worth, Boynton Beach, Wellington, Boca Raton, Delray Beach.">',
      '<meta name="description" content="Añejo meal prep, Cuban food, Fit bowls, and catering service areas across Palm Beach County and Broward County.">',
    )
    .replace('Fresh Cuban-American meal prep, delivered across Palm Beach County.', 'Fresh Cuban-American meal prep, Fit bowls, and catering requests across Palm Beach County and Broward County.');
  if (!meal.includes('/catering/service-areas')) {
    meal = meal.replace(
      '<div class="cta"><a class="btn btn-gold" href="/order">Order à la carte →</a><a class="btn btn-green" href="/subscribe">Subscribe weekly →</a></div>',
      `<h2>Catering and Cuban food service areas</h2><p>Añejo also accepts quote requests for Cuban catering, Cajitas, party trays, and Mediterranean-inspired group meals across Palm Beach County and Broward County.</p><div class="grid"><a class="chip" href="/cuban-food">Cuban food</a><a class="chip" href="/mediterranean-catering">Mediterranean catering</a><a class="chip" href="/catering/service-areas">All catering cities</a><a class="chip" href="/es/comida-cubana">Comida cubana</a></div><div class="cta"><a class="btn btn-gold" href="/order">Order à la carte →</a><a class="btn btn-green" href="/subscribe">Subscribe weekly →</a></div>`,
    );
  }
  await fs.writeFile(mealPath, meal);
}

async function writeRobots() {
  const robots = `# Añejo Catering Co. — robots.txt
User-agent: *
Allow: /

# Application / private surfaces (no SEO value, keep out of the index)
Disallow: /api/
Disallow: /hub/
Disallow: /client/
Disallow: /trainer/
Disallow: /prototype/
Disallow: /intake.html
Disallow: /plan.html
Disallow: /go.html
Disallow: /login.html
Disallow: /portal.html

Sitemap: ${site}/sitemap.xml
`;
  await fs.writeFile(path.join(publicDir, 'robots.txt'), robots);
}

async function writeSitemap() {
  const files = (await walk(publicDir)).filter((file) => file.endsWith('.html'));
  const disallowedPrefixes = [
    'hub/',
    'client/',
    'trainer/',
    'prototype/',
    'studio/',
  ];
  const disallowedFiles = new Set([
    'intake.html',
    'plan.html',
    'go.html',
    'login.html',
    'portal.html',
    '404.html',
  ]);
  const urls = [];
  for (const file of files) {
    const rel = path.relative(publicDir, file).replaceAll(path.sep, '/');
    if (disallowedFiles.has(rel)) continue;
    if (disallowedPrefixes.some((prefix) => rel.startsWith(prefix))) continue;
    const html = await fs.readFile(file, 'utf8');
    if (/name=["']robots["'][^>]+noindex/i.test(html)) continue;
    const canonical = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1] ?? publicUrlFromFile(file);
    urls.push(canonical);
  }
  const unique = [...new Set(urls)].sort((a, b) => {
    const weight = (url) => {
      if (url === `${site}/`) return 0;
      if (url === `${site}/catering`) return 1;
      if (url.includes('/catering/')) return 2;
      if (url.includes('/es/')) return 4;
      return 3;
    };
    return weight(a) - weight(b) || a.localeCompare(b);
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${unique.map((url) => `  <url>
    <loc>${url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${url.includes('/catering/') || url.includes('/meal-prep/') ? 'monthly' : 'weekly'}</changefreq>
    <priority>${url === `${site}/` ? '1.0' : url === `${site}/catering` ? '0.95' : url.includes('/catering/') ? '0.86' : '0.75'}</priority>
  </url>`).join('\n')}
</urlset>
`;
  await fs.writeFile(path.join(publicDir, 'sitemap.xml'), xml);
  return unique.length;
}

async function writeBusinessProfilePackage() {
  const lines = `# Añejo Google Business Profile Update Package

Date: ${today}

## Direct update status

No Google Business Profile / Google Maps management connector is available in this Codex session. This package is the exact update set to apply in Business Profile Manager or Search/Maps while logged into the owner account.

## Primary business identity

- Name: Añejo Catering Co.
- Website: https://anejocateringco.com/
- Primary category to confirm in GBP: Caterer
- Secondary categories to add where available: Cuban restaurant, Meal delivery, Health food restaurant, Mediterranean restaurant, Event catering service
- Service area emphasis: Palm Beach County and Broward County, Florida
- Phone: 561-567-1047
- Public description draft:

Añejo Catering Co. provides Cuban catering, Cuban food, personalized Cajitas, party trays, and Mediterranean-inspired Añejo Fit bowls for events, offices, private gatherings, and celebrations across Palm Beach County and Broward County. Request custom catering for lechón, congrí, tamales, croquetas, empanadas, Cajitas, healthy bowls, and group meals. Quotes are confirmed by event date, guest count, menu, delivery route, and availability.

## Services to add

- Cuban catering
- Catering Cubano
- Comida cubana para eventos
- Cuban food catering
- Party trays
- Lechón catering
- Congrí tray catering
- Cuban tamales catering
- Croquetas and empanadas catering
- Personalized Cajitas
- Birthday catering
- Office catering
- Private event catering
- Mediterranean catering
- Healthy catering
- Añejo Fit bowls
- Meal prep delivery
- Corporate lunch catering

## Service areas to add

Palm Beach County:
${palmBeach.map((city) => `- ${city.name}, FL`).join('\n')}

Broward County:
${broward.map((city) => `- ${city.name}, FL`).join('\n')}

## Website links to use in GBP

- Main website: https://anejocateringco.com/
- Catering quote page: https://anejocateringco.com/catering
- Service areas: https://anejocateringco.com/catering/service-areas
- Cuban food page: https://anejocateringco.com/cuban-food
- Spanish Cuban food page: https://anejocateringco.com/es/comida-cubana
- Menu: https://anejocateringco.com/menu/
- La Cajita: https://anejocateringco.com/cajita

## Photo upload set

Use only real food/event photos. Do not upload synthetic images or heavily filtered images to GBP.

- public/assets/img/menu-launch/home-catering.webp
- public/assets/img/menu-launch/combo-table.webp
- public/assets/img/menu-launch/tray-croquetas.webp
- public/assets/img/menu-launch/tray-empanadas.webp
- public/assets/img/menu-launch/food-lechon.webp
- public/assets/img/menu-launch/food-congri.webp
- public/assets/img/menu-launch/food-tamal.webp
- public/assets/img/cajita/pink-first-birthday-catering-spread.jpg
- public/assets/img/cajita/pink-first-birthday-cajitas-table.jpg
- public/assets/img/cajita/pink-first-birthday-cajita-detail.jpg

## Suggested GBP posts

### English

Cuban catering is now available by quote across Palm Beach County and Broward County. Request lechón, congrí, tamales, croquetas, empanadas, personalized Cajitas, Añejo Fit bowls, and Mediterranean-inspired group meals for offices, birthdays, private events, and celebrations.

Link: https://anejocateringco.com/catering

### Spanish

Añejo acepta solicitudes de catering cubano, comida cubana, Cajitas personalizadas, bandejas y opciones saludables para eventos en Palm Beach County y Broward County. Solicita cotización con fecha, ciudad, invitados y menú deseado.

Link: https://anejocateringco.com/es/comida-cubana

## GBP QA checklist after applying

- Search brand name on Google Maps and confirm website button points to https://anejocateringco.com/
- Confirm categories are accurate and not keyword-stuffed into the business name.
- Confirm service list includes both English and Spanish user phrasing.
- Confirm service areas include Palm Beach and Broward municipalities.
- Upload at least 10 real photos and confirm they display publicly.
- Add the catering URL as the appointment/order/action link if GBP supports it.
- Reply to existing reviews and request new real customer reviews after completed orders.
`;
  await fs.mkdir(path.join(root, 'docs', 'marketing'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs', 'marketing', 'anejo-google-business-profile-update-package-2026-09-14.md'), lines);
}

async function main() {
  await fs.mkdir(path.join(publicDir, 'assets/css'), { recursive: true });
  await fs.mkdir(path.join(publicDir, 'catering'), { recursive: true });
  await fs.mkdir(path.join(publicDir, 'es/catering'), { recursive: true });
  await fs.writeFile(path.join(publicDir, 'assets/css/local-seo.css'), localCss());
  for (const city of cities) {
    const slug = slugify(city.name);
    await fs.writeFile(path.join(publicDir, 'catering', `${slug}.html`), cityPage(city, 'en'));
    await fs.writeFile(path.join(publicDir, 'es/catering', `${slug}.html`), cityPage(city, 'es'));
  }
  await fs.writeFile(path.join(publicDir, 'catering/service-areas.html'), areasPage(false));
  await fs.writeFile(path.join(publicDir, 'es/catering/areas-de-servicio.html'), areasPage(true));
  await fs.writeFile(path.join(publicDir, 'cuban-food.html'), topicPage({ topic: 'cuban' }));
  await fs.writeFile(path.join(publicDir, 'es/comida-cubana.html'), topicPage({ spanish: true, topic: 'cuban' }));
  await fs.writeFile(path.join(publicDir, 'mediterranean-catering.html'), topicPage({ topic: 'mediterranean' }));
  await fs.writeFile(path.join(publicDir, 'es/catering-mediterraneo.html'), topicPage({ spanish: true, topic: 'mediterranean' }));
  await updateExistingPages();
  await writeRobots();
  const urlCount = await writeSitemap();
  await writeBusinessProfilePackage();
  console.log(JSON.stringify({ generatedCityPages: cities.length * 2, cityCount: cities.length, sitemapUrls: urlCount }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
