/**
 * Sets the active state on nav links/buttons matching the current page.
 * Pass the filename (e.g. "at-home-demo-map.html") to mark as active.
 */
function setNavActive(pageFile) {
  "use strict";
  document.querySelectorAll(".site-nav-links a, .site-nav-links button").forEach(el => {
    const href = el.getAttribute("href") || el.dataset.href || "";
    if (href && href.includes(pageFile)) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });
}
