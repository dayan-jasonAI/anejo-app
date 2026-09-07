(function () {
  var gallery = document.querySelector('[data-cajita-gallery]');
  if (!gallery) return;
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var images = gallery.querySelectorAll('img');
  if (images.length < 2) return;
  var pause = gallery.querySelector('[data-cajita-pause]');
  var index = 0;
  var paused = motion.matches;
  function label() {
    if (!pause) return;
    pause.setAttribute('aria-pressed', String(paused));
    pause.textContent = paused ? 'Play gallery' : 'Pause gallery';
  }
  label();
  motion.addEventListener('change', function (event) { paused = event.matches; label(); });
  window.setInterval(function () {
    if (paused || document.hidden) return;
    var next = (index + 1) % images.length;
    if (!images[next].complete || !images[next].naturalWidth) return;
    images[index].classList.remove('is-active');
    index = next;
    images[index].classList.add('is-active');
  }, 4200);
  if (pause) pause.addEventListener('click', function () {
    paused = !paused;
    label();
  });
}());
