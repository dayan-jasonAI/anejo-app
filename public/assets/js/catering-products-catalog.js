// Shared by the public selector and server validation.
//
// EVERY id here must resolve to a published price, or the customer is shown a product they cannot
// buy. The only exceptions are the Fit bowls (which go through the bowl editor) and the explicitly
// custom lines. test/money/catering-catalog-api.test.js pins that, because two ways of breaking it
// have already shipped: a mapping whose flavor keys did not match this file's, and a product left
// listed after the menu retired it.
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
  // Added 2026-09-09. Every one of these has had a published tray price on the live menu all
  // along; none of them was offered here, so ordering any of them meant filing an "Other custom
  // request" that no instant quote could price. Yuca is the one that broke Dayan's own order.
  { id: 'yuca', category: 'Cuban Food', en: 'Yuca, onion & chicharrones · 6 oz per serving', es: 'Yuca con cebolla y chicharrones · 6 oz por porción', unit: ['servings', 'porciones'] },
  { id: 'salad-fresh', category: 'Cuban Food', en: 'Ensalada fresca · 6 oz per serving', es: 'Ensalada fresca · 6 oz por porción', unit: ['servings', 'porciones'] },
  { id: 'croqueta-dressed', category: 'Cuban Food', en: 'Dressed croqueta', es: 'Croqueta vestida', unit: ['pieces', 'unidades'] },
  { id: 'bomba', category: 'Cuban Food', en: 'La Bomba Tropical', es: 'La Bomba Tropical', unit: ['pieces', 'unidades'] },
  { id: 'pizza', category: 'Cuban Food', en: 'Ham, pepperoni & red onion pizza', es: 'Pizza de jamón, pepperoni y cebolla morada', unit: ['servings', 'porciones'] },
  { id: 'cup-fresa', category: 'Cuban Food', en: 'Tres leches de Fresa · cup', es: 'Tres leches de Fresa · vasito', unit: ['cups', 'vasitos'] },
  { id: 'cup-chocolate', category: 'Cuban Food', en: 'Tres leches de Chocolate · cup', es: 'Tres leches de Chocolate · vasito', unit: ['cups', 'vasitos'] },
  { id: 'cake-fresa', category: 'Cuban Food', en: 'Tres leches de Fresa · whole cake', es: 'Tres leches de Fresa · pastel entero', unit: ['cakes', 'pasteles'] },
  { id: 'cake-chocolate', category: 'Cuban Food', en: 'Tres leches de Chocolate · whole cake', es: 'Tres leches de Chocolate · pastel entero', unit: ['cakes', 'pasteles'] },
  // Sauces. `addon: true` keeps them out of the browse list and into the suggestion strip — a
  // sauce is something you are offered once there is food in the cart, not a category you shop.
  { id: 'dip-signature', category: 'Cuban Food', addon: true, en: 'Añejo Signature Sauce', es: 'Salsa Añejo Signature', unit: ['servings', 'porciones'] },
  { id: 'dip-ajo', category: 'Cuban Food', addon: true, en: 'Ajo Cítrico', es: 'Ajo Cítrico', unit: ['servings', 'porciones'] },
  { id: 'dip-cilantro', category: 'Cuban Food', addon: true, en: 'Cilantro Lime Crema', es: 'Crema de Cilantro y Limón', unit: ['servings', 'porciones'] },
  { id: 'dip-pineapple', category: 'Cuban Food', addon: true, en: 'Pineapple Chile', es: 'Piña con Chile', unit: ['servings', 'porciones'] },
  { id: 'dip-spicy', category: 'Cuban Food', addon: true, en: 'Spicy Añejo Aioli', es: 'Alioli Añejo Picante', unit: ['servings', 'porciones'] },
  { id: 'dip-spinach', category: 'Cuban Food', addon: true, en: 'Spinach Goodness', es: 'Spinach Goodness', unit: ['servings', 'porciones'] },
  { id: 'dip-chimi', category: 'Cuban Food', addon: true, en: 'Chimichurri Vital', es: 'Chimichurri Vital', unit: ['servings', 'porciones'] },
  { id: 'dip-golden', category: 'Cuban Food', addon: true, en: 'Golden Turmeric', es: 'Golden Turmeric', unit: ['servings', 'porciones'] },
  { id: 'dip-mango', category: 'Cuban Food', addon: true, en: 'Mango Omega', es: 'Mango Omega', unit: ['servings', 'porciones'] },
  { id: 'dip-avocado', category: 'Cuban Food', addon: true, en: 'Aguacate Cilantro', es: 'Aguacate Cilantro', unit: ['servings', 'porciones'] },
  { id: 'dip-light', category: 'Cuban Food', addon: true, en: 'Añejo Light Dressing', es: 'Aderezo Añejo Light', unit: ['servings', 'porciones'] },
  { id: 'dip-coconut', category: 'Cuban Food', addon: true, en: 'Coconut Dressing', es: 'Aderezo de Coco', unit: ['servings', 'porciones'] },
  { id: 'cajita-standard', category: 'Individual Cajitas', en: 'Standard La Cajita · all six items', es: 'La Cajita estándar · los seis productos', unit: ['boxes', 'cajitas'] },
  { id: 'cajita-custom', category: 'Individual Cajitas', en: 'Personalized La Cajita · specify changes below', es: 'La Cajita personalizada · indica los cambios abajo', unit: ['boxes', 'cajitas'] },
  ...['Añejo Fit Menu', 'Cuban Food', 'Individual Cajitas'].map((category, i) => ({ id: `custom-${i}`, category, en: 'Other custom request · describe below', es: 'Otra solicitud personalizada · describe abajo', unit: ['servings / boxes', 'porciones / cajitas'], custom: true })),
];
