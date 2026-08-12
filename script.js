(function () {
  var ticking = false;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function updateTheme() {
    var scrollable = document.documentElement.scrollHeight - window.innerHeight;
    var progress = scrollable > 0 ? clamp(window.scrollY / scrollable, 0, 1) : 0;
    var base = 255 - progress * 255;

    // Text flips instantly between black and white at a fixed background
    // threshold instead of crossfading through the intermediate grays. A
    // crossfade would necessarily pass through a color that matches the
    // background at some point (zero contrast); an instant flip never does,
    // since text is always pure black or pure white.
    var text = base > 127 ? 0 : 255;

    // Two-stop sheen instead of a flat fill (see --bg-a/--bg-b in
    // style.css), plus a faint cool tint that grows with darkness so the
    // bottom of the page reads as gunmetal charcoal rather than flat
    // black — gives the background some dimension instead of a plain
    // grayscale ramp.
    var tint = Math.round(progress * 10);
    var lightStop = clamp(base + 16, 0, 255);
    var darkStop = clamp(base - 14, 0, 255);
    var bgA = 'rgb(' + lightStop + ', ' + lightStop + ', ' + clamp(lightStop + tint, 0, 255) + ')';
    var bgB = 'rgb(' + darkStop + ', ' + darkStop + ', ' + clamp(darkStop + tint, 0, 255) + ')';

    var root = document.documentElement.style;
    root.setProperty('--bg-a', bgA);
    root.setProperty('--bg-b', bgB);
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

  // Exposed so the page-transition script below can recompute the gradient
  // after swapping in new page content (the document height changes).
  window.__updateScrollTheme = updateTheme;
})();

// --- Slide page transitions -------------------------------------------
// Intercepts clicks on internal links (index/projects/gallery) and swaps
// the page content with a slide animation instead of a hard navigation.
// Pages stay as real, separate HTML files (fetched over the network), so
// direct links, bookmarks, and no-JS fallback all keep working normally.
(function () {
  var DURATION = 380; // ms, keep in sync with the CSS transition below
  var root = null;

  function isInternalPageLink(a) {
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return false;
    var href = a.getAttribute('href');
    return !!href && /^[a-zA-Z0-9_-]+\.html$/.test(href);
  }

  function bindLinks(container) {
    var links = container.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      if (isInternalPageLink(links[i])) {
        links[i].addEventListener('click', onLinkClick);
      }
    }
  }

  function onLinkClick(e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    var href = e.currentTarget.getAttribute('href');
    e.preventDefault();
    navigateTo(href);
  }

  // Only the <main> content area swaps and slides — the hero header (always
  // "ALISA YOUNG") and footer stay put, so it never looks like you've left
  // the page, and scrolling up always finds the same hero, not the fetched
  // page's own heading.
  function getContentRoot() {
    if (root) return root;
    var main = document.querySelector('main.container');
    root = document.createElement('div');
    root.id = 'content-root';
    main.parentNode.insertBefore(root, main);
    root.appendChild(main);
    return root;
  }

  function isHomeHref(href) {
    return href === 'index.html' || href === './' || href === '/';
  }

  function swapContent(html) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var newMain = doc.querySelector('main.container');
    root.innerHTML = newMain ? newMain.outerHTML : '';
    // The URL and browser history are deliberately left alone — this is a
    // content swap within a single page, not a real navigation. Changing
    // the URL would mean a later refresh (or reopening a bookmark/tab) hits
    // the real, separate projects.html/gallery.html file directly, which
    // has its own genuine header — showing "PROJECTS" where "ALISA YOUNG"
    // was expected.
    bindLinks(root);
    // Scroll position is never touched. Projects/Gallery's content is sized
    // (see .container.sub-page in style.css) to match the home page's total
    // height exactly, so the same scrollY both keeps the content visually
    // aligned with where it was and lands on the same gradient darkness —
    // no manual repositioning needed.
    if (window.__updateScrollTheme) window.__updateScrollTheme();
    if (window.__initFilmstrip) window.__initFilmstrip(root);
    if (window.__initReveal) window.__initReveal(root);
    if (window.__updateParallax) window.__updateParallax();
  }

  function navigateTo(href) {
    var toHome = isHomeHref(href);
    var pageRoot = getContentRoot();
    var outClass = toHome ? 'slide-out-reverse' : 'slide-out';
    var inClass = toHome ? 'slide-in-start-reverse' : 'slide-in-start';

    // Force a reflow before adding the class so the browser registers the
    // element's current (non-slid) state as the transition's starting
    // point, rather than collapsing creation + class change into one
    // instant style update with nothing to animate from.
    void pageRoot.offsetWidth;
    pageRoot.classList.add(outClass);

    // A fixed timeout (rather than waiting on 'transitionend') keeps this
    // working even if the transition doesn't actually run — e.g. a user
    // with reduced-motion preferences, or any other edge case.
    setTimeout(function () {
      fetch(href)
        .then(function (res) { return res.text(); })
        .then(function (html) {
          swapContent(html);
          pageRoot.classList.remove(outClass);
          pageRoot.classList.add(inClass);
          void pageRoot.offsetWidth; // force reflow before animating in
          pageRoot.classList.remove(inClass);
        })
        .catch(function () {
          window.location.href = href; // fall back to a normal navigation
        });
    }, DURATION);
  }

  function init() {
    bindLinks(document.body);
  }

  // This script loads at the end of <body>, so DOMContentLoaded has
  // typically already fired by the time it runs — waiting for that event
  // here would mean the listener never fires. Bind immediately in that
  // case, and only wait for the event if the script somehow runs early.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// --- Photoshoot filmstrip: edge auto-scroll + click-to-zoom lightbox ---
(function () {
  var EDGE_ZONE = 160; // px from each edge that triggers auto-scroll
  var MAX_SPEED = 14; // px per animation frame at the very edge
  var lightboxEl = null;

  function setupWrap(wrap) {
    if (wrap.__filmstripReady) return; // avoid double-binding on re-init
    wrap.__filmstripReady = true;

    var strip = wrap.querySelector('.filmstrip');
    if (!strip) return;
    var speed = 0;

    function tick() {
      if (speed !== 0) strip.scrollLeft += speed;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    wrap.addEventListener('mousemove', function (e) {
      var rect = wrap.getBoundingClientRect();
      var x = e.clientX - rect.left;
      if (x < EDGE_ZONE) {
        speed = -MAX_SPEED * ((EDGE_ZONE - x) / EDGE_ZONE);
      } else if (x > rect.width - EDGE_ZONE) {
        speed = MAX_SPEED * ((x - (rect.width - EDGE_ZONE)) / EDGE_ZONE);
      } else {
        speed = 0;
      }
    });
    wrap.addEventListener('mouseleave', function () {
      speed = 0;
    });

    var images = strip.querySelectorAll('img');
    for (var i = 0; i < images.length; i++) {
      images[i].addEventListener('click', (function (img) {
        return function () { openLightbox(img.src, img.alt); };
      })(images[i]));
    }
  }

  function getLightbox() {
    if (lightboxEl) return lightboxEl;
    lightboxEl = document.createElement('div');
    lightboxEl.className = 'lightbox';
    var img = document.createElement('img');
    lightboxEl.appendChild(img);
    lightboxEl.addEventListener('click', function () {
      lightboxEl.classList.remove('active');
    });
    document.body.appendChild(lightboxEl);
    return lightboxEl;
  }

  function openLightbox(src, alt) {
    var lb = getLightbox();
    var img = lb.querySelector('img');
    img.src = src;
    img.alt = alt || '';
    lb.classList.add('active');
  }

  function initFilmstrip(container) {
    var wraps = container.querySelectorAll('.filmstrip-wrap');
    for (var i = 0; i < wraps.length; i++) {
      setupWrap(wraps[i]);
    }
  }

  window.__initFilmstrip = initFilmstrip;

  function init() {
    initFilmstrip(document.body);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// --- Scroll reveal: fade + slide elements in as they enter view --------
(function () {
  var observer = null;

  function getObserver() {
    if (observer) return observer;
    observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          entries[i].target.classList.add('reveal-visible');
          observer.unobserve(entries[i].target);
        }
      }
    }, { threshold: 0.15 });
    return observer;
  }

  function initReveal(container) {
    var obs = getObserver();
    var els = container.querySelectorAll('.reveal:not(.reveal-visible)');
    for (var i = 0; i < els.length; i++) {
      obs.observe(els[i]);
    }
  }

  window.__initReveal = initReveal;

  function init() {
    initReveal(document.body);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// --- Subtle parallax depth ------------------------------------------------
// Elements with .parallax (hero photo, bio photo) drift slightly against
// the scroll based on their position relative to the viewport center — CSS
// owns the actual transform (reading --parallax-y) so hover states can
// still add their own scale on top without one clobbering the other.
(function () {
  var PARALLAX_FACTOR = 0.06;
  var ticking = false;

  function updateParallax() {
    var els = document.querySelectorAll('.parallax');
    for (var i = 0; i < els.length; i++) {
      var rect = els[i].getBoundingClientRect();
      var center = rect.top + rect.height / 2;
      var offset = (window.innerHeight / 2 - center) * PARALLAX_FACTOR;
      els[i].style.setProperty('--parallax-y', offset.toFixed(1) + 'px');
    }
    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(updateParallax);
      ticking = true;
    }
  }

  document.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  updateParallax();

  window.__updateParallax = updateParallax;
})();
