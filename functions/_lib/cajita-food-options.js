// Owner-confirmed options: stable IDs for storage, bilingual display labels.
export const CAJITA_FLAVORS = {
  sandwich: [['ham-spread', 'Ham spread', 'Pasta de jamón'], ['tuna-spread', 'Tuna spread', 'Pasta de atún']],
  empanada: [['guava-cheese', 'Guava and cheese', 'Guayaba y queso'], ['cheese', 'Cheese', 'Queso'], ['ham', 'Ham', 'Jamón'], ['tuna', 'Tuna', 'Atún'], ['chicken', 'Chicken', 'Pollo'], ['beef', 'Beef', 'Carne de res'], ['ham-cheese', 'Ham and cheese', 'Jamón y queso'], ['guava', 'Guava', 'Guayaba'], ['ropa-vieja', 'Ropa vieja', 'Ropa vieja'], ['pulled-pork', 'Pulled pork', 'Cerdo desmenuzado']],
  croqueta: [['ham', 'Ham', 'Jamón'], ['chorizo', 'Chorizo', 'Chorizo'], ['sausage', 'Sausage', 'Salchicha'], ['chicken', 'Chicken', 'Pollo'], ['tuna', 'Tuna', 'Atún'], ['beef', 'Beef', 'Carne de res']],
};
export const CAJITA_DEFAULT_FLAVORS = { sandwich: 'ham-spread', empanada: 'guava-cheese', croqueta: 'ham' };
export function flavorLabel(id, flavor, lang = 'en') {
  const entry = CAJITA_FLAVORS[id]?.find((option) => option[0] === flavor);
  return entry ? entry[lang === 'es' ? 2 : 1] : '';
}
