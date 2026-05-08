(function (global) {
  "use strict";
  const DU = {
    /** Safe querySelector — returns null without throwing */
    qs: (sel, root) => (root || document).querySelector(sel),
    /** Safe querySelectorAll — returns [] not NodeList */
    qsa: (sel, root) => Array.from((root || document).querySelectorAll(sel)),
    /** Create element with optional attrs and children */
    el: (tag, attrs, ...children) => {
      const e = document.createElement(tag);
      if (attrs) Object.entries(attrs).forEach(([k, v]) => {
        if (k === "class") e.className = v;
        else if (k === "style") e.style.cssText = v;
        else if (k.startsWith("data-")) e.dataset[k.slice(5)] = v;
        else e.setAttribute(k, v);
      });
      children.forEach(c => {
        if (typeof c === "string") e.insertAdjacentHTML("beforeend", c);
        else if (c) e.appendChild(c);
      });
      return e;
    },
  };
  global.DU = DU;
})(window);
