/* =====================================================================
   hero-3d.js — "AI chat orb" hero scene for the portfolio (Three.js r160)

   What it draws
   - A smooth, liquid AI orb: a noise-displaced sphere whose surface flows
     through cyan, blue, violet and a hint of pink, with a bright rim.
   - It "speaks": while the hint beside it types a question, the surface
     ripples like a voice and ripple rings pulse outwards.
   - A soft particle field with faint connecting lines that drift and shy
     away from the cursor.
   - A typing hint ("Ask me anything…") under the orb. Clicking the orb or
     the hint opens the website chat assistant (klarkyytech-chat.js).

   Where it sits
   - Wide screens: in the empty space to the right of the hero text.
   - Narrow screens: as a glowing aura behind the avatar (no hint), so it
     never sits behind the text.

   Behaviour
   - Camera fly-in on load, cursor parallax, hover = brighter and livelier,
     click = ripple burst + opens the chat.
   - prefers-reduced-motion: one still frame and a static hint.
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
    bg: 0x0a0e14,                                   // must match the page background (--bg)
    orb: [0x22d3ee, 0x3b82f6, 0x8b5cf6, 0xec4899],  // orb surface gradient: cyan → blue → violet → pink
    particles: [0x22d3ee, 0x3b82f6, 0x8b5cf6, 0x2dd4bf],
    lines: 0x60a5fa,
  },
  prompts: [                                        // questions the hint types out
    'Ask me anything…',
    'What can you automate for my business?',
    'How would n8n save me time?',
    'Can you build my website?',
    'How do I book a free call?',
  ],
  openChatOnClick: true,    // click the orb or hint = open the website chat
  speed: 1,                 // global animation speed (0.5 = calmer, 1.5 = livelier)
  bloom: { strength: 0.75, radius: 0.6, threshold: 0.2 },
  particles: { desktop: 200, mobile: 90 },
  linkDistance: 0.9,        // max connecting-line length (in orb-sized units)
  parallax: 0.2,            // how far the scene tilts towards the cursor
  flyInSeconds: 2.4,        // camera entrance duration
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


function init() {
  const C = CONFIG.colors;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
  const DIST = 18;            // final camera distance (far + narrow lens = no edge stretching)
  const REACH = 1.9;          // outermost ripple radius in orb radii (defines the layout size)

  /* ---------- renderer, scene, camera ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(C.bg, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  let pixelRatio = Math.min(devicePixelRatio || 1, isMobile ? 1.5 : 1.75);
  renderer.setPixelRatio(pixelRatio);

  const scene = new THREE.Scene();
  scene.background = backgroundTexture(); // same teal-at-top glow the hero had in CSS

  const camera = new THREE.PerspectiveCamera(23, 1, 0.1, 120);
  camera.position.set(0, 0, DIST);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), CONFIG.bloom.strength, CONFIG.bloom.radius, CONFIG.bloom.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let useBloom = true;

  /* ---------- the orb: obj (position/scale) > tilt (parallax) ---------- */
  const glowTex = glowTexture();
  const obj = new THREE.Group(), tilt = new THREE.Group();
  obj.add(tilt); scene.add(obj);

  const orbColors = C.orb.map(c => new THREE.Color(c));
  const orbMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uAmp: { value: 0.05 }, uFreq: { value: 1.6 }, uGlow: { value: 1 },
      uC1: { value: orbColors[0] }, uC2: { value: orbColors[1] }, uC3: { value: orbColors[2] }, uC4: { value: orbColors[3] },
    },
    vertexShader: NOISE + `
      uniform float uTime, uAmp, uFreq;
      varying vec3 vNormal, vView, vPos; varying float vNoise;
      void main(){
        // two layers of flowing noise push the surface in and out (the "voice")
        float n  = snoise(normal * uFreq + vec3(0.0, 0.0, uTime * 0.35));
        float n2 = snoise(normal * uFreq * 2.3 - vec3(uTime * 0.5));
        vec3 p = position + normal * (n * uAmp + n2 * uAmp * 0.35);
        vNoise = n; vPos = position;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vView = normalize(-mv.xyz);
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: NOISE + `
      uniform float uTime, uGlow; uniform vec3 uC1, uC2, uC3, uC4;
      varying vec3 vNormal, vView, vPos; varying float vNoise;
      void main(){
        float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.0);
        // soft diagonal gradient (cyan -> blue -> violet) bent by slow, low-frequency liquid swirls
        float f = snoise(vPos * 0.9 + vec3(uTime * 0.18, -uTime * 0.12, uTime * 0.08)) * 0.5 + 0.5;
        float g = snoise(vPos * 1.3 - vec3(uTime * 0.15)) * 0.5 + 0.5;
        float d = clamp(0.5 + 0.32 * (vPos.y + vPos.x * 0.6) + (f - 0.5) * 0.75, 0.0, 1.0);
        vec3 col = mix(uC1, uC2, smoothstep(0.0, 0.55, d));
        col = mix(col, uC3, smoothstep(0.45, 1.0, d));
        col = mix(col, uC4, smoothstep(0.62, 1.0, g) * 0.22);
        float center = pow(1.0 - fres, 3.0);               // luminous heart facing the viewer
        vec3 c = col * (0.5 + 0.3 * f) + mix(col, vec3(1.0), 0.45) * center * 0.22
               + col * fres * 1.4 * uGlow + vec3(1.0) * pow(fres, 5.0) * 0.35 * uGlow;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1, isMobile ? 32 : 64), orbMat);
  tilt.add(orb);
  const aura = sprite(glowTex, 0x6d7cf7, 3.6, 0.42); aura.position.z = -0.6; tilt.add(aura);
  const haze = sprite(glowTex, 0x8b5cf6, 8.5, 0.14); haze.position.z = -2.5; tilt.add(haze);

  // ripple rings that pulse out while the orb "speaks" (pool, face the camera)
  const ripples = Array.from({ length: 6 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 128),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0x8b5cf6 : 0x22d3ee, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    obj.add(m);
    return { mesh: m, t: 1, strength: 1 };
  });
  let nextRipple = 0;
  function emitRipple(strength) {
    const r = ripples[nextRipple++ % ripples.length];
    r.t = 0; r.strength = strength;
  }

  /* ---------- particle field (world space) + connecting lines ---------- */
  const N = isMobile ? CONFIG.particles.mobile : CONFIG.particles.desktop;
  const nNear = Math.round(N * 0.7);           // clustered around the orb; the rest drift across the hero
  const seeds = [], home = new Float32Array(N * 3), pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
  const colArr = new Float32Array(N * 3), sizeArr = new Float32Array(N);
  const palette = C.particles.map(c => new THREE.Color(c)).concat([new THREE.Color(0xe2e8f0)]);
  for (let i = 0; i < N; i++) {
    seeds.push({ u: Math.random(), v: Math.random(), w: Math.random(), f: 0.2 + Math.random() * 0.5, ph: Math.random() * 6.28 });
    const c = palette[Math.floor(Math.random() * (i < nNear ? 4 : 5))];
    colArr.set([c.r, c.g, c.b], i * 3);
    sizeArr[i] = (i < nNear ? 0.045 : 0.035) + Math.random() * 0.05;
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

  const MAX_SEG = isMobile ? 120 : 240;
  const segPos = new Float32Array(MAX_SEG * 6), segCol = new Float32Array(MAX_SEG * 6);
  const segGeo = new THREE.BufferGeometry();
  segGeo.setAttribute('position', new THREE.BufferAttribute(segPos, 3));
  segGeo.setAttribute('color', new THREE.BufferAttribute(segCol, 3));
  const segments = new THREE.LineSegments(segGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  segments.frustumCulled = false;
  scene.add(segments);
  const lineColor = new THREE.Color(C.lines);

  /* ---------- the typing hint (DOM) ---------- */
  const hint = document.createElement('button');
  hint.type = 'button';
  hint.className = 'hero3d-hint';
  hint.setAttribute('aria-label', 'Open the AI chat assistant');
  hint.innerHTML = '<span class="hero3d-hint-spark">✦</span><span class="hero3d-hint-text"></span><span class="hero3d-hint-caret"></span>';
  hero.appendChild(hint);
  const hintText = hint.querySelector('.hero3d-hint-text');
  injectHintStyles();
  let talking = false;   // true while the hint is typing: the orb "speaks"

  function startTyping() {
    if (reduced) { hintText.textContent = CONFIG.prompts[0]; return; }
    let p = 0, i = 0, phase = 'type';
    (function step() {
      const text = CONFIG.prompts[p % CONFIG.prompts.length];
      if (phase === 'type') {
        talking = true;
        hintText.textContent = text.slice(0, ++i);
        if (i >= text.length) { phase = 'hold'; talking = false; return setTimeout(step, 2200); }
        return setTimeout(step, 38 + Math.random() * 45);
      }
      if (phase === 'hold') { phase = 'erase'; return setTimeout(step, 30); }
      hintText.textContent = text.slice(0, --i);
      if (i <= 0) { phase = 'type'; p++; return setTimeout(step, 450); }
      setTimeout(step, 18);
    })();
  }

  function openChat() {
    if (!CONFIG.openChatOnClick) return;
    const launcher = document.getElementById('klark-chat-launcher');
    if (launcher) launcher.click();
    else location.hash = '#book';                 // no chat on the page: go to the booking section
  }
  hint.addEventListener('click', () => { burst(); setTimeout(openChat, 250); });

  /* ---------- layout: where the orb goes and how big it is ---------- */
  const anchor = new THREE.Vector3();
  let W = 1, H = 1, objScale = 1, worldW = 1, worldH = 1, mode = 'side';
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  function textHalfWidth() {
    // widest line of hero text, measured from the centre (ranges give the real text bounds)
    const hr = hero.getBoundingClientRect(), mid = hr.left + hr.width / 2, range = document.createRange();
    let half = 0;
    for (const el of hero.children) {
      if (el === wrap || el === hint) continue;
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
      rPx = Math.min(side * 0.4, H * 0.32, 240);
      ax = W - side / 2 - 8; ay = H * 0.42;
    } else {
      mode = 'halo';                                 // glowing aura behind the avatar
      const av = document.getElementById('avatar');
      const ar = av ? av.getBoundingClientRect() : { left: hr.left + W / 2 - 50, top: hr.top + 40, width: 100, height: 100 };
      ax = ar.left + ar.width / 2 - hr.left; ay = ar.top + ar.height / 2 - hr.top; rPx = ar.width * 1.15;
    }
    anchor.set((ax - W / 2) / ppu, -(ay - H / 2) / ppu, 0);
    objScale = rPx / (REACH * ppu);                  // orb radius in world units
    obj.position.copy(anchor);
    wrap.dataset.anchor = Math.round(ax) + ',' + Math.round(ay) + ',' + mode;   // handy for debugging/tests

    // hint sits under the orb on wide screens; hidden in halo mode
    hint.hidden = mode !== 'side';
    hint.style.left = ax + 'px';
    hint.style.top = (ay + rPx * 0.72 + 12) + 'px';
    placeParticleHomes();
  }

  function placeParticleHomes() {
    for (let i = 0; i < N; i++) {
      const s = seeds[i], k = i * 3;
      if (i < nNear) {           // loose shell around the orb
        const th = s.u * Math.PI * 2, ph = Math.acos(2 * s.v - 1);
        const r = (mode === 'halo' ? 1.5 + s.w * 0.9 : 1.5 + s.w * 1.6) * objScale;
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
    hovered = raycaster.ray.distanceSqToPoint(obj.position) < (1.15 * objScale) ** 2;
    const blocked = e.target.closest && e.target.closest('a,button,input,textarea,select,video');
    hero.style.cursor = hovered && !blocked ? 'pointer' : '';
  }
  if (!reduced) {
    addEventListener('pointermove', onPointer, { passive: true });
    addEventListener('pointerdown', onPointer, { passive: true });
  }
  hero.addEventListener('click', e => {
    if (e.target.closest('a,button,input,textarea,select,video')) return;
    onPointer(e);
    if (hovered) { burst(); setTimeout(openChat, 250); }
  });

  let energy = 0, kick = 0, kickVel = 0;
  function burst() {
    energy = 1; kickVel += 0.07;
    emitRipple(1.4); setTimeout(() => emitRipple(1.1), 140); setTimeout(() => emitRipple(0.8), 280);
    for (let i = 0; i < nNear; i++) {   // push nearby particles outwards
      const k = i * 3, dx = pos[k] - anchor.x, dy = pos[k + 1] - anchor.y, dz = pos[k + 2];
      const d = Math.hypot(dx, dy, dz) || 1, f = (0.05 + Math.random() * 0.07) * objScale;
      vel[k] += dx / d * f; vel[k + 1] += dy / d * f; vel[k + 2] += dz / d * f;
    }
  }

  /* ---------- animation ---------- */
  const clock = new THREE.Clock();
  let t = 0, startT = null, frame = 0, running = false, rafId = 0, ready = false;
  let speak = 0, rippleClock = 0, hoverAmt = 0;
  const fpsSamples = [];
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
    camera.position.set(ndcSmooth.x * 0.6 * e, 4 * (1 - e) + ndcSmooth.y * 0.45 * e, DIST + 14 * (1 - e));
    camera.lookAt(0, 0, 0);

    // "voice": speak while the hint types, with a syllable-like flutter
    hoverAmt += ((hovered ? 1 : 0) - hoverAmt) * 0.08;
    speak += ((talking ? 1 : 0) - speak) * 0.06;
    energy *= 0.95;
    const syllable = Math.abs(Math.sin(t * 9.5) * Math.sin(t * 3.7 + 1.3));
    orbMat.uniforms.uTime.value = t;
    orbMat.uniforms.uAmp.value = 0.022 + speak * (0.025 + 0.05 * syllable) + hoverAmt * 0.02 + energy * 0.16;
    orbMat.uniforms.uFreq.value = 1.1 + speak * 0.4 + energy * 0.8;
    orbMat.uniforms.uGlow.value = 1 + hoverAmt * 0.5 + speak * 0.25 * syllable + energy;
    if (!reduced && speak > 0.5) {                   // ripple rings while speaking
      rippleClock -= dt;
      if (rippleClock <= 0) { emitRipple(0.55 + syllable * 0.4); rippleClock = 0.55; }
    }

    // orb: entrance scale, float, click "kick", parallax tilt, slow spin
    kickVel += -kick * 0.12; kickVel *= 0.82; kick += kickVel;
    const breath = 1 + Math.sin(t * 1.3) * 0.015 + speak * syllable * 0.03;
    obj.scale.setScalar(objScale * (0.3 + 0.7 * easeBack(intro)) * (breath + kick + hoverAmt * 0.04));
    obj.position.y = anchor.y + Math.sin(t * 0.9) * 0.08 * objScale;
    tilt.rotation.x = THREE.MathUtils.lerp(tilt.rotation.x, -ndcSmooth.y * CONFIG.parallax, 0.08);
    tilt.rotation.y = THREE.MathUtils.lerp(tilt.rotation.y, ndcSmooth.x * CONFIG.parallax * 1.3, 0.08);
    orb.rotation.y += dt * 0.12 * CONFIG.speed;
    aura.material.opacity = (0.36 + 0.1 * Math.sin(t * 1.3) + hoverAmt * 0.15 + speak * 0.12 * syllable + energy * 0.3) * e;
    aura.scale.setScalar(3.6 * (1 + hoverAmt * 0.12 + energy * 0.35));
    if (useBloom) bloom.strength = CONFIG.bloom.strength * (1 + hoverAmt * 0.4 + energy);

    // ripple rings
    for (const r of ripples) {
      if (r.t >= 1) { r.mesh.material.opacity = 0; continue; }
      r.t = Math.min(1, r.t + dt * 0.75);
      r.mesh.scale.setScalar(1.02 + ease(r.t) * (REACH - 1.02));
      r.mesh.material.opacity = (1 - r.t) * 0.5 * r.strength;
      r.mesh.quaternion.copy(camera.quaternion);
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
        const f = (1 - d2 / repelR2) * 0.012 * (1 + hoverAmt);
        vel[k] += dx * f; vel[k + 1] += dy * f;
      }
      vel[k] *= 0.9; vel[k + 1] *= 0.9; vel[k + 2] *= 0.9;
      pos[k] += vel[k]; pos[k + 1] += vel[k + 1]; pos[k + 2] += vel[k + 2];
    }
    pGeo.attributes.position.needsUpdate = true;
    pMat.uniforms.uFade.value = e * (1 + energy * 0.6);

    // faint connecting lines between nearby particles (every other frame is plenty)
    if (frame % 2 === 0 || reduced) {
      const L = CONFIG.linkDistance * objScale * REACH, L2 = L * L;
      let n = 0;
      for (let i = 0; i < nNear && n < MAX_SEG; i++) {
        const a = i * 3;
        for (let j = i + 1; j < nNear && n < MAX_SEG; j++) {
          const b = j * 3, dx = pos[a] - pos[b], dy = pos[a + 1] - pos[b + 1], dz = pos[a + 2] - pos[b + 2], d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > L2) continue;
          const mx = (pos[a] + pos[b]) / 2 - mouseWorld.x, my = (pos[a + 1] + pos[b + 1]) / 2 - mouseWorld.y;
          const near = pointerActive ? Math.max(0, 1 - (mx * mx + my * my) / (repelR2 * 2.2)) : 0;
          const alpha = (1 - Math.sqrt(d2) / L) * 0.16 * e * (1 + near * 2 + energy + speak * 0.4);
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

    hint.style.opacity = e;
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
      const median = [...fpsSamples].sort((a, b) => a - b)[45];
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
  startTyping();
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

function injectHintStyles() {
  if (document.getElementById('hero3d-hint-css')) return;
  const s = document.createElement('style');
  s.id = 'hero3d-hint-css';
  s.textContent = `
    .hero .hero3d-hint{ position:absolute; z-index:2; transform:translateX(-50%); display:inline-flex; align-items:center; gap:8px;
      max-width:min(320px, 40vw); padding:9px 16px; border-radius:999px; cursor:pointer; opacity:0;
      font:500 13px/1.3 'Segoe UI',system-ui,sans-serif; color:#e8f2ff; white-space:nowrap;
      background:rgba(14,22,38,.62); border:1px solid rgba(139,92,246,.45);
      box-shadow:0 0 0 1px rgba(34,211,238,.08) inset, 0 8px 30px -10px rgba(99,102,241,.55);
      backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); transition:border-color .25s, box-shadow .25s; }
    .hero .hero3d-hint:hover, .hero .hero3d-hint:focus-visible{ border-color:rgba(34,211,238,.8); box-shadow:0 0 22px -4px rgba(34,211,238,.55); outline:none; }
    .hero .hero3d-hint[hidden]{ display:none; }
    .hero3d-hint-text{ overflow:hidden; text-overflow:ellipsis; }
    .hero3d-hint-spark{ background:linear-gradient(135deg,#22d3ee,#8b5cf6,#ec4899); -webkit-background-clip:text; background-clip:text; color:transparent; font-size:15px; }
    .hero3d-hint-caret{ width:2px; height:15px; background:#22d3ee; border-radius:2px; animation:hero3dCaret 1s steps(1) infinite; }
    @keyframes hero3dCaret{ 50%{ opacity:0; } }
    @media (prefers-reduced-motion: reduce){ .hero3d-hint-caret{ animation:none; } }`;
  document.head.appendChild(s);
}

// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT)
const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

// start last, after every const above (e.g. NOISE) is defined
if (hero && wrap && canvas && webglAvailable()) {
  try { init(); } catch (e) { console.warn('hero-3d disabled:', e); } // fallback stays visible
}
