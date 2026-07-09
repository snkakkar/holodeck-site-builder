/* ══════════════════════════════════════════════════════════════════
   Share modal — invite @salesforce.com teammates to a project by email.

   Email-keyed sharing (see neon-multiuser-backend memory): a share works
   on the recipient's FIRST login even if they had no account when it was
   created. RLS is authoritative — every store call is gated server-side;
   the client checks here are UX-only.

   Public API:  window.HOLO_SHARE.open(projectId, projectName)
   Depends on:  window.HOLO_STORE (shareProject/updateShare/unshareProject/
                listShares), window.HOLO_AUTH (isSalesforceEmail, currentUser).
   Self-contained overlay — does not reuse builder.js's #bxModal so the
   module stays decoupled and loads before builder.js.
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  const STORE = global.HOLO_STORE;
  const AUTH  = function () { return global.HOLO_AUTH; };

  let _overlay = null;
  let _projectId = null;
  let _shares = [];       // [{shared_with_email, permission, created_at}]
  let _visibility = null; // "private" | "gallery" | null (unknown until loaded)

  function h(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else if (k === "on") Object.keys(attrs[k]).forEach(function (ev) { node.addEventListener(ev, attrs[k][ev]); });
      else if (k === "disabled" || k === "selected") { if (attrs[k]) node.setAttribute(k, k); }
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function isSalesforce(email) {
    const a = AUTH();
    if (a && typeof a.isSalesforceEmail === "function") return a.isSalesforceEmail(email);
    return /@salesforce\.com$/i.test(String(email || ""));
  }

  function close() {
    if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
    _overlay = null; _projectId = null; _shares = []; _visibility = null;
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) { if (e.key === "Escape") close(); }

  // Small inline status line (errors / confirmations) inside the modal.
  function setStatus(msg, tone) {
    const el = _overlay && _overlay.querySelector(".bx-share-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "bx-share-status" + (tone ? " tone-" + tone : "");
  }

  // open(projectId, projectName, visibility?) — visibility is the caller's
  // known value ("private"/"gallery"); when omitted the gallery toggle loads
  // it lazily. onChange (4th arg) is called after a visibility flip so the
  // home grid can refetch (a newly-published project appears in the gallery).
  function open(projectId, projectName, visibility, onChange) {
    if (!STORE || !projectId) return;
    close(); // any previous instance
    _projectId = projectId;
    _visibility = (visibility === "gallery" || visibility === "private") ? visibility : null;

    const card = h("div", { class: "bx-share-card", role: "dialog", "aria-modal": "true", "aria-label": "Share project" }, [
      h("div", { class: "bx-share-head" }, [
        h("div", { class: "bx-share-title", text: "Share" }),
        h("div", { class: "bx-share-sub", text: projectName || "Project" }),
        h("button", { class: "bx-share-x", "aria-label": "Close", text: "✕", on: { click: close } }),
      ]),
      buildInviteRow(),
      buildGalleryRow(onChange),
      h("div", { class: "bx-share-status" }),
      h("div", { class: "bx-share-list", id: "bxShareList" }, [
        h("div", { class: "bx-share-empty", text: "Loading collaborators…" }),
      ]),
      h("div", { class: "bx-share-foot" }, [
        h("div", { class: "bx-share-hint", text: "Only @salesforce.com teammates can be added. They'll see it under “Shared with me” on their next sign-in." }),
      ]),
    ]);

    _overlay = h("div", { class: "bx-share-overlay", on: { click: function (e) { if (e.target === _overlay) close(); } } }, [card]);
    document.body.appendChild(_overlay);
    document.addEventListener("keydown", onKey);
    refreshList();
    refreshGallery();
    const input = _overlay.querySelector(".bx-share-email");
    if (input) input.focus();
  }

  // "Publish to team gallery" toggle. Flips projects.visibility between
  // 'private' and 'gallery' via STORE.setVisibility. Any @salesforce.com
  // teammate can then find + duplicate the project from the Team Gallery tab
  // (RLS projects_select returns gallery rows to everyone). Read-only until the
  // current visibility is known (loaded lazily if the caller didn't pass it).
  function buildGalleryRow(onChange) {
    if (!STORE.setVisibility) return null; // store predates gallery — hide row
    const toggle = h("input", { class: "bx-share-gallery-toggle", type: "checkbox" });
    toggle.disabled = true; // enabled once visibility resolves
    const label = h("label", { class: "bx-share-gallery-label" }, [
      toggle,
      h("span", { class: "bx-share-gallery-text" }, [
        h("span", { class: "bx-share-gallery-title", text: "Publish to team gallery" }),
        h("span", { class: "bx-share-gallery-sub",
          text: "Any @salesforce.com teammate can find and duplicate this demo." }),
      ]),
    ]);
    toggle.addEventListener("change", function () {
      const next = toggle.checked ? "gallery" : "private";
      toggle.disabled = true;
      setStatus(toggle.checked ? "Publishing…" : "Unpublishing…");
      STORE.setVisibility(_projectId, next).then(function (vis) {
        _visibility = vis;
        setStatus(vis === "gallery" ? "Published to the team gallery." : "Removed from the team gallery.", "good");
        if (typeof onChange === "function") { try { onChange(); } catch (e) {} }
      }).catch(function (err) {
        toggle.checked = (_visibility === "gallery"); // revert
        setStatus((err && err.message) || "Couldn't update the gallery.", "warn");
      }).then(function () { toggle.disabled = false; });
    });
    return h("div", { class: "bx-share-gallery" }, [label]);
  }

  // Sync the toggle to the current visibility. Uses the caller-provided value
  // when present; otherwise loads the project once to read it.
  function refreshGallery() {
    const toggle = _overlay && _overlay.querySelector(".bx-share-gallery-toggle");
    if (!toggle) return;
    const apply = function (vis) {
      _visibility = (vis === "gallery") ? "gallery" : "private";
      // Guard against a stale close()/reopen: only touch the live toggle.
      const live = _overlay && _overlay.querySelector(".bx-share-gallery-toggle");
      if (!live) return;
      live.checked = (_visibility === "gallery");
      live.disabled = false;
    };
    if (_visibility != null) { apply(_visibility); return; }
    if (!STORE.loadProject) { apply("private"); return; }
    STORE.loadProject(_projectId).then(function (state) {
      apply(state && state.visibility);
    }).catch(function () { apply("private"); });
  }

  function buildInviteRow() {
    const email = h("input", {
      class: "bx-share-email", type: "email", placeholder: "teammate@salesforce.com",
      autocomplete: "off", spellcheck: "false",
    });
    const perm = h("select", { class: "bx-share-perm" }, [
      h("option", { value: "view", selected: true, text: "Can view" }),
      h("option", { value: "edit", text: "Can edit" }),
    ]);
    const add = h("button", { class: "bx-share-add", type: "button", text: "Share" });

    function submit() {
      const value = (email.value || "").trim().toLowerCase();
      if (!value) { setStatus("Enter an email.", "warn"); email.focus(); return; }
      if (!isSalesforce(value)) { setStatus("Only @salesforce.com emails can be added.", "warn"); return; }
      const me = (AUTH() && AUTH().currentUser && AUTH().currentUser()) ? String(AUTH().currentUser().email || "").toLowerCase() : "";
      if (value === me) { setStatus("That's you — you already own this project.", "warn"); return; }
      add.disabled = true; setStatus("Sharing…");
      STORE.shareProject(_projectId, value, perm.value).then(function () {
        email.value = ""; perm.value = "view";
        setStatus("Shared with " + value + ".", "good");
        return refreshList();
      }).catch(function (err) {
        setStatus((err && err.message) || "Couldn't share. Try again.", "warn");
      }).then(function () { add.disabled = false; });
    }
    add.addEventListener("click", submit);
    email.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } });

    return h("div", { class: "bx-share-invite" }, [email, perm, add]);
  }

  function refreshList() {
    return STORE.listShares(_projectId).then(function (rows) {
      _shares = rows || [];
      renderList();
    }).catch(function () {
      _shares = [];
      renderList("Couldn't load collaborators.");
    });
  }

  function renderList(errMsg) {
    const list = _overlay && _overlay.querySelector("#bxShareList");
    if (!list) return;
    list.innerHTML = "";
    if (errMsg) { list.appendChild(h("div", { class: "bx-share-empty", text: errMsg })); return; }
    if (!_shares.length) {
      list.appendChild(h("div", { class: "bx-share-empty", text: "Not shared with anyone yet." }));
      return;
    }
    _shares.forEach(function (s) {
      const email = s.shared_with_email;
      const perm = h("select", { class: "bx-share-row-perm" }, [
        h("option", { value: "view", selected: s.permission !== "edit", text: "Can view" }),
        h("option", { value: "edit", selected: s.permission === "edit", text: "Can edit" }),
      ]);
      perm.addEventListener("change", function () {
        const next = perm.value;
        setStatus("Updating…");
        STORE.updateShare(_projectId, email, next).then(function () {
          s.permission = next;
          setStatus("Updated " + email + ".", "good");
        }).catch(function (err) {
          perm.value = s.permission; // revert
          setStatus((err && err.message) || "Couldn't update.", "warn");
        });
      });
      const remove = h("button", { class: "bx-share-remove", type: "button", title: "Remove access", text: "Remove" });
      remove.addEventListener("click", function () {
        remove.disabled = true; setStatus("Removing…");
        STORE.unshareProject(_projectId, email).then(function () {
          setStatus("Removed " + email + ".", "good");
          return refreshList();
        }).catch(function (err) {
          remove.disabled = false;
          setStatus((err && err.message) || "Couldn't remove.", "warn");
        });
      });
      list.appendChild(h("div", { class: "bx-share-row" }, [
        h("span", { class: "bx-share-row-email", text: email }),
        perm,
        remove,
      ]));
    });
  }

  global.HOLO_SHARE = { open: open, close: close };
})(window);
