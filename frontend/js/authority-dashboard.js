/**
 * Municipality dashboard — staff only; manual status and delete.
 */
(function () {
  var tbody = document.getElementById("dash-tbody");
  var statsEl = document.getElementById("dash-stats");
  var pulseMsg = document.getElementById("pulse-msg");
  var pulseMeta = document.getElementById("pulse-meta");
  var pulseTime = document.getElementById("pulse-time");
  var rowCount = document.getElementById("row-count");
  var btnNow = document.getElementById("btn-now");

  var pollMs = 7000;
  var timer = null;
  var pipeline = [];

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statusBadgeClass(st) {
    if (st === "Resolved") {
      return "inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-200";
    }
    if (st === "In Progress") {
      return "inline-flex items-center rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-100";
    }
    if (st === "Sent to Municipality") {
      return "inline-flex items-center rounded-full border border-sky-400/40 bg-sky-500/15 px-2.5 py-0.5 text-xs font-semibold text-sky-100";
    }
    return "inline-flex items-center rounded-full border border-slate-600 bg-slate-800/80 px-2.5 py-0.5 text-xs font-semibold text-slate-300";
  }

  function priorityBadgeClass(p) {
    var s = String(p || "").toLowerCase();
    if (s === "high") {
      return "inline-flex rounded-full border border-rose-400/35 bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-100";
    }
    if (s === "low") {
      return "inline-flex rounded-full border border-emerald-400/35 bg-emerald-500/12 px-2 py-0.5 text-xs font-medium text-emerald-100";
    }
    if (s === "medium") {
      return "inline-flex rounded-full border border-amber-400/35 bg-amber-500/12 px-2 py-0.5 text-xs font-medium text-amber-100";
    }
    return "text-slate-400";
  }

  function routeBadgeClass(route) {
    var s = String(route || "").toLowerCase();
    if (s === "authority") {
      return "inline-flex rounded-full border border-violet-400/35 bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-100";
    }
    if (s === "community") {
      return "inline-flex rounded-full border border-teal-400/35 bg-teal-500/15 px-2 py-0.5 text-xs font-medium text-teal-100";
    }
    return "text-slate-400";
  }

  function statCardClass(key) {
    if (key === "Resolved") {
      return "rounded-2xl border border-emerald-500/30 bg-emerald-950/35 p-4 shadow-sm";
    }
    if (key === "In Progress") {
      return "rounded-2xl border border-amber-500/30 bg-amber-950/35 p-4 shadow-sm";
    }
    if (key === "Sent to Municipality") {
      return "rounded-2xl border border-sky-500/30 bg-sky-950/35 p-4 shadow-sm";
    }
    return "rounded-2xl border border-slate-700 bg-slate-900/50 p-4 shadow-sm";
  }

  function statValueClass(key) {
    if (key === "Resolved") return "mt-2 text-3xl font-black tabular-nums text-emerald-200";
    if (key === "In Progress") return "mt-2 text-3xl font-black tabular-nums text-amber-200";
    if (key === "Sent to Municipality") return "mt-2 text-3xl font-black tabular-nums text-sky-200";
    return "mt-2 text-3xl font-black tabular-nums text-slate-100";
  }

  function renderStats(stats) {
    statsEl.innerHTML = (pipeline || []).map(function (key) {
      var n = stats && typeof stats[key] === "number" ? stats[key] : 0;
      return (
        '<div class="' +
        statCardClass(key) +
        '">' +
        '<p class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">' +
        escapeHtml(key) +
        "</p>" +
        '<p class="' +
        statValueClass(key) +
        '">' +
        n +
        "</p></div>"
      );
    }).join("");
  }

  function optionsForStatus(current) {
    return (pipeline || [])
      .map(function (opt) {
        var sel = opt === current ? ' selected="selected"' : "";
        return '<option value="' + escapeHtml(opt) + '"' + sel + ">" + escapeHtml(opt) + "</option>";
      })
      .join("");
  }

  function renderRows(reports) {
    tbody.innerHTML = (reports || [])
      .map(function (r) {
        var desc = String(r.description || "").slice(0, 80);
        if ((r.description || "").length > desc.length) desc += "...";
        var pri = String(r.priority || "—");
        var route = String(r.resolution_route || "—");
        var priIsBadge = pri === "high" || pri === "medium" || pri === "low";
        var routeIsBadge = route === "authority" || route === "community";
        var reporter =
          r.author && r.author.display_name
            ? String(r.author.display_name)
            : "—";
        var cur = String(r.authority_status || "");
        return (
          '<tr class="transition-colors hover:bg-slate-800/40" data-report-id="' +
          escapeHtml(String(r.id)) +
          '">' +
          '<td class="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-400">#' +
          escapeHtml(String(r.id)) +
          "</td>" +
          '<td class="max-w-[120px] truncate px-3 py-3 text-slate-300" title="' +
          escapeHtml(reporter) +
          '">' +
          escapeHtml(reporter) +
          "</td>" +
          '<td class="px-3 py-3">' +
          '<select class="auth-status-select w-full min-w-[10rem] rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-100" data-report-id="' +
          escapeHtml(String(r.id)) +
          '" aria-label="Status for report ' +
          escapeHtml(String(r.id)) +
          '">' +
          optionsForStatus(cur) +
          "</select></td>" +
          '<td class="px-3 py-3 text-slate-200">' +
          escapeHtml(String(r.issue_category || "—")) +
          "</td>" +
          '<td class="px-3 py-3">' +
          (priIsBadge
            ? '<span class="' + priorityBadgeClass(pri) + '">' + escapeHtml(pri) + "</span>"
            : '<span class="text-slate-500">' + escapeHtml(pri) + "</span>") +
          "</td>" +
          '<td class="px-3 py-3">' +
          (routeIsBadge
            ? '<span class="' + routeBadgeClass(route) + '">' + escapeHtml(route) + "</span>"
            : '<span class="text-slate-500">' + escapeHtml(route) + "</span>") +
          "</td>" +
          '<td class="max-w-[200px] px-3 py-3 text-slate-300">' +
          escapeHtml(desc) +
          "</td>" +
          '<td class="whitespace-nowrap px-3 py-3">' +
          '<button type="button" class="btn-save-status mr-2 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500" data-report-id="' +
          escapeHtml(String(r.id)) +
          '">Save</button>' +
          '<button type="button" class="btn-del-report rounded-lg border border-rose-500/50 bg-rose-950/40 px-2.5 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-900/50" data-report-id="' +
          escapeHtml(String(r.id)) +
          '">Delete</button>' +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    rowCount.textContent = (reports || []).length + " reports";
  }

  async function loadDashboard() {
    try {
      var res = await fetch("/api/authority/dashboard", { credentials: "same-origin" });
      if (res.status === 401 || res.status === 403) {
        window.location.href = "/authority/login";
        return;
      }
      if (!res.ok) throw new Error("dashboard failed");
      var data = await res.json();
      pipeline = data.pipeline || [];
      renderStats(data.stats);
      renderRows(data.reports);
      pulseMsg.textContent = "Connected";
      pulseMeta.textContent = "Auto-refresh every " + Math.round(pollMs / 1000) + " seconds. Use Save after changing status.";
      pulseTime.textContent = "Updated " + (data.generated_at || "");
    } catch (e) {
      pulseMsg.textContent = "Could not load dashboard.";
      pulseMeta.textContent = "Check that you are signed in as staff and the server is running.";
      console.error(e);
    }
  }

  function schedule() {
    if (timer) clearInterval(timer);
    timer = setInterval(loadDashboard, pollMs);
  }

  if (btnNow) {
    btnNow.addEventListener("click", function () {
      loadDashboard();
    });
  }

  tbody.addEventListener("click", async function (ev) {
    var t = ev.target;
    if (!t || !t.getAttribute) return;
    var rid = t.getAttribute("data-report-id");
    if (!rid) return;
    if (t.classList.contains("btn-save-status")) {
      var row = tbody.querySelector('tr[data-report-id="' + rid + '"]');
      var sel = row && row.querySelector(".auth-status-select");
      var st = sel ? sel.value : "";
      t.disabled = true;
      try {
        var res = await fetch("/api/authority/reports/" + encodeURIComponent(rid), {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authority_status: st }),
        });
        if (res.status === 401 || res.status === 403) {
          window.location.href = "/authority/login";
          return;
        }
        if (!res.ok) {
          alert("Could not update status.");
          return;
        }
        await loadDashboard();
      } catch (e) {
        alert("Network error.");
      } finally {
        t.disabled = false;
      }
    }
    if (t.classList.contains("btn-del-report")) {
      if (!confirm("Delete report #" + rid + "? This cannot be undone.")) return;
      t.disabled = true;
      try {
        var res2 = await fetch("/api/authority/reports/" + encodeURIComponent(rid), {
          method: "DELETE",
          credentials: "same-origin",
        });
        if (res2.status === 401 || res2.status === 403) {
          window.location.href = "/authority/login";
          return;
        }
        if (!res2.ok) {
          alert("Could not delete.");
          return;
        }
        await loadDashboard();
      } catch (e) {
        alert("Network error.");
      } finally {
        t.disabled = false;
      }
    }
  });

  loadDashboard();
  schedule();
})();
