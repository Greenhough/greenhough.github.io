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
