/* =====================================================================
   hero-3d.js — premium 3D hero scene for the portfolio (Three.js r160)

   What it draws
   - An "automation core": a glowing energy core inside a faceted crystal,
     wrapped in a wireframe cage and three orbit rings with data packets.
   - Tool labels (n8n, Make, Zapier, AI, API, CRM) orbiting the core, each
     linked to it by a faint line with a travelling energy pulse.
   - A soft particle field with "plexus" connecting lines that drift,
     shy away from the cursor and burst outwards on click.

   Where it sits
   - Wide screens: in the empty space to the right of the hero text.
   - Narrow screens: as a halo orbiting the avatar (the avatar covers the
     core), so it never sits behind the text.

   Behaviour
   - Camera fly-in on load, gentle float/rotation/pulse, cursor parallax,
     hover = stronger glow, click on the core = expand + particle burst.
   - prefers-reduced-motion: one still frame, no animation or fly-in.
   - No WebGL / script error: the CSS fallback (.hero3d-fallback) stays.
   - Pauses when the hero is off screen or the tab is hidden; drops bloom
     and resolution automatically if the device can't hold ~40 fps.

   Markup it expects (see index.html):
     <div class="hero">
       <div class="hero3d" aria-hidden="true">
         <div class="hero3d-fallback"></div>
         <canvas id="hero3dCanvas"></canvas>
       </div>
       ...hero content...
   ===================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ---------- CUSTOMIZE HERE ---------- */
const CONFIG = {
  colors: {
    bg: 0x0a0e14,       // must match the page background (--bg)
    cyan: 0x22d3ee,     // core + crystal edges
    blue: 0x3b82f6,     // rings, rim light
    purple: 0xa78bfa,   // cage, accents
    teal: 0x2dd4bf,     // portfolio accent, used in particles
  },
  labels: ['n8n', 'Make', 'Zapier', 'AI', 'API', 'CRM'], // orbiting tool labels
  speed: 1,                 // global animation speed (0.5 = calmer, 1.5 = livelier)
  bloom: { strength: 0.7, radius: 0.5, threshold: 0.22 },
  particles: { desktop: 240, mobile: 110 },
  linkDistance: 1.15,       // max plexus line length (in core-sized units)
  parallax: 0.22,           // how far the scene tilts towards the cursor
  flyInSeconds: 2.6,        // camera entrance duration
};
/* ------------------------------------ */

const hero = document.querySelector('.hero');
const wrap = document.querySelector('.hero3d');
const canvas = document.getElementById('hero3dCanvas');

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return false; }
}

if (hero && wrap && canvas && webglAvailable()) {
  try { init(); } catch (e) { console.warn('hero-3d disabled:', e); } // fallback stays visible
}

