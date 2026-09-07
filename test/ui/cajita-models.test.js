import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFoodModel, disposeFoodModel } from '../../src/cajita/food-models.js';
import { foods, presets, newVariant, totals } from '../../src/cajita/catalog.js';

const standard = foods.filter((f) => f.id !== 'skewer').map((f) => f.id);

function meshes(root) { const out = []; root.traverse((o) => { if (o.isMesh) out.push(o); }); return out; }

test('all standard food models are finite, dimensional, and compact', () => {
  let triangles = 0;
  for (const id of [...standard, 'skewer']) {
    const root = createFoodModel(id);
    const box = new THREE.Box3().setFromObject(root);
    assert.ok(box.min.toArray().every(Number.isFinite), `${id} min bounds`);
    assert.ok(box.max.toArray().every(Number.isFinite), `${id} max bounds`);
    assert.ok(box.getSize(new THREE.Vector3()).toArray().every((n) => n > 0), `${id} has volume`);
    assert.ok(box.max.x - box.min.x <= 1.4 && box.max.z - box.min.z <= 1.2, `${id} fits footprint`);
    for (const mesh of meshes(root)) triangles += mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3;
    disposeFoodModel(root);
  }
  assert.ok(triangles > 100 && triangles < 20000, `standard six + skewer triangle budget: ${triangles}`);
});

test('theme pickColor does not recolor food materials', () => {
  const before = meshes(createFoodModel('sandwich')).map((m) => m.material.color.getHex());
  const themed = createFoodModel('sandwich', { pickColor: () => '#00ff00' });
  assert.deepEqual(meshes(themed).map((m) => m.material.color.getHex()), before);
  disposeFoodModel(themed);
});

test('skewer exposes the required food components', () => {
  const root = createFoodModel('skewer');
  const ids = new Set(meshes(root).map((m) => m.userData.componentId).filter(Boolean));
  assert.deepEqual([...ids].sort(), ['cheese', 'grape', 'guava', 'ham', 'pineapple']);
  disposeFoodModel(root);
});

test('external pickTexture remains caller-owned during disposal', () => {
  const texture = new THREE.Texture(); let disposed = 0; texture.dispose = () => { disposed += 1; };
  const root = createFoodModel('skewer', { pickTexture: () => texture });
  disposeFoodModel(root);
  assert.equal(disposed, 0);
});

test('catalog supports standard six and no-dessert 20/10 quantities with valid theme colors', () => {
  const a = newVariant(); const b = newVariant();
  a.id = 'standard'; a.quantity = 20; b.id = 'no-dessert'; b.quantity = 10;
  b.items = b.items.map((item) => item.id === 'tres-leches' ? { ...item, quantity: 0 } : item);
  assert.equal(totals({ variants: [a, b] }).boxes, 30);
  assert.equal(totals({ variants: [a, b] }).items['tres-leches'], 20);
  assert.equal(presets.length, 20);
  for (const preset of presets) for (const color of Object.values(preset.colors)) assert.match(color, /^#[0-9a-f]{6}$/i);
});
