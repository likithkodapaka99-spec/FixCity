/**
 * Shared top nav: session-aware links (same-origin cookies).
 * Municipality console is only linked for staff (role === "authority").
 */
(function () {
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var mount = document.getElementById("nav-mount");
  if (!mount) return;

  var darkNav = document.body.classList.contains("fc-municipality-console");

  function link(href, label) {
    var cls = darkNav
      ? "text-sm font-semibold text-slate-100 hover:text-white"
      : "text-sm font-semibold text-slate-700 hover:text-slate-900";
    return (
      '<a class="' +
      cls +
      '" href="' +
      escapeHtml(href) +
      '">' +
      escapeHtml(label) +
      "</a>"
    );
  }

  /** Municipality console link only for logged-in staff (not shown to citizens). */
  function authorityNavExtra(u) {
    if (u && u.role === "authority") {
      return link("/authority", "Municipality");
    }
    return "";
  }

  function renderGuest() {
    mount.innerHTML =
      link("/", "Posts") +
      link("/report", "Report") +
      link("/login", "Log in") +
      link("/signup", "Sign up") +
      link("/authority/login", "Staff login");
  }

  function renderUser(u) {
    var greetCls = darkNav
      ? "hidden sm:inline text-sm text-slate-300"
      : "hidden sm:inline text-sm text-slate-600";
    var greetNameCls = darkNav
      ? "font-semibold text-white"
      : "font-semibold text-slate-900";
    var btnCls = darkNav
      ? "inline-flex items-center rounded-lg border border-slate-500 bg-slate-800 px-3 py-1.5 text-sm font-semibold text-slate-100 hover:bg-slate-700"
      : "inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50";
    mount.innerHTML =
      '<span class="' +
      greetCls +
      '">Hi, <span class="' +
      greetNameCls +
      '">' +
      escapeHtml(u.display_name) +
      "</span></span>" +
      link("/", "Posts") +
      link("/report", "Report") +
      link("/profile", "Profile") +
      authorityNavExtra(u) +
      '<button type="button" class="' +
      btnCls +
      '" id="nav-logout">Log out</button>';
    var btn = document.getElementById("nav-logout");
    if (btn) {
      btn.addEventListener("click", async function () {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
        });
        window.location.href = "/";
      });
    }
  }

  fetch("/api/auth/me", { credentials: "same-origin" })
    .then(function (r) {
      if (r.ok) return r.json();
      renderGuest();
      return null;
    })
    .then(function (u) {
      if (u) renderUser(u);
    })
    .catch(function () {
      renderGuest();
    });
})();
