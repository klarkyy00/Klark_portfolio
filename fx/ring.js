/* Scroll rings (2026-11-25): Websites, Dashboards, featured Projects.
   Tiles stand on a 3D ring; the section pins while you scroll and the ring turns, bringing each
   tile to the front with a short dwell. Premium motion (motion-design skill): no overshoot, eased
   follow, one signature curve. Falls back to the original layout with reduced motion / no 3D. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !(window.CSS && CSS.supports('transform-style', 'preserve-3d'))) return;
  var NAV = 58;

  function makeRing(o) {
    var tiles = o.tiles, N = tiles.length, grid = o.grid;
    if (N < 4) return;
    var track = document.createElement('div'); track.className = 'ring-track';
    var stage = document.createElement('div'); stage.className = 'ring-stage';
    var view = document.createElement('div'); view.className = 'ring-view';
    var floor = document.createElement('div'); floor.className = 'ring-floor'; floor.setAttribute('aria-hidden', 'true');
    var cap = document.createElement('div'); cap.className = 'ring-caption'; cap.setAttribute('aria-live', 'polite');
    cap.innerHTML = '<div class="ring-cap-inner"><span class="ring-count"></span><span class="ring-type"></span>' +
      '<h3 class="ring-title"></h3><p class="ring-desc"></p>' +
      '<a class="hero-cta primary ring-open"></a></div>' +
      '<div class="ring-rail" aria-hidden="true"><i></i></div><p class="ring-hint" aria-hidden="true">Scroll<span class="ring-keys"> or use ← →</span> to turn the ring</p>';
    var bg = document.createElement('div'); bg.className = 'ring-bg'; bg.setAttribute('aria-hidden', 'true');
    bg.innerHTML = '<div class="ring-bg-l"></div><div class="ring-bg-l"></div>';
    var bgL = bg.children, bgOn = 0, bgSrc = '';
    o.mount.parentNode.insertBefore(track, o.mount);
    track.appendChild(stage); stage.appendChild(bg); stage.appendChild(view); view.appendChild(floor); view.appendChild(grid); stage.appendChild(cap);
    o.section.classList.add('ring-mode'); grid.classList.add('ring');

    var elCount = cap.querySelector('.ring-count'), elType = cap.querySelector('.ring-type'), elTitle = cap.querySelector('.ring-title'),
        elDesc = cap.querySelector('.ring-desc'), elOpen = cap.querySelector('.ring-open'), capInner = cap.querySelector('.ring-cap-inner'), rail = cap.querySelector('.ring-rail i');
    if (o.external) { elOpen.target = '_blank'; elOpen.rel = 'noopener'; }
    if (o.onOpen) elOpen.addEventListener('click', function (e) { e.preventDefault(); o.onOpen(front); });

    var STEP = 360 / N, ZP = 120, ZS = 0.16, R = 0, stepPx = 0, trackTop = 0, travel = 1;
    var cur = 0, target = 0, started = false, raf = 0, front = -1, inView = false, intro = 0, introDone = false;

    function layout() {
      var phone = innerWidth <= 760; ZP = phone ? 60 : 120; ZS = phone ? 0.08 : 0.16;
      var w = phone ? Math.min(250, innerWidth * 0.66) : 320, gap = phone ? 18 : 34;
      grid.style.setProperty('--ring-w', w + 'px');
      R = Math.round((w + gap) / (2 * Math.tan(Math.PI / N)));
      var h = 0; tiles.forEach(function (t) { h = Math.max(h, t.offsetHeight); });
      grid.style.setProperty('--ring-h', h + 'px');
      tiles.forEach(function (t, i) { t.__k = -1; t.style.transform = 'rotateY(' + (i * STEP) + 'deg) translateZ(' + R + 'px)'; });
      stepPx = Math.round(innerHeight * (phone ? 0.3 : 0.34));
      travel = stepPx * (N - 1);
      track.style.height = 'calc(100vh - ' + NAV + 'px + ' + travel + 'px)';
      measure();
      target = angle(); if (!started) { cur = target; started = true; }
      kick();
    }
    function measure() { trackTop = track.getBoundingClientRect().top + scrollY - NAV; }
    function angle() {
      var p = Math.min(1, Math.max(0, (scrollY - trackTop) / travel));
      var x = p * (N - 1), k = Math.floor(x), f = x - k;          // dwell: hold each tile, then turn
      if (k >= N - 1) return (N - 1) * STEP;
      var t = Math.min(1, Math.max(0, (f - 0.2) / 0.6)); t = t * t * (3 - 2 * t);
      return (k + t) * STEP;
    }
    function frame() {
      raf = 0;
      target = angle();
      var d = target - cur, prev = cur;
      cur = Math.abs(d) < 0.02 ? target : cur + d * 0.14;
      var v = cur - prev;                                            // angular speed: drives the lean + floor glow
      if (intro > 0.002) intro *= 0.93; else intro = 0;
      var lean = Math.max(-5, Math.min(5, v * 1.4));                 // ring leans into the turn, settles when it stops
      grid.style.transform = 'translateZ(' + (-R - intro * 420) + 'px) rotateX(' + lean.toFixed(2) + 'deg) rotateY(' + (-(cur - intro * 70)).toFixed(3) + 'deg)';
      rail.style.transform = 'scaleX(' + (N > 1 ? Math.max(0, Math.min(1, cur / ((N - 1) * STEP))) : 1).toFixed(4) + ')';
      floor.style.opacity = (0.75 + Math.min(0.25, Math.abs(v) * 0.08)).toFixed(2);
      for (var i = 0; i < N; i++) {
        var a = ((i * STEP - cur) % 360 + 540) % 360 - 180, abs = Math.abs(a), t = tiles[i], vis = abs < 115;
        if (t.__vis !== vis) { t.__vis = vis; t.style.pointerEvents = vis ? '' : 'none'; }
        var op = !vis ? 0 : abs < 8 ? 1 : Math.max(0.18, 1 - (abs - 8) / 120);
        op = Math.round(op * 50) / 50;
        if (t.__o !== op) { t.__o = op; t.style.opacity = op; }
        if (vis) {
          var k = Math.max(0, 1 - abs / (STEP * 0.8)); k = Math.round(k * k * (3 - 2 * k) * 50) / 50;   // zoom: pushes forward + grows as it nears the front
          if (t.__k !== k) { t.__k = k; t.style.transform = 'rotateY(' + (i * STEP) + 'deg) translateZ(' + (R + k * ZP) + 'px) scale(' + (1 + k * ZS).toFixed(3) + ')'; }
          var px = Math.round(Math.max(-1, Math.min(1, a / 70)) * -14);                                   // screenshot drifts against the turn (parallax)
          if (t.__px !== px) { t.__px = px; t.style.setProperty('--px', px + 'px'); }
        }
      }
      var f = Math.max(0, Math.min(N - 1, Math.round(cur / STEP)));
      if (f !== front) setFront(f);
      if (cur !== target || intro > 0) kick();
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }

    function setFront(f) {
      var first = front < 0; front = f;
      tiles.forEach(function (t, i) { t.classList.toggle('ring-front', i === f); t.setAttribute('aria-current', i === f ? 'true' : 'false'); });
      var d = o.info[f];
      if (d.img && d.img !== bgSrc) {                                   // backdrop: the front project, blurred, crossfades in
        bgSrc = d.img; var nx = bgL[1 - bgOn], ol = bgL[bgOn];
        nx.style.backgroundImage = 'url("' + d.img.replace(/"/g, '%22') + '")';
        nx.classList.add('on'); ol.classList.remove('on'); bgOn = 1 - bgOn;
      }
      var apply = function () {
        elCount.textContent = (f + 1) + ' of ' + N; elType.textContent = d.type; elTitle.textContent = d.title; elDesc.textContent = d.desc;
        elOpen.href = d.href; elOpen.innerHTML = o.openLabel + (o.external ? ' <span aria-hidden="true">↗</span>' : '');
        elOpen.setAttribute('aria-label', o.openLabel + ': ' + d.title + (o.external ? ' (opens in a new tab)' : ''));
      };
      if (first || !capInner.animate) { apply(); return; }
      // swap the text now, then stagger it in. No wait on a fade-out: if the main thread is busy the
      // caption can never be left hidden, because its resting style is always fully visible.
      capInner.getAnimations({ subtree: true }).forEach(function (x) { x.cancel(); });
      apply();
      Array.prototype.forEach.call(capInner.children, function (c, m) {   // count, label, title, text, button
        c.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: m * 55, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
      });
    }
    function goTo(i, smooth) { window.scrollTo({ top: trackTop + i * stepPx + 2, behavior: smooth ? 'smooth' : 'auto' }); }
    tiles.forEach(function (t, i) {
      t.addEventListener('click', function (e) {
        if (i !== front) { e.preventDefault(); goTo(i, true); return; }
        if (o.onOpen) { e.preventDefault(); o.onOpen(i); }
      });
      t.addEventListener('focus', function () { if (i !== front) goTo(i, false); });
      t.addEventListener('keydown', function (e) {                       // arrow keys step the ring and move focus with it
        var k = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!k) return; e.preventDefault();
        var j = Math.max(0, Math.min(N - 1, i + k)); if (j !== i) { goTo(j, true); tiles[j].focus({ preventScroll: true }); }
      });
    });

    window.addEventListener('scroll', function () { if (inView) kick(); }, { passive: true });
    window.addEventListener('resize', layout, { passive: true });
    window.addEventListener('load', layout);
    if ('ResizeObserver' in window) {
      var lastH = 0;
      new ResizeObserver(function () { var h = document.documentElement.scrollHeight; if (Math.abs(h - lastH) > 2) { lastH = h; measure(); kick(); } }).observe(document.body);
    }
    new IntersectionObserver(function (es) { inView = es[0].isIntersecting; if (inView) { if (!introDone) { introDone = true; intro = 1; } kick(); } }, { rootMargin: '200px 0px' }).observe(track);
    layout(); setFront(0);
  }

  /* ---------- tile sections (Websites, Dashboards) ---------- */
  function tileSection(id, openLabel) {
    var sec = document.getElementById(id), grid = sec && sec.querySelector('.websites-grid');
    if (!grid) return;
    var tiles = Array.prototype.slice.call(grid.querySelectorAll(':scope > .site-tile'));
    tiles.forEach(function (t) { t.classList.remove('is-more', 'reveal'); });
    grid.classList.remove('has-more', 'more-open');
    var more = grid.nextElementSibling; if (more && more.classList.contains('show-more-row')) more.remove();
    var info = tiles.map(function (t) {
      var q = function (s) { var e = t.querySelector(s); return e ? e.textContent.trim() : ''; };
      var im = t.querySelector('.site-shot img'); return { href: t.href, img: im ? im.src : '', type: q('.site-type'), title: q('h3'), desc: q('.site-info p') };
    });
    makeRing({ section: sec, grid: grid, mount: grid, tiles: tiles, info: info, openLabel: openLabel, external: true });
  }
  tileSection('websites', 'Open site');
  tileSection('dashboards', 'Open dashboard');

  /* ---------- featured projects ---------- */
  (function () {
    var wrap = document.getElementById('cardWrap'), zone = document.querySelector('.projects-zone'), filter = document.getElementById('filterNav');
    if (!wrap || !zone || !filter) return;
    var cards = Array.prototype.slice.call(wrap.querySelectorAll(':scope > .card')).slice(0, 6);   // the page's featured order
    var grid = document.createElement('div'); grid.className = 'websites-grid ring-projects';
    var info = [], tiles = [];
    cards.forEach(function (c) {
      var img = c.querySelector('.screenshot-gallery img, .card-body img, video[poster]');
      var src = img ? (img.tagName === 'VIDEO' ? img.getAttribute('poster') : img.getAttribute('src')) : '';
      var q = function (s) { var e = c.querySelector(s); return e ? e.textContent.trim() : ''; };
      var res = c.querySelector('.case-result');
      var result = res ? res.textContent.replace(/^\s*Result\s*/, '').trim() : q('.card-desc');
      if (!c.id) c.id = 'case-' + c.dataset.id;
      var a = document.createElement('a'); a.className = 'site-tile proj-tile'; a.href = '#' + c.id;
      a.innerHTML = '<div class="site-shot"><img loading="lazy" decoding="async" alt=""><span class="site-live"></span></div>' +
        '<div class="site-info"><span class="site-type"></span><h3></h3></div>';
      var im = a.querySelector('img'); im.src = src; im.alt = q('.card-title') + ' screenshot';
      a.querySelector('.site-live').textContent = c.dataset.client === 'client' ? 'Client project' : 'Case study';
      a.querySelector('.site-type').textContent = q('.card-tag');
      a.querySelector('h3').textContent = q('.card-title');
      grid.appendChild(a); tiles.push(a);
      info.push({ href: '#' + c.id, img: im.src, type: q('.card-tag'), title: q('.card-title'), desc: result });
    });
    var head = zone.querySelector('.projects-head');
    var mount = document.createElement('div'); zone.insertBefore(mount, filter);
    makeRing({ section: zone, grid: grid, mount: mount, tiles: tiles, info: info, openLabel: 'Read the case study', external: false,
      onOpen: function (i) { openCase(cards[i]); } });
    mount.remove();

    // the full list stays below, collapsed: featured cases are already on the ring
    var row = wrap.nextElementSibling, btn = row && row.classList.contains('show-more-row') && row.querySelector('button');
    var all = wrap.querySelectorAll(':scope > .card');
    Array.prototype.forEach.call(all, function (c) { c.classList.add('is-more'); });
    wrap.classList.add('has-more');
    if (btn) btn.textContent = 'Browse all ' + all.length + ' projects';
    var label = document.createElement('p'); label.className = 'ring-list-label'; label.textContent = 'All projects, by platform';
    zone.insertBefore(label, filter);

    function openCase(card) {
      if (!wrap.classList.contains('more-open')) { wrap.classList.add('more-open'); if (row && row.parentNode) row.remove(); }
      if (card.classList.contains('hidden')) { var allBtn = filter.querySelector('[data-filter="all"]'); if (allBtn) allBtn.click(); }
      if (!card.classList.contains('open')) { var h = card.querySelector('.card-head'); if (h) h.click(); }
      setTimeout(function () {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        var h = card.querySelector('.card-head'); if (h) h.focus({ preventScroll: true });
      }, 60);
    }
  })();
})();
