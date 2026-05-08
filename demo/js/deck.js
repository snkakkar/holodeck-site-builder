/**
 * makeDeck — creates a slide deck with click-to-advance, keyboard nav, and progress dots.
 *
 * @param {object} config
 *   slides        {NodeList|Element[]}  slide elements with class "pslide"
 *   dotsContainer {Element}             container to render dots into
 *   onEnter       {function(idx)}       optional callback when slide becomes active
 *   isActive      {function}            optional guard — returns true if this deck should handle input
 *   clickTarget   {Element}             element that advances on click (default: document)
 *   thumbEl       {Element}             optional thumb preview element
 */
function makeDeck(config) {
  "use strict";
  const slides = Array.from(config.slides || []);
  const dotsContainer = config.dotsContainer;
  const onEnter = config.onEnter || null;
  const isActive = config.isActive || (() => true);
  const clickTarget = config.clickTarget || document;
  const total = slides.length;
  let current = 0;

  // Build dots
  const dots = [];
  if (dotsContainer) {
    dotsContainer.innerHTML = "";
    slides.forEach((_, i) => {
      const d = document.createElement("div");
      d.className = "pdot" + (i === 0 ? " active" : "");
      d.setAttribute("aria-label", "Slide " + (i + 1));
      d.setAttribute("role", "button");
      d.setAttribute("tabindex", "0");
      d.addEventListener("click", () => goTo(i));
      d.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") goTo(i); });
      dotsContainer.appendChild(d);
      dots.push(d);
    });
  }

  function goTo(idx) {
    if (idx < 0 || idx >= total) return;
    slides[current].classList.remove("active");
    if (dots[current]) dots[current].classList.remove("active");
    current = idx;
    slides[current].classList.add("active");
    if (dots[current]) dots[current].classList.add("active");
    if (onEnter) onEnter(current);
  }

  // Click to advance
  clickTarget.addEventListener("click", e => {
    if (!isActive()) return;
    // Don't advance if clicking a link, button, or dot
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "a" || tag === "button" || e.target.classList.contains("pdot")) return;
    if (e.target.closest("a") || e.target.closest("button")) return;
    if (current < total - 1) goTo(current + 1);
  });

  // Keyboard
  document.addEventListener("keydown", e => {
    if (!isActive()) return;
    if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); if (current < total - 1) goTo(current + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); if (current > 0) goTo(current - 1); }
  });

  // Initialize first slide
  goTo(0);

  return { goTo, getCurrent: () => current, total };
}
