// Shared by the public selector and server validation. Prices are quoted after review.
export const cateringProducts = [
  ...['FUEGO', 'LIGERO', 'MAR', 'RAÍZ', 'COCO', 'VIDA', 'CONGREEN'].map((name) => ({ id: `fit-${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}`, category: 'Añejo Fit Menu', en: `${name} bowl`, es: `Bowl ${name}`, unit: ['bowls', 'bowls'] })),
  { id: 'lechon', category: 'Cuban Food', en: 'Roast pork · 6 oz per serving', es: 'Lechón asado · 6 oz por porción', unit: ['servings', 'porciones'] },
  { id: 'congri', category: 'Cuban Food', en: 'Congrí · 2 cooked cups per serving', es: 'Congrí · 2 tazas cocidas por porción', unit: ['servings', 'porciones'] },
  { id: 'tamales', category: 'Cuban Food', en: 'Cuban tamales · 3 slices per serving', es: 'Tamales cubanos · 3 rodajas por porción', unit: ['servings', 'porciones'] },
  { id: 'roll', category: 'Cuban Food', en: 'Hawaiian roll with spread', es: 'Panecillo hawaiano con pasta', unit: ['pieces', 'unidades'], flavorKey: 'sandwich' },
  { id: 'empanada', category: 'Cuban Food', en: 'Empanada · 1.25 oz', es: 'Empanada · 1.25 oz', unit: ['pieces', 'unidades'], flavorKey: 'empanada' },
  { id: 'croqueta', category: 'Cuban Food', en: 'Croqueta · 1.20 oz fried', es: 'Croqueta · 1.20 oz frita', unit: ['pieces', 'unidades'], flavorKey: 'croqueta' },
  { id: 'salad', category: 'Cuban Food', en: 'Cold macaroni salad · 6 oz per serving', es: 'Ensalada fría de coditos · 6 oz por porción', unit: ['servings', 'porciones'] },
  { id: 'skewer', category: 'Cuban Food', en: 'Grape, ham, guava, cheese & pineapple skewer', es: 'Pincho de uva, jamón, guayaba, queso y piña', unit: ['pieces', 'unidades'] },
  { id: 'tres-leches', category: 'Cuban Food', en: 'Tres leches cup · 3–4 oz', es: 'Vasito de tres leches · 3–4 oz', unit: ['cups', 'vasitos'] },
  { id: 'cajita-standard', category: 'Individual Cajitas', en: 'Standard La Cajita · all six items', es: 'La Cajita estándar · los seis productos', unit: ['boxes', 'cajitas'] },
  { id: 'cajita-custom', category: 'Individual Cajitas', en: 'Personalized La Cajita · specify changes below', es: 'La Cajita personalizada · indica los cambios abajo', unit: ['boxes', 'cajitas'] },
  ...['Añejo Fit Menu', 'Cuban Food', 'Individual Cajitas'].map((category, i) => ({ id: `custom-${i}`, category, en: 'Other custom request · describe below', es: 'Otra solicitud personalizada · describe abajo', unit: ['servings / boxes', 'porciones / cajitas'], custom: true })),
];
