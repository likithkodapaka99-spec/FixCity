/**
 * Profile: avatar upload + user's reports (layout matches main feed).
 */
(function () {
  var feed = document.getElementById("profile-feed");
  var title = document.getElementById("profile-title");
  var sub = document.getElementById("profile-sub");
  var flash = document.getElementById("profile-flash");
  var avatarLetter = document.getElementById("profile-avatar-letter");
  var avatarImg = document.getElementById("profile-avatar-img");
  var formAvatar = document.getElementById("form-avatar");
  var inputAvatar = document.getElementById("input-avatar");

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

  function showFlash(kind, msg) {
    if (!flash) return;
    flash.hidden = false;
    flash.textContent = msg;
    flash.className =
      "mt-3 rounded-xl border px-3 py-2 text-sm " +
      (kind === "ok"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-rose-200 bg-rose-50 text-rose-900");
  }

  function setAvatarUI(user) {
    var url = user && user.avatar_url;
    var name = (user && user.display_name) || "?";
    if (url && avatarImg && avatarLetter) {
      avatarImg.src = url;
      avatarImg.classList.remove("hidden");
      avatarLetter.classList.add("hidden");
    } else if (avatarImg && avatarLetter) {
      avatarImg.removeAttribute("src");
      avatarImg.classList.add("hidden");
      avatarLetter.classList.remove("hidden");
      avatarLetter.textContent = String(name).trim().slice(0, 1).toUpperCase() || "?";
    }
  }

  function authorStripFromUser(user) {
    var name = (user && user.display_name) || "You";
    var url = user && user.avatar_url;
    var initial = String(name).trim().slice(0, 1).toUpperCase() || "?";
    var avatar = url
      ? '<img class="h-10 w-10 shrink-0 rounded-full border border-slate-200 object-cover" src="' +
        escapeHtml(url) +
        '" alt="" />'
      : '<span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-600">' +
        escapeHtml(initial) +
        "</span>";
    return (
      '<div class="flex items-center gap-3 border-b border-slate-100 bg-white px-5 py-3">' +
      avatar +
      '<span class="text-sm font-semibold text-slate-900">' +
      escapeHtml(name) +
      "</span></div>"
    );
  }

  function mapLinks(lat, lng) {
    var la = Number(lat);
    var ln = Number(lng);
    var g =
      "https://www.google.com/maps?q=" + encodeURIComponent(la + "," + ln);
    var o =
      "https://www.openstreetmap.org/?mlat=" +
      encodeURIComponent(la) +
      "&mlon=" +
      encodeURIComponent(ln) +
      "#map=16/" +
      la +
      "/" +
      ln;
    return (
      '<div class="fc-meta">' +
      escapeHtml(la.toFixed(5) + ", " + ln.toFixed(5)) +
      '<br><a class="font-semibold text-indigo-700 hover:underline" href="' +
      escapeHtml(g) +
      '" target="_blank" rel="noopener noreferrer">Google Maps</a>' +
      ' <span class="text-slate-400">·</span> ' +
      '<a class="font-semibold text-indigo-700 hover:underline" href="' +
      escapeHtml(o) +
      '" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' +
      "</div>"
    );
  }

  function renderPost(r, user) {
    var img = r.image_url
      ? '<img src="' +
        escapeHtml(r.image_url) +
        '" alt="" loading="lazy" />'
      : '<div class="fc-profile-placeholder">No photo</div>';
    var chips =
      '<span class="fc-badge fc-badge--muted">' +
      escapeHtml(String(r.issue_category || "general")) +
      "</span>" +
      '<span class="fc-badge fc-badge--muted">' +
      escapeHtml(String(r.authority_status || "")) +
      "</span>" +
      '<span class="fc-badge fc-badge--med">' +
      escapeHtml(String(r.priority || "—")) +
      "</span>";
    var loc =
      r.latitude != null && r.longitude != null
        ? mapLinks(r.latitude, r.longitude)
        : '<p class="fc-meta">Location not set</p>';
    return (
      '<article class="fc-profile-card">' +
      authorStripFromUser(user) +
      img +
      '<div class="fc-profile-body">' +
      '<div class="fc-chips">' +
      chips +
      "</div>" +
      '<p style="margin:0 0 0.75rem;font-size:0.875rem;color:#0f172a;line-height:1.5">' +
      escapeHtml(String(r.description || "")) +
      "</p>" +
      '<p class="fc-meta">' +
      formatWhen(r.created_at) +
      "</p>" +
      loc +
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
    title.textContent = user.display_name;
    sub.textContent = user.email + " · your public name and photo appear on posts and community replies.";
    setAvatarUI(user);

    if (formAvatar && inputAvatar) {
      formAvatar.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (!inputAvatar.files || !inputAvatar.files[0]) {
          showFlash("err", "Choose an image first.");
          return;
        }
        var fd = new FormData();
        fd.append("avatar", inputAvatar.files[0]);
        try {
          var res = await fetch("/api/auth/avatar", {
            method: "POST",
            credentials: "same-origin",
            body: fd,
          });
          var data = await res.json().catch(function () {
            return {};
          });
          if (!res.ok) {
            showFlash("err", data.error || "Upload failed.");
            return;
          }
          if (data.user) {
            user = data.user;
            setAvatarUI(user);
          }
          showFlash("ok", "Profile photo updated.");
          inputAvatar.value = "";
        } catch (err) {
          showFlash("err", "Could not upload. Try again.");
          console.error(err);
        }
      });
    }

    var repRes = await fetch("/api/auth/my-reports", { credentials: "same-origin" });
    if (!repRes.ok) {
      feed.innerHTML = '<p class="fc-meta">Could not load your posts.</p>';
      return;
    }
    var data = await repRes.json();
    var rows = data.reports || [];
    if (!rows.length) {
      feed.innerHTML =
        '<div class="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-700">You have not posted yet. <a class="font-semibold text-indigo-700 hover:underline" href="/report">Report a problem</a>.</div>';
      return;
    }
    feed.innerHTML = rows.map(function (r) {
      return renderPost(r, user);
    }).join("");
  }

  run().catch(function (e) {
    feed.innerHTML = '<p class="fc-meta">Something went wrong.</p>';
    console.error(e);
  });
})();

