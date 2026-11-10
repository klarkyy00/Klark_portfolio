/* =====================================================================
   fx/motion.js  -  scroll-motion layer for the portfolio (pairs with fx/motion.css)
   - Section h2s: centre-out mask wipe + accent bar grows
   - Grid children cascade in (fade + rise + blur-to-sharp + small rotateX)
   - Process section: SVG "workflow wire" draws with scroll, data packet rides it,
     each .process-number lights up as the wire reaches it
   - Subtle parallax on headings / sub-copy / decorative orbs (CSS `translate`, so it
     never fights the reveal `transform`)
   - Sticky .top-nav gets stronger glass + animated underline after the hero
   Progressive enhancement: nothing is hidden unless this script adds html.fx-motion.
   Reduced motion: no hiding, no scroll-linked motion; wire is drawn fully, all steps lit.
   ===================================================================== */
(function () {
  'use strict';

  /* ------------------------------ CONFIG ------------------------------ */
  var CONFIG = {
    stagger: 90,            // ms between items that enter together (70-110 feels right)
    maxStaggerSteps: 8,     // cap so long batches never wait more than stagger*cap
    itemDuration: 900,      // ms, must match --fx-dur in motion.css (used for cleanup timing)
    headingDuration: 1450,  // ms until heading clip-path is removed
    revealRootMargin: '0px',            // was -8%: items in the bottom strip stayed hidden until the user scrolled
    revealThreshold: 0.08,

    // [container selector, child selector, soft?]  soft = rise only, no 3D tilt
    cascades: [
      ['.stats-grid', '.stat > *', true],
      ['.services-grid', '.service-card'],
      ['.process-steps', '.process-step'],
      ['.faq-section', '.faq-item'],
      ['.cert-grid', '.cert-card'],
      ['.websites-grid', '.site-tile'],
      ['.testimonial-grid', ':scope > *']
    ],
    headingSections: '.about-section, .services-section, .process-section, .faq-section, .cert-section, ' +
                     '.websites-section, .testimonials-section, .booking-section, .contact-section',

    // parallax: px of drift per px of distance from viewport centre, and hard cap (px)
    parallax: {
      heading: { k: 0.045, max: 18 },
      sub:     { k: 0.028, max: 12 },
      orb:     { k: 0.14,  max: 40 }
    },
    subSelectors: '.services-sub, .process-sub, .faq-sub, .websites-sub, .testimonials-sub, ' +
                  '.booking-section > p, .contact-section > p',
    // decorative orbs: [section selector, colour class, css position]
    orbs: [
      ['.services-section', 'fx-orb-v', 'left:-160px; top:40px;'],
      ['.process-section', 'fx-orb-c', 'right:-170px; top:10px;'],
      ['#websites', 'fx-orb-b', 'left:-180px; top:120px;'],
      ['#dashboards', 'fx-orb-v', 'right:-180px; top:60px;'],
      ['.testimonials-section', 'fx-orb-c', 'left:-150px; top:0;']
    ],

    // process wire
    wire: {
      focus: 0.70,          // viewport fraction: wire tip follows this line
      rowSpread: 0.11,      // same-row numbers: extra scroll (x viewport height) between lights
      gutter: 6,            // px from container edge for routed segments
      corner: 16,           // px corner radius of routed segments
      ease: 0.16,           // tip smoothing (0..1 per frame)
      loopMs: 2600,         // packet loop duration once fully drawn
      loopPause: 900        // pause between loops
    },

    navClass: 'fx-nav-scrolled'
  };

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function docTop(el) { var y = 0; while (el) { y += el.offsetTop; el = el.offsetParent; } return y; }

  /* ---------------- state ---------------- */
  var items = [];      // {el, kind:'item'|'h', top, bottom, done}
  var para = [];       // {el, cfg, center, last}
  var wire = null;     // process wire state
  var dirty = true, measureDirty = true, rafId = 0;
  var vh = window.innerHeight;

  /* ======================= reveal (headings + cascades) ======================= */
  function reveal(rec, delay, instant) {
    if (rec.done) return;
    rec.done = true;
    var el = rec.el;
    if (rec.kind === 'h') {
      if (instant) { el.classList.add('fx-h-in', 'fx-h-done'); return; }
      el.classList.add('fx-h-in');
      setTimeout(function () { el.classList.add('fx-h-done'); }, CONFIG.headingDuration);
      return;
    }
    if (instant) {
      el.classList.add('fx-instant', 'fx-in');
    } else {
      el.style.setProperty('--fx-d', delay + 'ms');
      el.classList.add('fx-in');
    }
    // hand the element back to its own CSS (hover transitions etc.)
    setTimeout(function () {
      el.classList.remove('fx-item', 'fx-in', 'fx-instant', 'fx-soft');
      el.style.removeProperty('--fx-d');
    }, instant ? 30 : delay + CONFIG.itemDuration + 80);
  }

  function onIntersect(entries) {
    var batch = [];
    entries.forEach(function (en) {
      var rec = en.target.__fx;
      if (!rec || rec.done) return;
      if (en.isIntersecting) batch.push(en);
      else if (en.boundingClientRect.bottom < 0) reveal(rec, 0, true); // already scrolled past
    });
    batch.sort(function (a, b) {
      return (a.boundingClientRect.top - b.boundingClientRect.top) || (a.boundingClientRect.left - b.boundingClientRect.left);
    });
    var n = 0;
    batch.forEach(function (en) {
      var rec = en.target.__fx;
      io.unobserve(en.target);
      if (rec.kind === 'h') { reveal(rec, 0, false); return; }
      reveal(rec, Math.min(n++, CONFIG.maxStaggerSteps) * CONFIG.stagger, false);
    });
  }
  var io = null;

  function setupReveals() {
    // headings
    $all(CONFIG.headingSections).forEach(function (sec) {
      var h = sec.querySelector(':scope > h2');
      if (!h) return;
      h.classList.add('fx-h');
      // observe the section, not the h2: a zero-width clip-path inside an overflow:hidden
      // ancestor (contact section) makes Chrome report the h2 as never intersecting
      var rec = { el: h, kind: 'h', done: false, watch: sec };
      sec.__fx = rec;
      items.push(rec);
    });
    // cascades
    CONFIG.cascades.forEach(function (c) {
      $all(c[0]).forEach(function (box) {
        $all(c[1], box).forEach(function (el) {
          if (el.__fx) return;
          el.classList.remove('reveal');          // take over from the page's per-card reveal
          el.classList.add('fx-item');
          if (c[2]) el.classList.add('fx-soft');
          items.push({ el: el, kind: 'item', done: false });
        });
      });
    });
    items.forEach(function (rec) { if (rec.kind !== 'h') rec.el.__fx = rec; });

    io = new IntersectionObserver(onIntersect, { rootMargin: CONFIG.revealRootMargin, threshold: CONFIG.revealThreshold });
    items.forEach(function (rec) { io.observe(rec.watch || rec.el); });

    // keyboard users: anything focused inside a hidden item is revealed at once
    document.addEventListener('focusin', function (e) {
      var t = e.target;
      while (t && t !== document.body) {
        if (t.__fx && !t.__fx.done) { io.unobserve(t.__fx.watch || t); reveal(t.__fx, 0, true); }
        t = t.parentNode;
      }
    }, true);
  }

  /* ======================= nav ======================= */
  function setupNav() {
    var nav = document.querySelector('.top-nav');
    var hero = document.querySelector('.hero');
    if (!nav || !hero) return;
    new IntersectionObserver(function (es) {
      var en = es[0];
      nav.classList.toggle(CONFIG.navClass, !en.isIntersecting && en.boundingClientRect.top < 0);
    }, { rootMargin: '-60px 0px 0px 0px', threshold: 0 }).observe(hero);
  }

  /* ======================= parallax + orbs ======================= */
  function setupParallax() {
    CONFIG.orbs.forEach(function (o) {
      var sec = document.querySelector(o[0]);
      if (!sec) return;
      sec.classList.add('fx-depth');
      var orb = document.createElement('div');
      orb.className = 'fx-orb ' + o[1];
      orb.setAttribute('aria-hidden', 'true');
      orb.style.cssText = o[2];
      sec.insertBefore(orb, sec.firstChild);
      para.push({ el: orb, cfg: CONFIG.parallax.orb, center: 0, last: null });
    });
    items.forEach(function (rec) {
      if (rec.kind === 'h') para.push({ el: rec.el, cfg: CONFIG.parallax.heading, center: 0, last: null });
    });
    $all(CONFIG.subSelectors).forEach(function (el) {
      para.push({ el: el, cfg: CONFIG.parallax.sub, center: 0, last: null });
    });
  }

  /* ======================= process wire ======================= */
  function svgEl(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // polyline -> path with rounded corners
  function roundedPath(pts, r) {
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 1; i < pts.length; i++) {
      var p = pts[i];
      if (i < pts.length - 1) {
        var a = pts[i - 1], b = pts[i + 1];
        var l1 = Math.hypot(p[0] - a[0], p[1] - a[1]), l2 = Math.hypot(b[0] - p[0], b[1] - p[1]);
        var rr = Math.min(r, l1 / 2, l2 / 2);
        if (rr > 0.5 && l1 > 0 && l2 > 0) {
          var p1 = [p[0] + (a[0] - p[0]) * rr / l1, p[1] + (a[1] - p[1]) * rr / l1];
          var p2 = [p[0] + (b[0] - p[0]) * rr / l2, p[1] + (b[1] - p[1]) * rr / l2];
          d += ' L' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) +
               ' Q' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
          continue;
        }
      }
      d += ' L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    }
    return d;
  }

  function setupWire() {
    var box = document.querySelector('.process-section .process-steps');
    if (!box) return;
    var steps = $all(':scope > .process-step', box);
    var nums = steps.map(function (s) { return s.querySelector('.process-number'); });
    if (steps.length < 2 || nums.some(function (n) { return !n; })) return;

    var svg = svgEl('svg', { 'class': 'fx-wire', 'aria-hidden': 'true', focusable: 'false' });
    var defs = svgEl('defs', {}, svg);
    var grad = svgEl('linearGradient', { id: 'fxWireGrad', gradientUnits: 'userSpaceOnUse' }, defs);
    svgEl('stop', { offset: '0', 'stop-color': '#8b5cf6' }, grad);
    svgEl('stop', { offset: '0.5', 'stop-color': '#3b82f6' }, grad);
    svgEl('stop', { offset: '1', 'stop-color': '#22d3ee' }, grad);
    var track = svgEl('path', { 'class': 'fx-wire-track' }, svg);
    var glow = svgEl('path', { 'class': 'fx-wire-glow' }, svg);
    var line = svgEl('path', { 'class': 'fx-wire-line' }, svg);
    var packet = svgEl('g', { 'class': 'fx-packet' }, svg);
    svgEl('circle', { 'class': 'fx-packet-halo', r: 11 }, packet);
    svgEl('circle', { 'class': 'fx-packet-core', r: 4.5 }, packet);
    var probe = svgEl('path', { fill: 'none' }, svg); // used only to measure prefix lengths
    probe.style.display = 'none';
    box.insertBefore(svg, box.firstChild);
    box.classList.add('fx-wired');

    wire = {
      box: box, steps: steps, nums: nums, svg: svg, grad: grad, track: track, glow: glow, line: line,
      packet: packet, probe: probe, total: 0, lens: [], keys: [], shown: reduce ? 1e9 : 0, target: 0,
      inView: false, loopStart: 0, lit: []
    };
    new IntersectionObserver(function (es) { wire.inView = es[0].isIntersecting; kick(); }, { threshold: 0 })
      .observe(box);
  }

  // layout reads only (called from measure())
  function buildWire() {
    var w = wire, box = w.box;
    var W = box.clientWidth, H = box.clientHeight;
    var c = w.nums.map(function (n, i) {
      var s = w.steps[i];
      return {
        x: s.offsetLeft + n.offsetLeft + n.offsetWidth / 2,
        y: s.offsetTop + n.offsetTop + n.offsetHeight / 2,
        top: s.offsetTop + n.offsetTop,
        cellBottom: s.offsetTop + s.offsetHeight
      };
    });
    var single = c.every(function (p) { return Math.abs(p.x - c[0].x) < 4; });
    var g = CONFIG.wire.gutter;
    var pts = [[c[0].x, c[0].y]], idx = [0];
    for (var i = 0; i < c.length - 1; i++) {
      var A = c[i], B = c[i + 1];
      if (Math.abs(A.y - B.y) < 4) {
        pts.push([B.x, B.y]);
      } else if (single) {
        // stacked layout: run down the left gutter, beside the text
        pts.push([g, A.y], [g, B.y], [B.x, B.y]);
      } else {
        // wrapped grid: exit to the nearer side, drop into the row gap, cross, drop into B
        var side = A.x > W / 2 ? W - g : g;
        var rowBottom = 0;
        c.forEach(function (p) { if (Math.abs(p.y - A.y) < 4) rowBottom = Math.max(rowBottom, p.cellBottom); });
        var yMid = (rowBottom + B.top) / 2;
        pts.push([side, A.y], [side, yMid], [B.x, yMid], [B.x, B.y]);
      }
      idx.push(pts.length - 1);
    }
    var d = roundedPath(pts, CONFIG.wire.corner);
    var lens = idx.map(function (k) {
      if (k === 0) return 0;
      w.probe.setAttribute('d', roundedPath(pts.slice(0, k + 1), CONFIG.wire.corner));
      return w.probe.getTotalLength();
    });
    w.probe.setAttribute('d', d);
    var total = w.probe.getTotalLength();
    lens[lens.length - 1] = total;

    // scroll keys: the doc-y the focus line must reach for each number to light
    var top = docTop(box), keys = [], run = 0;
    c.forEach(function (p, i) {
      run = (i > 0 && Math.abs(p.y - c[i - 1].y) < 4) ? run + 1 : 0;
      keys.push(top + p.y + run * vh * CONFIG.wire.rowSpread);
    });
    w.pending = { d: d, W: W, H: H, total: total };
    w.lens = lens; w.keys = keys; w.total = total;
  }

  function applyWireGeometry() {
    var w = wire, p = w.pending;
    if (!p) return;
    w.pending = null;
    [w.track, w.glow, w.line].forEach(function (el) { el.setAttribute('d', p.d); });
    w.grad.setAttribute('x1', 0); w.grad.setAttribute('y1', 0);
    w.grad.setAttribute('x2', Math.max(p.W, 1)); w.grad.setAttribute('y2', Math.max(p.H, 1));
    [w.glow, w.line].forEach(function (el) { el.style.strokeDasharray = p.total + ' ' + (p.total + 10); });
    if (w.shown > p.total) w.shown = p.total;
    w.lastDrawn = -1;
  }

  // returns true while it still needs frames
  function updateWire(now, scrollY) {
    var w = wire;
    if (reduce) { w.target = w.total; w.shown = w.total; }
    else {
      var f = scrollY + vh * CONFIG.wire.focus, k = w.keys, L = w.lens, t;
      if (f <= k[0]) t = 0;
      else if (f >= k[k.length - 1]) t = w.total;
      else {
        for (var i = 0; i < k.length - 1; i++) {
          if (f < k[i + 1]) { t = L[i] + (L[i + 1] - L[i]) * (f - k[i]) / Math.max(k[i + 1] - k[i], 1); break; }
        }
      }
      w.target = t;
      w.shown += (w.target - w.shown) * CONFIG.wire.ease;
      if (Math.abs(w.target - w.shown) < 0.4) w.shown = w.target;
    }
    var s = w.shown;
    if (s !== w.lastDrawn) {
      w.lastDrawn = s;
      var off = (w.total - s).toFixed(1);
      w.line.style.strokeDashoffset = off;
      w.glow.style.strokeDashoffset = off;
      for (var j = 0; j < w.steps.length; j++) {
        var lit = s >= w.lens[j] - 2 && (j > 0 || s > 0.5 || reduce);
        if (lit !== w.lit[j]) { w.lit[j] = lit; w.steps[j].classList.toggle('fx-lit', lit); }
      }
    }
    if (reduce) return false;

    // packet: rides the tip while drawing, loops along the finished wire while in view
    var complete = s >= w.total - 0.5, pos = -1;
    if (!complete) { if (s > 0.5) pos = s; w.loopStart = 0; }
    else if (w.inView) {
      if (!w.loopStart) w.loopStart = now;
      var cyc = (now - w.loopStart) % (CONFIG.wire.loopMs + CONFIG.wire.loopPause);
      if (cyc < CONFIG.wire.loopMs) {
        var u = cyc / CONFIG.wire.loopMs;
        pos = w.total * (u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
      }
    }
    if (pos >= 0) {
      var pt = w.line.getPointAtLength(pos);
      w.packet.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
    }
    w.packet.classList.toggle('on', pos >= 0);
    return w.shown !== w.target || (complete && w.inView);
  }

  /* ======================= measure / frame loop ======================= */
  function measure() {
    vh = window.innerHeight;
    items.forEach(function (rec) {
      if (rec.done) return;
      rec.top = docTop(rec.el); rec.bottom = rec.top + rec.el.offsetHeight;
    });
    para.forEach(function (p) { p.center = docTop(p.el) + p.el.offsetHeight / 2; });
    if (wire) buildWire();
  }

  function frame(now) {
    rafId = 0;
    var needMore = false;
    if (measureDirty) { measureDirty = false; measure(); dirty = true; }
    var sy = window.pageYOffset;
    // ---- writes only below this line ----
    if (wire) applyWireGeometry();
    if (dirty) {
      dirty = false;
      // catch-up: anything the user jumped past (anchor links) is shown instantly
      for (var i = 0; i < items.length; i++) {
        var rec = items[i];
        if (!rec.done && rec.bottom < sy) { io.unobserve(rec.watch || rec.el); reveal(rec, 0, true); }
      }
      if (!reduce) {
        var mid = sy + vh / 2;
        for (var j = 0; j < para.length; j++) {
          var p = para[j], dist = p.center - mid;
          if (Math.abs(dist) > vh * 1.4) continue;          // far off-screen: leave it
          var v = Math.round(clamp(-dist * p.cfg.k, -p.cfg.max, p.cfg.max) * 10) / 10;
          if (v !== p.last) { p.last = v; p.el.style.translate = '0 ' + v + 'px'; }
        }
      }
    }
    if (wire && updateWire(now || performance.now(), sy)) needMore = true;
    if (needMore) kick();
  }
  function kick() { if (!rafId) rafId = requestAnimationFrame(frame); }

  /* ======================= init ======================= */
  function init() {
    try {
      if (!reduce) {
        root.classList.add('fx-motion');
        setupReveals();
        setupNav();
        setupParallax();
      }
      setupWire();

      window.addEventListener('scroll', function () { dirty = true; kick(); }, { passive: true });
      window.addEventListener('resize', function () { measureDirty = true; kick(); }, { passive: true });
      window.addEventListener('load', function () { measureDirty = true; kick(); });
      if ('ResizeObserver' in window) {
        // accordions / images / fonts change page height -> cached positions go stale
        new ResizeObserver(function () { measureDirty = true; kick(); }).observe(document.body);
      }
      kick();
    } catch (err) {
      // never leave content hidden because of a script error
      root.classList.remove('fx-motion');
      if (window.console) console.warn('[fx/motion] disabled:', err);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
