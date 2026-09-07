(function () {
  var gallery = document.querySelector('[data-cajita-gallery]');
  if (!gallery || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var images = gallery.querySelectorAll('img');
  if (images.length < 2) return;
  var pause = gallery.querySelector('[data-cajita-pause]');
  var index = 0;
  var paused = false;
  var timer = window.setInterval(function () {
    if (paused) return;
    var next = (index + 1) % images.length;
    if (!images[next].complete || !images[next].naturalWidth) return;
    images[index].classList.remove('is-active');
    index = next;
    images[index].classList.add('is-active');
  }, 4200);
  if (pause) pause.addEventListener('click', function () {
    paused = !paused;
    pause.setAttribute('aria-pressed', String(paused));
    pause.textContent = paused ? 'Play gallery' : 'Pause gallery';
  });
}());
