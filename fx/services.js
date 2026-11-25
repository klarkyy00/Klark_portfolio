/* Services: "agents deploying" (2026-11-25, impeccable animate playbook).
   Desktop: the service cards start as one overlapping, fanned stack in the middle of the grid (a queue of
   agents). Scrolling deals them out to their grid slots one by one; each card that lands boots: its status
   chip flips Queued -> Running and a scan line sweeps it once. Fully scroll-linked, reverses on scroll up.
   Single-column layouts: no stack; each card boots as it enters view.
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

  var deck = matchMedia('(min-width: 900px)');
  if (deck.matches) window.__svcDeck = true;          // motion.js skips its own reveal for this grid
  grid.classList.add('agent-grid');

  var cards = [], raf = 0, cur = 0, inView = false, mode = '';
  function visible() { return all.filter(function (c) { return c.offsetParent !== null; }); }

  function measure() {
    mode = deck.matches && getComputedStyle(grid).gridTemplateColumns.split(' ').length > 1 ? 'deck' : 'list';
    cards = visible();
    if (mode !== 'deck') { all.forEach(function (c) { c.style.translate = c.style.rotate = c.style.scale = ''; }); return; }
    var n = cards.length, cx = grid.offsetWidth / 2, cy = Math.min(grid.offsetHeight, 520) / 2, mid = (n - 1) / 2;
    cards.forEach(function (c, i) {
      var x = c.offsetLeft + c.offsetWidth / 2, y = c.offsetTop + c.offsetHeight / 2;
      c.__dx = cx + (i - mid) * 14 - x;
      c.__dy = cy + (i - mid) * 8 - y;
      c.__rz = (i - mid) * 4.5;
      c.__start = i * (0.4 / Math.max(1, n - 1));
      c.style.zIndex = String(i + 1);
    });
  }
  function progress() {                               // 0 when the grid top is low in the viewport, 1 once it has risen
    var r = grid.getBoundingClientRect();
    return Math.max(0, Math.min(1, (innerHeight * 0.92 - r.top) / (innerHeight * 0.6)));
  }
  function frame() {
    raf = 0;
    if (mode !== 'deck') return;
    var target = progress(), d = target - cur;
    cur = Math.abs(d) < 0.001 ? target : cur + d * 0.16;
    cards.forEach(function (c) {
      var k = Math.max(0, Math.min(1, (cur - c.__start) / 0.6));
      var e = 1 - Math.pow(1 - k, 3), t = 1 - e;      // ease-out: cards decelerate into their slots
      c.style.translate = (c.__dx * t).toFixed(1) + 'px ' + (c.__dy * t).toFixed(1) + 'px';
      c.style.rotate = (c.__rz * t).toFixed(2) + 'deg';
      c.style.scale = (1 - 0.1 * t).toFixed(3);
      c.classList.toggle('agent-live', k >= 0.97);
    });
    if (cur !== target) kick();
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  // list mode: each card boots as it comes into view, and resets if it drops back below
  var io = new IntersectionObserver(function (es) {
    if (mode === 'deck') return;
    es.forEach(function (en) {
      if (en.isIntersecting) en.target.classList.add('agent-live');
      else if (en.boundingClientRect.top > 0) en.target.classList.remove('agent-live');
    });
  }, { threshold: 0.55 });
  all.forEach(function (c) { io.observe(c); });

  new IntersectionObserver(function (es) { inView = es[0].isIntersecting; if (inView) kick(); }, { rootMargin: '300px 0px' }).observe(grid);
  window.addEventListener('scroll', function () { if (inView) kick(); }, { passive: true });
  function remeasure() { measure(); cur = progress(); kick(); }
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(grid);
  window.addEventListener('load', remeasure);
  if (deck.addEventListener) deck.addEventListener('change', remeasure);
  measure(); cur = progress(); kick();
})();
