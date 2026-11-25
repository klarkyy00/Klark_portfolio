/* Falling cards (2026-11-25, impeccable animate playbook) for Services and Certifications.
   Scroll-linked: each card drops in from above its slot with gravity (accelerating), drifting and tilting a
   little as it falls, then lands with a short squash. Cards in a row fall left to right; a lower row falls
   behind the row above; the grid crops the fall so nothing crosses the section heading. Reverses on scroll up.
   Services: on landing the card boots (status chip Queued -> Running + one scan sweep).
   Reduced motion: no movement (services show Running). Default state (no JS) is the normal grid. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function makeFall(grid, all, o) {
    if (!grid || !all.length) return;
    if (o.setup) all.forEach(o.setup);
    if (reduce) { all.forEach(function (c) { c.classList.add(o.landed); }); return; }
    grid.classList.add('fall-grid');

    var cards = [], raf = 0, sy = scrollY, inView = false, F = 290, SPAN = 380, STAG = 70;
    function measure() {
      var phone = innerWidth < 760;
      F = phone ? 170 : 290;                            // fall height (px)
      SPAN = innerHeight * (phone ? 0.36 : 0.42);       // scroll distance a card takes to fall
      STAG = phone ? 0 : 70;                            // extra scroll per column, so a row falls left to right
      var gTop = grid.getBoundingClientRect().top + scrollY;
      cards = all.filter(function (c) { return c.offsetParent !== null; });
      var uniq = function (v, i, a) { return a.indexOf(v) === i; }, num = function (a, b) { return a - b; };
      var tops = cards.map(function (c) { return c.offsetTop; }).filter(uniq).sort(num);
      cards.forEach(function (c, i) {
        c.__top = gTop + c.offsetTop;                   // layout position: transforms never change it
        // column counted within the card's own row (a centred short last row must not become columns 5-7)
        c.__col = cards.filter(function (o) { return o.offsetTop === c.offsetTop && o.offsetLeft < c.offsetLeft; }).length;
        c.__row = tops.indexOf(c.offsetTop);
        c.__side = i % 2 ? 1 : -1;
        c.__rz = (7 + (i % 3) * 3) * c.__side;
        c.__live = undefined; c.__z = undefined;
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
        // solid almost at once: a half-transparent card over another card mixes the two texts and neither can be read
        c.style.opacity = Math.min(1, k * 7).toFixed(2);
        var live = k >= 0.995;
        if (live !== c.__live) {
          c.__live = live; c.classList.toggle(o.landed, live); c.classList.toggle('is-falling', !live);
        }
        // stacking follows progress: the nearer a card is to landing, the more it is in front. A card that is still
        // fading in (top of its fall) is therefore always behind solid cards, so two texts never show through each other.
        var z = live ? 40 : 10 + Math.round(k * 25);
        if (z !== c.__z) { c.__z = z; c.style.zIndex = String(z); }
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
  }

  /* Services: falling agents that boot on landing */
  var sg = document.querySelector('.services-grid');
  if (sg) {
    if (!reduce) { window.__svcDeck = true; sg.classList.add('agent-grid'); }   // motion.js skips its own reveal for this grid
    makeFall(sg, Array.prototype.slice.call(sg.querySelectorAll(':scope > .service-card')), {
      landed: 'agent-live',
      setup: function (c) {
        var chip = document.createElement('span'); chip.className = 'agent-chip'; chip.setAttribute('aria-hidden', 'true');
        chip.innerHTML = '<i></i><b class="q">Queued</b><b class="r">Running</b>';
        var scan = document.createElement('span'); scan.className = 'agent-scan'; scan.setAttribute('aria-hidden', 'true');
        c.appendChild(chip); c.appendChild(scan);
      }
    });
  }

  /* Certifications: the wrapper falls, the card inside keeps floating once it has landed */
  var cg = document.querySelector('.cert-grid');
  if (cg) {
    if (!reduce) window.__certFall = true;             // motion.js skips its own reveal for this grid
    makeFall(cg, Array.prototype.slice.call(cg.querySelectorAll(':scope > .cert-float')), { landed: 'cert-landed' });
  }
})();
