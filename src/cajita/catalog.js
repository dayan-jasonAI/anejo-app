export const foods = [
  { id: 'sandwich', name: 'Mini sandwich', detail: 'Your Añejo sandwich. Tell us about filling requests in your notes.' },
  { id: 'empanada', name: 'Empanada', detail: 'Golden pastry, made for your celebration.' },
  { id: 'croqueta', name: 'Croqueta', detail: 'A crisp, savory Cuban favorite.' },
  { id: 'salad', name: 'Party salad', detail: 'An individually portioned creamy salad.' },
  { id: 'grazing', name: 'Grazing bites', detail: 'A little sweet, a little savory.' },
  { id: 'tres-leches', name: 'Tres leches', detail: 'Included in the classic Cajita. Remove it if you prefer.' },
  { id: 'skewer', name: 'Fruit & ham skewer', detail: 'Grape, ham, guava, cheese and pineapple. With a themed pick.' },
];
const palette = (background, liner, logo, accent) => ({ background, box: '#ffffff', liner, label: '#fffaf0', tag: '#fffaf0', logo, ribbon: accent, pick: accent });
export const presets = [
  ['signature', 'Añejo Signature', '#e8e5dc', '#1a3d2e', '#8b6b3e', '#c6a85b', 'botanical'],
  ['gender-reveal', 'Gender reveal', '#eeded9', '#bad5e8', '#72503e', '#eaa9bc', 'hearts'],
  ['birthday', 'Birthday', '#f1e0e7', '#e4acc4', '#9a4869', '#c6a85b', 'flowers'],
  ['halloween', 'Halloween', '#ded3e8', '#3c2059', '#532d70', '#ef8c30', 'fall'],
  ['christmas', 'Christmas', '#e3e7df', '#22493c', '#8b2439', '#c6a85b', 'stars'],
  ['hanukkah', 'Hanukkah', '#e0eaf3', '#1d4875', '#21476a', '#bcc8d4', 'stars'],
  ['new-year', 'New Year / New Year’s Eve', '#e4ddd2', '#1a1a1a', '#8b6b3e', '#c6a85b', 'stars'],
  ['valentine', 'Valentine’s Day', '#f1d9dd', '#ca7c91', '#7b2947', '#e3aaad', 'hearts'],
  ['easter', 'Easter', '#ede8f0', '#c7b5d6', '#687e58', '#e5cb73', 'flowers'],
  ['mother', 'Mother’s Day', '#efe0e7', '#d5a9bb', '#884966', '#c6a85b', 'flowers'],
  ['father', 'Father’s Day', '#e2e5df', '#294a46', '#8b6b3e', '#be9459', 'botanical'],
  ['veterans', 'Veterans Day', '#e4e3de', '#244367', '#932f3e', '#c6a85b', 'stars'],
  ['independence', 'Independence Day', '#e6e9ee', '#315780', '#ae344a', '#e1ac68', 'stars'],
  ['labor', 'Labor Day', '#e6e4df', '#314c6b', '#962f44', '#c6a85b', 'stars'],
  ['thanksgiving', 'Thanksgiving', '#ece0ce', '#92643d', '#684428', '#c2803e', 'fall'],
  ['quince', 'Quinceañera / 15th birthday', '#ece1eb', '#b69ac7', '#8b6b3e', '#c6a85b', 'flowers'],
  ['sweet16', 'Sweet sixteen', '#eadfe7', '#d59dc0', '#643b75', '#c6a85b', 'stars'],
  ['special', 'Special occasion', '#e5e9e1', '#1a3d2e', '#8b6b3e', '#c6a85b', 'botanical'],
  ['just-because', 'Just because', '#f0e9dc', '#d7c99d', '#526647', '#c6a85b', 'flowers'],
  ['custom', 'Your own theme', '#e8e5dc', '#1a3d2e', '#8b6b3e', '#c6a85b', 'none'],
].map(([id, name, ...p]) => ({ id, name, colors: palette(...p), pattern: p[4] }));
export function newVariant() {
  return { id: crypto.randomUUID(), name: 'Classic Cajita', quantity: 1,
    items: foods.map(({id}) => ({ id, quantity: id === 'skewer' ? 0 : 1 })),
    theme: { preset: 'signature', name: 'Añejo Signature', colors: {...presets[0].colors}, pattern: 'botanical', pickShape: 'circle', prompt: '', artworkAttachmentId: null },
    personalization: { labelText: 'La Cajita', tagText: 'Hecho con amor', pickText: '', artworks: [], textPlacements: ['label','tag','pick'].map(surface => ({surface, x: .5, y: .83, scale: 1, rotation: 0})) },
    notes: '', packagingRequest: '',
  };
}
export function totals(config) {
  return { boxes: config.variants.reduce((n,v) => n + v.quantity,0),
    items: Object.fromEntries(foods.map(({id}) => [id, config.variants.reduce((n,v) => n + v.quantity * (v.items.find(i=>i.id===id)?.quantity || 0), 0)])) };
}
export const clone = (value) => JSON.parse(JSON.stringify(value));
