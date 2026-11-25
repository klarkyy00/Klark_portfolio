/* About "reading light" (2026-11-25): as the section scrolls past a reading line, each word lights up,
   key phrases draw a highlight band, and a rail beside the text fills. Scrubbed both ways.
   Reduced motion: text is fully lit and the bands are drawn, nothing moves. */
(function () {
  'use strict';
  var sec = document.querySelector('.about-section');
  if (!sec) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { sec.classList.add('rd-static'); return; }

  var words = [], ps = Array.prototype.slice.call(sec.querySelectorAll(':scope > p:not(.about-video)'));
  function split(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (c) {
      if (c.nodeType === 3) {
        var f = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach(function (t) {
          if (!t) return;
          if (/^\s+$/.test(t)) { f.appendChild(document.createTextNode(t)); return; }
          var w = document.createElement('span'); w.className = 'rw'; w.textContent = t; f.appendChild(w); words.push(w);
        });
        c.parentNode.replaceChild(f, c);
      } else if (c.nodeType === 1) split(c);
    });
  }
  ps.forEach(split);
  var hls = Array.prototype.slice.call(sec.querySelectorAll('.hl')).map(function (h) { return { el: h, first: h.querySelector('.rw') }; });

  // heading: letters rise in once, the accent bar draws under them
  var h2 = sec.querySelector('h2');
  if (h2) {
    var txt = h2.textContent; h2.setAttribute('aria-label', txt); h2.textContent = '';
    txt.split('').forEach(function (ch, i) {
      var s = document.createElement('span'); s.className = 'ch'; s.setAttribute('aria-hidden', 'true');
      s.style.setProperty('--i', i); s.textContent = ch === ' ' ? ' ' : ch; h2.appendChild(s);
    });
  }
  var rail = document.createElement('div'); rail.className = 'rd-rail'; rail.setAttribute('aria-hidden', 'true');
  rail.innerHTML = '<i></i><b></b>'; sec.appendChild(rail);
  var fill = rail.firstChild, dot = rail.lastChild;
  sec.classList.add('rd-on');

  var ys = [], lit = 0, raf = 0, railH = 1;
  function measure() {
    var base = sec.getBoundingClientRect().top;
    ys = words.map(function (w) { var r = w.getBoundingClientRect(); return r.top - base + r.height / 2; });
    if (!ps.length) return;
    var t = ps[0].getBoundingClientRect().top - base, b = ps[ps.length - 1].getBoundingClientRect().bottom - base;
    railH = Math.max(1, b - t); rail.style.top = t + 'px'; rail.style.height = railH + 'px';
  }
  function frame() {
    raf = 0;
    var line = innerHeight * 0.74 - sec.getBoundingClientRect().top;   // reading line, in section coordinates
    var n = lit;
    while (n < words.length && ys[n] <= line) n++;
    while (n > 0 && ys[n - 1] > line) n--;
    if (n === lit) return;
    var a = Math.min(n, lit), b = Math.max(n, lit), on = n > lit;
    for (var i = a; i < b; i++) words[i].classList.toggle('on', on);
    lit = n;
    hls.forEach(function (h) { if (h.first) h.el.classList.toggle('on', h.first.classList.contains('on')); });
    var p = words.length ? lit / words.length : 1;
    fill.style.transform = 'scaleY(' + p.toFixed(3) + ')';
    dot.style.top = (p * railH).toFixed(1) + 'px';
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  var active = false;
  window.addEventListener('scroll', function () { if (active) kick(); }, { passive: true });
  window.addEventListener('resize', function () { measure(); kick(); }, { passive: true });
  window.addEventListener('load', function () { measure(); kick(); });
  new IntersectionObserver(function (es) {
    active = es[0].isIntersecting;
    if (active) { sec.classList.add('rd-in'); measure(); kick(); }
  }, { rootMargin: '100px 0px' }).observe(sec);
  if ('ResizeObserver' in window) new ResizeObserver(function () { measure(); kick(); }).observe(sec);
  measure();
})();
