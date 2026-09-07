import * as THREE from "three";

// Deterministic, deliberately stylised fallback food models. They are kept small so a
// Cajita can render several items without turning the preview into a geometry benchmark.
const C = {
  bread: 0xd99a42,
  toast: 0xf2c266,
  filling: 0x7d3b20,
  pastry: 0xd88935,
  crumb: 0x9b5a2b,
  cream: 0xfff5df,
  salad: 0xf0d8a2,
  grape: 0x72a84b,
  ham: 0xd66f72,
  cheese: 0xf5c85d,
  guava: 0x9e2631,
  pineapple: 0xe9b63e,
  skewer: 0x916a3e,
  clear: 0xffffff,
};

function mat(color, roughness = 0.48, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    ...opts,
  });
}
function pick(opts, key, fallback) {
  const fn = opts[`pick${key[0].toUpperCase()}${key.slice(1)}`];
  const value = typeof fn === "function" ? fn(key, fallback) : fn;
  return value == null ? fallback : value;
}
function roundedBox(size, material, radius = 0.1, bevel = 3) {
  const [x, y, z] = size;
  const shape = new THREE.Shape();
  const r = Math.min(radius, x / 2, z / 2);
  shape.moveTo(-x / 2 + r, -z / 2);
  shape.lineTo(x / 2 - r, -z / 2);
  shape.quadraticCurveTo(x / 2, -z / 2, x / 2, -z / 2 + r);
  shape.lineTo(x / 2, z / 2 - r);
  shape.quadraticCurveTo(x / 2, z / 2, x / 2 - r, z / 2);
  shape.lineTo(-x / 2 + r, z / 2);
  shape.quadraticCurveTo(-x / 2, z / 2, -x / 2, z / 2 - r);
  shape.lineTo(-x / 2, -z / 2 + r);
  shape.quadraticCurveTo(-x / 2, -z / 2, -x / 2 + r, -z / 2);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: y,
    bevelEnabled: true,
    bevelSegments: bevel,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    curveSegments: 4,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y / 2, 0);
  return new THREE.Mesh(g, material);
}
function sphere(r, material, scale = [1, 1, 1]) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), material);
  m.scale.set(...scale);
  return m;
}
function item(group, mesh, x, y, z, componentId) {
  mesh.position.set(x, y, z);
  if (componentId) mesh.userData.componentId = componentId;
  group.add(mesh);
  return mesh;
}
function finish(group, opts, label = "") {
  group.userData.cajitaLabel = label;
  group.userData.pickColor = opts.pickColor;
  group.userData.pickShape = opts.pickShape;
  return group;
}
function skewer(group, opts) {
  const wood = mat(0xb98b55, 0.72);
  const p = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 1.15, 8),
    wood,
  );
  p.rotation.z = Math.PI / 2;
  p.position.y = 0.57;
  group.add(p);
  const shape = pick(opts, "shape", "circle");
  const m = mat(C.cream, 0.38);
  let flag;
  const s = new THREE.Shape();
  if (shape === "heart") {
    s.moveTo(0, -0.09);
    s.bezierCurveTo(-0.18, 0.02, -0.13, 0.13, 0, 0.19);
    s.bezierCurveTo(0.13, 0.13, 0.18, 0.02, 0, -0.09);
  } else if (shape === "star") {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5,
        r = i % 2 ? 0.055 : 0.105;
      if (!i) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    s.closePath();
  } else if (shape === "flower") {
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8,
        r = i % 2 ? 0.065 : 0.105;
      if (!i) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    s.closePath();
  } else {
    s.absarc(0, 0, 0.095, 0, Math.PI * 2);
  }
  flag = new THREE.Mesh(new THREE.ShapeGeometry(s), m);
  flag.position.set(0.55, 0.57, 0);
  flag.rotation.y = Math.PI / 2;
  group.add(flag);
  const texture = pick(opts, "texture", null);
  if (texture) {
    flag.material.map = texture;
    flag.material.userData.externalTexture = true;
    flag.material.needsUpdate = true;
  }
}

