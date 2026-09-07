(function () {
  var gallery = document.querySelector('[data-cajita-gallery]');
  if (!gallery || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var images = gallery.querySelectorAll('img');
  if (images.length < 2) return;
  var index = 0;
  window.setInterval(function () {
    images[index].classList.remove('is-active');
    index = (index + 1) % images.length;
    images[index].classList.add('is-active');
  }, 4200);
}());
