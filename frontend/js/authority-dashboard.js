/**
 * STEP 8 — Fake “municipality” dashboard (polling simulates realtime).
 */
(function () {
  var tbody = document.getElementById("dash-tbody");
  var statsEl = document.getElementById("dash-stats");
  var pulseMsg = document.getElementById("pulse-msg");
  var pulseMeta = document.getElementById("pulse-meta");
  var pulseTime = document.getElementById("pulse-time");
  var rowCount = document.getElementById("row-count");
  var btnSim = document.getElementById("btn-sim");
  var btnNow = document.getElementById("btn-now");

  var pollMs = 7000;
  var timer = null;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statusClass(st) {
    if (st === "Resolved") return "badge badge--ok";
    if (st === "In Progress") return "badge badge--warn";
    return "badge badge--muted";
  }

  function renderStats(stats, pipeline) {
    statsEl.innerHTML = (pipeline || []).map(function (key) {
      var n = stats && typeof stats[key] === "number" ? stats[key] : 0;
      return (
        '<div class="metric-card"><p class="metric-card__label">' +
        escapeHtml(key) +
        '</p><p class="metric-card__value">' +
        n +
        "</p></div>"
      );
    }).join("");
  }

  function renderRows(reports) {
    tbody.innerHTML = (reports || [])
      .map(function (r) {
        var desc = String(r.description || "").slice(0, 96);
        if ((r.description || "").length > desc.length) desc += "…";
        return (
          "<tr>" +
          "<td>#" +
          escapeHtml(String(r.id)) +
          "</td>" +
          '<td><span class="' +
          statusClass(r.authority_status) +
          '">' +
          escapeHtml(String(r.authority_status || "")) +
          "</span></td>" +
          "<td>" +
          escapeHtml(String(r.issue_category || "—")) +
          "</td>" +
          "<td>" +
          escapeHtml(String(r.priority || "—")) +
          "</td>" +
          "<td>" +
          escapeHtml(String(r.resolution_route || "—")) +
          "</td>" +
          "<td>" +
          escapeHtml(desc) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    rowCount.textContent = (reports || []).length + " tickets";
  }

  async function loadDashboard() {
    try {
      var res = await fetch("/api/authority/dashboard");
      if (!res.ok) throw new Error("dashboard failed");
      var data = await res.json();
      renderStats(data.stats, data.pipeline);
      renderRows(data.reports);
      if (data.fake_pulse) {
        pulseMsg.textContent = data.fake_pulse.message || "";
        pulseMeta.textContent =
          "Synthetic latency: ~" +
          (data.fake_pulse.latency_ms || 0) +
          " ms · next auto-refresh in ~" +
          Math.round(pollMs / 1000) +
          "s";
      }
      pulseTime.textContent = "Snapshot: " + (data.generated_at || "");
    } catch (e) {
      pulseMsg.textContent = "Could not reach /api/authority/dashboard — is Flask running?";
      pulseMeta.textContent = "";
      console.error(e);
    }
  }

  function schedule() {
    if (timer) clearInterval(timer);
    timer = setInterval(loadDashboard, pollMs);
  }

  btnNow.addEventListener("click", function () {
    loadDashboard();
  });

  btnSim.addEventListener("click", async function () {
    btnSim.disabled = true;
    try {
      var res = await fetch("/api/authority/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      var data = await res.json().catch(function () {
        return null;
      });
      if (!res.ok) {
        pulseMsg.textContent = (data && data.error) || "Simulate failed.";
        return;
      }
      pulseMsg.textContent = data.message || "Tick complete.";
      await loadDashboard();
    } catch (e) {
      pulseMsg.textContent = "Network error during simulation.";
      console.error(e);
    } finally {
      btnSim.disabled = false;
    }
  });

  loadDashboard();
  schedule();
})();
