/* Services: "falling agents" (2026-11-25, impeccable animate playbook).
   Scroll-linked: each service card drops in from above its slot with gravity (accelerating), drifting and
   tilting a little as it falls, then lands with a short squash. On landing it boots: the status chip flips
   Queued -> Running and a scan line sweeps it once. Cards in a row fall left to right. Reverses on scroll up.
   Reduced motion: no movement, every agent shows Running. Default state (no JS) is the normal grid. */
(function () {
  'use strict';
  var grid = document.querySelector('.services-grid');
  if (!grid) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var all = Array.prototype.slice.call(grid.querySelectorAll(':scope > .service-card'));

  all.forEach(function (c) {
    var chip = document.createElement('span'); chip.className = 'agent-chip'; chip.setAttribute('aria-hidden', 'true');
    chip.innerHTML = '<i></i><b class="q">Queued</b><b class="r">Running</b>';
    var scan = document.createElement('span'); scan.className = 'agent-scan'; scan.setAttribute('aria-hidden', 'true');
    c.appendChild(chip); c.appendChild(scan);
  });
  if (reduce) { all.forEach(function (c) { c.classList.add('agent-live'); }); return; }

  window.__svcDeck = true;                            // motion.js skips its own reveal for this grid
  grid.classList.add('agent-grid');

  var cards = [], raf = 0, sy = scrollY, inView = false, F = 340, SPAN = 380, STAG = 70;
  function measure() {
    var phone = innerWidth < 760;
    F = phone ? 170 : 290;                            // fall height (px)
    SPAN = innerHeight * (phone ? 0.36 : 0.42);       // scroll distance a card takes to fall
    STAG = phone ? 0 : 70;                            // extra scroll per column, so a row falls left to right
    var gTop = grid.getBoundingClientRect().top + scrollY;
    cards = all.filter(function (c) { return c.offsetParent !== null; });
    var lefts = cards.map(function (c) { return c.offsetLeft; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    var tops = cards.map(function (c) { return c.offsetTop; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    cards.forEach(function (c, i) {
      c.__top = gTop + c.offsetTop;                   // layout position: transforms never change it
      c.__col = lefts.indexOf(c.offsetLeft);
      c.__row = tops.indexOf(c.offsetTop);
      c.__side = i % 2 ? 1 : -1;
      c.__rz = (7 + (i % 3) * 3) * c.__side;
      c.__live = undefined;
    });
  }
  function frame() {
    raf = 0;
    var d = scrollY - sy;
    sy = Math.abs(d) < 0.5 ? scrollY : sy + d * 0.2;  // smoothed scroll so the fall glides
    cards.forEach(function (c) {
      var k = (sy + innerHeight * 0.98 - c.__top - c.__col * STAG) / SPAN;
      k = Math.max(0, Math.min(1, k));
      var u = 1 - k * k;                              // gravity: slow at the top, fastest just before landing
      c.style.translate = (c.__side * 26 * u).toFixed(1) + 'px ' + (-F * u).toFixed(1) + 'px';
      c.style.rotate = (c.__rz * u).toFixed(2) + 'deg';
      c.style.opacity = Math.min(1, k * 2.2).toFixed(2);
      var live = k >= 0.995;
      if (live !== c.__live) { c.__live = live; c.classList.toggle('agent-live', live); c.style.zIndex = String(live ? 20 : 10 - c.__row); }   // falling cards pass behind landed ones and the row above
    });
    if (sy !== scrollY) kick();
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  new IntersectionObserver(function (es) { inView = es[0].isIntersecting; if (inView) kick(); }, { rootMargin: '400px 0px' }).observe(grid);
  window.addEventListener('scroll', function () { if (inView) kick(); }, { passive: true });
  function remeasure() { measure(); sy = scrollY; kick(); }
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(grid);
  window.addEventListener('resize', remeasure, { passive: true });
  window.addEventListener('load', remeasure);
  measure(); kick();
})();
