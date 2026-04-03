/**
 * FixCity — Posts / map / community.
 */
(function () {
  const DEFAULT_MAP_CENTER = [20.5937, 78.9629];
  const DEFAULT_MAP_ZOOM = 5;
  const fetchOpts = { credentials: "same-origin" };

  const feed = document.getElementById("feed");
  const flash = document.getElementById("flash");
  const btnRefresh = document.getElementById("btn-refresh");
  const btnNearby = document.getElementById("btn-nearby");
  const btnAll = document.getElementById("btn-all");
  const filterHint = document.getElementById("filter-hint");

  let mapInstance = null;
  let markerLayer = null;
  let currentNearFilter = null;
  let currentUser = null;

  function getVoterKey() {
    try {
      var k = localStorage.getItem("fixcity_voter_key");
      if (!k) {
        k =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : "v" + Math.random().toString(36).slice(2);
        localStorage.setItem("fixcity_voter_key", k);
      }
      return String(k).slice(0, 64);
    } catch {
      return "anon-" + Math.random().toString(36).slice(2);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showFlash(kind, message) {
    if (!flash) return;
    flash.hidden = false;
    flash.textContent = message;
    flash.className =
      "mb-4 rounded-2xl border px-4 py-3 text-sm " +
      (kind === "ok"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-rose-200 bg-rose-50 text-rose-900");
  }

  function clearFlash() {
    if (!flash) return;
    flash.hidden = true;
    flash.textContent = "";
    flash.className = "";
  }

  function updateFilterHint() {
    if (!filterHint) return;
    if (currentNearFilter) {
      filterHint.hidden = false;
      filterHint.textContent =
        "Showing reports within " +
        currentNearFilter.km +
        " km of your location (GPS reports only).";
    } else {
      filterHint.hidden = true;
      filterHint.textContent = "";
    }
  }

  function urgencyStyle(priority) {
    const p = (priority || "").toLowerCase();
    if (p === "high")
      return { fill: "#dc2626", stroke: "#991b1b", label: "High", radius: 14 };
    if (p === "medium")
      return { fill: "#f59e0b", stroke: "#b45309", label: "Medium", radius: 11 };
    if (p === "low")
      return { fill: "#059669", stroke: "#047857", label: "Low", radius: 9 };
    return { fill: "#64748b", stroke: "#475569", label: "Unclassified", radius: 8 };
  }

  function ensureMap() {
    if (typeof L === "undefined") return false;
    if (mapInstance) return true;
    const el = document.getElementById("map");
    if (!el) return false;
    mapInstance = L.map("map", { scrollWheelZoom: true }).setView(
      DEFAULT_MAP_CENTER,
      DEFAULT_MAP_ZOOM
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapInstance);
    markerLayer = L.layerGroup().addTo(mapInstance);
    return true;
  }

  function invalidateMapSoon() {
    setTimeout(function () {
      if (mapInstance) mapInstance.invalidateSize();
    }, 120);
  }

  function syncMap(rows) {
    if (!ensureMap() || !mapInstance || !markerLayer) return;
    markerLayer.clearLayers();
    const pts = [];
    rows.forEach(function (r) {
      if (r.latitude == null || r.longitude == null) return;
      const lat = Number(r.latitude);
      const lng = Number(r.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;
      const u = urgencyStyle(r.priority);
      const m = L.circleMarker([lat, lng], {
        radius: u.radius,
        color: u.stroke,
        weight: 2,
        fillColor: u.fill,
        fillOpacity: 0.88,
      });
      const desc = String(r.description || "");
      const short = desc.slice(0, 110);
      const more = desc.length > short.length ? "…" : "";
      const cat = r.issue_category ? escapeHtml(String(r.issue_category)) : "—";
      const auth = escapeHtml(String(r.authority_status || "—"));
      m.bindPopup(
        "<strong>Report #" +
          escapeHtml(String(r.id)) +
          "</strong><br>" +
          escapeHtml(short) +
          more +
          "<br><small>" +
          "Priority: " +
          escapeHtml(u.label) +
          "<br>Category: " +
          cat +
          "<br>Authority: " +
          auth +
          '</small><br><a href="#report-' +
          escapeHtml(String(r.id)) +
          '">Jump to card ↓</a>'
      );
      markerLayer.addLayer(m);
      pts.push([lat, lng]);
    });

    if (pts.length === 1) {
      mapInstance.setView(pts[0], 14);
    } else if (pts.length > 1) {
      mapInstance.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
    } else {
      mapInstance.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
    }
    invalidateMapSoon();
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

  function mapLinksHtml(lat, lng) {
    if (lat == null || lng == null) {
      return '<span class="text-slate-600">Location not set</span>';
    }
    var la = Number(lat);
    var ln = Number(lng);
    if (Number.isNaN(la) || Number.isNaN(ln)) {
      return '<span class="text-slate-600">Location not set</span>';
    }
    var label = la.toFixed(5) + ", " + ln.toFixed(5);
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
      '<span class="text-slate-600">' +
      escapeHtml(label) +
      '</span><br><span class="mt-1 inline-flex flex-wrap gap-x-2 gap-y-1">' +
      '<a class="font-semibold text-brand-700 hover:underline" href="' +
      escapeHtml(g) +
      '" target="_blank" rel="noopener noreferrer">Google Maps</a>' +
      '<span class="text-slate-400">·</span>' +
      '<a class="font-semibold text-brand-700 hover:underline" href="' +
      escapeHtml(o) +
      '" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' +
      "</span>"
    );
  }

  function renderSuggestions(data) {
    const s = data.ai_suggestions;
    if (s == null) {
      return (
        '<div class="fc-suggestions">' +
        "<h4>Suggested actions</h4>" +
        '<p style="margin:0;font-size:0.875rem;color:#475569;">No suggestions stored (older report). New reports get instant triage.</p>' +
        "</div>"
      );
    }
    var list = Array.isArray(s) ? s : typeof s === "string" ? [s] : [];
    if (list.length) {
      const items = list
        .slice(0, 6)
        .map(function (x) {
          return "<li>" + escapeHtml(String(x)) + "</li>";
        })
        .join("");
      return (
        '<div class="fc-suggestions">' +
        "<h4>Suggested actions</h4>" +
        "<ul>" +
        items +
        "</ul></div>"
      );
    }
    return (
      '<div class="fc-suggestions">' +
      "<h4>Suggested actions</h4>" +
      '<p style="margin:0;font-size:0.875rem;color:#475569;">No suggestions available for this report.</p>' +
      "</div>"
    );
  }


  function authorStripHtml(author) {
    var name =
      author && author.display_name ? String(author.display_name) : "Anonymous";
    var url = author && author.avatar_url;
    var initial = name.trim().slice(0, 1).toUpperCase() || "?";
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

  function badge(text, kind) {
    var cls = "fc-badge fc-badge--med";
    if (kind === "author") cls = "fc-badge fc-badge--author";
    else if (kind === "muted") cls = "fc-badge fc-badge--muted";
    else if (kind === "high") cls = "fc-badge fc-badge--high";
    else if (kind === "low") cls = "fc-badge fc-badge--low";
    return '<span class="' + cls + '">' + escapeHtml(text) + "</span>";
  }

  function renderCommunityShell(id) {
    return (
      '<div class="fc-community-wrap">' +
      '<p style="margin:0;font-size:0.875rem;font-weight:600;color:#0f172a;">Community</p>' +
      '<div class="fc-community-inner community__inner" data-report-id="' +
      escapeHtml(String(id)) +
      '">Loading…</div>' +
      "</div>"
    );
  }

  function buildCommunityHTML(c, reportId) {
    const v = c.vote_summary || {};
    const voteLine =
      v.count > 0
        ? "Urgency: <strong>" +
          escapeHtml(String(v.average)) +
          "/5</strong> (" +
          v.count +
          ")"
        : "No urgency votes yet.";

    const volItems = (c.volunteers || [])
      .slice(0, 5)
      .map(function (x) {
        var av = x.avatar_url
          ? '<img src="' +
            escapeHtml(x.avatar_url) +
            '" alt="" style="width:1.5rem;height:1.5rem;border-radius:9999px;object-fit:cover;vertical-align:middle;margin-right:0.35rem" />'
          : "";
        return (
          '<li style="font-size:0.875rem;color:#334155">' +
          av +
          escapeHtml(x.display_name) +
          (x.contact
            ? ' <span style="font-size:0.75rem;color:#64748b">(' + escapeHtml(x.contact) + ")</span>"
            : "") +
          "</li>"
        );
      })
      .join("");

    const msgItems = (c.messages || [])
      .slice(-8)
      .map(function (m) {
        var mav = m.sender_avatar_url
          ? '<img src="' +
            escapeHtml(m.sender_avatar_url) +
            '" alt="" style="width:1.5rem;height:1.5rem;border-radius:9999px;object-fit:cover;vertical-align:middle;margin-right:0.35rem" />'
          : "";
        return (
          '<li style="padding:0.5rem 0;border-bottom:1px solid #f1f5f9">' +
          '<p style="margin:0;font-size:0.875rem">' +
          mav +
          '<span style="font-weight:600">' +
          escapeHtml(m.sender_name) +
          '</span> <span style="font-size:0.75rem;color:#64748b">' +
          escapeHtml(formatWhen(m.created_at)) +
          "</span></p>" +
          '<p style="margin:0.25rem 0 0;font-size:0.875rem;color:#334155">' +
          escapeHtml(m.body) +
          "</p></li>"
        );
      })
      .join("");

    const voteBtns = [1, 2, 3, 4, 5]
      .map(function (s) {
        return (
          '<button type="button" class="vote-btn" style="border-radius:0.75rem;border:1px solid #e2e8f0;background:#fff;padding:0.35rem 0.6rem;font-size:0.75rem;font-weight:600;color:#334155;cursor:pointer" data-report-id="' +
          escapeHtml(reportId) +
          '" data-score="' +
          s +
          '">' +
          s +
          "</button>"
        );
      })
      .join(" ");

    return (
      '<div style="display:flex;flex-direction:column;gap:1rem">' +
      '<div style="font-size:0.875rem;color:#334155">' +
      voteLine +
      "</div>" +
      '<div style="display:flex;flex-wrap:wrap;gap:0.5rem">' +
      voteBtns +
      "</div>" +
      '<div style="display:grid;gap:0.75rem;grid-template-columns:1fr">' +
      '<form class="form-help" data-report-id="' +
      escapeHtml(reportId) +
      '" style="display:flex;flex-direction:column;gap:0.5rem">' +
      '<p style="margin:0;font-size:0.875rem;font-weight:600">I can help</p>' +
      (currentUser
        ? '<input type="hidden" name="display_name" value="' +
          escapeHtml(currentUser.display_name) +
          '" />'
        : '<input style="width:100%;border-radius:0.75rem;border:1px solid #e2e8f0;padding:0.5rem 0.75rem;font-size:0.875rem" name="display_name" placeholder="Your name" required maxlength="120" />') +
      '<input style="width:100%;border-radius:0.75rem;border:1px solid #e2e8f0;padding:0.5rem 0.75rem;font-size:0.875rem" name="contact" placeholder="Contact (optional)" maxlength="255" />' +
      '<button style="border-radius:0.75rem;background:#4f46e5;color:#fff;padding:0.5rem;font-size:0.875rem;font-weight:600;border:none;cursor:pointer" type="submit">Send</button>' +
      "</form>" +
      '<div>' +
      '<p style="margin:0 0 0.5rem;font-size:0.875rem;font-weight:600">Volunteers</p>' +
      (volItems
        ? '<ul style="margin:0;padding-left:1.25rem">' + volItems + "</ul>"
        : '<p style="margin:0;font-size:0.875rem;color:#64748b">No volunteers yet.</p>') +
      "</div></div>" +
      '<div>' +
      '<p style="margin:0 0 0.5rem;font-size:0.875rem;font-weight:600">Chat</p>' +
      (msgItems
        ? '<ul style="margin:0;max-height:14rem;overflow:auto;list-style:none;padding:0;border:1px solid #e2e8f0;border-radius:0.75rem;background:#fff">' +
          msgItems +
          "</ul>"
        : '<p style="margin:0;font-size:0.875rem;color:#64748b">No messages yet.</p>') +
      '<form class="form-msg" data-report-id="' +
      escapeHtml(reportId) +
      '" style="margin-top:0.5rem;display:flex;flex-direction:column;gap:0.5rem">' +
      (currentUser
        ? '<input type="hidden" name="sender_name" value="' +
          escapeHtml(currentUser.display_name) +
          '" />'
        : '<input style="width:100%;border-radius:0.75rem;border:1px solid #e2e8f0;padding:0.5rem 0.75rem;font-size:0.875rem" name="sender_name" placeholder="Name" required maxlength="120" />') +
      '<textarea style="width:100%;border-radius:0.75rem;border:1px solid #e2e8f0;padding:0.5rem 0.75rem;font-size:0.875rem" name="body" rows="2" placeholder="Message" required maxlength="2000"></textarea>' +
      '<button style="border-radius:0.75rem;border:1px solid #e2e8f0;background:#fff;padding:0.5rem;font-size:0.875rem;font-weight:600;color:#334155;cursor:pointer" type="submit">Send</button>' +
      "</form></div>" +
      "</div>"
    );
  }

  async function hydrateCommunity(reportId) {
    var inner = feed.querySelector(
      '.community__inner[data-report-id="' + reportId + '"]'
    );
    if (!inner) return;
    inner.textContent = "Loading…";
    var vk = getVoterKey();
    try {
      var res = await fetch(
        "/api/reports/" +
          encodeURIComponent(String(reportId)) +
          "/community?voter_key=" +
          encodeURIComponent(vk),
        fetchOpts
      );
      if (!res.ok) throw new Error("community fetch failed");
      var data = await res.json();
      inner.innerHTML = buildCommunityHTML(data, String(reportId));
    } catch (e) {
      inner.innerHTML =
        '<p style="font-size:0.875rem;color:#64748b">Could not load community.</p>';
      console.error(e);
    }
  }

  async function hydrateAllCommunity(rows) {
    await Promise.all(
      rows.map(function (r) {
        return hydrateCommunity(String(r.id));
      })
    );
  }

  function renderCard(data) {
    const imgUrl = data.image_url || "";
    const hasLoc = data.latitude != null && data.longitude != null;

    const pri = (data.priority || "").toLowerCase();
    const priChip =
      pri === "high"
        ? badge("Priority: high", "high")
        : pri === "low"
          ? badge("Priority: low", "low")
          : badge("Priority: medium", "");

    const catChip = data.issue_category
      ? badge(String(data.issue_category), "muted")
      : badge("Category pending", "muted");

    const imgBlock = imgUrl
      ? '<img class="h-56 w-full object-cover" src="' +
        escapeHtml(imgUrl) +
        '" alt="Report photo" loading="lazy" />'
      : '<div class="h-56 w-full bg-slate-100 flex items-center justify-center text-sm text-slate-500">No photo</div>';

    return (
      '<article class="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" id="report-' +
      escapeHtml(String(data.id)) +
      '">' +
      authorStripHtml(data.author) +
      imgBlock +
      '<div class="p-5">' +
      '<div class="flex flex-wrap gap-2">' +
      catChip +
      priChip +
      (data.resolution_route
        ? badge(
            String(data.resolution_route).toLowerCase() === "authority"
              ? "Needs municipality"
              : "Community can help",
            "muted"
          )
        : "") +
      "</div>" +
      '<p class="mt-3 text-sm text-slate-800">' +
      escapeHtml(data.description || "") +
      "</p>" +
      '<div class="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">' +
      '<div><span class="font-semibold">Status:</span> ' +
      escapeHtml(data.authority_status || "") +
      "</div>" +
      '<div><span class="font-semibold">Reported:</span> ' +
      escapeHtml(formatWhen(data.created_at)) +
      "</div>" +
      '<div class="sm:col-span-1"><span class="font-semibold">Location:</span> ' +
      mapLinksHtml(hasLoc ? data.latitude : null, hasLoc ? data.longitude : null) +
      "</div>" +
      "</div>" +
      renderSuggestions(data) +
      renderCommunityShell(data.id) +
      "</div></article>"
    );
  }

  async function loadReports(opts) {
    opts = opts || {};
    var silent = !!opts.silent;
    if (!silent && feed) {
      feed.innerHTML = '<p class="text-sm text-slate-600">Loading…</p>';
    }
    try {
      var url = "/api/reports";
      if (currentNearFilter) {
        url +=
          "?near_lat=" +
          encodeURIComponent(currentNearFilter.lat) +
          "&near_lng=" +
          encodeURIComponent(currentNearFilter.lng) +
          "&radius_km=" +
          encodeURIComponent(currentNearFilter.km);
      }
      const res = await fetch(url, fetchOpts);
      if (!res.ok) throw new Error("Failed to load reports");
      const payload = await res.json();
      const rows = payload.reports || [];
      if (!rows.length) {
        if (feed) {
          feed.innerHTML =
            '<div class="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-700">No reports yet. <a class="font-semibold text-indigo-700 hover:underline" href="/report">Submit the first one</a>.</div>';
        }
        syncMap([]);
        invalidateMapSoon();
        return;
      }
      if (feed) feed.innerHTML = rows.map(renderCard).join("");
      syncMap(rows);
      await hydrateAllCommunity(rows);
    } catch (e) {
      if (!silent && feed) {
        feed.innerHTML =
          '<div class="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900">Could not reach the API. Start the backend (<code>python run.py</code>).</div>';
        syncMap([]);
      }
      console.error(e);
    }
  }

  if (btnRefresh) btnRefresh.addEventListener("click", loadReports);

  if (btnNearby) {
    btnNearby.addEventListener("click", function () {
      clearFlash();
      if (!navigator.geolocation) {
        showFlash("err", "Geolocation is not available in this browser.");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          currentNearFilter = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            km: 10,
          };
          updateFilterHint();
          loadReports();
        },
        function () {
          showFlash("err", "Location permission is needed for the nearby filter.");
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  if (btnAll) {
    btnAll.addEventListener("click", function () {
      currentNearFilter = null;
      updateFilterHint();
      loadReports();
    });
  }

  if (feed) {
    feed.addEventListener("click", async function (ev) {
      var t = ev.target;
      if (!t || !t.classList || !t.classList.contains("vote-btn")) return;
      ev.preventDefault();
      var rid = t.getAttribute("data-report-id");
      var score = parseInt(t.getAttribute("data-score"), 10);
      if (!rid || score < 1 || score > 5) return;
      try {
        var res = await fetch(
          "/api/reports/" + encodeURIComponent(rid) + "/votes",
          Object.assign({}, fetchOpts, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ voter_key: getVoterKey(), score: score }),
          })
        );
        if (!res.ok) throw new Error("vote failed");
        await hydrateCommunity(rid);
      } catch (e) {
        showFlash("err", "Could not save your vote.");
        console.error(e);
      }
    });

    feed.addEventListener("submit", async function (ev) {
      var form = ev.target;
      if (!form || !form.classList) return;
      var rid = form.getAttribute("data-report-id");
      if (!rid) return;

      if (!form.classList.contains("form-help") && !form.classList.contains("form-msg")) {
        return;
      }

      ev.preventDefault();

      try {
        if (form.classList.contains("form-help")) {
          var fd = new FormData(form);
          var name = (fd.get("display_name") || "").toString().trim();
          var contact = (fd.get("contact") || "").toString().trim();
          var res = await fetch(
            "/api/reports/" + encodeURIComponent(rid) + "/volunteers",
            Object.assign({}, fetchOpts, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ display_name: name, contact: contact }),
            })
          );
          if (!res.ok) throw new Error("volunteer failed");
          form.reset();
        } else {
          var fd2 = new FormData(form);
          var sender = (fd2.get("sender_name") || "").toString().trim();
          var body = (fd2.get("body") || "").toString().trim();
          var res2 = await fetch(
            "/api/reports/" + encodeURIComponent(rid) + "/messages",
            Object.assign({}, fetchOpts, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sender_name: sender, body: body }),
            })
          );
          if (!res2.ok) throw new Error("message failed");
          form.reset();
        }
        await hydrateCommunity(rid);
      } catch (e) {
        showFlash("err", "Could not send that. Check your connection and retry.");
        console.error(e);
      }
    });
  }

  window.addEventListener("resize", invalidateMapSoon);

  updateFilterHint();
  (async function initFeed() {
    try {
      var mr = await fetch("/api/auth/me", fetchOpts);
      if (mr.ok) currentUser = await mr.json();
    } catch (e) {}
    loadReports();
  })();
})();
