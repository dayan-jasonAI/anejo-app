import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createFoodModel, disposeFoodModel } from "./food-models.js";
import { paintSurface, decoration } from "./artwork.js";

export function createScene(host, selectItem) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 7;
  controls.maxDistance = 24;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.target.set(0, 0.3, 0);
  controls.enablePan = false;
  const pmrem = new THREE.PMREMGenerator(renderer),
    room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04);
  scene.environment = env.texture;
  room.dispose();
  pmrem.dispose();
  scene.environmentIntensity = 0.6;
  renderer.toneMappingExposure = 0.9;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x89917f, 1));
  const key = new THREE.DirectionalLight(0xfff4de, 2);
  key.position.set(3, 9, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -9;
  key.shadow.camera.right = 9;
  key.shadow.camera.top = 9;
  key.shadow.camera.bottom = -9;
  key.shadow.normalBias = 0.04;
  scene.add(key);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.ShadowMaterial({ opacity: 0.15 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  scene.add(floor);
  let group,
    food = [],
    lid,
    closed = false,
    animations = [],
    textures = [],
    frames = 0,
    contextLost = false;
  let reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function reset() {
    camera.position.set(7.3, 8.6, 9.7);
    controls.target.set(0, 0.25, 0);
    controls.update();
  }
  reset();
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();
  function box(w, h, d, material, x = 0, y = 0, z = 0, parent = group) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function texture(surface, v, assets) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 640;
    paintSurface(canvas, v, surface, assets);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    textures.push(t);
    return t;
  }
  function clear() {
    if (!group) return;
    scene.remove(group);
    food.forEach(disposeFoodModel);
    food = [];
    group.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material?.dispose();
      }
    });
    textures.forEach((t) => t.dispose());
    textures = [];
    animations = [];
  }
  function update(v, assets, animate = false) {
    const itemTotal = v.items.reduce((n, i) => n + i.quantity, 0);
    if (contextLost) return { total: itemTotal, shown: 0 };
    clear();
    group = new THREE.Group();
    scene.add(group);
    host.style.backgroundColor = v.theme.colors.background;
    const total = v.items.reduce((n, i) => n + i.quantity, 0),
      shown = Math.min(total, 28),
      cols = Math.max(3, Math.ceil(Math.sqrt(shown * 1.45))),
      rows = Math.max(2, Math.ceil(shown / cols));
    // Confirmed Leafiew B0D1CB87P2 footprint. Food models are illustrative,
    // not dimensioned products: never imply that unlimited items physically fit.
    const w = 7, d = 5;
    const cellX = (w - 0.4) / cols, cellZ = (d - 0.4) / rows;
    const foodScale = Math.min(1.85, cellX / 1.25, cellZ / 1.1);
    const clearMat = new THREE.MeshPhysicalMaterial({
      color: v.theme.colors.box,
      roughness: 0.15,
      metalness: 0,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
      clearcoat: 1,
    });
    const rim = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.25,
      transparent: true,
      opacity: 0.75,
    });
    const paper = new THREE.MeshStandardMaterial({ color: v.theme.colors.box, roughness: 0.9 });
    box(w, 0.09, d, paper, 0, 0.04);
    box(w, 0.77, 0.035, paper, 0, 0.46, -d / 2);
    box(w, 0.77, 0.035, paper, 0, 0.46, d / 2);
    box(0.035, 0.77, d, paper, -w / 2, 0.46);
    box(0.035, 0.77, d, paper, w / 2, 0.46);
    for (const z of [-d / 2, d / 2]) box(w, 0.035, 0.035, rim, 0, 0.86, z);
    for (const x of [-w / 2, w / 2]) box(0.035, 0.035, d, rim, x, 0.86);
    const liner = document.createElement("canvas");
    liner.width = liner.height = 640;
    const lc = liner.getContext("2d");
    lc.fillStyle = v.theme.colors.liner;
    lc.fillRect(0, 0, 640, 640);
    const bg = assets.get(v.theme.artworkAttachmentId)?.image;
    if (bg) {
      lc.globalAlpha = 0.4;
      lc.drawImage(bg, 0, 0, 640, 640);
      lc.globalAlpha = 1;
    }
    decoration(lc, v.theme.pattern, v.theme.colors.label);
    const lt = new THREE.CanvasTexture(liner);
    lt.colorSpace = THREE.SRGBColorSpace;
    textures.push(lt);
    const lm = new THREE.MeshStandardMaterial({ map: lt, roughness: 1 });
    box(w - 0.12, 0.035, d - 0.12, lm, 0, 0.105);
    const pickTex = texture("pick", v, assets);
    let idx = 0;
    for (const item of v.items) {
      for (let n = 0; n < item.quantity && idx < 28; n++, idx++) {
        const model = createFoodModel(item.id, {
          flavor: item.flavor,
          pickColor: v.theme.colors.pick,
          pickShape: v.theme.pickShape,
          pickText: v.personalization.pickText,
          pickTexture: pickTex,
        });
        const bounds = new THREE.Box3().setFromObject(model);
        const itemScale = Math.min(foodScale, 0.92 / (bounds.max.y - bounds.min.y));
        const restingY = 0.14 - bounds.min.y * itemScale;
        model.position.set(
          ((idx % cols) - (cols - 1) / 2) * cellX,
          restingY,
          (Math.floor(idx / cols) - (rows - 1) / 2) * cellZ,
        );
        model.scale.setScalar(itemScale);
        model.userData.itemId = item.id;
        model.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            o.userData.itemId = item.id;
          }
        });
        group.add(model);
        food.push(model);
        if (animate && !reduced) {
          animations.push({
            obj: model,
            target: restingY,
            scale: itemScale,
            start: performance.now() + idx * 85,
          });
          model.position.y = 3.4;
          model.scale.setScalar(0.01);
        }
      }
    }
    lid = new THREE.Group();
    group.add(lid);
    box(w + 0.06, 0.045, d + 0.06, clearMat, 0, 0, 0, lid);
    const label = new THREE.Mesh(
      new THREE.CircleGeometry(0.77, 64),
      new THREE.MeshStandardMaterial({
        map: texture("label", v, assets),
        transparent: true,
        roughness: 0.8,
        side: THREE.DoubleSide,
      }),
    );
    label.rotation.x = -Math.PI / 2;
    label.position.set(0.35, 0.03, 0);
    lid.add(label);
    const ribbon = new THREE.MeshStandardMaterial({
      color: v.theme.colors.ribbon,
      roughness: 0.85,
    });
    box(w + 0.1, 0.013, 0.018, ribbon, 0, 0.05, 0, lid);
    box(0.018, 0.013, d + 0.1, ribbon, 0, 0.055, 0, lid);
    const tag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.75, 1.07),
      new THREE.MeshStandardMaterial({
        map: texture("tag", v, assets),
        roughness: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    tag.rotation.set(-Math.PI / 2, 0, -0.23);
    tag.position.set(-w / 2 + 0.6, 0.075, d / 2 - 0.5);
    lid.add(tag);
    lid.position.set(
      closed ? 0 : w * 0.18,
      closed ? 1.14 : 2.8,
      closed ? 0 : -d * 0.49,
    );
    lid.rotation.x = closed ? 0 : 0.11;
    return { total, shown };
  }
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    contextLost = true;
    document.getElementById("scene-fallback").hidden = false;
    for (const id of ["lid", "reset-view", "replay"]) document.getElementById(id).disabled = true;
  });
  let down;
  renderer.domElement.addEventListener("pointerdown", (e) => {
    down = [e.clientX, e.clientY];
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6)
      return;
    const rect = renderer.domElement.getBoundingClientRect(),
      ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
    const hit = ray.intersectObjects(food, true)[0];
    if (hit?.object.userData.itemId) selectItem(hit.object.userData.itemId);
  });
  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden || contextLost) return;
    controls.update();
    for (const a of animations) {
      const t = Math.min(1, Math.max(0, (now - a.start) / 600)),
        k = 1 - Math.pow(1 - t, 3);
      a.obj.position.y = 3.4 + (a.target - 3.4) * k;
      a.obj.scale.setScalar(a.scale * Math.max(0.01, k));
    }
    animations = animations.filter((a) => now < a.start + 600);
    if (++frames % 2 === 0 || animations.length) renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
  return {
    update,
    reset,
    toggle() {
      closed = !closed;
      return closed;
    },
  };
}
