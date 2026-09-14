// Añejo — the deposit-confirmed gift reveal.
//
// Rendered ONLY on a quote whose deposit has actually been paid AND that carries a gift in its
// quote_json. Both conditions are checked server-side in functions/q/[token].js; this file has no
// say in whether it runs, which is deliberate — the gate is not something a customer can reach.
//
// three.js r128 is the pinned runtime. Do not use any API newer than that: CapsuleGeometry (r141)
// was used here once and threw on load, which left an attached-but-never-rendered canvas painting
// solid black with no error anywhere. The symbol list in the guard below is the check that would
// have caught it.
(function () {
  const fail = (what) => {
    const s = document.getElementById('cr-stage');
    if (s) {
      s.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;' +
        'justify-content:center;padding:28px;text-align:center;font-family:Georgia,serif;' +
        'font-size:15px;line-height:1.6;color:#8A7B63;background:#F7F2E7">' +
        'The animation could not start on this device.<br><span style="font-size:12px;opacity:.8">' +
        String(what).replace(/[<>]/g, '') + '</span></div>';
    }
  };
  if (typeof THREE === 'undefined') { fail('three.js did not load'); return; }
  // Every three.js symbol this page depends on, checked once against the version that actually
  // loaded. A build that is missing one of these is a version mismatch, not a broken browser, and
  // it should say so rather than paint an unrendered canvas black.
  const NEEDS = ['WebGLRenderer', 'Scene', 'PerspectiveCamera', 'PMREMGenerator', 'CanvasTexture',
    'CatmullRomCurve3', 'BufferGeometry', 'Float32BufferAttribute', 'CylinderGeometry',
    'SphereGeometry', 'CircleGeometry', 'TorusGeometry', 'BoxGeometry', 'PlaneGeometry',
    'HemisphereLight', 'DirectionalLight', 'PointLight', 'MeshStandardMaterial',
    'MeshBasicMaterial', 'Group', 'Vector3', 'Color', 'Fog'];
  const missing = NEEDS.filter((k) => typeof THREE[k] === 'undefined');
  if (missing.length) { fail('this three.js build is missing ' + missing.join(', ')); return; }
  try {
  const stage = document.getElementById('cr-stage');
  const host = document.getElementById('cr-root');
  const beat = document.getElementById('cr-beat');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Whose gift this is, and which language to say it in. Read off the container the server
  // rendered, so this file is identical for every customer and holds no one's data.
  const GIFT_NAME = (host && host.dataset.name) || '';
  const GIFT_LANG = (host && host.dataset.lang) === 'es' ? 'es' : 'en';

  // Her invitation's palette, plus the two reds that carry the whole reveal.
  const IVORY = 0xfbf7ee, PARCH = 0xefe6d4, GOLD = 0xb0904f, GOLD_LT = 0xd8c48a;
  const CRIMSON = 0xb31e28, CRIMSON_LT = 0xd8404a;
  const BERRY = 0xe33a3a, GLAZE = 0xa81622, SPONGE = 0xe8c98e, FOIL = 0xc9c9c9, LEAF = 0x4e7a3a;
  const BLUSH = 0xf0d9cf;

  // ---------------------------------------------------------------- colour management
  //
  // Everything below is what separates a render from a photograph, and none of it is geometry.
  //
  // three.js multiplies light in LINEAR space but a hex colour picked by eye is sRGB. Feeding
  // sRGB values straight in makes mid-tones sit too bright and kills the roll-off into highlights
  // — the flat, plasticky look. Every colour in this scene is converted once, here, and the
  // renderer encodes back to sRGB on the way out.
  const C = (hex) => new THREE.Color(hex).convertSRGBToLinear();

  // A studio, not a gradient. Reflections are most of what tells you a surface is foil, satin or
  // paper, and a flat vertical ramp reflects as a flat vertical ramp — which is why the first
  // version's metal read as painted plastic. This paints an equirectangular environment with two
  // actual softboxes in it: a big key above and to the left, a smaller fill opposite, a warm
  // bounce off the table. Those are the shapes you see travelling across the glaze and the pan.
  function studioEnv(rendererRef) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const g = c.getContext('2d');

    const sky = g.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0.00, '#cfc7b6');
    sky.addColorStop(0.45, '#a89e8b');
    sky.addColorStop(0.52, '#8d8474');
    sky.addColorStop(1.00, '#5f584c');
    g.fillStyle = sky; g.fillRect(0, 0, 1024, 512);

    // Soft-edged light sources. The ellipse gradients are the highlight shapes that will slide
    // across every curved surface as the box turns.
    const box = (x, y, rx, ry, peak) => {
      const rad = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      rad.addColorStop(0, peak);
      rad.addColorStop(0.55, 'rgba(255,252,244,0.18)');
      rad.addColorStop(1, 'rgba(255,252,244,0)');
      g.save(); g.translate(x, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
      g.translate(-x, -y); g.fillStyle = rad;
      g.fillRect(x - rx * 2, y - ry * 2, rx * 4, ry * 4); g.restore();
    };
    box(300, 110, 210, 110, 'rgba(255,255,255,1)');    // key, upper left
    box(770, 165, 120, 80, 'rgba(255,250,238,0.55)');  // fill, upper right
    box(520, 435, 300, 55, 'rgba(255,236,208,0.3)');   // warm bounce off the table

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.encoding = THREE.sRGBEncoding;
    const pmrem = new THREE.PMREMGenerator(rendererRef);
    pmrem.compileEquirectangularShader();
    const env = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose(); tex.dispose();
    return env;
  }

  // ---------------------------------------------------------------- procedural surface detail
  //
  // No external images are allowed here (the page ships as one file), so every texture is drawn
  // to a canvas at load. Bump maps are doing most of the work: a perfectly smooth surface is the
  // single loudest "this is CGI" signal, and real food, paper and metal are none of them smooth.
  function canvasTex(w, h, draw, { repeat = 1, encoding = null } = {}) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    if (encoding) t.encoding = encoding;
    return t;
  }

  const noise = (g, w, h, amount, size) => {
    for (let i = 0; i < (w * h) / (size * size) * amount; i++) {
      const v = 120 + Math.random() * 135;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(Math.random() * w, Math.random() * h, size, size);
    }
  };

  // Strawberry achenes — the seeds. Sunken pits in a quincunx-ish scatter, which is the texture
  // your eye actually uses to recognise a strawberry at a glance.
  const berryBump = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#8c8c8c'; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 26; row++) {
      for (let col = 0; col < 30; col++) {
        const x = (col + (row % 2 ? 0.5 : 0)) * (w / 30) + (Math.random() - 0.5) * 5;
        const y = row * (h / 26) + (Math.random() - 0.5) * 5;
        const r = 3.4 + Math.random() * 1.6;
        const pit = g.createRadialGradient(x, y, 0, x, y, r * 2.4);
        pit.addColorStop(0, '#2c2c2c');
        pit.addColorStop(0.45, '#6e6e6e');
        pit.addColorStop(0.7, '#d8d8d8');   // the raised lip around each seed
        pit.addColorStop(1, '#8c8c8c');
        g.fillStyle = pit;
        g.beginPath(); g.ellipse(x, y, r * 2.4, r * 1.9, 0, 0, 6.3); g.fill();
      }
    }
  });

  // Berry colour: never one flat red. Ripe shoulders, a paler unripe blush, and the seeds picking
  // up a yellow-gold the way they do on a real fruit.
  const berryMap = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d4232c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 24 + Math.random() * 70;
      const blot = g.createRadialGradient(x, y, 0, x, y, r);
      const deep = Math.random() > 0.45;
      blot.addColorStop(0, deep ? 'rgba(150,16,24,0.5)' : 'rgba(236,90,70,0.42)');
      blot.addColorStop(1, 'rgba(212,35,44,0)');
      g.fillStyle = blot; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
    }
    for (let row = 0; row < 26; row++) {
      for (let col = 0; col < 30; col++) {
        const x = (col + (row % 2 ? 0.5 : 0)) * (w / 30), y = row * (h / 26);
        g.fillStyle = 'rgba(226,190,96,0.75)';
        g.beginPath(); g.ellipse(x, y, 3.2, 2.4, 0, 0, 6.3); g.fill();
      }
    }
  }, { encoding: THREE.sRGBEncoding });

  // Glaze gloss is uneven — that unevenness is the whole reason a glaze looks wet.
  const glazeRough = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 30 + Math.random() * 90;
      const pool = g.createRadialGradient(x, y, 0, x, y, r);
      pool.addColorStop(0, 'rgba(12,12,12,0.55)');
      pool.addColorStop(1, 'rgba(70,70,70,0)');
      g.fillStyle = pool; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
    }
    noise(g, w, h, 0.06, 2);
  });

  // Paper: fine fibre, plus the faint horizontal laid lines of a good gift box.
  const paperBump = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 0.85, 1);
    g.strokeStyle = 'rgba(150,150,150,0.16)'; g.lineWidth = 1;
    for (let y = 0; y < h; y += 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }, { repeat: 3 });

  // Satin: the sheen runs ALONG the ribbon. Fine striations in one direction are what make a
  // ribbon look woven instead of moulded.
  const satinRough = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4a4a4a'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 1) {
      const v = 40 + Math.random() * 55;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, 0, 1, h);
    }
  }, { repeat: 2 });

  // Foil: brushed, dented, slightly crumpled. Perfect metal is the giveaway.
  const foilBump = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const y = Math.random() * h;
      g.strokeStyle = `rgba(${Math.random() > 0.5 ? 210 : 40},${Math.random() > 0.5 ? 210 : 40},${Math.random() > 0.5 ? 210 : 40},0.25)`;
      g.lineWidth = 0.6 + Math.random();
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (Math.random() - 0.5) * 10); g.stroke();
    }
    noise(g, w, h, 0.25, 2);
  }, { repeat: 2 });

  // Sponge crumb, for the band of cake visible below the glaze.
  const spongeBump = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2200; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 1 + Math.random() * 3.5;
      const dark = Math.random() > 0.5;
      g.fillStyle = dark ? 'rgba(40,40,40,0.5)' : 'rgba(225,225,225,0.4)';
      g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
    }
  }, { repeat: 3 });

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // ACES is the film response curve: highlights roll off instead of clipping to flat white, which
  // is the difference between a lit render and a photograph. sRGB output then puts the linear
  // maths back into the space a screen actually shows.
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = studioEnv(renderer);
  scene.background = C(0xf7f2e7);
  scene.fog = new THREE.Fog(C(0xf7f2e7), 16, 34);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

  // Bright, warm and airy — the invitation is a high-key photograph, not a dark studio. The key is
  // soft and from the front-right, with a broad fill so the white box never falls to grey.
  // The environment map is now carrying most of the ambient, so the discrete lights are dialled
  // back and exist mainly to cast shadow and shape. Over-lighting on top of a real environment is
  // what flattens a scene out.
  scene.add(new THREE.HemisphereLight(C(0xfffaf0), C(0xded2b8), 0.18));
  const key = new THREE.DirectionalLight(C(0xfff4de), 1.55);
  key.position.set(4.2, 7.5, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 30;
  key.shadow.camera.left = -6.5; key.shadow.camera.right = 6.5;
  key.shadow.camera.top = 6.5; key.shadow.camera.bottom = -6.5;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  scene.add(key);
  const fill = new THREE.DirectionalLight(C(0xf2f6ff), 0.22);
  fill.position.set(-5.5, 2.5, 4.5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(C(0xffe4bd), 0.55);
  rim.position.set(-2.5, 4.5, -6.5);
  scene.add(rim);
  // Lights only the cake, and only once it is out — the reveal is lit differently from the box.
  const spot = new THREE.PointLight(C(0xfff0d2), 0, 12, 2);
  spot.position.set(0, 4.2, 2.2);
  scene.add(spot);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(16, 96),
    new THREE.MeshStandardMaterial({
      color: C(PARCH), roughness: 0.94, metalness: 0,
      bumpMap: paperBump, bumpScale: 0.012,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.02;
  floor.receiveShadow = true;
  scene.add(floor);

  // Ambient occlusion, faked. Light cannot reach the crease where an object meets the table, and
  // a shadow map alone does not darken it nearly enough — without this the box floats.
  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(4.2, 64),
    new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, opacity: 0.5,
      map: canvasTex(256, 256, (g, w, h) => {
        const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.clearRect(0, 0, w, h);
        r.addColorStop(0.00, 'rgba(64,52,34,0.85)');
        r.addColorStop(0.30, 'rgba(80,64,42,0.42)');
        r.addColorStop(0.55, 'rgba(110,92,62,0.12)');
        r.addColorStop(0.80, 'rgba(255,255,255,0)');
        r.addColorStop(1.00, 'rgba(255,255,255,0)');
        g.fillStyle = r; g.fillRect(0, 0, w, h);
      }),
      blending: THREE.MultiplyBlending,
    })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -1.014;
  scene.add(contact);

  const root = new THREE.Group();
  scene.add(root);

  // Coated art paper: matte, faintly fibrous, and NOT pure white — a white box photographs as a
  // warm off-white because it is lit by warm light bouncing off a warm table.
  const matBox = new THREE.MeshStandardMaterial({
    color: C(IVORY), roughness: 0.72, metalness: 0,
    bumpMap: paperBump, bumpScale: 0.006, envMapIntensity: 0.9,
  });
  const matBoxIn = new THREE.MeshStandardMaterial({
    color: C(0xdccfb4), roughness: 0.92, metalness: 0,
    bumpMap: paperBump, bumpScale: 0.008, envMapIntensity: 0.5,
  });
  // Foil-stamped gold: a real stamp is slightly rough, so the reflection smears rather than
  // mirroring. A perfectly polished gold reads as a video-game pickup.
  const matGold = new THREE.MeshStandardMaterial({
    color: C(0xc9a961), roughness: 0.32, metalness: 1,
    bumpMap: foilBump, bumpScale: 0.004, envMapIntensity: 1.3,
  });
  // Satin ribbon: the sheen is a narrow band that travels along the weave, which the striated
  // roughness map produces. Metalness stays at zero — satin is dyed fibre, not metal.
  const matSatin = new THREE.MeshStandardMaterial({
    color: C(CRIMSON), roughness: 0.42, metalness: 0,
    roughnessMap: satinRough, envMapIntensity: 1.25,
  });
  const matSatinLt = new THREE.MeshStandardMaterial({
    color: C(CRIMSON_LT), roughness: 0.36, metalness: 0,
    roughnessMap: satinRough, envMapIntensity: 1.35,
  });

  // ---- the box: four walls and a floor, genuinely open at the top ---------
  const W = 2.6, H = 1.6, WALL = 0.09;
  const base = new THREE.Group();
  base.position.y = -0.24;
  root.add(base);
  const inner = W - WALL * 2;
  for (const [sx, sz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const wall = new THREE.Mesh(
      sz ? new THREE.BoxGeometry(W, H, WALL) : new THREE.BoxGeometry(WALL, H, inner),
      matBox
    );
    wall.position.set(sx * (W - WALL) / 2, 0, sz * (W - WALL) / 2);
    wall.castShadow = true; wall.receiveShadow = true;
    base.add(wall);
  }
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(inner, WALL, inner), matBoxIn);
  bottom.position.y = -(H - WALL) / 2;
  bottom.receiveShadow = true;
  base.add(bottom);
  const cavity = new THREE.Mesh(new THREE.BoxGeometry(inner - 0.02, H - 0.12, inner - 0.02), matBoxIn);
  cavity.position.y = -0.27;
  root.add(cavity);
  for (const y of [-0.98, 0.5]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.03, y < 0 ? 0.05 : 0.03, W + 0.03), matGold);
    band.position.y = y;
    root.add(band);
  }

  // ---- the lid ------------------------------------------------------------
  const lid = new THREE.Group();
  lid.position.y = 0.56;
  root.add(lid);
  const lidBox = new THREE.Mesh(new THREE.BoxGeometry(W + 0.18, 0.36, W + 0.18), matBox);
  lidBox.castShadow = true;
  lid.add(lidBox);
  const lidTrim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.21, 0.04, W + 0.21), matGold);
  lidTrim.position.y = -0.16;
  lid.add(lidTrim);

  // ---- the ribbon and the BIG red bow ------------------------------------
  // Its own group so it can come off BEFORE the lid moves. A bow that unties after the lid opens
  // is the wrong beat — the untying IS the anticipation.
  const ribbon = new THREE.Group();
  root.add(ribbon);
  // Straps that LIE ON the box: 0.5 wide, 4cm proud of each surface, wrapping the lid and running
  // down all four sides to the table. Built face by face rather than as one slab through the
  // middle, which is what made the old one invisible from outside.
  const STRAP = 0.5, PROUD = 0.04;
  const LID_TOP = 0.76, BOX_HALF = (W + 0.18) / 2 + PROUD;
  const strapTopGeo = new THREE.BoxGeometry(STRAP, 0.05, BOX_HALF * 2);
  for (const rot of [0, Math.PI / 2]) {
    const top = new THREE.Mesh(strapTopGeo, matSatin);
    top.position.y = LID_TOP + 0.02;
    top.rotation.y = rot;
    top.castShadow = true;
    ribbon.add(top);
  }
  const sideGeo = new THREE.BoxGeometry(STRAP, LID_TOP + 1.02, 0.05);
  for (const [sx, sz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const side = new THREE.Mesh(sideGeo, matSatin);
    side.position.set(sx * BOX_HALF, (LID_TOP - 1.02) / 2, sz * BOX_HALF);
    side.rotation.y = sx ? Math.PI / 2 : 0;
    side.castShadow = true;
    ribbon.add(side);
  }

  // Big means big: six loops in two tiers, a fat knot, and long tails that reach the table.
  const bow = new THREE.Group();
  bow.position.y = LID_TOP + 0.42;
  bow.scale.setScalar(1.45);
  ribbon.add(bow);
  // REAL RIBBON IS A FLAT STRIP, NOT A TUBE.
  //
  // A torus has a circular cross-section, so however you squash it the silhouette stays a rounded
  // rod — which is why the previous bow read as glossy plastic tubing. This builds each loop as an
  // actual band: a teardrop path sampled along its length, two vertices emitted per sample across
  // the ribbon's width, and the width TAPERING TO NOTHING at the knot, which is what a tied loop
  // does when it is pinched. Double-sided, so you see the back face inside the loop like real
  // ribbon.
  function satinStrip(path, widthAt, twist = 0, closed = false) {
    const N = 110;
    const pos = [], uv = [], idx = [];
    const up = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = path.getPointAt(closed ? t % 1 : t);
      const tan = path.getTangentAt(closed ? t % 1 : t).normalize();
      // The width axis rides perpendicular to the path, rolled by `twist` so the band turns over
      // as it comes round — a loop that never twists looks stamped from sheet metal.
      const axis = new THREE.Vector3().crossVectors(tan, up).normalize();
      if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
      axis.applyAxisAngle(tan, Math.sin(t * Math.PI * 2) * twist);
      const w = widthAt(t) / 2;
      pos.push(p.x + axis.x * w, p.y + axis.y * w, p.z + axis.z * w);
      pos.push(p.x - axis.x * w, p.y - axis.y * w, p.z - axis.z * w);
      uv.push(t, 1, t, 0);
      if (i < N) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  const satinFace = matSatin.clone();  satinFace.side = THREE.DoubleSide;
  const satinFaceLt = matSatinLt.clone(); satinFaceLt.side = THREE.DoubleSide;

  // A loop: out from the knot, around, and back to the knot. Pinched at both ends.
  function loopPath(dir, reach, lift, depth) {
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(dir * reach * 0.45, lift * 0.75, depth * 0.5),
      new THREE.Vector3(dir * reach * 0.95, lift * 0.95, depth),
      new THREE.Vector3(dir * reach * 1.12, lift * 0.15, depth * 0.6),
      new THREE.Vector3(dir * reach * 0.72, -lift * 0.42, depth * 0.15),
      new THREE.Vector3(0, 0, 0),
    ], true, 'catmullrom', 0.35);
  }

  const tails = [];
  for (const d of [-1, 1]) {
    // Front pair — the big loops that carry the shape.
    const big = new THREE.Mesh(
      satinStrip(loopPath(d, 0.82, 0.62, 0.1), (t) => 0.34 * Math.pow(Math.sin(t * Math.PI), 0.42), 0.5, true),
      satinFace
    );
    big.castShadow = true;
    bow.add(big);

    // Back pair — smaller, turned away, giving the bow depth instead of reading as a flat sticker.
    const back = new THREE.Mesh(
      satinStrip(loopPath(d, 0.6, 0.5, -0.34), (t) => 0.27 * Math.pow(Math.sin(t * Math.PI), 0.42), 0.7, true),
      satinFaceLt
    );
    bow.add(back);

    // The tail: falls from the knot, kinks once, and ends in the V-notch a ribbon is cut with.
    const tail = new THREE.Group();
    const tailPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(d * 0.1, -0.42, 0.07),
      new THREE.Vector3(d * 0.26, -0.86, 0.02),
      new THREE.Vector3(d * 0.2, -1.28, -0.08),
    ]);
    const strip = new THREE.Mesh(
      satinStrip(tailPath, (t) => 0.26 * (1 - t * 0.12), 0.22),
      d > 0 ? satinFace : satinFaceLt
    );
    strip.castShadow = true;
    tail.add(strip);
    tail.position.set(d * 0.1, -0.02, 0.1);
    bow.add(tail);
    tails.push(tail);
  }

  // The knot: a short cushion of ribbon gathered across the middle. Everything else appears to
  // pass through it, which is what makes the separate loops read as one tied bow.
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.19, 40, 28), matSatinLt);
  knot.position.set(0, 0.03, 0.08);
  knot.scale.set(1.45, 0.86, 0.78);
  knot.castShadow = true;
  bow.add(knot);

  // ---- white florals around the base, from her invitation -----------------
  // Roses as tight layered petals, baby's breath as clusters of tiny spheres. Low-poly on purpose:
  // they read as the invitation's ivory crown at this scale without costing a thousand triangles.
  const matPetal = new THREE.MeshStandardMaterial({ color: C(0xfffdf8), roughness: 0.66, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 1.1 });
  const matPetalWarm = new THREE.MeshStandardMaterial({ color: C(0xf6ecdc), roughness: 0.7, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 1.1 });
  const matBud = new THREE.MeshStandardMaterial({ color: C(0xfffefb), roughness: 0.8, metalness: 0, envMapIntensity: 1.0 });
  const matStem = new THREE.MeshStandardMaterial({ color: C(0x6f8a5c), roughness: 0.85, metalness: 0, side: THREE.DoubleSide });

  function rose(r) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.42, 12, 10), matBud);
    g.add(core);
    for (let ring = 0; ring < 3; ring++) {
      const n = 5 + ring * 2;
      const rr = r * (0.55 + ring * 0.28);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.5;
        const p = new THREE.Mesh(
          new THREE.CircleGeometry(r * (0.42 + ring * 0.1), 7),
          ring % 2 ? matPetalWarm : matPetal
        );
        p.position.set(Math.cos(a) * rr * 0.72, ring * r * 0.12, Math.sin(a) * rr * 0.72);
        p.rotation.set(-Math.PI / 2 + 0.85 - ring * 0.22, 0, -a);
        p.castShadow = true;
        g.add(p);
      }
    }
    return g;
  }
  function babysBreath(n, spread) {
    const g = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.016 + Math.random() * 0.012, 6, 5), matBud);
      b.position.set((Math.random() - 0.5) * spread, Math.random() * spread * 0.7, (Math.random() - 0.5) * spread);
      g.add(b);
    }
    return g;
  }
  const florals = new THREE.Group();
  root.add(florals);
  const FLOWERS = [
    [-1.72, -0.86, 1.30, 0.30], [1.66, -0.88, 1.34, 0.25], [-1.90, -0.90, -0.42, 0.22],
    [1.92, -0.90, -0.30, 0.27], [-0.72, -0.92, 1.74, 0.20], [0.86, -0.92, 1.70, 0.23],
    [-1.30, -0.62, 1.62, 0.16], [1.36, -0.64, 1.58, 0.17],
  ];
  for (const [x, y, z, r] of FLOWERS) {
    const f = rose(r);
    f.position.set(x, y, z);
    f.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 6, (Math.random() - 0.5) * 0.4);
    florals.add(f);
    const puff = babysBreath(46, 0.62);
    puff.position.set(x + (Math.random() - 0.5) * 0.5, y + 0.12, z + (Math.random() - 0.5) * 0.4);
    florals.add(puff);
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(r * 1.1, 5), matStem);
    leaf.position.set(x + (Math.random() - 0.5) * 0.6, y - 0.06, z + (Math.random() - 0.5) * 0.5);
    leaf.rotation.set(-Math.PI / 2 + 0.25, 0, Math.random() * 6);
    florals.add(leaf);
  }

  // ---- THE CAKE, built from the photograph on the site --------------------
  // It is not a frosted cream cake. It is a round tres leches in a fluted FOIL PAN, its whole top
  // under a glossy red strawberry glaze, with whole berries — green calyx and all — ringed around
  // the edge and one standing in the middle. Every one of those details is in the product shot,
  // and getting them wrong would be selling her a cake we do not make.
  const cake = new THREE.Group();
  cake.position.y = -1.15;
  cake.visible = false;
  root.add(cake);

  const R = 1.18;
  // A disposable foil pan is real aluminium — full metalness — but crumpled and brushed, so the
  // bump map is doing as much as the reflectivity.
  const matFoil = new THREE.MeshStandardMaterial({
    color: C(0xd7d9db), roughness: 0.38, metalness: 1,
    bumpMap: foilBump, bumpScale: 0.012, envMapIntensity: 1.15,
  });
  const matSponge = new THREE.MeshStandardMaterial({
    color: C(SPONGE), roughness: 0.94, metalness: 0,
    bumpMap: spongeBump, bumpScale: 0.02, envMapIntensity: 0.6,
  });
  // The wettest thing in the frame. Very low roughness, but modulated — an even gloss reads as
  // moulded plastic, and it is the VARIATION in the highlight that says "syrup".
  const matGlaze = new THREE.MeshStandardMaterial({
    color: C(GLAZE), roughness: 0.14, metalness: 0,
    roughnessMap: glazeRough, envMapIntensity: 1.5,
  });
  // Strawberries: a waxy skin over a translucent fruit. No subsurface scattering available here,
  // so the colour map carries the ripeness variation and the bump map carries the seeds.
  const matBerry = new THREE.MeshStandardMaterial({
    color: C(0xe6e2e0), map: berryMap, roughness: 0.34, metalness: 0,
    bumpMap: berryBump, bumpScale: 0.02, envMapIntensity: 1.0,
  });
  const matLeaf = new THREE.MeshStandardMaterial({
    color: C(LEAF), roughness: 0.62, metalness: 0,
    side: THREE.DoubleSide, envMapIntensity: 1.1,
  });

  const pan = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.16, R * 1.02, 0.30, 96), matFoil);
  pan.position.y = -0.04;
  pan.castShadow = true; pan.receiveShadow = true;
  cake.add(pan);
  // The fluted rim: a ring of small boxes around the lip, which is what makes a foil pan read as
  // foil rather than as a metal tin.
  const flute = new THREE.Group();
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.1, 0.09), matFoil);
    f.position.set(Math.cos(a) * R * 1.17, 0.13, Math.sin(a) * R * 1.17);
    f.rotation.y = -a;
    flute.add(f);
  }
  cake.add(flute);
  const panRim = new THREE.Mesh(new THREE.TorusGeometry(R * 1.17, 0.035, 10, 64), matFoil);
  panRim.rotation.x = Math.PI / 2;
  panRim.position.y = 0.17;
  cake.add(panRim);

  const sponge = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.99, R * 0.97, 0.34, 96), matSponge);
  sponge.position.y = 0.17;
  sponge.castShadow = true;
  cake.add(sponge);
  // Glaze: a slightly domed disc that pours right to the sponge's edge, glossy and uneven.
  const glazeGeo = new THREE.SphereGeometry(R * 0.985, 96, 40, 0, Math.PI * 2, 0, Math.PI / 2);
  // Poured syrup pools and ripples; it never sets as a perfect dome. A few millimetres of
  // low-frequency wobble is all it takes, and without it the highlight slides across too cleanly.
  {
    const pos = glazeGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const w = Math.sin(x * 3.1) * Math.cos(z * 2.7) * 0.013
              + Math.sin(x * 7.3 + z * 5.1) * 0.006;
      pos.setY(i, y + w);
    }
    pos.needsUpdate = true;
    glazeGeo.computeVertexNormals();
  }
  const glaze = new THREE.Mesh(glazeGeo, matGlaze);
  glaze.scale.y = 0.20;
  glaze.position.y = 0.32;
  cake.add(glaze);

  // Drips running over the edge onto the sponge. Uneven in length on purpose.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
    const len = 0.06 + Math.random() * 0.13;
    const rad = 0.035 + Math.random() * 0.02;
    const drip = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 0.82, len, 12), matGlaze);
    drip.add(shaft);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.82, 12, 10), matGlaze);
    bead.position.y = -len / 2;
    drip.add(bead);
    drip.position.set(Math.cos(a) * R * 0.985, 0.27 - len * 0.45, Math.sin(a) * R * 0.985);
    cake.add(drip);
  }
  const glazeEdge = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.99, R * 0.99, 0.09, 64), matGlaze);
  glazeEdge.position.y = 0.30;
  cake.add(glazeEdge);

  // Whole strawberries: a tapered cone-ish body, blunt end up, with a green calyx of small leaves.
  function strawberry(s) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.19 * s, 48, 36), matBerry);
    body.scale.set(1, 1.3, 1);
    // A strawberry is wider at the crown and tapers to the tip — squashing the bottom does it.
    body.geometry = body.geometry.clone();
    const pos = body.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < 0) { const k = Math.max(0.18, 1 + y * 2.6); pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); }
    }
    pos.needsUpdate = true;
    body.geometry.computeVertexNormals();
    body.castShadow = true;
    g.add(body);
    const cal = new THREE.Group();
    cal.position.y = 0.17 * s;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      // Small, and swept steeply DOWN against the shoulder of the berry — a calyx hugs the fruit.
      // Flat discs lying face-up were what made these read as holly.
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.055 * s, 4), matLeaf);
      l.position.set(Math.cos(a) * 0.062 * s, -0.012 * s, Math.sin(a) * 0.062 * s);
      l.rotation.set(-Math.PI / 2 + 1.05, 0, -a);
      cal.add(l);
    }
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.016 * s, 0.02 * s, 0.07 * s, 6), matLeaf);
    stub.position.y = 0.03 * s;
    cal.add(stub);
    g.add(cal);
    return g;
  }
  const berries = [];
  for (let i = 0; i < 11; i++) {
    const centre = i === 10;
    const b = strawberry(centre ? 1.22 : 1.12);
    if (centre) b.position.set(0, 0.54, 0);
    else {
      const a = (i / 10) * Math.PI * 2;
      b.position.set(Math.cos(a) * R * 0.66, 0.50, Math.sin(a) * R * 0.66);
      b.rotation.z = ((i % 2) ? 1 : -1) * 0.16;
    }
    b.rotation.y = Math.random() * 6;
    cake.add(b);
    berries.push(b);
  }

  // ---- confetti: a lot of it, in two bursts -------------------------------
  const CONF = 900;
  const confetti = new THREE.Group();
  confetti.visible = false;
  scene.add(confetti);
  const confColors = [GOLD_LT, GOLD, 0xffffff, IVORY, CRIMSON, CRIMSON_LT, BLUSH, 0xf7e7b0];
  const bits = [];
  const rectGeo = new THREE.PlaneGeometry(0.11, 0.17);
  const bigGeo = new THREE.PlaneGeometry(0.2, 0.13);
  for (let i = 0; i < CONF; i++) {
    const m = new THREE.Mesh(
      i % 7 === 0 ? bigGeo : rectGeo,
      // Roughly a third of real party confetti is metallised film and the rest is paper. Mixing
      // the two is what makes a burst sparkle instead of reading as coloured squares.
      new THREE.MeshStandardMaterial({
        color: C(confColors[i % confColors.length]),
        roughness: i % 3 ? 0.62 : 0.18, metalness: i % 3 ? 0 : 1,
        envMapIntensity: i % 3 ? 0.9 : 2.4,
        side: THREE.DoubleSide, transparent: true,
      })
    );
    confetti.add(m);
    bits.push({ m, v: new THREE.Vector3(), spin: new THREE.Vector3(), live: false });
  }
  // Two waves: the burst when the lid goes, and a second lighter shower as the cake lands, so the
  // air never empties out between the two best moments.
  function fire(from, to, power) {
    for (let i = from; i < to; i++) {
      const b = bits[i];
      b.live = true;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.0;
      b.m.position.set(Math.cos(a) * r, 0.55 + Math.random() * 0.4, Math.sin(a) * r);
      b.m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      b.m.material.opacity = 1;
      b.v.set(
        Math.cos(a) * (0.03 + Math.random() * 0.09) * power,
        (0.13 + Math.random() * 0.16) * power,
        Math.sin(a) * (0.03 + Math.random() * 0.09) * power
      );
      b.spin.set((Math.random() - 0.5) * 0.34, (Math.random() - 0.5) * 0.34, (Math.random() - 0.5) * 0.34);
    }
  }

  // ---- the timeline -------------------------------------------------------
  // Eleven seconds, and every pause in it is deliberate. The old five-second version went straight
  // from bow to cake with nothing in between, which is why it read as a transition rather than as
  // a surprise. The two stillnesses — the tremble before the untie, and the held breath after the
  // lid leaves — are what make it land.
  const T = {
    settle: 1.15,      // the box breathes
    tremble: 1.55,     // something inside shifts
    untie: 2.30,       // the bow gives
    ribbonOff: 3.70,   // ribbon slides away
    hold: 4.25,        // silence
    lidLift: 4.55,     // the lid rises, slowly
    lidOff: 5.45,      // and goes
    burst: 5.35,       // the confetti
    rise: 5.70,        // the cake comes up
    land: 7.90,
    berries: 8.05,     // strawberries settle in
    shower: 8.60,      // second wave
    copy: 9.30,
  };
  const BEATS = [
    [0.30, 'Su fecha está reservada…'],
    [2.30, 'Y hay algo más.'],
    [4.30, '…'],
    [5.90, ''],
  ];

  const ease = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
  const easeIn = (t) => Math.pow(Math.min(Math.max(t, 0), 1), 2.2);
  const easeBack = (t) => { const c = 1.42, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
  const clamp01 = (t) => Math.min(Math.max(t, 0), 1);

  let t0 = performance.now();
  let done = false, fired1 = false, fired2 = false;

  function reset() {
    t0 = performance.now();
    done = false; fired1 = false; fired2 = false;
    host.classList.remove('revealed');
    beat.classList.remove('on');
    lid.position.set(0, 0.56, 0); lid.rotation.set(0, 0, 0); lid.visible = true;
    ribbon.visible = true; ribbon.position.set(0, 0, 0); ribbon.rotation.set(0, 0, 0);
    bow.scale.setScalar(1.45); bow.rotation.set(0, 0, 0); bow.position.y = LID_TOP + 0.42;
    cake.visible = false; cake.position.y = -1.15; cake.rotation.y = 0;
    confetti.visible = false;
    for (const b of bits) { b.live = false; b.m.material.opacity = 0; }
    for (const g of berries) g.scale.setScalar(0.001);
    spot.intensity = 0;
    root.rotation.y = -0.40;
    root.position.y = 0;
  }

  function layout() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const aspect = w / h;
    const half = Math.tan((38 * Math.PI) / 180 / 2);
    // Fit a fixed world box at every width — the tall dimension on wide screens, the wide one on a
    // phone, whichever needs the camera further back.
    camera.dist = Math.max(3.35 / half, 2.45 / (half * aspect));
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', layout);

  let lastBeat = -1;
  function tick(now) {
    requestAnimationFrame(tick);
    const t = (now - t0) / 1000;

    for (let i = BEATS.length - 1; i >= 0; i--) {
      if (t >= BEATS[i][0] && lastBeat !== i) {
        lastBeat = i;
        beat.textContent = BEATS[i][1];
        beat.classList.toggle('on', Boolean(BEATS[i][1]));
        break;
      }
    }

    // A slow turn throughout, and a slow push in — the camera never sits still, so the box never
    // looks like a photograph of a box.
    root.rotation.y = -0.40 + t * 0.055;
    const push = clamp01((t - T.rise) / 3.4);
    const d = camera.dist * (1.08 - push * 0.14);
    camera.position.set(0, d * 0.26 + push * 0.85, d);
    camera.lookAt(0, -0.28 + push * 0.95, 0);

    if (t < T.untie) root.position.y = Math.sin(t * 2.0) * 0.028;

    // Tremble: the box shivers, as if what is inside just moved. Pure anticipation, no progress.
    if (t >= T.tremble && t < T.untie) {
      const k = (t - T.tremble) / (T.untie - T.tremble);
      const amp = 0.016 * Math.sin(k * Math.PI);
      root.position.x = Math.sin(t * 46) * amp;
      bow.rotation.z = Math.sin(t * 38) * amp * 1.6;
    } else if (t >= T.untie) {
      root.position.x = 0;
    }

    // The bow gives: loops shrink and rotate, tails swing, and the whole ribbon slides off the box.
    if (t >= T.untie) {
      const u = ease((t - T.untie) / (T.ribbonOff - T.untie));
      bow.scale.setScalar(1.45 * (1 - u * 0.72));
      bow.rotation.z = u * 1.35;
      bow.position.y = LID_TOP + 0.42 - u * 0.5;
      for (let i = 0; i < tails.length; i++) tails[i].rotation.z = (i ? 1 : -1) * (0.2 + u * 1.0);
      ribbon.position.y = -u * 1.15;
      ribbon.position.x = -u * 1.75;
      ribbon.rotation.z = u * 0.62;
      if (u >= 1) ribbon.visible = false;
    }

    // The lid lifts slowly — easeIn, so it creeps then goes — and floats out of frame.
    if (t >= T.lidLift) {
      const u = easeIn((t - T.lidLift) / (T.lidOff - T.lidLift + 1.0));
      lid.position.y = 0.56 + u * 4.6;
      lid.position.x = u * 2.1;
      lid.rotation.z = u * 0.85;
      lid.rotation.x = u * 0.42;
      if (u >= 1) lid.visible = false;
    }

    if (t >= T.burst && !fired1) { fired1 = true; confetti.visible = true; fire(0, 620, 1.15); }
    if (t >= T.shower && !fired2) { fired2 = true; fire(620, CONF, 0.75); }
    if (confetti.visible) {
      for (const b of bits) {
        if (!b.live) continue;
        b.v.y -= 0.0034;
        b.v.x *= 0.994; b.v.z *= 0.994;
        b.m.position.add(b.v);
        b.m.rotation.x += b.spin.x; b.m.rotation.y += b.spin.y; b.m.rotation.z += b.spin.z;
        if (b.m.position.y < -1) b.m.material.opacity = Math.max(0, b.m.material.opacity - 0.016);
      }
    }

    // The cake comes up out of the box, slowly, with a little overshoot so it arrives.
    if (t >= T.rise) {
      cake.visible = true;
      const u = clamp01((t - T.rise) / (T.land - T.rise));
      cake.position.y = -1.15 + easeBack(u) * 1.98;
      cake.rotation.y = u * 0.9 + Math.max(0, t - T.land) * 0.24;
      spot.intensity = u * 3.0;
    }
    // Strawberries settle in one at a time, after the cake has arrived.
    if (t >= T.berries) {
      berries.forEach((g, i) => {
        const k = clamp01((t - T.berries - i * 0.055) / 0.42);
        g.scale.setScalar(0.001 + easeBack(k) * 0.999);
      });
    }

    if (!done && t >= T.copy) { done = true; host.classList.add('revealed'); }

    renderer.render(scene, camera);
  }

  // Reduced motion: no flight, no confetti — the cake is simply there, lit, turning slowly.
  function reduced() {
    lid.visible = false; ribbon.visible = false;
    cake.visible = true; cake.position.y = 0.83;
    spot.intensity = 3.0;
    host.classList.add('revealed');
    beat.classList.remove('on');
    berries.forEach((g) => g.scale.setScalar(1));
    camera.position.set(0, camera.dist * 0.3, camera.dist * 0.95);
    camera.lookAt(0, 0.1, 0);
    (function spin() { requestAnimationFrame(spin); root.rotation.y += 0.0022; renderer.render(scene, camera); })();
  }

  layout();
  reset();
  if (reduce) reduced();
  else requestAnimationFrame(tick);

  document.getElementById('cr-replay').addEventListener('click', () => {
    if (reduce) return;
    lastBeat = -1;
    reset();
  });
  } catch (e) {
    fail((e && e.message) || String(e));
  }
})();
