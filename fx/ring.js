/* Websites ring (2026-11-25)
   The website tiles stand on a 3D ring; the section pins while you scroll and the ring turns,
   bringing each site to the front. Premium motion: no overshoot, eased follow (lerp), one
   signature curve. Falls back to the plain grid with reduced motion or without 3D support. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var sec = document.getElementById('websites');
  var grid = sec && sec.querySelector('.websites-grid');
  if (!sec || !grid || reduce || !(window.CSS && CSS.supports('transform-style', 'preserve-3d'))) return;

  var tiles = Array.prototype.slice.call(grid.querySelectorAll(':scope > .site-tile'));
  var N = tiles.length;
  if (N < 4) return;

  /* ---------- build ---------- */
  tiles.forEach(function (t) { t.classList.remove('is-more', 'reveal'); });
  grid.classList.remove('has-more', 'more-open');
  var more = grid.nextElementSibling;
  if (more && more.classList.contains('show-more-row')) more.remove();

  var track = document.createElement('div'); track.className = 'ring-track';
  var stage = document.createElement('div'); stage.className = 'ring-stage';
  var view = document.createElement('div'); view.className = 'ring-view';
  var floor = document.createElement('div'); floor.className = 'ring-floor'; floor.setAttribute('aria-hidden', 'true');
  var cap = document.createElement('div'); cap.className = 'ring-caption'; cap.setAttribute('aria-live', 'polite');
  cap.innerHTML = '<div class="ring-cap-inner"><span class="ring-count"></span><span class="ring-type"></span>' +
    '<h3 class="ring-title"></h3><p class="ring-desc"></p>' +
    '<a class="hero-cta primary ring-open" target="_blank" rel="noopener">Open site <span aria-hidden="true">↗</span></a></div>' +
    '<p class="ring-hint" aria-hidden="true">Scroll to turn the ring</p>';
  grid.parentNode.insertBefore(track, grid);
  track.appendChild(stage); stage.appendChild(view); view.appendChild(floor); view.appendChild(grid); stage.appendChild(cap);
  sec.classList.add('ring-mode'); grid.classList.add('ring');

  var info = tiles.map(function (t) {
    var q = function (s) { var e = t.querySelector(s); return e ? e.textContent.trim() : ''; };
    return { href: t.href, type: q('.site-type'), title: q('h3'), desc: q('.site-info p'), url: q('.site-url') };
  });
  var elCount = cap.querySelector('.ring-count'), elType = cap.querySelector('.ring-type'), elTitle = cap.querySelector('.ring-title'),
      elDesc = cap.querySelector('.ring-desc'), elOpen = cap.querySelector('.ring-open'), capInner = cap.querySelector('.ring-cap-inner');

  /* ---------- geometry ---------- */
  var STEP = 360 / N, R = 0, stepPx = 0, trackTop = 0, travel = 1;
  function layout() {
    var phone = innerWidth <= 760;
    var w = phone ? Math.min(250, innerWidth * 0.66) : 320, gap = phone ? 18 : 34;
    grid.style.setProperty('--ring-w', w + 'px');
    R = Math.round((w + gap) / (2 * Math.tan(Math.PI / N)));
    var h = 0; tiles.forEach(function (t) { h = Math.max(h, t.offsetHeight); });
    grid.style.setProperty('--ring-h', h + 'px');
    tiles.forEach(function (t, i) { t.style.transform = 'rotateY(' + (i * STEP) + 'deg) translateZ(' + R + 'px)'; });
    stepPx = Math.round(innerHeight * (phone ? 0.3 : 0.34));
    travel = stepPx * (N - 1);
    track.style.height = 'calc(100vh - 58px + ' + travel + 'px)';
    trackTop = track.getBoundingClientRect().top + scrollY - 58;
    target = progressAngle(); if (!started) { cur = target; started = true; }
    kick();
  }

  /* ---------- motion ---------- */
  var cur = 0, target = 0, started = false, raf = 0, front = -1, inView = false, lastY = -1;
  function progressAngle() {
    var p = Math.min(1, Math.max(0, (scrollY - trackTop) / travel));
    // dwell: each site holds at the front for ~40% of its scroll slot, then the ring turns to the next
    var x = p * (N - 1), k = Math.floor(x), f = x - k;
    if (k >= N - 1) return (N - 1) * STEP;
    var t = Math.min(1, Math.max(0, (f - 0.2) / 0.6));
    t = t * t * (3 - 2 * t);                                        // smoothstep: gentle start and landing
    return (k + t) * STEP;
  }
  function frame() {
    raf = 0;
    target = progressAngle();
    var d = target - cur;
    cur = Math.abs(d) < 0.02 ? target : cur + d * 0.14;           // eased follow: smooth, never overshoots
    grid.style.transform = 'translateZ(' + (-R) + 'px) rotateY(' + (-cur).toFixed(3) + 'deg)';
    for (var i = 0; i < N; i++) {
      var a = ((i * STEP - cur) % 360 + 540) % 360 - 180;         // angle from the front, -180..180
      var abs = Math.abs(a), t = tiles[i];
      var vis = abs < 115;
      // tiles round the back fade out but stay focusable (visibility:hidden would drop them from the Tab order)
      if (t.__vis !== vis) { t.__vis = vis; t.style.pointerEvents = vis ? '' : 'none'; }
      var o = !vis ? 0 : abs < 8 ? 1 : Math.max(0.18, 1 - (abs - 8) / 120);
      var oq = Math.round(o * 50) / 50;
      if (t.__o !== oq) { t.__o = oq; t.style.opacity = oq; }
    }
    var f = Math.round(cur / STEP); f = Math.max(0, Math.min(N - 1, f));
    if (f !== front) setFront(f);
    if (cur !== target) kick();
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  function setFront(f) {
    var first = front < 0; front = f;
    tiles.forEach(function (t, i) {
      var on = i === f;
      t.classList.toggle('ring-front', on);
      t.tabIndex = 0; t.setAttribute('aria-current', on ? 'true' : 'false');
    });
    var d = info[f];
    var apply = function () {
      elCount.textContent = (f + 1) + ' of ' + N; elType.textContent = d.type; elTitle.textContent = d.title;
      elDesc.textContent = d.desc; elOpen.href = d.href; elOpen.setAttribute('aria-label', 'Open ' + d.title + ' (opens in a new tab)');
    };
    if (first || !capInner.animate) { apply(); return; }
    capInner.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 140, easing: 'cubic-bezier(.4,0,1,1)' })
      .onfinish = function () {
        apply();
        capInner.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.4,0,.2,1)' });
      };
  }

  // bring tile i to the front by scrolling to its spot on the track
  function goTo(i, smooth) {
    var y = trackTop + i * stepPx + 2;
    window.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'auto' });
  }
  tiles.forEach(function (t, i) {
    t.addEventListener('click', function (e) { if (i !== front) { e.preventDefault(); goTo(i, true); } });
    t.addEventListener('focus', function () { if (i !== front) goTo(i, false); });
  });

  window.addEventListener('scroll', function () { if (inView) kick(); }, { passive: true });
  window.addEventListener('resize', layout, { passive: true });
  window.addEventListener('load', layout);
  if ('ResizeObserver' in window) {
    var lastH = 0;
    new ResizeObserver(function () { var h = document.documentElement.scrollHeight; if (Math.abs(h - lastH) > 2) { lastH = h; trackTop = track.getBoundingClientRect().top + scrollY - 58; kick(); } }).observe(document.body);
  }
  new IntersectionObserver(function (es) { inView = es[0].isIntersecting; if (inView) kick(); }, { rootMargin: '200px 0px' }).observe(track);
  layout();
  setFront(0);
})();
