(function () {
  var ticking = false;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function updateTheme() {
    var scrollable = document.documentElement.scrollHeight - window.innerHeight;
    var progress = scrollable > 0 ? clamp(window.scrollY / scrollable, 0, 1) : 0;
    var bg = Math.round(255 - progress * 255);

    // Text flips instantly between black and white at a fixed background
    // threshold instead of crossfading through the intermediate grays. A
    // crossfade would necessarily pass through a color that matches the
    // background at some point (zero contrast); an instant flip never does,
    // since text is always pure black or pure white.
    var text = bg > 127 ? 0 : 255;

    var root = document.documentElement.style;
    root.setProperty('--bg-color', 'rgb(' + bg + ', ' + bg + ', ' + bg + ')');
    root.setProperty('--text-color', 'rgb(' + text + ', ' + text + ', ' + text + ')');
    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(updateTheme);
      ticking = true;
    }
  }

  document.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  updateTheme();
})();
