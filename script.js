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
    navigateTo(href, true);
  }

  function getPageRoot() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'page-root';
    while (document.body.firstChild) {
      root.appendChild(document.body.firstChild);
    }
    document.body.appendChild(root);
    return root;
  }

  function swapContent(html, href, push) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    root.innerHTML = doc.body.innerHTML;
    document.title = doc.title;
    if (push) history.pushState({ href: href }, doc.title, href);
    bindLinks(root);
    if (window.__updateScrollTheme) window.__updateScrollTheme();
    window.scrollTo(0, 0);
  }

  function navigateTo(href, push) {
    var pageRoot = getPageRoot();

    // Force a reflow before adding the class so the browser registers the
    // element's current (non-slid) state as the transition's starting
    // point, rather than collapsing creation + class change into one
    // instant style update with nothing to animate from.
    void pageRoot.offsetWidth;
    pageRoot.classList.add('slide-out');

    // A fixed timeout (rather than waiting on 'transitionend') keeps this
    // working even if the transition doesn't actually run — e.g. a user
    // with reduced-motion preferences, or any other edge case.
    setTimeout(function () {
      fetch(href)
        .then(function (res) { return res.text(); })
        .then(function (html) {
          swapContent(html, href, push);
          pageRoot.classList.remove('slide-out');
          pageRoot.classList.add('slide-in-start');
          void pageRoot.offsetWidth; // force reflow before animating in
          pageRoot.classList.remove('slide-in-start');
        })
        .catch(function () {
          window.location.href = href; // fall back to a normal navigation
        });
    }, DURATION);
  }

  window.addEventListener('popstate', function () {
    var href = location.pathname.split('/').pop() || 'index.html';
    navigateTo(href, false);
  });

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