function init() {
  const C = CONFIG.colors;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
  const DIST = 10;            // final camera distance
  const ORBIT_R = 2.25;       // label orbit radius (defines the object's size)

  /* ---------- renderer, scene, camera ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(C.bg, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  let pixelRatio = Math.min(devicePixelRatio || 1, isMobile ? 1.5 : 1.75);
  renderer.setPixelRatio(pixelRatio);

  const scene = new THREE.Scene();
  scene.background = backgroundTexture(); // same teal-at-top glow the hero had in CSS
  scene.fog = new THREE.FogExp2(C.bg, 0.03);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, DIST);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), CONFIG.bloom.strength, CONFIG.bloom.radius, CONFIG.bloom.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let useBloom = true;

  /* ---------- lights ---------- */
  scene.add(new THREE.AmbientLight(0x223344, 0.6));
  const keyLight = new THREE.PointLight(C.cyan, 30, 30); keyLight.position.set(3, 2, 4); scene.add(keyLight);
  const fillLight = new THREE.PointLight(C.purple, 22, 30); fillLight.position.set(-3, -1, 3); scene.add(fillLight);
  const rim = new THREE.DirectionalLight(C.blue, 2.2); rim.position.set(0, 2, -5); scene.add(rim);

  /* ---------- the object: obj (position) > tilt (parallax) > spin (rotation) ---------- */
  const glowTex = glowTexture();
  const obj = new THREE.Group();
  const tilt = new THREE.Group();
  const spin = new THREE.Group();
  obj.add(tilt); tilt.add(spin); scene.add(obj);

  // energy core + its soft "volumetric" glow
  const coreMat = new THREE.MeshStandardMaterial({ color: 0x0b1220, emissive: C.cyan, emissiveIntensity: 1.35, roughness: 0.3, metalness: 0.2 });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 4), coreMat);
  spin.add(core);
  const coreGlow = sprite(glowTex, C.cyan, 2.6, 0.35); tilt.add(coreGlow);
  const haze = sprite(glowTex, C.purple, 9, 0.16); haze.position.z = -2.5; tilt.add(haze);

  // faceted crystal with glowing edges
  const crystalGeo = new THREE.IcosahedronGeometry(1.05, 0);
  const crystal = new THREE.Mesh(crystalGeo, new THREE.MeshPhysicalMaterial({
    color: 0x0f1b2e, metalness: 0.6, roughness: 0.15, transparent: true, opacity: 0.35,
    flatShading: true, emissive: C.blue, emissiveIntensity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
  const crystalEdges = new THREE.LineSegments(new THREE.EdgesGeometry(crystalGeo),
    new THREE.LineBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
  crystal.add(crystalEdges);
  spin.add(crystal);

  // outer wireframe cage + glowing vertices
  const cageGeo = new THREE.IcosahedronGeometry(1.5, 1);
  const cage = new THREE.LineSegments(new THREE.EdgesGeometry(cageGeo),
    new THREE.LineBasicMaterial({ color: C.purple, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending }));
  const cageDots = new THREE.Points(cageGeo, new THREE.PointsMaterial({
    color: C.purple, size: 0.09, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  cage.add(cageDots);
  tilt.add(cage);

  // three tilted orbit rings, each carrying two data packets
  const rings = [];
  [[1.85, C.blue, 1.1, 0.3], [2.0, C.cyan, -0.5, 1.2], [2.15, C.purple, 0.4, -0.9]].forEach(([r, color, rx, rz], i) => {
    const g = new THREE.Group(); g.rotation.set(rx, 0, rz);
    g.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.006, 6, 160),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })));
    const packets = [0, Math.PI].map(phase => {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      p.add(sprite(glowTex, color, 0.55, 0.9));
      g.add(p);
      return { mesh: p, phase };
    });
    tilt.add(g);
    rings.push({ group: g, r, packets, speed: 0.55 + i * 0.18 });
  });

  // orbiting tool labels, linked to the core by lines with travelling pulses
  const labels = CONFIG.labels.map((text, i, all) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(text, i % 2 ? '#a78bfa' : '#22d3ee'), transparent: true, depthWrite: false }));
    s.scale.set(0.82, 0.36, 1);
    tilt.add(s);
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending }));
    tilt.add(line);
    const pulse = sprite(glowTex, C.cyan, 0.32, 0.9); tilt.add(pulse);
    return { sprite: s, line, pulse, angle: (i / all.length) * Math.PI * 2, yOff: (i % 3 - 1) * 0.55 };
  });

  // click shockwave
  const shock = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 128),
    new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  obj.add(shock);

  /* ---------- particle field (world space) + plexus lines ---------- */
  const N = isMobile ? CONFIG.particles.mobile : CONFIG.particles.desktop;
  const nNear = Math.round(N * 0.75);          // clustered around the object; the rest drift across the hero
  const seeds = [], home = new Float32Array(N * 3), pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
  const colArr = new Float32Array(N * 3), sizeArr = new Float32Array(N);
  const palette = [C.cyan, C.blue, C.purple, C.teal, 0xe2e8f0].map(c => new THREE.Color(c));
  for (let i = 0; i < N; i++) {
    seeds.push({ u: Math.random(), v: Math.random(), w: Math.random(), f: 0.2 + Math.random() * 0.5, ph: Math.random() * 6.28 });
    const c = palette[Math.floor(Math.random() * (i < nNear ? 4 : 5))];
    colArr.set([c.r, c.g, c.b], i * 3);
    sizeArr[i] = (i < nNear ? 0.05 : 0.035) + Math.random() * 0.06;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute('aColor', new THREE.BufferAttribute(colArr, 3));
  pGeo.setAttribute('aSize', new THREE.BufferAttribute(sizeArr, 1));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 1 }, uFade: { value: 0 } },
    vertexShader: `
      attribute vec3 aColor; attribute float aSize; uniform float uScale; varying vec3 vColor;
      void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform float uFade; varying vec3 vColor;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a * uFade;
        gl_FragColor = vec4(vColor * a, a); }`,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);

  const MAX_SEG = isMobile ? 160 : 320;
  const segPos = new Float32Array(MAX_SEG * 6), segCol = new Float32Array(MAX_SEG * 6);
  const segGeo = new THREE.BufferGeometry();
  segGeo.setAttribute('position', new THREE.BufferAttribute(segPos, 3));
  segGeo.setAttribute('color', new THREE.BufferAttribute(segCol, 3));
  const segments = new THREE.LineSegments(segGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  segments.frustumCulled = false;
  scene.add(segments);
  const lineColor = new THREE.Color(C.cyan);

  /* ---------- layout: where the object goes and how big it is ---------- */
  const anchor = new THREE.Vector3();
  let W = 1, H = 1, objScale = 1, worldW = 1, worldH = 1, mode = 'side';
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  function textHalfWidth() {
    // widest line of hero text, measured from the centre (ranges give the real text bounds)
    const hr = hero.getBoundingClientRect(), mid = hr.left + hr.width / 2, range = document.createRange();
    let half = 0;
    for (const el of hero.children) {
      if (el === wrap) continue;
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      if (r.width) half = Math.max(half, mid - r.left, r.right - mid);
    }
    return half;
  }

  function layout() {
    W = hero.clientWidth; H = hero.clientHeight;
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    const ppu = H / (2 * DIST * tanHalf);            // screen pixels per world unit at z = 0
    worldW = W / ppu; worldH = H / ppu;
    pMat.uniforms.uScale.value = (H * pixelRatio) / (2 * tanHalf);

    const hr = hero.getBoundingClientRect();
    const side = W / 2 - textHalfWidth() - 28;     // free space right of the text
    let ax, ay, rPx;
    if (side >= 190) {
      mode = 'side';
      ax = W - side / 2 - 8; ay = H * 0.46; rPx = Math.min(side * 0.36, H * 0.3, 230);
    } else {
      mode = 'halo';                                 // orbit the avatar instead
      const av = document.getElementById('avatar');
      const ar = av ? av.getBoundingClientRect() : { left: hr.left + W / 2 - 50, top: hr.top + 40, width: 100, height: 100 };
      ax = ar.left + ar.width / 2 - hr.left; ay = ar.top + ar.height / 2 - hr.top; rPx = ar.width * 1.08;
    }
    anchor.set((ax - W / 2) / ppu, -(ay - H / 2) / ppu, 0);
    objScale = rPx / (ORBIT_R * ppu);
    obj.position.copy(anchor);
    wrap.dataset.anchor = Math.round(ax) + ',' + Math.round(ay) + ',' + mode;   // handy for debugging/tests
    placeParticleHomes();
  }

  function placeParticleHomes() {
    for (let i = 0; i < N; i++) {
      const s = seeds[i], k = i * 3;
      if (i < nNear) {           // shell around the object
        const th = s.u * Math.PI * 2, ph = Math.acos(2 * s.v - 1), r = (mode === 'halo' ? 1.5 + s.w * 1.1 : 1.6 + s.w * 1.7) * objScale;
        home[k] = anchor.x + r * Math.sin(ph) * Math.cos(th);
        home[k + 1] = anchor.y + r * Math.cos(ph) * 0.8;
        home[k + 2] = r * Math.sin(ph) * Math.sin(th) * 0.6;
      } else {                   // sparse ambient drift across the whole hero
        home[k] = (s.u - 0.5) * worldW; home[k + 1] = (s.v - 0.5) * worldH; home[k + 2] = -3 + s.w * 3;
      }
      if (!placeParticleHomes.done) { pos[k] = home[k]; pos[k + 1] = home[k + 1]; pos[k + 2] = home[k + 2]; }
    }
    placeParticleHomes.done = true;
  }

  /* ---------- input: parallax, hover, click ---------- */
  const ndc = new THREE.Vector2(0, 0), ndcSmooth = new THREE.Vector2(0, 0);
  const raycaster = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const mouseWorld = new THREE.Vector3(1e3, 1e3, 0);
  let pointerActive = false, lastPointer = 0, hovered = false;

  function onPointer(e) {
    const r = hero.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom) { pointerActive = false; hovered = false; hero.style.cursor = ''; return; }
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    pointerActive = true; lastPointer = performance.now();
    raycaster.setFromCamera(ndc, camera);
    raycaster.ray.intersectPlane(plane, mouseWorld);
    hovered = raycaster.ray.distanceSqToPoint(obj.position) < (1.25 * objScale) ** 2;
    const blocked = e.target.closest && e.target.closest('a,button,input,textarea,select,video');
    hero.style.cursor = hovered && !blocked ? 'pointer' : '';
  }
  if (!reduced) {
    addEventListener('pointermove', onPointer, { passive: true });
    addEventListener('pointerdown', onPointer, { passive: true });
    hero.addEventListener('click', e => {
      if (e.target.closest('a,button,input,textarea,select,video')) return;
      onPointer(e);
      if (hovered) burst();
    });
  }

  let energy = 0, kick = 0, kickVel = 0, shockT = 1;
  function burst() {
    energy = 1; kickVel += 0.09; shockT = 0;
    for (let i = 0; i < nNear; i++) {   // push nearby particles outwards
      const k = i * 3, dx = pos[k] - anchor.x, dy = pos[k + 1] - anchor.y, dz = pos[k + 2];
      const d = Math.hypot(dx, dy, dz) || 1, f = (0.06 + Math.random() * 0.08) * objScale;
      vel[k] += dx / d * f; vel[k + 1] += dy / d * f; vel[k + 2] += dz / d * f;
    }
  }

  /* ---------- animation ---------- */
  const clock = new THREE.Clock();
  let t = 0, startT = null, frame = 0, running = false, rafId = 0, ready = false;
  const fpsSamples = [];
  const tmp = new THREE.Vector3();
  const ease = x => 1 - Math.pow(1 - x, 3);
  const easeBack = x => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

  function update(dt) {
    t += dt * CONFIG.speed;
    if (startT === null) startT = t;
    const intro = reduced ? 1 : Math.min(1, (t - startT) / (CONFIG.flyInSeconds * CONFIG.speed));
    const e = ease(intro);

    // camera fly-in, then a light cursor parallax (idle wander on touch devices)
    if (!pointerActive || performance.now() - lastPointer > 4000) ndc.set(Math.sin(t * 0.21) * 0.35, Math.cos(t * 0.17) * 0.25);
    ndcSmooth.lerp(ndc, reduced ? 1 : 0.05);
    camera.position.set(ndcSmooth.x * 0.35 * e, 3 * (1 - e) + ndcSmooth.y * 0.25 * e, DIST + 8 * (1 - e));
    camera.lookAt(0, 0, 0);

    // hover / click energy
    const hoverAmt = hovered ? 1 : 0;
    obj.userData.hover = THREE.MathUtils.lerp(obj.userData.hover || 0, hoverAmt, 0.08);
    const h = obj.userData.hover;
    energy *= 0.96;
    kickVel += -kick * 0.12; kickVel *= 0.82; kick += kickVel;     // spring for the click "expand"

    // object: float, rotate, tilt, pulse
    const sc = objScale * (0.3 + 0.7 * easeBack(intro)) * (1 + kick + h * 0.04);
    obj.scale.setScalar(sc);
    obj.position.y = anchor.y + Math.sin(t * 0.9) * 0.12 * objScale;
    tilt.rotation.x = THREE.MathUtils.lerp(tilt.rotation.x, -ndcSmooth.y * CONFIG.parallax, 0.08);
    tilt.rotation.y = THREE.MathUtils.lerp(tilt.rotation.y, ndcSmooth.x * CONFIG.parallax * 1.3, 0.08);
    spin.rotation.y += dt * 0.25 * CONFIG.speed * (1 + energy * 3);
    spin.rotation.x = Math.sin(t * 0.3) * 0.25;
    crystal.rotation.y -= dt * 0.35 * CONFIG.speed;
    cage.rotation.y -= dt * 0.08 * CONFIG.speed; cage.rotation.z += dt * 0.05 * CONFIG.speed;
    const pulse = 1 + 0.25 * Math.sin(t * 1.6);
    coreMat.emissiveIntensity = 1.35 * pulse * (1 + h * 0.8 + energy * 2);
    coreGlow.material.opacity = 0.3 * pulse * (1 + h * 0.8 + energy);
    coreGlow.scale.setScalar(2.6 * (1 + h * 0.25 + energy * 0.6));
    crystalEdges.material.opacity = 0.75 + 0.25 * pulse * (1 + h);
    if (useBloom) bloom.strength = CONFIG.bloom.strength * (1 + h * 0.5 + energy * 1.2);

    // ring packets
    for (const ring of rings) for (const p of ring.packets) {
      const a = t * ring.speed * (1 + energy * 2.5) + p.phase;
      p.mesh.position.set(Math.cos(a) * ring.r, Math.sin(a) * ring.r, 0);
    }

    // orbiting labels + link lines + pulses (in tilt space)
    labels.forEach((L, i) => {
      const a = L.angle + t * 0.22;
      L.sprite.position.set(Math.cos(a) * ORBIT_R, L.yOff + Math.sin(t * 0.7 + i) * 0.08, Math.sin(a) * ORBIT_R * 0.75);
      const depth = (L.sprite.position.z / (ORBIT_R * 0.75) + 1) / 2;   // 0 = back, 1 = front
      L.sprite.material.opacity = (0.3 + 0.7 * depth) * e;
      const lp = L.line.geometry.attributes.position;
      lp.setXYZ(1, L.sprite.position.x, L.sprite.position.y, L.sprite.position.z); lp.needsUpdate = true;
      L.line.material.opacity = (0.08 + 0.18 * depth) * (1 + h) * e;
      const f = (t * 0.45 + i / labels.length) % 1;
      L.pulse.position.copy(L.sprite.position).multiplyScalar(f);
      L.pulse.material.opacity = Math.sin(f * Math.PI) * 0.9 * e;
    });

    // shockwave
    if (shockT < 1) {
      shockT = Math.min(1, shockT + dt * 1.1);
      shock.scale.setScalar(0.6 + ease(shockT) * 3.4);
      shock.material.opacity = (1 - shockT) * 0.65;
      shock.quaternion.copy(camera.quaternion);
    }

    // particles: drift around home, repel from cursor, spring back after a burst
    const repelR = 1.4 * Math.max(objScale, 0.6), repelR2 = repelR * repelR;
    for (let i = 0; i < N; i++) {
      const k = i * 3, s = seeds[i];
      const tx = home[k] + Math.sin(t * s.f + s.ph) * 0.25 * objScale;
      const ty = home[k + 1] + Math.cos(t * s.f * 0.8 + s.ph) * 0.25 * objScale;
      const tz = home[k + 2] + Math.sin(t * s.f * 0.6 + s.ph * 2) * 0.2;
      vel[k] += (tx - pos[k]) * 0.012; vel[k + 1] += (ty - pos[k + 1]) * 0.012; vel[k + 2] += (tz - pos[k + 2]) * 0.012;
      const dx = pos[k] - mouseWorld.x, dy = pos[k + 1] - mouseWorld.y, d2 = dx * dx + dy * dy;
      if (pointerActive && d2 < repelR2) {
        const f = (1 - d2 / repelR2) * 0.012 * (1 + h);
        vel[k] += dx * f; vel[k + 1] += dy * f;
      }
      vel[k] *= 0.9; vel[k + 1] *= 0.9; vel[k + 2] *= 0.9;
      pos[k] += vel[k]; pos[k + 1] += vel[k + 1]; pos[k + 2] += vel[k + 2];
    }
    pGeo.attributes.position.needsUpdate = true;
    pMat.uniforms.uFade.value = e * (1 + energy * 0.6);

    // plexus lines between nearby particles (every other frame is plenty)
    if (frame % 2 === 0 || reduced) {
      const L = CONFIG.linkDistance * objScale, L2 = L * L;
      let n = 0;
      for (let i = 0; i < nNear && n < MAX_SEG; i++) {
        const a = i * 3;
        for (let j = i + 1; j < nNear && n < MAX_SEG; j++) {
          const b = j * 3, dx = pos[a] - pos[b], dy = pos[a + 1] - pos[b + 1], dz = pos[a + 2] - pos[b + 2], d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > L2) continue;
          // brighter when short, and brighter still near the cursor
          const mx = (pos[a] + pos[b]) / 2 - mouseWorld.x, my = (pos[a + 1] + pos[b + 1]) / 2 - mouseWorld.y;
          const near = pointerActive ? Math.max(0, 1 - (mx * mx + my * my) / (repelR2 * 2.2)) : 0;
          const alpha = (1 - Math.sqrt(d2) / L) * 0.35 * e * (1 + near * 2 + energy);
          const o = n * 6;
          segPos[o] = pos[a]; segPos[o + 1] = pos[a + 1]; segPos[o + 2] = pos[a + 2];
          segPos[o + 3] = pos[b]; segPos[o + 4] = pos[b + 1]; segPos[o + 5] = pos[b + 2];
          for (let q = 0; q < 2; q++) { segCol[o + q * 3] = lineColor.r * alpha; segCol[o + q * 3 + 1] = lineColor.g * alpha; segCol[o + q * 3 + 2] = lineColor.b * alpha; }
          n++;
        }
      }
      segGeo.setDrawRange(0, n * 2);
      segGeo.attributes.position.needsUpdate = true; segGeo.attributes.color.needsUpdate = true;
    }
    frame++;
  }

  function render() { useBloom ? composer.render() : renderer.render(scene, camera); }

  function markReady() {
    if (ready) return;
    ready = true;
    wrap.classList.add('ready');
  }

  function loop() {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    update(dt);
    render();
    markReady();
    adaptQuality(dt);
  }

  // If the device can't keep ~40 fps after the fly-in, drop bloom and resolution.
  function adaptQuality(dt) {
    if (fpsSamples.length >= 90 || t < 1.5) return;
    fpsSamples.push(dt);
    if (fpsSamples.length === 90) {
      const sorted = [...fpsSamples].sort((a, b) => a - b), median = sorted[45];
      if (1 / median < 40) {
        useBloom = false;
        pixelRatio = 1; renderer.setPixelRatio(1); layout();
      }
    }
  }

  function setRunning(on) {
    if (reduced) return;
    if (on && !running) { running = true; clock.getDelta(); loop(); }
    else if (!on && running) { running = false; cancelAnimationFrame(rafId); }
  }

  /* ---------- start ---------- */
  layout();
  if (reduced) {
    update(0.016); render(); markReady();                            // one still frame
  } else {
    let visible = true;
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; setRunning(visible && !document.hidden); }, { threshold: 0 }).observe(hero);
    document.addEventListener('visibilitychange', () => setRunning(visible && !document.hidden));
    setRunning(true);
  }
  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { layout(); if (reduced) { update(0); render(); } }, 80);
  }).observe(hero);
}

/* ---------- small helpers ---------- */
function sprite(map, color, scale, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(scale);
  return s;
}

function glowTexture() {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'), gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function labelTexture(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 112;
  const g = c.getContext('2d');
  const x = 10, y = 16, w = 236, h = 80, r = 40;
  g.shadowColor = color; g.shadowBlur = 16;
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  g.fillStyle = 'rgba(10,18,30,0.85)'; g.fill();
  g.lineWidth = 3; g.strokeStyle = color; g.stroke();
  g.shadowBlur = 0;
  g.fillStyle = '#e8f6ff'; g.font = '600 42px "Segoe UI", system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 57);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function backgroundTexture() {
  // matches the hero's old CSS: radial-gradient(ellipse at top, #0f2a2c 0%, #0a0e14 70%)
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0e14'; g.fillRect(0, 0, 512, 256);
  g.save(); g.translate(256, 0); g.scale(1.6, 1);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 230);
  gr.addColorStop(0, '#0f2a2c'); gr.addColorStop(1, 'rgba(10,14,20,0)');
  g.fillStyle = gr; g.fillRect(-256, 0, 512, 256); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
