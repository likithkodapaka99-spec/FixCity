/**
 * Profile: social-style grid of the current user's reports.
 */
(function () {
  var feed = document.getElementById("profile-feed");
  var title = document.getElementById("profile-title");
  var sub = document.getElementById("profile-sub");

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatWhen(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  }

  function renderPost(r) {
    var img = r.image_url
      ? '<img class="social-post__img" src="' +
        escapeHtml(r.image_url) +
        '" alt="" loading="lazy" />'
      : '<div class="social-post__img social-post__img--placeholder">No photo</div>';
    var chips =
      '<span class="chip">' +
      escapeHtml(String(r.issue_category || "general")) +
      "</span>" +
      '<span class="chip chip--muted">' +
      escapeHtml(String(r.authority_status || "")) +
      "</span>" +
      '<span class="chip">' +
      escapeHtml(String(r.priority || "—")) +
      "</span>";
    return (
      '<article class="social-post">' +
      img +
      '<div class="social-post__body">' +
      '<div class="chips">' +
      chips +
      "</div>" +
      '<p class="social-post__text">' +
      escapeHtml(String(r.description || "")) +
      "</p>" +
      '<p class="meta">' +
      formatWhen(r.created_at) +
      (r.latitude != null && r.longitude != null
        ? " · " +
          Number(r.latitude).toFixed(4) +
          ", " +
          Number(r.longitude).toFixed(4)
        : "") +
      "</p>" +
      "</div>" +
      "</article>"
    );
  }

  async function run() {
    var meRes = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (!meRes.ok) {
      sub.textContent = "Redirecting to log in…";
      window.location.href = "/login";
      return;
    }
    var user = await meRes.json();
    title.textContent = user.display_name + " — your reports";
    sub.textContent =
      user.email + " · problem posts you filed (newest first).";

    var repRes = await fetch("/api/auth/my-reports", { credentials: "same-origin" });
    if (!repRes.ok) {
      feed.innerHTML = '<p class="meta">Could not load your posts.</p>';
      return;
    }
    var data = await repRes.json();
    var rows = data.reports || [];
    if (!rows.length) {
      feed.innerHTML =
        '<div class="empty">You have not posted yet. <a href="/report">Report a problem</a>.</div>';
      return;
    }
    feed.innerHTML = rows.map(renderPost).join("");
  }

  run().catch(function (e) {
    feed.innerHTML = '<p class="meta">Something went wrong.</p>';
    console.error(e);
  });
})();
