/**
 * FixCity — Report form only (/report). Location/GPS is OUTSIDE the auth-gated
 * fieldset so "Use my location" always works (only description/photo/submit need login).
 */
(function () {
  const fetchOpts = { credentials: "same-origin" };

  const form = document.getElementById("report-form");
  const flash = document.getElementById("flash");
  const btnGeo = document.getElementById("btn-geo");
  const geoStatus = document.getElementById("geo-status");
  const latInput = document.getElementById("lat-lab");
  const lngInput = document.getElementById("lng-lab");
  const btnSubmit = document.getElementById("btn-submit");
  const fieldset = document.getElementById("report-fieldset");

  let currentUser = null;

  if (!form || !latInput || !lngInput) return;

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

  async function syncReportFormAuth() {
    try {
      var r = await fetch("/api/auth/me", fetchOpts);
      currentUser = r.ok ? await r.json() : null;
    } catch {
      currentUser = null;
    }
    if (fieldset) fieldset.disabled = !currentUser;
    var hint = document.getElementById("report-auth-hint");
    if (hint) hint.style.display = currentUser ? "none" : "";
  }

  btnGeo.addEventListener("click", function () {
    clearFlash();
    if (!navigator.geolocation) {
      showFlash("err", "Geolocation is not supported in this browser.");
      return;
    }
    geoStatus.textContent = "Locating…";
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        latInput.value = String(lat);
        lngInput.value = String(lng);
        geoStatus.textContent = "Location captured.";
      },
      function (err) {
        geoStatus.textContent = "Location denied or unavailable.";
        var msg = "Could not read GPS.";
        if (err && err.code === 1) {
          msg =
            "Permission denied. In Chrome: click the lock icon → Site settings → Location → Allow, then try again.";
        }
        showFlash("err", msg + " You can still submit without coordinates.");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });

  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    clearFlash();
    if (btnSubmit) btnSubmit.disabled = true;
    const fd = new FormData(form);
    if (!latInput.value.trim()) fd.delete("latitude");
    if (!lngInput.value.trim()) fd.delete("longitude");

    try {
      const res = await fetch(
        "/api/reports",
        Object.assign({}, fetchOpts, {
          method: "POST",
          body: fd,
        })
      );
      const data = await res.json().catch(function () {
        return null;
      });
      if (!res.ok) {
        if (res.status === 401) {
          showFlash(
            "err",
            (data && data.message) || "Log in to submit. Use the links above."
          );
          await syncReportFormAuth();
          return;
        }
        showFlash("err", (data && data.error) || "Submit failed.");
        return;
      }
      showFlash("ok", "Report submitted! Opening community feed…");
      form.reset();
      latInput.value = "";
      lngInput.value = "";
      geoStatus.textContent = "No location yet";
      setTimeout(function () {
        window.location.href = "/";
      }, 900);
    } catch (e) {
      showFlash("err", "Network error — is the Flask server running?");
      console.error(e);
    } finally {
      if (btnSubmit) btnSubmit.disabled = false;
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) syncReportFormAuth();
  });

  syncReportFormAuth();
})();
