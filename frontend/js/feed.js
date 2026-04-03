/**
 * FixCity — Posts / map / community (no report form). Used on / (index).
 */
(function () {
  const DEFAULT_MAP_CENTER = [20.5937, 78.9629];
  const DEFAULT_MAP_ZOOM = 5;
  const LIVE_POLL_MS = 22000;
  const LS_LIVE_POLL = "fixcity_live_poll";
  const fetchOpts = { credentials: "same-origin" };

  const feed = document.getElementById("feed");
  const flash = document.getElementById("flash");
  const btnRefresh = document.getElementById("btn-refresh");
  const btnNearby = document.getElementById("btn-nearby");
  const btnAll = document.getElementById("btn-all");
  const filterHint = document.getElementById("filter-hint");
  const chkLive = document.getElementById("chk-live");

  let mapInstance = null;
  let markerLayer = null;
  let livePollTimer = null;
  let currentNearFilter = null;

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
    if (p === "high") {
      return {
        fill: "#dc2626",
        stroke: "#991b1b",
        label: "High urgency",
        radius: 14,
      };
    }
    if (p === "medium") {
      return {
        fill: "#d97706",
        stroke: "#b45309",
        label: "Medium urgency",
        radius: 11,
      };
    }
    if (p === "low") {
      return {
        fill: "#059669",
        stroke: "#047857",
        label: "Low urgency",
        radius: 9,
      };
    }
    return {
      fill: "#64748b",
      stroke: "#475569",
      label: "Unclassified",
      radius: 8,
    };
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
      const cat = r.issue_category
        ? escapeHtml(String(r.issue_category))
        : "—";
      const auth = escapeHtml(String(r.authority_status || "—"));
      m.bindPopup(
        "<strong>Report #" +
          escapeHtml(String(r.id)) +
          "</strong><br>" +
          escapeHtml(short) +
          more +
          "<br><span style=\"color:" +
          u.fill +
          "\">●</span> " +
          escapeHtml(u.label) +
          "<br><small>Category: " +
          cat +
          "<br>Authority: " +
          auth +
          '</small><br><a href="#report-' +
          escapeHtml(String(r.id)) +
          '">Jump to card ↓</a> · <a href="/authority" target="_blank" rel="noopener">Console</a>'
      );
      markerLayer.addLayer(m);
      pts.push([lat, lng]);
    });

    if (pts.length === 1) {
      mapInstance.setView(pts[0], 14);
    } else if (pts.length > 1) {
      mapInstance.fitBounds(L.latLngBounds(pts), {
        padding: [40, 40],
        maxZoom: 15,
      });
    } else {
      mapInstance.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
    }
    invalidateMapSoon();
  }

  function showFlash(kind, message) {
    if (!flash) return;
    flash.hidden = false;
    flash.textContent = message;
    flash.className = "flash " + (kind === "ok" ? "flash--ok" : "flash--err");
  }

  function clearFlash() {
    if (!flash) return;
    flash.hidden = true;
    flash.textContent = "";
    flash.className = "flash";
  }

  function formatWhen(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  }

  function renderSuggestions(data) {
    const s = data.ai_suggestions;
    if (s == null) {
      return (
        '<div class="solutions"><h3>Suggested actions</h3>' +
        "<p class=\"meta\">No suggestions stored (older report). New reports get instant rule-based triage.</p></div>"
      );
    }
    if (Array.isArray(s)) {
      if (s.length === 0) {
        return (
          '<div class="solutions"><h3>Suggested actions</h3><p class="meta">(empty list)</p></div>'
        );
      }
      const items = s
        .map(function (x) {
          return "<li>" + escapeHtml(String(x)) + "</li>";
        })
        .join("");
      return (
        '<div class="solutions"><h3>Suggested actions</h3><ul>' +
        items +
        "</ul></div>"
      );
    }
    return (
      '<div class="solutions"><h3>Suggested actions</h3><pre class="meta">' +
      escapeHtml(JSON.stringify(s, null, 2)) +
      "</pre></div>"
    );
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function priorityChip(p) {
    if (!p) return '<span class="chip chip--muted">Priority: —</span>';
    const cls =
      p === "high"
        ? "chip--danger"
        : p === "medium"
          ? ""
          : "chip--ok";
    return (
      '<span class="chip ' +
      cls +
      '">Priority: ' +
      escapeHtml(p) +
      "</span>"
    );
  }

  function renderCommunityShell(id) {
    return (
      '<section class="community">' +
      '<h3 class="community__title">Community</h3>' +
      '<div class="community__inner" data-report-id="' +
      escapeHtml(String(id)) +
      '">Loading…</div>' +
      "</section>"
    );
  }

  function buildCommunityHTML(c, reportId) {
    const v = c.vote_summary || {};
    const voteLine =
      v.count > 0
        ? "Community urgency: <strong>" +
          escapeHtml(String(v.average)) +
          "/5</strong> (" +
          v.count +
          " vote" +
          (v.count === 1 ? "" : "s") +
          ")"
        : "No community urgency votes yet.";
    const mine =
      v.my_score != null
        ? '<p class="meta">Your vote: ' +
          escapeHtml(String(v.my_score)) +
          "/5</p>"
        : '<p class="meta">You have not voted on this report yet.</p>';

    const volItems = (c.volunteers || [])
      .map(function (x) {
        return (
          "<li>" +
          escapeHtml(x.display_name) +
          (x.contact
            ? ' — <span class="meta">' + escapeHtml(x.contact) + "</span>"
            : "") +
          "</li>"
        );
      })
      .join("");

    const msgItems = (c.messages || [])
      .map(function (m) {
        return (
          "<li><strong>" +
          escapeHtml(m.sender_name) +
          '</strong> <span class="meta">' +
          escapeHtml(formatWhen(m.created_at)) +
          "</span><br>" +
          escapeHtml(m.body) +
          "</li>"
        );
      })
      .join("");

    const msgBlock = msgItems
      ? '<ul class="comm-msgs">' + msgItems + "</ul>"
      : '<p class="meta">No messages yet — say you’re on the way or share updates.</p>';

    const voteBtns = [1, 2, 3, 4, 5]
      .map(function (s) {
        return (
          '<button type="button" class="btn btn--ghost btn--sm vote-btn" data-report-id="' +
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
      '<div class="comm-block">' +
      '<p class="comm-votes">' +
      voteLine +
      "</p>" +
      mine +
      '<p class="meta">Rate how urgent this feels (1 = low, 5 = critical)</p>' +
      '<div class="vote-row">' +
      voteBtns +
      "</div>" +
      '<h4 class="comm-sub">Helpers (“I can help”)</h4>' +
      (volItems
        ? '<ul class="comm-list">' + volItems + "</ul>"
        : '<p class="meta">No volunteers yet — be the first.</p>') +
      '<form class="form-help comm-form" data-report-id="' +
      escapeHtml(reportId) +
      '">' +
      '<label class="mini">Your name <input type="text" name="display_name" required maxlength="120" autocomplete="name" /></label>' +
      '<label class="mini">Contact (optional) <input type="text" name="contact" maxlength="255" placeholder="phone, email, or social handle" autocomplete="tel" /></label>' +
      '<button type="submit" class="btn btn--primary btn--sm">I can help</button>' +
      "</form>" +
      '<h4 class="comm-sub">Neighborhood chat</h4>' +
      msgBlock +
      '<form class="form-msg comm-form" data-report-id="' +
      escapeHtml(reportId) +
      '">' +
      '<label class="mini">Name <input type="text" name="sender_name" required maxlength="120" autocomplete="nickname" /></label>' +
      '<label class="field"><span class="field__label">Message</span><textarea name="body" rows="2" required maxlength="2000"></textarea></label>' +
      '<button type="submit" class="btn btn--ghost btn--sm">Send</button>' +
      "</form>" +
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
        '<p class="meta">Could not load community data. Refresh to retry.</p>';
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
    const loc =
      data.latitude != null && data.longitude != null
        ? data.latitude.toFixed(5) + ", " + data.longitude.toFixed(5)
        : "Location not set";

    const authorChip =
      data.author && data.author.display_name
        ? '<span class="chip chip--author">' +
          escapeHtml(data.author.display_name) +
          "</span>"
        : '<span class="chip chip--muted">No author (legacy)</span>';

    const cat = data.issue_category
      ? '<span class="chip">' + escapeHtml(data.issue_category) + "</span>"
      : '<span class="chip chip--muted">Category pending</span>';

    const route = data.resolution_route
      ? '<span class="chip">' +
        escapeHtml(data.resolution_route) +
        " path</span>"
      : "";

    const imgBlock = imgUrl
      ? '<img class="card__media" src="' +
        escapeHtml(imgUrl) +
        '" alt="Report photo" loading="lazy" />'
      : '<div class="card__media" role="img" aria-label="No photo"></div>';

    return (
      '<article class="card" id="report-' +
      escapeHtml(String(data.id)) +
      '">' +
      imgBlock +
      '<div class="card__body">' +
      '<div class="chips">' +
      authorChip +
      cat +
      priorityChip(data.priority) +
      route +
      "</div>" +
      "<p>" +
      escapeHtml(data.description || "") +
      "</p>" +
      '<p class="meta"><strong>Status:</strong> ' +
      escapeHtml(data.authority_status || "") +
      "</p>" +
      '<p class="meta"><strong>Reported:</strong> ' +
      formatWhen(data.created_at) +
      "</p>" +
      '<p class="meta"><strong>GPS:</strong> ' +
      escapeHtml(loc) +
      "</p>" +
      renderSuggestions(data) +
      renderCommunityShell(data.id) +
      "</div></article>"
    );
  }

  async function loadReports(opts) {
    opts = opts || {};
    var silent = !!opts.silent;
    if (!silent && feed) {
      feed.innerHTML = '<p class="meta">Loading…</p>';
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
          feed.innerHTML = currentNearFilter
            ? '<div class="empty">No GPS-tagged reports within this radius. Try “Show all” or add a report with location.</div>'
            : '<div class="empty">No reports yet. <a href="/report">Submit the first one</a>.</div>';
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
          '<div class="empty">Could not reach the API. Start the backend (<code>python run.py</code>).</div>';
        syncMap([]);
      }
      console.error(e);
    }
  }

  function scheduleLivePoll() {
    if (livePollTimer) {
      clearInterval(livePollTimer);
      livePollTimer = null;
    }
    if (!chkLive || !chkLive.checked) return;
    livePollTimer = setInterval(function () {
      if (document.hidden) return;
      loadReports({ silent: true });
    }, LIVE_POLL_MS);
  }

  function initLivePollUi() {
    if (!chkLive) return;
    try {
      if (localStorage.getItem(LS_LIVE_POLL) === "0") {
        chkLive.checked = false;
      }
    } catch {
      /* ignore */
    }
    chkLive.addEventListener("change", function () {
      try {
        localStorage.setItem(LS_LIVE_POLL, chkLive.checked ? "1" : "0");
      } catch {
        /* ignore */
      }
      scheduleLivePoll();
    });
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
      if (
        !form ||
        !form.classList ||
        (!form.classList.contains("form-help") &&
          !form.classList.contains("form-msg"))
      ) {
        return;
      }
      ev.preventDefault();
      var rid = form.getAttribute("data-report-id");
      if (!rid) return;

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
              body: JSON.stringify({
                display_name: name,
                contact: contact,
              }),
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
              body: JSON.stringify({
                sender_name: sender,
                body: body,
              }),
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

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      loadReports({ silent: true });
    }
  });

  updateFilterHint();
  initLivePollUi();
  loadReports();
  scheduleLivePoll();
})();
