/* hero-network.js — 3D "automation workflow network" behind the portfolio hero.
 * Vanilla JS + Canvas 2D with a tiny hand-rolled perspective projection. No deps.
 * Inserts <canvas class="hero-net"> as the first child of .hero (pointer-events:none).
 * Busy toward the left/right edges, faded in the centered text column.
 * Honors prefers-reduced-motion (single static frame), pauses off-screen / hidden tab.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ CONFIG */
  var CONFIG = {
    seed: 7,                 // layout seed (change for a different graph)
    cols: 9,                 // workflow stages, left -> right (desktop)
    colsMobile: 6,
    spanX: 1.04,             // half-width of the graph in world units (1 = hero edge)
    spanXMobile: 0.88,
    spreadY: 1.35,           // vertical spread of nodes within a stage (desktop)
    spreadYMobile: 0.8,
    maxPerCol: 3,            // max nodes per stage (desktop); mobile uses 2
    nodeSize: 0.072,         // node edge length in world units (x spans about -1..1)
    nodeSizeMobile: 0.11,
    opacity: 0.9,            // global opacity (desktop)
    opacityMobile: 0.6,      // global opacity on narrow screens (<760px)
    centerFade: 0.16,        // min opacity multiplier inside the text column
    textHalfWidth: 380,      // px half-width of the text column to keep calm
    fadeRamp: 240,           // px over which the center fade ramps back to 1
    fadeRampMobile: 150,
    spawnEvery: 0.9,         // seconds between new executions (jittered)
    packetSpeed: 0.42,       // world units per second along a link
    maxPackets: 36,
    rotateAmp: 0.32,         // radians of slow Y-rotation sway
    rotateSpeed: 0.07,       // sway speed
    parallax: 0.22,          // radians the graph tilts toward the pointer
    flyIn: 2.4,              // seconds of the camera fly-in
    camDist: 2.3,            // final camera distance
    dust: 46,                // background depth particles (0 to disable)
    labels: true,            // tiny node labels when big enough
    colors: {
      violet: '#8b5cf6', blue: '#60a5fa', cyan: '#22d3ee', pink: '#ec4899',
      panel: '21,24,58', link: [139, 92, 246], linkEnd: [34, 211, 238], text: '#a0a8d0'
    }
  };

  /* Node kinds: color + glyph id + tiny label */
  var KINDS = {
    trigger: { c: 'cyan',   g: 'bolt',  l: 'Trigger' },
    webhook: { c: 'blue',   g: 'hook',  l: 'Webhook' },
    ai:      { c: 'violet', g: 'spark', l: 'AI Agent' },
    code:    { c: 'blue',   g: 'code',  l: 'Code' },
    ifn:     { c: 'pink',   g: 'if',    l: 'IF' },
    sheet:   { c: 'cyan',   g: 'sheet', l: 'Sheets' },
    mail:    { c: 'blue',   g: 'mail',  l: 'Gmail' },
    slack:   { c: 'violet', g: 'hash',  l: 'Slack' },
    http:    { c: 'violet', g: 'globe', l: 'HTTP' }
  };
  var MID = ['ai', 'code', 'ifn', 'http', 'ai', 'sheet'];
  var END = ['mail', 'slack', 'sheet'];

  /* ------------------------------------------------------------------ setup */
  var hero = document.querySelector('.hero');
  if (!hero) return;
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;

  canvas.className = 'hero-net';
  canvas.setAttribute('aria-hidden', 'true');
  // isolation makes .hero a stacking context, so z-index:-1 sits above the hero's own
  // background but below every child (no need to touch the children's positioning).
  var st = document.createElement('style');
  st.textContent =
    '.hero{isolation:isolate}' +
    '.hero>canvas.hero-net{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block;' +
    '-webkit-mask-image:linear-gradient(to bottom,#000 78%,transparent);mask-image:linear-gradient(to bottom,#000 78%,transparent)}';
  document.head.appendChild(st);
  hero.insertBefore(canvas, hero.firstChild);

  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, dpr = 1, mobile = false;
  var nodes = [], links = [], packets = [], dust = [];
  var time = 0, spawnT = 0, last = 0, raf = 0, onScreen = true;
  var tilt = { x: 0, y: 0, tx: 0, ty: 0 };

  function rng(seed) { // mulberry32
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function pick(r, a) { return a[Math.floor(r() * a.length)]; }
  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; }

  /* Pre-rendered glow sprites (much cheaper than shadowBlur) */
  var sprites = {};
  ['violet', 'blue', 'cyan', 'pink'].forEach(function (k) {
    var s = document.createElement('canvas'); s.width = s.height = 64;
    var g = s.getContext('2d'), c = hexRgb(CONFIG.colors[k]);
    var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(' + c + ',0.9)');
    gr.addColorStop(0.25, 'rgba(' + c + ',0.35)');
    gr.addColorStop(1, 'rgba(' + c + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    sprites[k] = s;
  });

  /* ------------------------------------------------------------------ graph */
  function build() {
    var r = rng(CONFIG.seed), cols = mobile ? CONFIG.colsMobile : CONFIG.cols;
    var maxPer = mobile ? 2 : CONFIG.maxPerCol, byCol = [];
    nodes = []; links = []; packets = [];
    for (var i = 0; i < cols; i++) {
      var sx = mobile ? CONFIG.spanXMobile : CONFIG.spanX, sy = mobile ? CONFIG.spreadYMobile : CONFIG.spreadY;
      var x = -sx + 2 * sx * i / (cols - 1), central = Math.abs(x) < 0.36;
      var n = central ? 1 : 1 + Math.floor(r() * maxPer), col = [];
      for (var k = 0; k < n; k++) {
        var kind = i === 0 ? pick(r, ['trigger', 'webhook']) : i === cols - 1 ? pick(r, END) : pick(r, MID);
        var nd = {
          x: x + (r() - 0.5) * 0.08,
          ny: central ? (r() < 0.5 ? -0.6 : 0.6) * sy : ((k + 0.5) / n - 0.5) * sy + (r() - 0.5) * 0.2,
          z: central ? 0.45 + r() * 0.3 : (r() - 0.5) * 0.7,  // central stages sit far back
          kind: KINDS[kind], col: i, out: [], fire: 0, ph: r() * 6.28, p: {}
        };
        nodes.push(nd); col.push(nd);
      }
      byCol.push(col);
    }
    function link(a, b) {
      for (var j = 0; j < a.out.length; j++) if (a.out[j].b === b) return;
      var L = { a: a, b: b, sp: [] }; a.out.push(L); links.push(L);
    }
    for (i = 0; i < cols - 1; i++) {
      var A = byCol[i], B = byCol[i + 1];
      B.forEach(function (b) { link(pick(r, A), b); });                 // every node has an input
      A.forEach(function (a) { if (!a.out.length) link(a, pick(r, B)); }); // and an output
      A.forEach(function (a) { if (r() < 0.25) link(a, pick(r, B)); });   // extra branches
    }
    dust = [];
    for (i = 0; i < (mobile ? CONFIG.dust >> 1 : CONFIG.dust); i++)
      dust.push({ x: (r() - 0.5) * 2.8, ny: (r() - 0.5) * 1.6, z: (r() - 0.5) * 2, p: {} });
  }

  /* ------------------------------------------------------------------ projection */
  var cam = { d: CONFIG.camDist, ry: 0, rx: 0, yR: 0.5, U: 1 };
  function project(o) {
    var y = o.ny * cam.yR, cy = Math.cos(cam.ry), sy = Math.sin(cam.ry);
    var x1 = o.x * cy + o.z * sy, z1 = -o.x * sy + o.z * cy;
    var cx = Math.cos(cam.rx), sx = Math.sin(cam.rx);
    var y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
    var s = cam.d / (cam.d + z2), p = o.p;
    p.x = W / 2 + x1 * s * cam.U; p.y = H / 2 + y2 * s * cam.U; p.s = s; p.z = z2;
    // depth fade (near = 1, far = ~0.3) times the center-column calm zone
    var depth = Math.max(0.25, Math.min(1, 0.65 - z2 * 0.55));
    p.a = depth * centerAlpha(p.x);
    return p;
  }
  function centerAlpha(x) {
    var half = Math.min(CONFIG.textHalfWidth, W * 0.36);
    var cf = Math.min(1, Math.max(0, (Math.abs(x - W / 2) - half * 0.55) / (mobile ? CONFIG.fadeRampMobile : CONFIG.fadeRamp)));
    return CONFIG.centerFade + (1 - CONFIG.centerFade) * cf * cf;
  }
  // Bezier from a's output port to b's input port (screen space, horizontal tangents)
  function curve(L) {
    var a = L.a.p, b = L.b.p, hs = (mobile ? CONFIG.nodeSizeMobile : CONFIG.nodeSize) * cam.U / 2;
    var x0 = a.x + hs * a.s, x3 = b.x - hs * b.s, k = Math.max(30, (x3 - x0) * 0.5);
    return [x0, a.y, x0 + k, a.y, x3 - k, b.y, x3, b.y];
  }
  function bez(c, t) {
    var u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
    return [a * c[0] + b * c[2] + d * c[4] + e * c[6], a * c[1] + b * c[3] + d * c[5] + e * c[7]];
  }

  /* ------------------------------------------------------------------ executions */
  function send(L) {
    if (packets.length >= CONFIG.maxPackets) return;
    var dx = L.b.x - L.a.x, dy = (L.b.ny - L.a.ny) * cam.yR;
    packets.push({ L: L, t: 0, v: CONFIG.packetSpeed / Math.max(0.12, Math.sqrt(dx * dx + dy * dy)) });
  }
  function arrive(n) {
    n.fire = 1;
    if (!n.out.length) return;
    if (n.kind.g === 'if' || Math.random() < 0.18) n.out.forEach(send); // branch fan-out
    else send(n.out[Math.floor(Math.random() * n.out.length)]);
  }
  function startExecution() {
    var starts = nodes.filter(function (n) { return n.col === 0; });
    var s = starts[Math.floor(Math.random() * starts.length)];
    if (s) { s.fire = 1; s.out.forEach(send); }
  }

  /* ------------------------------------------------------------------ glyphs */
  function glyph(g, x, y, r) {
    ctx.beginPath();
    switch (g) {
      case 'bolt': ctx.moveTo(x + r * .2, y - r); ctx.lineTo(x - r * .5, y + r * .15); ctx.lineTo(x, y + r * .15);
        ctx.lineTo(x - r * .2, y + r); ctx.lineTo(x + r * .5, y - r * .15); ctx.lineTo(x, y - r * .15); ctx.closePath(); ctx.fill(); return;
      case 'spark': ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
        ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill(); return;
      case 'hook': ctx.arc(x, y - r * .3, r * .45, Math.PI * .8, Math.PI * 2.2); ctx.moveTo(x, y + r * .15); ctx.lineTo(x, y + r * .8); break;
      case 'code': ctx.moveTo(x - r * .25, y - r * .7); ctx.lineTo(x - r * .8, y); ctx.lineTo(x - r * .25, y + r * .7);
        ctx.moveTo(x + r * .25, y - r * .7); ctx.lineTo(x + r * .8, y); ctx.lineTo(x + r * .25, y + r * .7); break;
      case 'if': ctx.moveTo(x, y - r * .8); ctx.lineTo(x + r * .8, y); ctx.lineTo(x, y + r * .8); ctx.lineTo(x - r * .8, y); ctx.closePath(); break;
      case 'sheet': ctx.rect(x - r * .7, y - r * .7, r * 1.4, r * 1.4); ctx.moveTo(x - r * .7, y); ctx.lineTo(x + r * .7, y); ctx.moveTo(x, y - r * .7); ctx.lineTo(x, y + r * .7); break;
      case 'mail': ctx.rect(x - r * .8, y - r * .55, r * 1.6, r * 1.1); ctx.moveTo(x - r * .8, y - r * .55); ctx.lineTo(x, y + r * .1); ctx.lineTo(x + r * .8, y - r * .55); break;
      case 'hash': ctx.moveTo(x - r * .25, y - r * .8); ctx.lineTo(x - r * .4, y + r * .8); ctx.moveTo(x + r * .4, y - r * .8); ctx.lineTo(x + r * .25, y + r * .8);
        ctx.moveTo(x - r * .75, y - r * .3); ctx.lineTo(x + r * .8, y - r * .3); ctx.moveTo(x - r * .8, y + r * .3); ctx.lineTo(x + r * .75, y + r * .3); break;
      case 'globe': ctx.arc(x, y, r * .75, 0, 6.283); ctx.moveTo(x - r * .75, y); ctx.lineTo(x + r * .75, y); ctx.ellipse(x, y, r * .32, r * .75, 0, 0, 6.283); break;
    }
    ctx.stroke();
  }
  function rrect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /* ------------------------------------------------------------------ frame */
  function draw(dt) {
    time += dt;
    // camera: fly-in (ease-out cubic), slow sway, eased pointer parallax
    var fi = Math.min(1, time / CONFIG.flyIn), e = 1 - Math.pow(1 - fi, 3);
    tilt.x += (tilt.tx - tilt.x) * Math.min(1, dt * 2.5);
    tilt.y += (tilt.ty - tilt.y) * Math.min(1, dt * 2.5);
    cam.d = CONFIG.camDist + (1 - e) * 3.2;
    cam.ry = Math.sin(time * CONFIG.rotateSpeed * 6.283) * CONFIG.rotateAmp * 0.5 + tilt.x + (1 - e) * 0.5;
    cam.rx = Math.sin(time * CONFIG.rotateSpeed * 4.1) * 0.06 + tilt.y + (1 - e) * 0.25;
    var G = (mobile ? CONFIG.opacityMobile : CONFIG.opacity) * e;
    var C = CONFIG.colors, ns = (mobile ? CONFIG.nodeSizeMobile : CONFIG.nodeSize) * cam.U;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var i, p;

    // dust (depth cue)
    ctx.fillStyle = '#a5b4fc';
    for (i = 0; i < dust.length; i++) {
      p = project(dust[i]); if (p.s <= 0) continue;
      ctx.globalAlpha = G * p.a * 0.35;
      ctx.fillRect(p.x, p.y, 1.4 * p.s, 1.4 * p.s);
    }

    for (i = 0; i < nodes.length; i++) project(nodes[i]);

    // links
    ctx.lineWidth = mobile ? 1 : 1.3;
    for (i = 0; i < links.length; i++) {
      var L = links[i], c = L.c = curve(L), a = L.a.p, b = L.b.p;
      var gr = ctx.createLinearGradient(c[0], c[1], c[6], c[7]);
      gr.addColorStop(0, 'rgba(' + C.link + ',' + (G * a.a * 0.55).toFixed(3) + ')');
      gr.addColorStop(0.5, 'rgba(' + C.link + ',' + (G * centerAlpha((c[0] + c[6]) / 2) * 0.4).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(' + C.linkEnd + ',' + (G * b.a * 0.55).toFixed(3) + ')');
      ctx.globalAlpha = 1; ctx.strokeStyle = gr;
      ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.bezierCurveTo(c[2], c[3], c[4], c[5], c[6], c[7]); ctx.stroke();
    }

    // packets (with a short fading trail)
    for (i = packets.length - 1; i >= 0; i--) {
      var pk = packets[i]; pk.t += pk.v * dt;
      if (pk.t >= 1) { packets.splice(i, 1); arrive(pk.L.b); continue; }
      if (!pk.L.c) continue;
      for (var k = 3; k >= 0; k--) {
        var tt = pk.t - k * 0.035; if (tt < 0) continue;
        var q = bez(pk.L.c, tt), al = G * centerAlpha(q[0]) * (1 - k * 0.24), s = (k ? 5 : 9) * (pk.L.a.p.s + pk.L.b.p.s) / 2;
        ctx.globalAlpha = al;
        ctx.drawImage(sprites.cyan, q[0] - s * 1.6, q[1] - s * 1.6, s * 3.2, s * 3.2);
        if (!k) { ctx.fillStyle = '#e0fbff'; ctx.beginPath(); ctx.arc(q[0], q[1], 1.6 * pk.L.b.p.s, 0, 6.283); ctx.fill(); }
      }
    }

    // nodes, far to near
    var order = nodes.slice().sort(function (m, n) { return n.p.z - m.p.z; });
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (i = 0; i < order.length; i++) {
      var n = order[i], np = n.p, col = C[n.kind.c], sz = ns * np.s, h = sz / 2;
      if (n.fire > 0) n.fire = Math.max(0, n.fire - dt * 1.6);
      var al2 = G * np.a, pulse = n.fire * n.fire, breathe = 0.5 + 0.5 * Math.sin(time * 1.3 + n.ph);
      // glow halo (soft, larger when far = blur-ish) + fire pulse
      ctx.globalAlpha = al2 * (0.22 + 0.12 * breathe + 0.7 * pulse);
      var gs = sz * (1.9 + pulse * 1.2 + (1 - np.s) * 1.5);
      ctx.drawImage(sprites[n.kind.c], np.x - gs, np.y - gs, gs * 2, gs * 2);
      // body
      ctx.globalAlpha = al2;
      rrect(np.x - h, np.y - h, sz, sz, sz * 0.24);
      ctx.fillStyle = 'rgba(' + C.panel + ',0.88)'; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1 + pulse; ctx.globalAlpha = al2 * (0.55 + 0.45 * pulse); ctx.stroke();
      // ports
      ctx.globalAlpha = al2 * 0.8; ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(np.x - h, np.y, 2 * np.s, 0, 6.283); ctx.arc(np.x + h, np.y, 2 * np.s, 0, 6.283); ctx.fill();
      // glyph + label
      if (sz > 14) {
        ctx.globalAlpha = al2 * (0.75 + 0.25 * pulse); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1, sz * 0.045);
        glyph(n.kind.g, np.x, np.y, sz * 0.26);
      }
      if (CONFIG.labels && sz > 34 && np.a > 0.45) {
        ctx.globalAlpha = al2 * 0.7; ctx.fillStyle = C.text;
        ctx.font = '600 ' + Math.round(9 * np.s + 1) + 'px system-ui,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(n.kind.l, np.x, np.y + h + 12 * np.s);
      }
    }
    ctx.globalAlpha = 1;

    // schedule new executions
    spawnT -= dt;
    if (spawnT <= 0 && fi > 0.5) { startExecution(); spawnT = CONFIG.spawnEvery * (0.6 + Math.random() * 0.8); }
  }

  /* ------------------------------------------------------------------ loop & lifecycle */
  function loop(ts) {
    raf = 0;
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016; last = ts;
    draw(dt);
    schedule();
  }
  function schedule() {
    if (!raf && !reduced && onScreen && !document.hidden) raf = requestAnimationFrame(loop);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }

  function resize() {
    var r = hero.getBoundingClientRect(), wasMobile = mobile;
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    mobile = (window.innerWidth || W) < 760;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    cam.U = W / 2; cam.yR = (H / W) * 0.92;
    if (!nodes.length || wasMobile !== mobile) build();
    if (reduced) staticFrame(); else if (time > 0) draw(0); // resizing clears the canvas: repaint now
  }
  function staticFrame() {
    time = CONFIG.flyIn + 3; // skip the fly-in
    draw(0);
    if (reduced) {
      packets = [];
      // freeze a few packets mid-flight so the still frame reads as "running"
      for (var i = 0; i < links.length; i += 2) packets.push({ L: links[i], t: 0.3 + (i % 5) * 0.12, v: 0 });
      draw(0);
    }
  }

  window.addEventListener('pointermove', function (ev) {
    if (reduced) return;
    tilt.tx = (ev.clientX / window.innerWidth - 0.5) * CONFIG.parallax;
    tilt.ty = (ev.clientY / window.innerHeight - 0.5) * CONFIG.parallax * 0.5;
  }, { passive: true });

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(hero);
  else window.addEventListener('resize', resize);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      onScreen = en[0].isIntersecting;
      if (onScreen) schedule(); else stop();
    }).observe(hero);
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else schedule(); });

  resize();
  if (reduced) staticFrame(); else { time = 0; schedule(); }

  window.HeroNet = { config: CONFIG, canvas: canvas, stats: function () {
    return { nodes: nodes.length, links: links.length, packets: packets.length, running: !!raf, reduced: reduced, mobile: mobile };
  } };
})();
