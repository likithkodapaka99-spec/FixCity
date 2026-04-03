/**
 * Shared top nav: session-aware links (same-origin cookies).
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

  function renderGuest() {
    mount.innerHTML =
      '<a href="/">Posts</a>' +
      '<a href="/report">Report</a>' +
      '<a href="/login">Log in</a>' +
      '<a href="/signup">Sign up</a>' +
      '<a href="/authority">Authority demo</a>';
  }

  function renderUser(u) {
    mount.innerHTML =
      '<span class="site-nav__hi">Hi, ' +
      escapeHtml(u.display_name) +
      "</span>" +
      '<a href="/">Posts</a>' +
      '<a href="/report">Report</a>' +
      '<a href="/profile">My posts</a>' +
      '<a href="/authority">Authority demo</a>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="nav-logout">Log out</button>';
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
