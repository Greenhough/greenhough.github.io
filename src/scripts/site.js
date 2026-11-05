/* Typewriter for the hero badge — cycles AI / GTM Engineering / Automation */
(function () {
  var el = document.getElementById('type');
  if (!el) return;

  var words = ['AI', 'GTM Engineering', 'Automation'];
  var i = 0;       // current word index
  var n = 0;       // characters shown
  var deleting = false;
  var pauseUntil = 0;

  function tick() {
    var full = words[i];

    if (!deleting) {
      if (n < full.length) {
        n++;
      } else {
        if (!pauseUntil) { pauseUntil = Date.now() + 1300; }
        else if (Date.now() >= pauseUntil) { pauseUntil = 0; deleting = true; }
      }
    } else {
      if (n > 0) {
        n--;
      } else {
        deleting = false;
        i = (i + 1) % words.length;
      }
    }

    el.textContent = full.slice(0, n);
  }

  setInterval(tick, 85);
})();

/* Nav: mobile hamburger toggle + shadow once you scroll */
(function () {
  var nav = document.querySelector('.nav');
  if (!nav) return;

  var toggle = nav.querySelector('.nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    // close the menu after tapping a link
    nav.querySelectorAll('.nav-links a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Toggle the "scrolled" (shrunk + shadow) state with hysteresis: turn on
  // past 64px, off below 24px. The 40px deadband is wider than the height
  // change the shrink causes, so it can't oscillate around a single threshold.
  var scrolled = false;
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (!scrolled && y > 64) {
      scrolled = true;
      nav.classList.add('scrolled');
    } else if (scrolled && y < 24) {
      scrolled = false;
      nav.classList.remove('scrolled');
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
