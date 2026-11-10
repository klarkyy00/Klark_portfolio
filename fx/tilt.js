/* =====================================================================
   fx/tilt.js  -  restrained 3D micro-interactions for the portfolio
   - 3D tilt + cursor spotlight (background layer) + border ring on cards
   - glare on website screenshots
   - magnetic CTA buttons
   Fine pointers with hover only; does nothing on touch. Tilt/magnet are
   disabled under prefers-reduced-motion (spotlight stays, it is static
   colour, not motion). JS only writes CSS custom properties + classes;
   all transforms live in fx/tilt.css. Overlays are pointer-events:none.
   ===================================================================== */
(function () {
  'use strict';

  /* ---------------- CONFIG ---------------- */
  var CONFIG = {
    // cards that tilt + get the spotlight and ring
    tiltSelector: '.service-card, .site-tile, .cert-card, .testimonial-card',
    maxTilt: 5,              // degrees at the card edge
    // project accordion cards: gentle tilt while CLOSED, none when .open
    accordionSelector: '#cardWrap .card',
    accordionMaxTilt: 1.6,   // degrees (0 = spotlight only)
    accordionTiltMaxHeight: 260, // px; taller than this = no tilt even if closed
    ring: true,              // thin glowing border that follows the cursor
    sheen: true,             // glare overlay on .site-shot screenshots
    trackDelay: 250,         // ms of soft ease-in before tight cursor tracking
    settleMs: 750,           // spring-back duration (matches tilt.css)
    // magnetic buttons
    magnetSelector: '.hero-cta, .social-btn, .ai-ask button, .nav-links a.nav-cta',
    magnetStrength: 0.22,    // fraction of cursor offset from centre
    magnetMax: 6,            // px, hard clamp so buttons stay easy to hit
    spotlightWithReducedMotion: true
  };

  var mqFine = window.matchMedia('(hover:hover) and (pointer:fine)');
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  function fine() { return mqFine.matches; }
  function motionOK() { return !mqReduce.matches; }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* ---------------- cards ---------------- */
  function bindCard(el, isAccordion) {
    if (el.__fxTilt) return;
    el.__fxTilt = true;
    el.classList.add('fx-tilt');

    var ring = null, sheen = null;
    function ensureLayers() {
      if (CONFIG.ring && !ring) {
        ring = document.createElement('span');
        ring.className = 'fx-ring';
        ring.setAttribute('aria-hidden', 'true');
        el.appendChild(ring);
      }
      if (CONFIG.sheen && !sheen && el.classList.contains('site-tile')) {
        var shot = el.querySelector('.site-shot');
        if (shot) {
          sheen = document.createElement('span');
          sheen.className = 'fx-sheen';
          sheen.setAttribute('aria-hidden', 'true');
          var img = shot.querySelector('img');
          // after the image, before the "Live" badge so the badge stays on top
          if (img && img.nextSibling) shot.insertBefore(sheen, img.nextSibling);
          else shot.appendChild(sheen);
        }
      }
    }

    var lastX = 0, lastY = 0, raf = 0, settleT = 0, trackT = 0, hot = false;

    function revealed() {
      return (!el.classList.contains('reveal') || el.classList.contains('visible')) && !el.classList.contains('fx-item');
    }
    function tiltAllowed() {
      if (!motionOK()) return 0;
      if (!isAccordion) return CONFIG.maxTilt;
      if (el.classList.contains('open')) return 0;
      if (el.offsetHeight > CONFIG.accordionTiltMaxHeight) return 0;
      return CONFIG.accordionMaxTilt;
    }

    function frame() {
      raf = 0;
      if (!hot) return;
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var x = lastX - r.left, y = lastY - r.top;
      var px = clamp(x / r.width, 0, 1), py = clamp(y / r.height, 0, 1);
      var max = tiltAllowed();
      var s = el.style;
      s.setProperty('--fx-mx', x.toFixed(1) + 'px');
      s.setProperty('--fx-my', y.toFixed(1) + 'px');
      s.setProperty('--fx-rx', ((0.5 - py) * 2 * max).toFixed(2) + 'deg');
      s.setProperty('--fx-ry', ((px - 0.5) * 2 * max).toFixed(2) + 'deg');
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(frame); }

    el.addEventListener('pointerenter', function (e) {
      if (e.pointerType !== 'mouse' || !fine()) return;
      if (!motionOK() && !CONFIG.spotlightWithReducedMotion) return;
      if (!revealed()) return;
      ensureLayers();
      clearTimeout(settleT); clearTimeout(trackT);
      el.classList.remove('fx-settle');
      lastX = e.clientX; lastY = e.clientY;
      hot = true;
      frame();                              // position vars before the class lands
      el.classList.add('fx-hot');
      trackT = setTimeout(function () { if (hot) el.classList.add('fx-track'); }, CONFIG.trackDelay);
    }, { passive: true });

    el.addEventListener('pointermove', function (e) {
      if (!hot) return;
      lastX = e.clientX; lastY = e.clientY;
      schedule();
    }, { passive: true });

    function leave() {
      if (!hot) return;
      hot = false;
      clearTimeout(trackT);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      el.classList.add('fx-settle');
      el.classList.remove('fx-hot', 'fx-track');
      var s = el.style;
      s.setProperty('--fx-rx', '0deg');
      s.setProperty('--fx-ry', '0deg');
      settleT = setTimeout(function () { el.classList.remove('fx-settle'); }, CONFIG.settleMs);
    }
    el.addEventListener('pointerleave', leave, { passive: true });

    // accordion: opening/closing changes height -> re-evaluate tilt next frame
    if (isAccordion) {
      el.addEventListener('click', function () { if (hot) schedule(); }, { passive: true });
    }
  }

  /* ---------------- magnetic buttons ---------------- */
  function bindMagnet(el) {
    if (el.__fxMag) return;
    el.__fxMag = true;
    el.classList.add('fx-mag');
    var lastX = 0, lastY = 0, raf = 0, settleT = 0, hot = false;
    var cx = 0, cy = 0;   // untransformed centre, measured on enter

    function frame() {
      raf = 0;
      if (!hot) return;
      var dx = (lastX - cx) * CONFIG.magnetStrength;
      var dy = (lastY - cy) * CONFIG.magnetStrength;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > CONFIG.magnetMax) { dx *= CONFIG.magnetMax / d; dy *= CONFIG.magnetMax / d; }
      el.style.setProperty('--fx-bx', dx.toFixed(2) + 'px');
      el.style.setProperty('--fx-by', dy.toFixed(2) + 'px');
    }
    function measure() {
      var r = el.getBoundingClientRect();
      // subtract the current offset so the centre stays the resting centre
      var bx = parseFloat(el.style.getPropertyValue('--fx-bx')) || 0;
      var by = parseFloat(el.style.getPropertyValue('--fx-by')) || 0;
      cx = r.left + r.width / 2 - (el.classList.contains('fx-hot') ? bx : 0);
      cy = r.top + r.height / 2 - (el.classList.contains('fx-hot') ? by : 0);
    }

    el.addEventListener('pointerenter', function (e) {
      if (e.pointerType !== 'mouse' || !fine() || !motionOK()) return;
      clearTimeout(settleT);
      el.classList.remove('fx-settle');
      el.style.setProperty('--fx-bx', '0px');
      el.style.setProperty('--fx-by', '0px');
      el.classList.remove('fx-hot');
      measure();
      lastX = e.clientX; lastY = e.clientY;
      hot = true;
      frame();
      el.classList.add('fx-hot');
    }, { passive: true });

    el.addEventListener('pointermove', function (e) {
      if (!hot) return;
      lastX = e.clientX; lastY = e.clientY;
      if (!raf) raf = requestAnimationFrame(frame);
    }, { passive: true });

    el.addEventListener('pointerleave', function () {
      if (!hot) return;
      hot = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      el.classList.add('fx-settle');
      el.classList.remove('fx-hot');
      el.style.setProperty('--fx-bx', '0px');
      el.style.setProperty('--fx-by', '0px');
      settleT = setTimeout(function () { el.classList.remove('fx-settle'); }, 600);
    }, { passive: true });
  }

  /* ---------------- init ---------------- */
  function init() {
    var accordion = document.querySelectorAll(CONFIG.accordionSelector);
    for (var i = 0; i < accordion.length; i++) bindCard(accordion[i], true);
    var cards = document.querySelectorAll(CONFIG.tiltSelector);
    for (var j = 0; j < cards.length; j++) bindCard(cards[j], false);
    var mags = document.querySelectorAll(CONFIG.magnetSelector);
    for (var k = 0; k < mags.length; k++) bindMagnet(mags[k]);
  }

  // Binding is cheap and harmless on touch (handlers bail on non-mouse),
  // so bind once; the media queries are re-checked on every enter.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // let other modules bind cards they inject later
  window.FXTilt = { refresh: init, config: CONFIG };
})();