function sandwich(opts) {
  const g = new THREE.Group();
  const bread = mat(C.bread, 0.42);
  const dark = mat(C.filling, 0.7);
  item(g, sphere(0.53, bread, [1.25, 0.34, 0.78]), 0, 0.51, 0);
  item(g, roundedBox([1.18, 0.1, 0.7], dark, 0.08), 0, 0.37, 0);
  item(g, sphere(0.51, mat(C.toast, 0.4), [1.2, 0.25, 0.74]), 0, 0.25, 0);
  return finish(g, opts, "sandwich");
}
function empanada(opts) {
  const g = new THREE.Group();
  const m = mat(C.pastry, 0.66);
  const s = new THREE.Shape();
  s.moveTo(-0.62, 0);
  s.quadraticCurveTo(0, -0.62, 0.62, 0);
  s.quadraticCurveTo(0, 0.3, -0.62, 0);
  const e = new THREE.ExtrudeGeometry(s, {
    depth: 0.35,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.035,
    bevelThickness: 0.035,
  });
  e.rotateX(Math.PI / 2);
  const body = new THREE.Mesh(e, m);
  body.position.y = 0.25;
  g.add(body);
  for (let i = -3; i <= 3; i++)
    item(
      g,
      new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 5, 8, Math.PI), m),
      i * 0.13,
      0.31 + 0.12 * Math.cos(i),
      -0.18,
    );
  return finish(g, opts, "empanada");
}
function croqueta(opts) {
  const g = new THREE.Group();
  const m = mat(C.crumb, 0.9);
  item(g, sphere(0.42, m, [1.1, 0.68, 0.68]), 0, 0.34, 0);
  for (let i = 0; i < 12; i++) {
    const p = sphere(0.028, mat(0x6f391f, 0.95), [1.4, 0.7, 1]);
    item(
      g,
      p,
      -0.3 + (i % 4) * 0.2,
      0.48 + (i % 3) * 0.05,
      -0.18 + (i % 4) * 0.1,
    );
  }
  return finish(g, opts, "croqueta");
}
function salad(opts) {
  const g = new THREE.Group();
  const glass = mat(C.clear, 0.08, {
    transparent: true,
    opacity: 0.22,
    roughness: 0.08,
  });
  item(g, sphere(0.4, glass, [1, 0.8, 1]), 0, 0.39, 0);
  const fill = mat(C.salad, 0.58);
  item(g, sphere(0.34, fill, [1, 0.45, 1]), 0, 0.36, 0);
  for (let i = 0; i < 7; i++)
    item(
      g,
      sphere(
        0.07,
        mat([0xd6ab73, 0x9eae60, 0xf4e1ad][i % 3], 0.7),
        [1.3, 0.7, 0.9],
      ),
      -0.23 + (i % 3) * 0.22,
      0.53 + (i % 2) * 0.06,
      -0.18 + ((i * 2) % 3) * 0.16,
    );
  return finish(g, opts, "salad");
}
function grazing(opts) {
  const g = new THREE.Group();
  item(g, sphere(0.16, mat(C.grape, 0.35)), -0.28, 0.3, 0);
  item(g, sphere(0.18, mat(C.ham, 0.5), [0.7, 1.2, 1]), -0.03, 0.3, 0);
  item(
    g,
    roundedBox([0.3, 0.22, 0.28], mat(C.cheese, 0.45), 0.04),
    0.22,
    0.28,
    0,
  );
  item(g, sphere(0.13, mat(C.guava, 0.4)), 0.38, 0.3, 0);
  skewer(g, opts);
  return finish(g, opts, "grazing");
}
function tresLeches(opts) {
  const g = new THREE.Group();
  const glass = mat(C.clear, 0.06, { transparent: true, opacity: 0.2 });
  item(g, sphere(0.4, glass, [0.8, 1, 0.8]), 0, 0.38, 0);
  item(g, sphere(0.32, mat(0xf4d7b2, 0.35), [0.9, 0.55, 0.9]), 0, 0.33, 0);
  item(g, sphere(0.25, mat(C.cream, 0.3), [1, 0.4, 1]), 0, 0.68, 0);
  return finish(g, opts, "tres-leches");
}
function skewerFood(opts) {
  const g = new THREE.Group();
  item(g, sphere(0.14, mat(C.grape, 0.35)), -0.3, 0.34, 0, "grape");
  const ham = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.055, 8, 14, Math.PI * 1.35),
    mat(C.ham, 0.55),
  );
  ham.rotation.x = Math.PI / 2;
  item(g, ham, -0.05, 0.34, 0, "ham");
  item(
    g,
    roundedBox([0.23, 0.2, 0.2], mat(C.cheese, 0.4), 0.03),
    0.18,
    0.3,
    0,
    "cheese",
  );
  item(g, sphere(0.12, mat(C.guava, 0.4)), 0.38, 0.31, 0, "guava");
  item(
    g,
    roundedBox([0.22, 0.18, 0.2], mat(C.pineapple, 0.45), 0.03),
    0.58,
    0.31,
    0,
    "pineapple",
  );
  skewer(g, opts);
  return finish(g, opts, "skewer");
}

const BUILDERS = {
  sandwich,
  empanada,
  croqueta,
  salad,
  grazing,
  "tres-leches": tresLeches,
  skewer: skewerFood,
};
export function createFoodModel(id, options = {}) {
  const builder = BUILDERS[id];
  if (!builder) throw new Error(`Unknown Cajita food model: ${id}`);
  const g = builder(options);
  g.scale.setScalar(0.82);
  return g;
}
export function disposeFoodModel(root) {
  if (!root) return;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    materials.forEach((m) => {
      if (m?.map && !m.userData?.externalTexture) m.map.dispose();
      if (m?.normalMap && !m.userData?.externalTexture) m.normalMap.dispose();
      m?.dispose();
    });
  });
}
