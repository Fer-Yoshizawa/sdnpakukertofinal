/* ==========================================================
   SDN PAKUKERTO II — SITE INTERACTIONS
   Minimal vanilla JS, used only where CSS alone cannot deliver
   the required interactivity:
     1. Home page — Program Keahlian auto-advancing carousel
        (centers the active card, pauses on it, swaps the
        adjacent showcase image with a fade, then loops).
     2. Profil Sekolah — Dinamika Kampus major tabs (click to
        switch image / title / description / competency list).
   ========================================================== */

document.addEventListener('DOMContentLoaded', function () {
  initProgramCarousel();
  initDinamikaTabs();
});

/* ---------- 1. Home — Program Keahlian carousel ---------- */
function initProgramCarousel() {
  var root = document.getElementById('program-showcase');
  if (!root) return;

  var viewport = root.querySelector('.program-carousel');
  var track = root.querySelector('.program-carousel__track');
  var cards = Array.prototype.slice.call(track.children);
  var images = Array.prototype.slice.call(root.querySelectorAll('.program-showcase__image'));

  var MOVE_MS = 600; // time it takes the track to slide to the next card
  var HOLD_MS = 2600; // how long the centered card stays enlarged before advancing
  var index = 0;
  var timer = null;

  function setActiveVisuals(cardIndex) {
    var major = cards[cardIndex].getAttribute('data-major');
    cards.forEach(function (card, i) {
      card.classList.toggle('is-active', i === cardIndex);
    });
    images.forEach(function (img) {
      img.classList.toggle('is-active', img.getAttribute('data-major') === major);
    });
  }

  function moveTrackTo(cardIndex, animate) {
    var viewportWidth = viewport.clientWidth;
    var card = cards[cardIndex];
    var cardCenter = card.offsetLeft + card.offsetWidth / 2;
    track.style.transition = animate ? 'transform ' + MOVE_MS + 'ms cubic-bezier(.4,0,.2,1)' : 'none';
    track.style.transform = 'translateX(' + (viewportWidth / 2 - cardCenter) + 'px)';
  }

  function advance() {
    index += 1;
    moveTrackTo(index, true);

    // Enlarge/highlight the incoming card as it settles into the center.
    setTimeout(function () {
      setActiveVisuals(Math.min(index, cards.length - 1));
    }, Math.max(MOVE_MS - 150, 0));

    timer = setTimeout(function () {
      // The last card in the track is a clone of the first — once we've
      // held on it, snap back to the real first card with no transition
      // so the loop is seamless and never visibly "resets".
      if (index >= cards.length - 1) {
        index = 0;
        moveTrackTo(0, false);
        setActiveVisuals(0);
        void track.offsetWidth; // force reflow before re-enabling transitions
      }
      advance();
    }, MOVE_MS + HOLD_MS);
  }

  function pause() {
    clearTimeout(timer);
  }

  function resume() {
    clearTimeout(timer);
    timer = setTimeout(advance, HOLD_MS);
  }

  // Initial state.
  moveTrackTo(0, false);
  setActiveVisuals(0);
  window.addEventListener('resize', function () {
    moveTrackTo(index >= cards.length ? cards.length - 1 : index, false);
  });

  viewport.addEventListener('mouseenter', pause);
  viewport.addEventListener('mouseleave', resume);

  timer = setTimeout(advance, MOVE_MS + HOLD_MS);
}

/* ---------- 2. Profil Sekolah — Dinamika Kampus tabs ---------- */
function initDinamikaTabs() {
  var root = document.querySelector('.dinamika');
  if (!root) return;

  var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
  var panelsWrap = root.querySelector('.dinamika__panels');
  var panels = Array.prototype.slice.call(root.querySelectorAll('.dinamika__panel'));
  var images = Array.prototype.slice.call(root.querySelectorAll('.dinamika__image'));
  var FADE_MS = 250;

  function activate(major) {
    tabs.forEach(function (tab) {
      tab.setAttribute('aria-selected', String(tab.getAttribute('data-major') === major));
    });
    images.forEach(function (img) {
      img.classList.toggle('is-active', img.getAttribute('data-major') === major);
    });

    panelsWrap.classList.add('is-transitioning');
    setTimeout(function () {
      panels.forEach(function (panel) {
        panel.classList.toggle('is-active', panel.getAttribute('data-major') === major);
      });
      panelsWrap.classList.remove('is-transitioning');
    }, FADE_MS);
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      if (tab.getAttribute('aria-selected') === 'true') return;
      activate(tab.getAttribute('data-major'));
    });
  });
}
