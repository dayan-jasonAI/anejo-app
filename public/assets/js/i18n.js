/* Añejo — lightweight EN/ES i18n. Walks text nodes + placeholders and swaps to Spanish.
   Persists choice in localStorage. Exposes window.AnejoLang { get, set } and window.AnejoI18n { refresh }. */
(function () {
  var KEY = 'anejo:lang';
  var lang = localStorage.getItem(KEY) || 'en';

  // English -> Spanish. Brand names, bowl names, prices, emails, handles stay as-is (absent from dict).
  var ES = {
    // nav + hero
    "Story":"Historia","Menu":"Menú","Services":"Servicios","Wholesale":"Mayoreo","Macros":"Macros",
    "Reserve a Tasting":"Reserva una Degustación",
    "Palm Beach County · Cuban-American Catering":"Condado de Palm Beach · Catering Cubano-Americano",
    "Clean Fuel.":"Combustible Limpio.","Bold Flavor.":"Sabor Intenso.","Built for Life.":"Hecho para la Vida.",
    "Premium longevity bowls, signature bites, and catering — Mediterranean nutrition with Cuban soul.":"Bowls premium de longevidad, bocados de autor y catering — nutrición mediterránea con alma cubana.",
    "Inspired by family. Built for legacy.":"Inspirado en la familia. Hecho para dejar legado.",
    "View the Menu":"Ver el Menú",
    "PBC · HERITAGE CRAFTED · FRESH NEVER FROZEN":"PBC · HECHO CON HERENCIA · FRESCO NUNCA CONGELADO",
    // home calculator band
    "Free · AI-Personalized · 10 Seconds":"Gratis · Personalizado con IA · 10 Segundos",
    "Find your macros.":"Encuentra tus macros.","Get your bowls.":"Arma tus bowls.",
    "Answer a few quick questions and our AI builds your daily macro targets plus a weekly Añejo bowl rotation tuned to your goal — no sign-up.":"Responde unas preguntas rápidas y nuestra IA arma tus macros diarios y una rotación semanal de bowls Añejo ajustada a tu meta — sin registrarte.",
    "Build my macro plan →":"Crear mi plan de macros →","For trainers & gyms":"Para entrenadores y gimnasios",
    // story
    "The Story Behind the Brand":"La Historia Detrás de la Marca","It started with":"Empezó con","family":"la familia",
    "Añejo Catering Co. was created out of a real moment in our family — my mom received a difficult diagnosis, and at the same time I was changing how I trained, ate, and lived. We needed food that supported her health AND tasted like home. Nothing on the market did both.":"Añejo Catering Co. nació de un momento real en nuestra familia — mi mamá recibió un diagnóstico difícil, y al mismo tiempo yo estaba cambiando cómo entrenaba, comía y vivía. Necesitábamos comida que cuidara su salud Y supiera a casa. Nada en el mercado lograba ambas cosas.",
    "\"We weren't going to choose between flavor and longevity. So we built something that doesn't make you.\"":"«No íbamos a elegir entre sabor y longevidad. Así que creamos algo que no te obliga a hacerlo.»",
    "What grew from that necessity is Añejo today: a premium Cuban-American food brand designed to support a healthier lifestyle, inspired by Mediterranean-style eating patterns associated with heart health and longevity, made with nutrient-conscious ingredients — and grounded in the flavor, texture, and soul of authentic Cuban cooking.":"Lo que creció de esa necesidad es el Añejo de hoy: una marca premium de comida cubano-americana diseñada para apoyar un estilo de vida más saludable, inspirada en patrones de alimentación mediterránea asociados con la salud del corazón y la longevidad, hecha con ingredientes conscientes de la nutrición — y anclada en el sabor, la textura y el alma de la auténtica cocina cubana.",
    "From handcrafted bowls to signature bites, every plate is built with intention. Healthy doesn't have to taste like a cleanse. It can taste like home.":"Desde bowls hechos a mano hasta bocados de autor, cada plato se construye con intención. Lo saludable no tiene que saber a dieta. Puede saber a casa.",
    "— DAYAN DIAZ, FOUNDER":"— DAYAN DIAZ, FUNDADOR",
    // menu
    "The Menu":"El Menú","Seven bowls.":"Siete bowls.","One philosophy.":"Una filosofía.",
    "16 oz bowl · 2 oz signature sauce on the side · 3-day fridge shelf · microwave + cold friendly · nuts removable · dairy-free swaps available · target macros 40% protein / 30% carbs / 30% fat. Per-bowl nutrition is approximate.":"Bowl de 16 oz · 2 oz de salsa de autor aparte · dura 3 días en refrigeración · apto para microondas y frío · frutos secos removibles · opciones sin lácteos · macros objetivo 40% proteína / 30% carbohidratos / 30% grasa. La información nutricional por bowl es aproximada.",
    "~510 kcal · 40g protein · 36g carbs · 22g fat":"~510 kcal · 40g proteína · 36g carbohidratos · 22g grasa",
    "~580 kcal · 42g protein · 35g carbs · 28g fat":"~580 kcal · 42g proteína · 35g carbohidratos · 28g grasa",
    "~520 kcal · 45g protein · 38g carbs · 20g fat":"~520 kcal · 45g proteína · 38g carbohidratos · 20g grasa",
    "~620 kcal · 40g protein · 30g carbs · 32g fat":"~620 kcal · 40g proteína · 30g carbohidratos · 32g grasa",
    "~590 kcal · 40g protein · 37g carbs · 27g fat":"~590 kcal · 40g proteína · 37g carbohidratos · 27g grasa",
    "~575 kcal · 41g protein · 39g carbs · 25g fat":"~575 kcal · 41g proteína · 39g carbohidratos · 25g grasa",
    "~520 kcal · 35g protein · 38g carbs · 26g fat":"~520 kcal · 35g proteína · 38g carbohidratos · 26g grasa",
    "Flagship. Tuna sautéed with mango and lime over quinoa, refried chickpeas, fresh greens, pumpkin seeds. The bowl that started it all.":"Insignia. Atún salteado con mango y limón sobre quinoa, garbanzos refritos, hojas verdes frescas y semillas de calabaza. El bowl con el que todo comenzó.",
    "Grilled steak with Añejo chimichurri, quinoa, grilled carrot + corn, spinach-apple-almond salad. Bold performance on a plate.":"Bistec a la parrilla con chimichurri Añejo, quinoa, zanahoria y elote asados, ensalada de espinaca, manzana y almendra. Rendimiento intenso en un plato.",
    "Lighter sibling of FUEGO. Grilled chicken with chimichurri, quinoa, grilled vegetables, spinach-apple-almond salad. Clean and ready.":"El hermano ligero de FUEGO. Pollo a la parrilla con chimichurri, quinoa, vegetales asados y ensalada de espinaca, manzana y almendra. Limpio y listo.",
    "Omega-rich salmon over quinoa with greens, roasted vegetables, pickled onions, sesame, microgreens, and Añejo sauce. Heart-smart and recovery-ready.":"Salmón rico en omega sobre quinoa con hojas verdes, vegetales asados, cebolla encurtida, ajonjolí, microgreens y salsa Añejo. Cuida el corazón y favorece la recuperación.",
    "Coconut-lime shrimp over a quinoa-corn-edamame blend with spinach, cherry tomato, cucumber, avocado, sesame, and light Ajo Cítrico. Lean and tropical.":"Camarón coco-limón sobre una mezcla de quinoa, elote y edamame con espinaca, tomate cherry, pepino, aguacate, ajonjolí y un toque de Ajo Cítrico. Ligero y tropical.",
    "Quinoa-blueberry congrí with tuna sauté, spinach-tomato salad, avocado, queso fresco, pumpkin seeds. Cuban fusion, reinterpreted.":"Congrí de quinoa y arándano con atún salteado, ensalada de espinaca y tomate, aguacate, queso fresco y semillas de calabaza. Fusión cubana reinventada.",
    "Crispy tofu with quinoa, slaw, roasted vegetables, sweet potato, avocado, and sesame, finished with Aguacate Cilantro and a Mango Omega accent. Plant-powered, fiber-rich.":"Tofu crujiente con quinoa, slaw, vegetales asados, camote, aguacate y ajonjolí, terminado con Aguacate Cilantro y un toque de Mango Omega. Lleno de plantas y fibra.",
    "Flagship":"Insignia","Pescatarian":"Pescetariano","High Protein":"Alto en Proteína","Mediterranean":"Mediterráneo",
    "Omega-3":"Omega-3","Anti-Inflammatory":"Antiinflamatorio","Cuban Heritage":"Herencia Cubana",
    "Plant Forward":"Basado en Plantas","Vegetarian":"Vegetariano","Dairy-Free":"Sin Lácteos",
    // sauces (house-made)
    "House-Made · No Shortcuts":"Hecho en Casa · Sin Atajos","House-made":"Salsas de autor","signature sauces":"hechas en casa",
    "Every bowl is finished with a house-made signature sauce — served on the side, so you control the moment. No fillers, no shortcuts.":"Cada bowl se termina con una salsa de autor hecha en casa — servida aparte, para que tú controles el momento. Sin rellenos, sin atajos.",
    "Bright garlic-citrus with olive oil, lemon, and Cuban sazón — freshness and depth for seafood and grilled proteins.":"Salsa brillante de ajo y cítrico con aceite de oliva, limón y sazón cubana — frescura y profundidad para mariscos y proteínas a la parrilla.",
    "A bold Cuban-Mediterranean herb sauce with garlic, citrus, and olive oil — made for steak, chicken, tofu, and roasted vegetables.":"Una salsa de hierbas cubano-mediterránea con ajo, cítrico y aceite de oliva — hecha para bistec, pollo, tofu y vegetales asados.",
    "Golden, anti-inflammatory turmeric with citrus and warm spice — color, depth, and a smooth wellness finish.":"Cúrcuma dorada y antiinflamatoria con cítrico y especia cálida — color, profundidad y un acabado suave de bienestar.",
    "A tropical, mango-forward dressing with a smooth, nutrient-rich finish — pairs with tuna, salmon, tofu, and wellness bowls.":"Un aderezo tropical con base de mango y un acabado suave y rico en nutrientes — combina con atún, salmón, tofu y bowls de bienestar.",
    "A creamy avocado-cilantro sauce with a fresh green finish — perfect for plant-forward bowls, tofu, chicken, and roasted vegetables.":"Una salsa cremosa de aguacate y cilantro con un acabado verde y fresco — perfecta para bowls de plantas, tofu, pollo y vegetales asados.",
    "Citrus vinaigrette with herbs and olive oil — a clean, bright finish for lighter bowls.":"Vinagreta cítrica con hierbas y aceite de oliva — un acabado limpio y brillante para bowls más ligeros.",
    "Sweet-heat pineapple with chile and citrus — a tropical lift with a gentle kick.":"Piña dulce-picante con chile y cítrico — un realce tropical con un toque de picor.",
    "Light coconut with lime and fresh herbs — smooth, tropical, and refreshing.":"Coco ligero con limón y hierbas frescas — suave, tropical y refrescante.",
    "2 oz · on the side":"2 oz · aparte",
    "Bites signature sauces: Añejo Signature Sauce, Ajo Cítrico Dip, Cilantro Lime Crema, Pineapple Chile Dip, Spicy Añejo Aioli, Spinach Goodness.":"Salsas de autor de Bites: Añejo Signature Sauce, Ajo Cítrico Dip, Cilantro Lime Crema, Pineapple Chile Dip, Spicy Añejo Aioli, Spinach Goodness.",
    "Allergen note: Bowls may contain wheat, egg, milk, fish, shellfish, tree nuts, or seeds depending on the SKU. Nuts removable on request. Dairy-free substitutions available. Full allergen disclosure on every bowl label. Please notify us of severe allergies when ordering.":"Nota de alérgenos: los bowls pueden contener trigo, huevo, leche, pescado, mariscos, frutos secos o semillas según el SKU. Frutos secos removibles a pedido. Sustituciones sin lácteos disponibles. Declaración completa de alérgenos en cada etiqueta. Avísanos de alergias graves al ordenar.",
    // brand architecture
    "Brand Architecture":"Arquitectura de Marca","One Añejo.":"Un solo Añejo.","Three lanes.":"Tres líneas.",
    "Services · Bowls · Events":"Servicios · Bowls · Eventos",
    "Premium catering, meal plans, and on-demand bowls. The flagship line — everything you see on this menu.":"Catering premium, planes de comida y bowls a pedido. La línea insignia — todo lo que ves en este menú.",
    "Packaged · Functional":"Empacado · Funcional",
    "Cold-pressed functional beverages designed to pair with the bowls. Gold Vitality · Hibiscus Zen · Emerald Hydrate.":"Bebidas funcionales prensadas en frío, diseñadas para acompañar los bowls. Gold Vitality · Hibiscus Zen · Emerald Hydrate.",
    "B2B · Wholesale":"B2B · Mayoreo",
    "Premium Cuban-Latin finger food for kava bars, cafés, and partner venues. Croquetas, empanadas, Tropical Bombs, signature sauces.":"Bocados cubano-latinos premium para kava bars, cafés y locales aliados. Croquetas, empanadas, Tropical Bombs y salsas de autor.",
    // how we serve
    "How We Serve":"Cómo Servimos","Built for":"Hecho para","every plate":"cada plato","in your life.":"de tu vida.",
    "Weekly Meal Plans":"Planes Semanales de Comida",
    "Fresh bowls delivered on your schedule. Sub-models for high-performers, longevity-focused clients, and busy professionals.":"Bowls frescos entregados según tu horario. Modelos de suscripción para personas de alto rendimiento, clientes enfocados en longevidad y profesionales ocupados.",
    "Corporate Lunch":"Almuerzo Corporativo",
    "Weekly programs for offices, clinics, and workspaces. Volume tiers from 10 bowls to 50+. Recurring or on-demand.":"Programas semanales para oficinas, clínicas y espacios de trabajo. Niveles por volumen desde 10 bowls hasta 50+. Recurrente o a pedido.",
    "Private Events":"Eventos Privados",
    "Plated catering for private functions, board dinners, weddings, country club events. Custom menus available with lead time.":"Catering emplatado para funciones privadas, cenas de directorio, bodas y eventos de country club. Menús personalizados con anticipación.",
    "Pickup & Delivery":"Recoger y Entrega",
    "On-demand individual orders. Premium bowls, signature bites, and the Añejo Fit functional drink line. Palm Beach County local.":"Pedidos individuales a pedido. Bowls premium, bocados de autor y la línea de bebidas funcionales Añejo Fit. Local del Condado de Palm Beach.",
    "Delivery":"Entrega",
    "On-demand delivery across Palm Beach County. Premium bowls, signature bites, and the Añejo Fit drink line — Monday–Saturday, lunch & dinner windows.":"Entrega a pedido en todo el Condado de Palm Beach. Bowls premium, bocados de autor y la línea Añejo Fit — de lunes a sábado, en horarios de almuerzo y cena.",
    "Gym & Clinic Programs":"Programas para Gimnasios y Clínicas",
    "White-glove meal programs for high-performance gyms and wellness clinics. Macro-targeted plans your members or patients can subscribe to.":"Programas de comida de alto nivel para gimnasios de alto rendimiento y clínicas de bienestar. Planes con macros a los que tus miembros o pacientes pueden suscribirse.",
    "Wholesale (Bites)":"Mayoreo (Bites)",
    "Áñejo Bites for kava bars, cafés, food halls. Reheat-and-serve format. See the Wholesale section below.":"Añejo Bites para kava bars, cafés y food halls. Formato listo para recalentar y servir. Ve la sección de Mayoreo abajo.",
    // dressings (eight)
    "Eight":"Ocho","signature dressings":"aderezos de autor",
    "Every bowl ships with a 2 oz sauce on the side — drizzle, dip, mix, your call.":"Cada bowl incluye 2 oz de salsa aparte — rocía, moja, mezcla, tú decides.",
    "Fresh herbs, garlic, olive oil, citrus":"Hierbas frescas, ajo, aceite de oliva, cítrico",
    "Roasted poblano, crisp apple, Greek yogurt":"Poblano asado, manzana crujiente, yogur griego",
    "Pineapple, chile, citrus":"Piña, chile, cítrico",
    "Citrus vinaigrette with herbs and olive oil":"Vinagreta cítrica con hierbas y aceite de oliva",
    "Greek yogurt base with citrus and subtle spice":"Base de yogur griego con cítrico y especia sutil",
    "Passion fruit, jalapeño, lime":"Maracuyá, jalapeño, limón",
    "Light coconut, lime, fresh herbs":"Coco ligero, limón, hierbas frescas",
    "Guava, citrus, olive oil, light spice":"Guayaba, cítrico, aceite de oliva, especia ligera",
    // tasting
    "Try it First":"Pruébalo Primero","Reserve a":"Reserva una","tasting":"degustación",
    "For meal-plan prospects, corporate buyers, gym partnerships, wellness clinics, and event hosts. We come to you or you come to the kitchen.":"Para prospectos de planes de comida, compradores corporativos, alianzas con gimnasios, clínicas de bienestar y anfitriones de eventos. Vamos a ti o vienes a la cocina.",
    "Tasting Request":"Solicitud de Degustación","We'll respond within 1 business day to schedule.":"Responderemos en 1 día hábil para agendar.",
    "Your name":"Tu nombre","Company / Organization":"Empresa / Organización","Email":"Correo","Phone":"Teléfono",
    "What are you exploring?":"¿Qué estás explorando?","Choose one...":"Elige una opción...",
    "Weekly meal plan (individual)":"Plan semanal de comida (individual)","Corporate lunch program":"Programa de almuerzo corporativo",
    "Private event catering":"Catering para eventos privados","Gym / wellness clinic partnership":"Alianza con gimnasio / clínica de bienestar",
    "Wholesale (Añejo Bites)":"Mayoreo (Añejo Bites)","Just curious":"Solo curiosidad","Anything we should know?":"¿Algo que debamos saber?",
    "Send Request":"Enviar Solicitud","Optional":"Opcional",
    "Group size, dietary needs, event date, target start...":"Tamaño del grupo, necesidades dietéticas, fecha del evento, inicio deseado...",
    // wholesale bites
    "Premium Cuban-Latin bites for your venue.":"Bocados cubano-latinos premium para tu local.",
    "Built for kava bars, cafés, lounges, and food halls. Ships frozen, ready-to-finish. No culinary team needed — your staff just air-fries, plates, and serves.":"Hechos para kava bars, cafés, lounges y food halls. Se envían congelados, listos para terminar. No necesitas equipo de cocina — tu personal solo fríe al aire, emplata y sirve.",
    "We handle the brand, the quality, the recipes. You handle the regulars.":"Nosotros manejamos la marca, la calidad y las recetas. Tú manejas a los clientes de siempre.",
    "Pilot territories available in Palm Beach County":"Territorios piloto disponibles en el Condado de Palm Beach",
    "Phase 1 Menu":"Menú Fase 1","Chicken Croqueta":"Croqueta de Pollo","Beef Croqueta":"Croqueta de Res",
    "Guava & Cheese Empanada":"Empanada de Guayaba y Queso","Tres Leches Cup":"Copa de Tres Leches",
    "$1.00 ea":"$1.00 c/u","$2.50 ea":"$2.50 c/u","$3.00 ea":"$3.00 c/u","$0.50 ea":"$0.50 c/u",
    "Signature Sauces (2 oz)":"Salsas de Autor (2 oz)",
    "Partner minimum 50% markup at retail. Tiered exclusivity available.":"Margen mínimo del 50% para el socio en retail. Exclusividad por niveles disponible.",
    "Start a Wholesale Conversation":"Inicia una Conversación de Mayoreo",
    // añejo fit (drinks)
    "Añejo Fit · Functional Drinks":"Añejo Fit · Bebidas Funcionales",
    "Cold-pressed.":"Prensado en frío.","Built to pair.":"Hecho para acompañar.",
    "Three functional juices in 12 oz bottles, cold-pressed for nutrient retention and designed to pair with the bowls. Clean Fuel. Bold Flavor. Built for Life.":"Tres jugos funcionales en botellas de 12 oz, prensados en frío para retener nutrientes y diseñados para acompañar los bowls. Combustible Limpio. Sabor Intenso. Hecho para la Vida.",
    "Golden energy. Tropical recovery.":"Energía dorada. Recuperación tropical.",
    "Calm energy. Clean balance.":"Energía calmada. Equilibrio limpio.",
    "Hydrate. Refresh. Recharge.":"Hidrata. Refresca. Recarga.",
    "Pineapple · Ginger · Turmeric · Chia · Coconut Water":"Piña · Jengibre · Cúrcuma · Chía · Agua de Coco",
    "Hibiscus · Lime · Ginger · Mint":"Hibisco · Limón · Jengibre · Menta",
    "Cucumber · Mint · Lemon · Honey · Chia":"Pepino · Menta · Limón · Miel · Chía",
    "Supports a healthy inflammation response*":"Apoya una respuesta inflamatoria saludable*",
    "Aids digestion":"Ayuda a la digestión","Supports immune function*":"Apoya la función inmune*",
    "Post-workout recovery":"Recuperación post-entrenamiento",
    "Supports healthy blood pressure*":"Apoya una presión arterial saludable*",
    "Antioxidant-rich":"Rico en antioxidantes","Calming botanicals":"Botánicos calmantes","Hydrating":"Hidratante",
    "Hydrating electrolyte support":"Apoyo hidratante de electrolitos",
    "Supports healthy blood sugar levels*":"Apoya niveles saludables de azúcar en sangre*",
    "Gut-friendly fiber":"Fibra amigable con el intestino","Plant-based omega-3 from chia":"Omega-3 vegetal de la chía",
    "Bright":"Brillante","Smooth heat":"Picor suave","Citrusy":"Cítrico","Refreshing":"Refrescante",
    "Ultra clean":"Ultra limpio","Cooling":"Refrescante","Crisp":"Fresco",
    "Pairs with":"Combina con",
    "12 fl oz · ~110 cal · cold-pressed":"12 fl oz · ~110 cal · prensado en frío",
    "12 fl oz · ~70 cal · cold-pressed":"12 fl oz · ~70 cal · prensado en frío",
    "12 fl oz · ~80 cal · cold-pressed":"12 fl oz · ~80 cal · prensado en frío",
    "Launching alongside the bowl menu. In the first weeks, drinks ship with bowl orders. Bottle photography coming soon.":"Lanzamiento junto al menú de bowls. En las primeras semanas, las bebidas se envían con los pedidos de bowls. Fotografía de botellas próximamente.",
    "*These statements have not been evaluated by the Food and Drug Administration. These products are not intended to diagnose, treat, cure, or prevent any disease. Nutrition values are estimates pending lab verification.":"*Estas afirmaciones no han sido evaluadas por la Administración de Alimentos y Medicamentos (FDA). Estos productos no están destinados a diagnosticar, tratar, curar ni prevenir ninguna enfermedad. Los valores nutricionales son estimados y están pendientes de verificación de laboratorio.",
    // bites wholesale form
    "Venue / business":"Local / negocio","Estimated weekly volume":"Volumen semanal estimado",
    "e.g. 200 croquetas/week":"ej.: 200 croquetas/semana",
    "We received your wholesale inquiry and will reach out within 1 business day.":"Recibimos tu solicitud de mayoreo. Te contactaremos en 1 día hábil.",
    // FAQ
    "Good to Know":"Bueno Saber","Frequently":"Preguntas","asked":"frecuentes",
    "Where do you deliver, and when?":"¿Dónde y cuándo entregan?",
    "We deliver across Palm Beach County, Monday through Saturday, in two windows — lunch (11:00 AM–1:00 PM) and dinner (5:00 PM–7:00 PM). Choose your window at checkout.":"Entregamos en todo el Condado de Palm Beach, de lunes a sábado, en dos horarios: almuerzo (11:00 AM–1:00 PM) y cena (5:00 PM–7:00 PM). Elige tu horario al pagar.",
    "How fresh are the bowls, and how do I store them?":"¿Qué tan frescos son los bowls y cómo los conservo?",
    "Every bowl is made fresh — never frozen — with about a 3-day refrigerated shelf life. They're microwave- and cold-friendly, with the signature sauce on the side so you control the moment.":"Cada bowl se hace fresco — nunca congelado — y dura unos 3 días en refrigeración. Aptos para microondas y para comer fríos, con la salsa de autor aparte para que tú controles el momento.",
    "Can you accommodate allergies and dietary needs?":"¿Pueden adaptarse a alergias y necesidades dietéticas?",
    "Bowls may contain wheat, egg, milk, fish, shellfish, tree nuts, or seeds depending on the recipe, and are prepared in a shared kitchen. Nuts are removable on request and dairy-free substitutions are often available. Please tell us about severe allergies before ordering — see each bowl's label for full disclosure.":"Los bowls pueden contener trigo, huevo, leche, pescado, mariscos, frutos secos o semillas según la receta, y se preparan en una cocina compartida. Los frutos secos se pueden quitar a pedido y a menudo hay sustituciones sin lácteos. Avísanos de alergias graves antes de ordenar — consulta la etiqueta de cada bowl para la declaración completa.",
    "How do the weekly meal-plan subscriptions work?":"¿Cómo funcionan las suscripciones semanales de planes de comida?",
    "Pick a weekly tier — 5, 10, or 12 bowls — and we deliver on your schedule. Subscriptions renew automatically each week and you can cancel anytime; see our":"Elige un nivel semanal — 5, 10 o 12 bowls — y entregamos según tu horario. Las suscripciones se renuevan automáticamente cada semana y puedes cancelar cuando quieras; consulta nuestra",
    "Refund & Cancellation policy":"Política de Reembolsos y Cancelaciones",
    "Is the AI macro calculator medical or nutritional advice?":"¿La calculadora de macros con IA es consejo médico o nutricional?",
    "No. The macro calculator and any generated plans are for general fitness and wellness information only — they are estimates, not medical or dietary advice. Consult your healthcare provider before starting any new nutrition program.":"No. La calculadora de macros y cualquier plan generado son solo información general de fitness y bienestar — son estimaciones, no consejo médico ni dietético. Consulta a tu proveedor de salud antes de comenzar cualquier programa de nutrición.",
    "How does pricing and tax work?":"¿Cómo funcionan los precios y los impuestos?",
    "Bowl and drink prices are shown on the menu; applicable Florida and Palm Beach County sales tax is added at checkout. Payments are processed securely by Square.":"Los precios de bowls y bebidas se muestran en el menú; el impuesto sobre ventas aplicable de Florida y del Condado de Palm Beach se añade al pagar. Los pagos se procesan de forma segura con Square.",
    "I'm a trainer or gym — can I partner with Añejo?":"Soy entrenador o gimnasio, ¿puedo asociarme con Añejo?",
    "Yes. Our trainer portal lets you generate macro-targeted bowl plans for your members, who subscribe to Añejo directly. Ask us about our trainer & gym partner program.":"Sí. Nuestro portal de entrenadores te permite generar planes de bowls con macros para tus miembros, que se suscriben a Añejo directamente. Pregúntanos por nuestro programa de socios para entrenadores y gimnasios.",
    "Explore the trainer portal →":"Explora el portal de entrenadores →",
    "FAQ":"Preguntas",
    // testimonials
    "Word of Mouth":"Lo Que Dicen","What people are":"Lo que la gente está","saying":"diciendo",
    "Healthy doesn't have to taste like a cleanse. It can taste like home.":"Lo saludable no tiene que saber a dieta. Puede saber a casa.",
    "— The Añejo promise":"— La promesa Añejo",
    "Your review could be here — be one of our first members and tell your story.":"Tu reseña podría estar aquí — sé uno de nuestros primeros miembros y cuenta tu historia.",
    "— Reserve a tasting":"— Reserva una degustación",
    "Trainers and gyms: share how Añejo plans changed your members' results.":"Entrenadores y gimnasios: cuenten cómo los planes Añejo cambiaron los resultados de sus miembros.",
    "— Partner with us":"— Asóciate con nosotros",
    "Verified customer reviews will appear here as our first orders ship.":"Las reseñas verificadas de clientes aparecerán aquí cuando lleguen nuestros primeros pedidos.",
    // testimonials
    "Word of Mouth":"De Boca en Boca","What people are":"Lo que la gente está","saying":"diciendo",
    "Healthy doesn't have to taste like a cleanse. It can taste like home.":"Lo saludable no tiene que saber a dieta. Puede saber a casa.",
    "— The Añejo promise":"— La promesa Añejo",
    "Your review could be here — be one of our first members and tell your story.":"Tu reseña podría estar aquí — sé uno de nuestros primeros miembros y cuenta tu historia.",
    "— Reserve a tasting":"— Reserva una degustación",
    "Trainers and gyms: share how Añejo plans changed your members' results.":"Entrenadores y gimnasios: cuenten cómo los planes Añejo cambiaron los resultados de sus miembros.",
    "— Partner with us":"— Asóciate con nosotros",
    "Verified customer reviews will appear here as our first orders ship.":"Las reseñas verificadas de clientes aparecerán aquí cuando salgan nuestros primeros pedidos.",
    // macro calculator (home hero)
    "Free":"Gratis","AI-Personalized":"Personalizado con IA","~10 Seconds":"~10 Segundos","No Sign-Up":"Sin Registro",
    "See your macros.":"Descubre tus macros.","Meet your bowls.":"Conoce tus bowls.",
    "Answer a few quick questions and our AI builds your exact daily targets — then a weekly Añejo bowl rotation tuned to your goal. Free, instant, no sign-up.":"Responde unas preguntas rápidas y nuestra IA arma tus objetivos diarios exactos — y una rotación semanal de bowls Añejo ajustada a tu meta. Gratis, al instante, sin registro.",
    "Build my free plan →":"Crear mi plan gratis →",
    "Trainer or gym? Partner with us →":"¿Entrenador o gimnasio? Asóciate con nosotros →",
    "Your daily targets":"Tus objetivos diarios","Sample":"Muestra","kcal / day":"kcal / día",
    "175g protein · 200g carbs · 65g fat":"175g proteína · 200g carbohidratos · 65g grasa",
    "Your weekly Añejo rotation":"Tu rotación semanal Añejo",
    "Tuned to fat loss · moderate activity":"Ajustado a pérdida de grasa · actividad moderada",
    // closing + footer
    "Built in Palm Beach.":"Hecho en Palm Beach.","Made with intent.":"Hecho con intención.",
    "Whether it's one bowl or a thousand — we cook it the same way.":"Ya sea un bowl o mil — lo cocinamos de la misma forma.",
    "Call 561-567-1047":"Llama al 561-567-1047",
    "Premium Cuban-American longevity bowls, catering, and wholesale bites. Made in Palm Beach County, Florida. Inspired by family. Built for legacy.":"Bowls premium cubano-americanos de longevidad, catering y bocados de mayoreo. Hechos en el Condado de Palm Beach, Florida. Inspirado en la familia. Hecho para dejar legado.",
    "Visit":"Ubicación","Service Area":"Zona de Servicio","Palm Beach County":"Condado de Palm Beach","Florida, USA":"Florida, EE. UU.",
    "Delivery Mon–Sat":"Entrega lun–sáb","Lunch 11–1 · Dinner 5–7":"Almuerzo 11–1 · Cena 5–7",
    "Skip to content":"Saltar al contenido",
    "Contact":"Contacto","Explore":"Explora",
    "© 2026 Añejo Catering Co. LLC · All rights reserved":"© 2026 Añejo Catering Co. LLC · Todos los derechos reservados",
    "PBC HERITAGE CRAFTED":"PBC HECHO CON HERENCIA",
    // titles
    "Añejo Catering Co. — Clean Fuel. Bold Flavor. Built for Life.":"Añejo Catering Co. — Combustible Limpio. Sabor Intenso. Hecho para la Vida.",
    // ===== calculator page =====
    "Macro Calculator":"Calculadora de Macros","Free · 10 Seconds · No Sign-Up":"Gratis · 10 Segundos · Sin Registro",
    "Your macros, your bowls.":"Tus macros, tus bowls.",
    "Tell us a little about you and your goal. Our AI builds your personalized daily macro target and a weekly Añejo bowl rotation tuned to it — Mediterranean nutrition with Cuban soul.":"Cuéntanos un poco sobre ti y tu meta. Nuestra IA arma tu objetivo diario de macros personalizado y una rotación semanal de bowls Añejo ajustada a él — nutrición mediterránea con alma cubana.",
    "For Me":"Para Mí","I'm a Trainer":"Soy Entrenador","About You":"Sobre Ti","Your name (optional)":"Tu nombre (opcional)",
    "Age":"Edad","Sex":"Sexo","Female":"Femenino","Male":"Masculino","Height":"Estatura","Weight (lb)":"Peso (lb)",
    "Activity & Goal":"Actividad y Meta","Activity level":"Nivel de actividad",
    "Sedentary — desk job, little exercise":"Sedentario — trabajo de escritorio, poco ejercicio",
    "Light — 1–3 workouts/week":"Ligero — 1–3 entrenamientos/semana","Moderate — 3–5 workouts/week":"Moderado — 3–5 entrenamientos/semana",
    "Active — 6–7 workouts/week":"Activo — 6–7 entrenamientos/semana","Very Active — daily training or physical job":"Muy Activo — entrenamiento diario o trabajo físico",
    "Primary goal":"Meta principal","Fat loss":"Pérdida de grasa","Muscle gain":"Ganancia muscular",
    "Recomposition (lean out + build)":"Recomposición (definir + construir)","Athletic performance":"Rendimiento atlético",
    "Longevity / preventive health":"Longevidad / salud preventiva","Health (managed)":"Salud (controlada)",
    "Check anything you currently manage with a doctor. For Type 1 diabetes, pregnancy, recent surgery (≤6 mo), GLP-1 use, eating-disorder history, or kidney/liver/cardiac/cancer care, please talk to your provider first — our calculator skips those for safety.":"Marca lo que controles actualmente con un médico. Para diabetes tipo 1, embarazo, cirugía reciente (≤6 meses), uso de GLP-1, antecedentes de trastornos alimenticios, o cuidado renal/hepático/cardíaco/oncológico, consulta primero a tu proveedor — la calculadora omite esos casos por seguridad.",
    "High blood pressure":"Presión alta","High cholesterol":"Colesterol alto","Prediabetes":"Prediabetes",
    "Type 2 diabetes (managed)":"Diabetes tipo 2 (controlada)","Metabolic syndrome":"Síndrome metabólico","None / general wellness":"Ninguna / bienestar general",
    "Allergens to avoid":"Alérgenos a evitar","Nuts":"Frutos secos","Dairy":"Lácteos","Soy":"Soya","Fish":"Pescado","Shellfish":"Mariscos","Pork":"Cerdo",
    "Anything else?":"¿Algo más?","Taste notes, bowls to avoid, training schedule":"Notas de sabor, bowls a evitar, horario de entrenamiento",
    "Build My Plan →":"Crear Mi Plan →",
    "This plan is for general fitness and wellness. It is not medical advice. Consult a healthcare professional before starting any new nutrition program. Añejo Catering Co. is not a medical provider.":"Este plan es para fitness y bienestar general. No es consejo médico. Consulta a un profesional de salud antes de comenzar cualquier programa de nutrición. Añejo Catering Co. no es un proveedor médico.",
    "First name":"Nombre","e.g., 'No spice. Prefer chicken over beef. Train 6 AM Mon/Wed/Fri.'":"ej.: 'Sin picante. Prefiero pollo a res. Entreno 6 AM lun/mié/vie.'",
    "Free Macro Calculator — Añejo Catering Co.":"Calculadora de Macros Gratis — Añejo Catering Co.",
    // ===== trainer portal =====
    "Trainer Portal":"Portal de Entrenadores","For Gyms · Trainers · Wellness Clinics":"Para Gimnasios · Entrenadores · Clínicas de Bienestar",
    "Your members, on Añejo.":"Tus miembros, con Añejo.","AI-personalized.":"Personalizado con IA.",
    "A turnkey tool for gym owners, trainers, and longevity clinics. Add a member, our AI generates a macro-targeted Mediterranean-Cuban bowl plan, you hand it to them. Members subscribe to Añejo direct through our":"Una herramienta llave en mano para dueños de gimnasios, entrenadores y clínicas de longevidad. Agrega un miembro, nuestra IA genera un plan de bowls mediterráneo-cubano con macros, y se lo entregas. Los miembros se suscriben a Añejo directamente a través de nuestro",
    "trainer & gym partner program":"programa de socios para entrenadores y gimnasios",
    "Generate a member plan →":"Generar un plan de miembro →","How it works":"Cómo funciona",
    "Enter a member's basics — age, weight, goal, conditions, allergens. Two minutes.":"Ingresa los datos de un miembro — edad, peso, meta, condiciones, alérgenos. Dos minutos.",
    "Our AI generates a personalized macro target + a weekly Añejo bowl rotation tuned to their goal.":"Nuestra IA genera un objetivo de macros personalizado + una rotación semanal de bowls Añejo ajustada a su meta.",
    "Review, tweak if needed, send it to your member. They subscribe direct through our partner program.":"Revisa, ajusta si hace falta, y envíaselo a tu miembro. Se suscribe directo a través de nuestro programa de socios.",
    "Pre-launch. The trainer portal is live — add a member, generate and fine-tune their plan, and send it for checkout. Plans are for general fitness and wellness — not medical advice. Añejo Catering Co. is not a medical provider.":"Pre-lanzamiento. El portal de entrenadores está activo — agrega un miembro, genera y ajusta su plan, y envíalo para el pago. Los planes son para fitness y bienestar general — no son consejo médico. Añejo Catering Co. no es un proveedor médico.",
    "Añejo Trainer Portal — AI-personalized plans for your members":"Portal de Entrenadores Añejo — planes personalizados con IA para tus miembros",
    // ===== intake (trainer) =====
    "Member Intake":"Registro de Miembro","Trainer · New Member":"Entrenador · Nuevo Miembro","New member":"Nuevo miembro",
    "Two-minute intake. Our AI builds the plan when you submit.":"Registro de dos minutos. Nuestra IA crea el plan al enviar.",
    "Basics":"Datos básicos","Member name":"Nombre del miembro","Conditions (managed)":"Condiciones (controladas)",
    "Check anything currently managed under a doctor's oversight. For Type 1 diabetes, pregnancy, post-surgery (≤6 mo), GLP-1, eating-disorder history, kidney/liver/cardiac/cancer treatment — use the RD/MD referral workflow (ships in V1.2).":"Marca lo que esté bajo supervisión médica. Para diabetes tipo 1, embarazo, postquirúrgico (≤6 meses), GLP-1, antecedentes de trastornos alimenticios, tratamiento renal/hepático/cardíaco/oncológico — usa el flujo de referencia a Nutricionista/Médico (llega en V1.2).",
    "Preferences":"Preferencias","Anything else? (bowls to avoid, taste notes, training schedule)":"¿Algo más? (bowls a evitar, notas de sabor, horario de entrenamiento)",
    "Generate AI Plan →":"Generar Plan con IA →",
    "This plan is for general fitness and wellness. It is not medical advice. Members should consult a healthcare professional before starting any new nutrition program. Añejo Catering Co. is not a medical provider.":"Este plan es para fitness y bienestar general. No es consejo médico. Los miembros deben consultar a un profesional de salud antes de comenzar cualquier programa de nutrición. Añejo Catering Co. no es un proveedor médico.",
    "e.g., 'No spice. Prefers chicken over beef. Trains 6 AM Mon/Wed/Fri.'":"ej.: 'Sin picante. Prefiere pollo a res. Entrena 6 AM lun/mié/vie.'",
    "New Member Intake — Añejo Trainer Portal":"Registro de Nuevo Miembro — Portal de Entrenadores Añejo",
    // ===== plan page (static) =====
    "Your Plan":"Tu Plan","Your plan":"Tu plan","Daily Macro Targets":"Objetivos Diarios de Macros",
    "Calories":"Calorías","Protein g":"Proteína g","Carbs g":"Carbohidratos g","Fat g":"Grasa g","Fiber g":"Fibra g",
    "Your Weekly Añejo Rotation":"Tu Rotación Semanal Añejo","Why this plan":"Por qué este plan","Lifestyle notes":"Notas de estilo de vida",
    "See the full menu →":"Ver el menú completo →","See the full menu":"Ver el menú completo","Start over":"Empezar de nuevo",
    "Subscribe to this plan →":"Suscríbete a este plan →","Order these bowls":"Ordena estos bowls",
    "Your Plan — Añejo Catering Co.":"Tu Plan — Añejo Catering Co.",
    // ===== order page (static; dynamic catalog/cart strings are localized in order.html JS) =====
    "Order — Añejo Catering Co.":"Ordenar — Añejo Catering Co.",
    "← Back to site":"← Volver al sitio",
    "Order · Delivery · Palm Beach County":"Ordenar · Entrega · Condado de Palm Beach",
    "Build your":"Arma tu","order":"pedido",
    "Pre-launch / test mode.":"Pre-lanzamiento / modo de prueba.",
    "You can build a cart and run the full checkout, but payment uses Square's":"Puedes armar un carrito y completar todo el pago, pero el pago usa el",
    "— no real charge and no food is fulfilled. Use test card":"de Square — sin cargo real y sin preparar comida. Usa la tarjeta de prueba",
    ", any future expiry, any CVV.":", cualquier vencimiento futuro, cualquier CVV.",
    "Your order":"Tu pedido",
    "Delivery fee":"Costo de entrega",
    "Est. FL sales tax (7%)":"Imp. sobre ventas FL est. (7%)",
    "Estimated total":"Total estimado",
    "Final tax & delivery fee are confirmed on the secure Square checkout page.":"El impuesto y el costo de entrega finales se confirman en la página de pago segura de Square.",
    "How would you like it?":"¿Cómo lo quieres?",
    "ASAP today":"Hoy mismo","Make-now · delivered today":"Hecho al momento · entregado hoy",
    "Schedule":"Programar","Pick a day & window":"Elige día y horario",
    "Delivery date & window":"Fecha y horario de entrega",
    "Delivery only · Palm Beach County · Mon–Sat. Order by 6 PM the day before.":"Solo entrega · Condado de Palm Beach · lun–sáb. Ordena antes de las 6 PM del día anterior.",
    "Lunch · 11:00 AM – 1:00 PM":"Almuerzo · 11:00 AM – 1:00 PM","Dinner · 5:00 PM – 7:00 PM":"Cena · 5:00 PM – 7:00 PM",
    "Your details":"Tus datos",
    "Text me delivery updates (on the way, arriving soon, delivered). Msg & data rates may apply; reply STOP to opt out. We never share your number.":"Envíame avisos de entrega (en camino, por llegar, entregado). Pueden aplicar tarifas de mensajes y datos; responde STOP para cancelar. Nunca compartimos tu número.",
    "Delivery address":"Dirección de entrega",
    "Proceed to checkout":"Proceder al pago",
    // order page — input placeholders
    "First name":"Nombre","Mobile number":"Número de móvil","Mobile number (optional)":"Número de móvil (opcional)",
    "Street address":"Dirección","Apt / unit / suite (optional)":"Apto / unidad / suite (opcional)",
    "City":"Ciudad","ZIP":"Código postal","Gate code, drop-off notes (optional)":"Código de acceso, notas de entrega (opcional)",
    // order page — customize modal section headers (chip labels + buttons are localized in order.html JS)
    "Protein":"Proteína","Remove ingredients":"Quitar ingredientes","Add a sauce":"Agregar una salsa",
    "Extra of an ingredient":"Extra de un ingrediente","Add to order":"Agregar al pedido"
  };

  var origText = new WeakMap();   // text node / option -> original english value
  var origPH = new WeakMap();     // element -> original placeholder
  var origTitle = document.title;
  var hubObserver = null;         // re-translates dynamically-rendered HUB content
  var OBS_OPTS = { childList: true, subtree: true, characterData: true };

  function tr(s){ return ES[s]; }

  function walk(node, fn){
    for (var c = node.firstChild; c; c = c.nextSibling){
      if (c.nodeType === 3){ fn(c); }
      else if (c.nodeType === 1){
        var tag = c.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || c.id === 'langToggle') continue;
        walk(c, fn);
      }
    }
  }

  function apply(l){
    var es = (l === 'es');
    if (hubObserver) hubObserver.disconnect();   // don't observe our own edits
    walk(document.body, function(t){
      var raw = t.nodeValue;
      if (!raw || !raw.trim()) return;
      if (!origText.has(t)) origText.set(t, raw);
      var orig = origText.get(t);
      if (es){
        var v = tr(orig.trim());
        t.nodeValue = (v !== undefined) ? orig.replace(orig.trim(), v) : orig;
      } else {
        t.nodeValue = orig;
      }
    });
    var phs = document.querySelectorAll('[placeholder]');
    for (var i = 0; i < phs.length; i++){
      var el = phs[i];
      if (!origPH.has(el)) origPH.set(el, el.getAttribute('placeholder'));
      var o = origPH.get(el);
      el.setAttribute('placeholder', es ? (tr(o) || o) : o);
    }
    if (es){ var tv = tr(origTitle); if (tv) document.title = tv; } else { document.title = origTitle; }
    document.documentElement.lang = es ? 'es' : 'en';
    updateToggle(l);
    if (hubObserver) { hubObserver.takeRecords(); hubObserver.observe(document.body, OBS_OPTS); }
  }

  // Merge extra entries (e.g. the HUB dictionary) into ES and re-apply.
  function extend(dict){
    if (!dict) return;
    for (var k in dict){ if (Object.prototype.hasOwnProperty.call(dict, k)) ES[k] = dict[k]; }
    apply(lang);
  }

  // On HUB pages, content is rendered dynamically (nav, tiles, lists, toasts). Watch the
  // DOM and re-translate in Spanish. apply() disconnects first, so this never loops.
  function startHubObserver(){
    if (hubObserver || !window.MutationObserver) return;
    if (location.pathname.indexOf('/hub') !== 0) return;
    var raf = 0;
    hubObserver = new MutationObserver(function(){
      if (lang !== 'es') return;
      if (raf) return;
      raf = (window.requestAnimationFrame || window.setTimeout)(function(){ raf = 0; apply(lang); }, 0);
    });
    hubObserver.observe(document.body, OBS_OPTS);
  }

  function ensureToggle(){
    if (document.getElementById('langToggle')) return;
    var b = document.createElement('button');
    b.id = 'langToggle'; b.type = 'button';
    b.setAttribute('aria-label', 'Language / Idioma');
    b.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:99999;background:#0D0D0D;border:1px solid rgba(200,188,110,.45);border-radius:999px;padding:9px 14px;font:600 12px/1 \'Josefin Sans\',-apple-system,sans-serif;letter-spacing:1px;color:#C8BC6E;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.35)';
    b.innerHTML = '<span data-l="en">EN</span><span style="opacity:.45;margin:0 5px">/</span><span data-l="es">ES</span>';
    b.addEventListener('click', function(){ setLang(lang === 'es' ? 'en' : 'es'); });
    document.body.appendChild(b);
  }
  function updateToggle(l){
    var b = document.getElementById('langToggle'); if (!b) return;
    b.querySelector('[data-l="en"]').style.color = l === 'en' ? '#fff' : '#C8BC6E';
    b.querySelector('[data-l="es"]').style.color = l === 'es' ? '#fff' : '#C8BC6E';
  }

  function setLang(l){
    lang = l; localStorage.setItem(KEY, l); apply(l);
    document.dispatchEvent(new CustomEvent('anejo:langchange', { detail: { lang: l } }));
  }

  window.AnejoLang = { get: function(){ return lang; }, set: setLang };
  window.AnejoI18n = { refresh: function(){ apply(lang); }, extend: extend };

  function init(){
    ensureToggle();
    // Drain any HUB dictionary that registered before this engine loaded.
    if (window.__hubI18nQueue){
      for (var i = 0; i < window.__hubI18nQueue.length; i++) extend(window.__hubI18nQueue[i]);
      window.__hubI18nQueue = null;
    }
    apply(lang);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
