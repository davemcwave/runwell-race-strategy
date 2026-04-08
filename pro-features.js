/**
 * Runwell Pro Features
 * - Race History import & manual entry
 * - Nutrition Calculator
 * - Weather Adjustments
 */
(function () {
  "use strict";

  // ─── Auth helper ──────────────────────────────────────────────

  function getUser() {
    try { return JSON.parse(localStorage.getItem("runwell-user")); } catch { return null; }
  }

  function isPaidUser() {
    const user = getUser();
    return user && (user.plan === "advanced" || user.plan === "pro" || user.plan === "coach");
  }

  function requirePro(callback) {
    if (isPaidUser()) {
      callback();
    } else {
      document.getElementById("pro-gate-modal").style.display = "flex";
    }
  }

  // ─── Modal helpers ────────────────────────────────────────────

  function openModal(id) { document.getElementById(id).style.display = "flex"; }
  function closeModal(id) { document.getElementById(id).style.display = "none"; }

  function setupModalClose(modalId, closeBtnId) {
    const modal = document.getElementById(modalId);
    document.getElementById(closeBtnId).addEventListener("click", () => closeModal(modalId));
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(modalId); });
  }

  // ─── Nutrition data ───────────────────────────────────────────

  const FUEL_DB = {
    "gu-energy":      { name: "GU Energy Gel",         cal: 100, carb: 22 },
    "gu-roctane":     { name: "GU Roctane",            cal: 100, carb: 21 },
    "maurten-100":    { name: "Maurten Gel 100",       cal: 100, carb: 25 },
    "maurten-160":    { name: "Maurten Gel 160",       cal: 160, carb: 40 },
    "sis-go":         { name: "SiS GO Isotonic Gel",   cal: 87,  carb: 22 },
    "clif-shot":      { name: "Clif Shot Energy Gel",  cal: 100, carb: 24 },
    "huma-plus":      { name: "Huma Gel Plus",         cal: 100, carb: 22 },
    "spring-energy":  { name: "Spring Awesome Sauce",  cal: 180, carb: 33 },
    "precision-30":   { name: "Precision PF 30 Gel",   cal: 100, carb: 30 },
    "honey-stinger":  { name: "Honey Stinger Gel",     cal: 100, carb: 24 },
    "clif-bloks":     { name: "Clif Bloks (3 pcs)",    cal: 100, carb: 24 },
    "gu-chews":       { name: "GU Chews (4 pcs)",      cal: 80,  carb: 20 },
    "maurten-chew":   { name: "Maurten Drink Mix 160", cal: 160, carb: 40 },
    "gatorade-chews": { name: "Gatorade Chews (4)",    cal: 100, carb: 23 },
    "maurten-320":    { name: "Maurten Mix 320",       cal: 320, carb: 79 },
    "tailwind":       { name: "Tailwind Endurance",    cal: 100, carb: 25 },
    "skratch":        { name: "Skratch Labs Mix",      cal: 80,  carb: 21 },
    "gatorade-endurance": { name: "Gatorade Endurance", cal: 120, carb: 30 },
    "banana":         { name: "Banana",                cal: 105, carb: 27 },
  };

  // ─── Race History ─────────────────────────────────────────────

  let raceHistory = [];

  function getRaceId() {
    return new URLSearchParams(window.location.search).get("race") || "default";
  }

  function loadRaceHistory() {
    try { raceHistory = JSON.parse(localStorage.getItem("runwell-history") || "[]"); } catch { raceHistory = []; }
  }

  function saveRaceHistory() {
    localStorage.setItem("runwell-history", JSON.stringify(raceHistory));
  }

  function parseTime(str) {
    if (!str) return null;
    const p = str.trim().split(":").map(Number);
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 3600 + p[1] * 60;
    return null;
  }

  function formatTime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.round(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function formatPace(totalSec, distMiles) {
    if (!totalSec || !distMiles) return "—";
    const paceS = totalSec / distMiles;
    const m = Math.floor(paceS / 60);
    const s = Math.round(paceS % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function renderHistoryTable() {
    const tbody = document.getElementById("history-table-body");
    if (raceHistory.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;font-size:13px;">No races added yet. Connect a service or add manually above.</td></tr>`;
      return;
    }
    tbody.innerHTML = raceHistory.map((r, i) => `
      <tr>
        <td style="font-weight:600;">${r.name}</td>
        <td>${r.date || "—"}</td>
        <td>${r.distance} mi</td>
        <td>${r.time}</td>
        <td style="color:var(--primary);font-weight:600;">${formatPace(parseTime(r.time), parseFloat(r.distance))}/mi</td>
        <td><button class="history-delete" data-idx="${i}">×</button></td>
      </tr>
    `).join("");

    tbody.querySelectorAll(".history-delete").forEach((btn) => {
      btn.addEventListener("click", () => {
        raceHistory.splice(parseInt(btn.dataset.idx), 1);
        saveRaceHistory();
        renderHistoryTable();
      });
    });
  }

  function initRaceHistory() {
    loadRaceHistory();

    document.getElementById("btn-race-history").addEventListener("click", () => {
      requirePro(() => { renderHistoryTable(); openModal("history-modal"); });
    });

    setupModalClose("history-modal", "history-close");

    // Add race
    document.getElementById("history-add").addEventListener("click", () => {
      const name = document.getElementById("history-name").value.trim();
      const date = document.getElementById("history-date").value;
      const distance = document.getElementById("history-distance").value;
      const time = document.getElementById("history-time").value.trim();
      const conditions = document.getElementById("history-conditions").value;
      const hr = document.getElementById("history-hr").value;

      if (!name || !time) { alert("Please enter a race name and finish time."); return; }

      raceHistory.push({ name, date, distance, time, conditions, hr });
      saveRaceHistory();
      renderHistoryTable();

      // Clear form
      document.getElementById("history-name").value = "";
      document.getElementById("history-time").value = "";
      document.getElementById("history-hr").value = "";
    });

    // Connect buttons (placeholder)
    ["connect-strava", "connect-garmin", "connect-coros"].forEach((id) => {
      document.getElementById(id).addEventListener("click", () => {
        const btn = document.getElementById(id);
        const status = btn.querySelector(".connect-status");
        if (status.classList.contains("connected")) {
          status.textContent = "Not connected";
          status.classList.remove("connected");
        } else {
          status.textContent = "Connected";
          status.classList.add("connected");
        }
      });
    });

    // Apply to pace plan
    document.getElementById("history-apply").addEventListener("click", () => {
      if (raceHistory.length === 0) { alert("Add at least one race to apply."); return; }
      // Find best marathon or longest race
      const sorted = [...raceHistory].sort((a, b) => parseFloat(b.distance) - parseFloat(a.distance));
      const best = sorted[0];
      const totalSec = parseTime(best.time);
      if (!totalSec) { alert("Could not parse the finish time for: " + best.name); return; }

      // Pre-fill the pace planner if it exists
      const goalInput = document.getElementById("goal-time");
      if (goalInput) {
        goalInput.value = formatTime(totalSec);
        alert(`Applied ${best.name} finish time (${best.time}) as your goal. Open Pace Planner to generate splits.`);
      }
      closeModal("history-modal");
    });
  }

  // ─── Nutrition Calculator ─────────────────────────────────────

  function initNutrition() {
    document.getElementById("btn-nutrition").addEventListener("click", () => {
      requirePro(() => {
        // Reset state on open
        document.getElementById("nutri-results").style.display = "none";
        document.getElementById("nutrition-calculate").style.display = "";
        document.getElementById("nutrition-apply").style.display = "none";
        openModal("nutrition-modal");
      });
    });

    setupModalClose("nutrition-modal", "nutrition-close");

    document.getElementById("nutrition-calculate").addEventListener("click", calculateNutrition);
    document.getElementById("nutrition-apply").addEventListener("click", applyNutrition);
  }

  let lastNutritionPlan = [];

  function calculateNutrition() {
    const weightVal = parseFloat(document.getElementById("nutri-weight").value);
    const weightUnit = document.getElementById("nutri-weight-unit").value;
    const paceStr = document.getElementById("nutri-pace").value.trim();
    const fuelKey = document.getElementById("nutri-fuel-brand").value;
    const fuelKey2 = document.getElementById("nutri-fuel-secondary").value;

    if (!weightVal || !fuelKey) { alert("Please enter your weight and select a primary fuel."); return; }

    const weightKg = weightUnit === "lbs" ? weightVal * 0.4536 : weightVal;
    const fuel = FUEL_DB[fuelKey];
    const fuel2 = fuelKey2 ? FUEL_DB[fuelKey2] : null;

    // Parse pace to estimate finish time
    let paceSeconds = 8 * 60; // default 8:00/mi
    if (paceStr) {
      const pp = paceStr.replace("/mi", "").trim().split(":").map(Number);
      if (pp.length === 2) paceSeconds = pp[0] * 60 + pp[1];
    }

    // Get course distance from the global app
    const courseDist = window._runwellCourseDistance || 26.2;
    const totalTimeSec = paceSeconds * courseDist;
    const totalTimeHr = totalTimeSec / 3600;

    // Check for custom targets, otherwise auto-recommend
    const customCal = parseFloat(document.getElementById("nutri-custom-cal").value);
    const customCarb = parseFloat(document.getElementById("nutri-custom-carb").value);
    const autoCarbPerHr = totalTimeHr > 2.5 ? 75 : 50;
    const autoCalPerHr = autoCarbPerHr * 4;
    const targetCarbPerHr = customCarb > 0 ? customCarb : autoCarbPerHr;
    const targetCalPerHr = customCal > 0 ? customCal : autoCalPerHr;

    // Fueling every ~30-45 min (roughly every 3-5 miles depending on pace)
    const fuelIntervalMin = 30;
    const fuelIntervalMiles = (fuelIntervalMin / 60) * (3600 / paceSeconds);

    // Build schedule
    lastNutritionPlan = [];
    let totalCal = 0, totalCarb = 0, servingCount = 0;
    let usePrimary = true;

    for (let mile = fuelIntervalMiles; mile < courseDist - 1; mile += fuelIntervalMiles) {
      const f = usePrimary ? fuel : (fuel2 || fuel);
      const timeAtMile = mile * paceSeconds;
      lastNutritionPlan.push({
        mile: Math.round(mile * 10) / 10,
        time: formatTime(timeAtMile),
        product: f.name,
        cal: f.cal,
        carb: f.carb,
      });
      totalCal += f.cal;
      totalCarb += f.carb;
      servingCount++;
      if (fuel2) usePrimary = !usePrimary;
    }

    // Update UI
    document.getElementById("nutri-results").style.display = "";
    document.getElementById("nutri-target-cal").textContent = `${targetCalPerHr} cal/hr`;
    document.getElementById("nutri-target-carb").textContent = `${targetCarbPerHr}g/hr`;
    document.getElementById("nutri-total-fuel").textContent = `${servingCount} servings`;

    const tbody = document.getElementById("nutri-schedule-body");
    let cumCal = 0, cumCarb = 0;
    tbody.innerHTML = lastNutritionPlan.map((item) => {
      cumCal += item.cal;
      cumCarb += item.carb;
      return `<tr>
        <td>Mile ${item.mile}</td>
        <td>${item.time}</td>
        <td style="font-weight:600;">${item.product}</td>
        <td>${item.cal} <span style="color:var(--text-muted);font-size:10px;">(${cumCal} total)</span></td>
        <td>${item.carb}g <span style="color:var(--text-muted);font-size:10px;">(${cumCarb}g total)</span></td>
      </tr>`;
    }).join("");

    document.getElementById("nutrition-calculate").style.display = "none";
    document.getElementById("nutrition-apply").style.display = "";
  }

  function applyNutrition() {
    if (lastNutritionPlan.length === 0) { alert("No nutrition plan to apply. Calculate first."); return; }

    if (!window._runwellAddMarker) {
      alert("Course not loaded yet. Please wait for the map to finish loading.");
      return;
    }

    // Close modal first so the markers render correctly
    closeModal("nutrition-modal");
    document.getElementById("nutrition-calculate").style.display = "";
    document.getElementById("nutrition-apply").style.display = "none";
    document.getElementById("nutri-results").style.display = "none";

    // Use setTimeout to let the modal close before adding markers
    setTimeout(() => {
      lastNutritionPlan.forEach((item) => {
        window._runwellAddMarker({
          mile: item.mile,
          type: "nutrition",
          label: `${item.product} (${item.cal} cal)`,
          pace: "",
          effort: "",
          notes: `${item.carb}g carbs — take at ~${item.time}`,
        });
      });
      alert(`Added ${lastNutritionPlan.length} nutrition markers to your race plan.`);
    }, 100);
  }

  // ─── Weather Adjustments ──────────────────────────────────────

  function initWeather() {
    document.getElementById("btn-weather").addEventListener("click", () => {
      requirePro(() => openModal("weather-modal"));
    });

    setupModalClose("weather-modal", "weather-close");

    document.getElementById("weather-calculate").addEventListener("click", calculateWeather);
    document.getElementById("weather-apply").addEventListener("click", applyWeather);
  }

  let lastWeatherAdj = 0; // total seconds per mile adjustment

  function calculateWeather() {
    let tempF = parseFloat(document.getElementById("weather-temp").value);
    const tempUnit = document.getElementById("weather-temp-unit").value;
    const humidity = parseFloat(document.getElementById("weather-humidity").value) || 50;
    let windMph = parseFloat(document.getElementById("weather-wind").value) || 0;
    const windUnit = document.getElementById("weather-wind-unit").value;
    const conditions = document.getElementById("weather-conditions").value;

    if (isNaN(tempF)) { alert("Please enter a temperature."); return; }

    // Convert units
    if (tempUnit === "C") tempF = tempF * 9 / 5 + 32;
    if (windUnit === "kph") windMph = windMph * 0.6214;

    // ─── Temperature impact ─────────────────────────
    // Optimal: 45-55°F. Each degree over 55 adds ~1-2s/mi. Under 40 adds ~1s/mi.
    let tempAdj = 0;
    let tempImpact = "No impact";
    let tempLevel = "none";

    if (tempF > 75) {
      tempAdj = (tempF - 55) * 2;
      tempImpact = `+${Math.round(tempAdj)}s/mi (hot)`;
      tempLevel = "high";
    } else if (tempF > 65) {
      tempAdj = (tempF - 55) * 1.5;
      tempImpact = `+${Math.round(tempAdj)}s/mi (warm)`;
      tempLevel = "medium";
    } else if (tempF > 55) {
      tempAdj = (tempF - 55) * 1;
      tempImpact = `+${Math.round(tempAdj)}s/mi`;
      tempLevel = "low";
    } else if (tempF < 35) {
      tempAdj = (35 - tempF) * 0.8;
      tempImpact = `+${Math.round(tempAdj)}s/mi (cold)`;
      tempLevel = "medium";
    } else {
      tempImpact = "Optimal range";
      tempLevel = "none";
    }

    // ─── Humidity impact ────────────────────────────
    // High humidity compounds heat. Above 60% adds extra time.
    let humidAdj = 0;
    let humidImpact = "Low";
    let humidLevel = "none";

    if (tempF > 60 && humidity > 80) {
      humidAdj = 12;
      humidImpact = `+${humidAdj}s/mi (dangerous)`;
      humidLevel = "high";
    } else if (tempF > 60 && humidity > 60) {
      humidAdj = 5;
      humidImpact = `+${humidAdj}s/mi`;
      humidLevel = "medium";
    } else if (humidity > 70) {
      humidAdj = 3;
      humidImpact = `+${humidAdj}s/mi`;
      humidLevel = "low";
    } else {
      humidImpact = "Minimal";
      humidLevel = "none";
    }

    // ─── Wind impact ────────────────────────────────
    // ~1s/mi per 3mph of headwind (assuming partial headwind on course)
    let windAdj = 0;
    let windImpact = "Calm";
    let windLevel = "none";

    if (windMph > 20) {
      windAdj = Math.round(windMph / 2.5);
      windImpact = `+${windAdj}s/mi (strong)`;
      windLevel = "high";
    } else if (windMph > 12) {
      windAdj = Math.round(windMph / 3);
      windImpact = `+${windAdj}s/mi`;
      windLevel = "medium";
    } else if (windMph > 5) {
      windAdj = Math.round(windMph / 4);
      windImpact = `+${windAdj}s/mi`;
      windLevel = "low";
    } else {
      windImpact = "Negligible";
    }

    // ─── Rain/conditions impact ─────────────────────
    let condAdj = 0;
    let condImpact = "No impact";
    let condLevel = "none";

    if (conditions === "rain") {
      condAdj = 8;
      condImpact = `+${condAdj}s/mi (wet roads)`;
      condLevel = "medium";
    } else if (conditions === "drizzle") {
      condAdj = 3;
      condImpact = `+${condAdj}s/mi`;
      condLevel = "low";
    } else if (conditions === "snow") {
      condAdj = 15;
      condImpact = `+${condAdj}s/mi (slippery)`;
      condLevel = "high";
    } else {
      condImpact = "No impact";
    }

    // ─── Total ──────────────────────────────────────
    lastWeatherAdj = tempAdj + humidAdj + windAdj + condAdj;

    // Update cards
    setWeatherCard("weather-card-temp", tempImpact, tempLevel);
    setWeatherCard("weather-card-humidity", humidImpact, humidLevel);
    setWeatherCard("weather-card-wind", windImpact, windLevel);
    setWeatherCard("weather-card-rain", condImpact, condLevel);

    // Total
    const adjMin = Math.floor(lastWeatherAdj / 60);
    const adjSec = Math.round(lastWeatherAdj % 60);
    const sign = lastWeatherAdj > 0 ? "+" : "";
    document.getElementById("weather-total-adj").textContent =
      lastWeatherAdj === 0 ? "No adjustment" : `${sign}${adjMin > 0 ? adjMin + ":" + String(adjSec).padStart(2, "0") : adjSec + "s"} /mi`;
    document.getElementById("weather-total-adj").style.color =
      lastWeatherAdj > 15 ? "var(--accent-red)" :
      lastWeatherAdj > 5 ? "var(--accent-orange)" :
      lastWeatherAdj > 0 ? "var(--accent-yellow)" : "var(--accent-green)";

    // Advisory note
    let note = "";
    if (tempF > 75 && humidity > 60) note = "Dangerously hot and humid. Consider starting slower, taking walk breaks, and increasing fluid intake by 50%.";
    else if (tempF > 70) note = "Warm conditions. Start conservatively and plan extra water stops.";
    else if (lastWeatherAdj > 15) note = "Significant weather impact. Adjust your goal time and focus on effort-based pacing rather than strict time targets.";
    else if (lastWeatherAdj > 5) note = "Moderate weather impact. Consider adjusting your goal time slightly and being flexible in the second half.";
    else if (lastWeatherAdj <= 0) note = "Great racing conditions! Stick with your planned pace.";
    else note = "Minor impact. Your planned paces should hold up well.";
    document.getElementById("weather-note").textContent = note;

    document.getElementById("weather-results").style.display = "";
    document.getElementById("weather-calculate").style.display = "none";
    document.getElementById("weather-apply").style.display = "";
  }

  function setWeatherCard(cardId, text, level) {
    const card = document.getElementById(cardId);
    card.className = `weather-card impact-${level}`;
    card.querySelector(".weather-card-value").textContent = text;
  }

  function applyWeather() {
    if (lastWeatherAdj === 0) { alert("No adjustment needed."); closeModal("weather-modal"); return; }

    // Add a note marker at mile 0 with the weather info
    if (window._runwellAddMarker) {
      const adjSec = Math.round(lastWeatherAdj);
      window._runwellAddMarker({
        mile: 0,
        type: "note",
        label: `Weather: +${adjSec}s/mi adjustment`,
        pace: "",
        effort: "",
        notes: document.getElementById("weather-note").textContent,
      });
    }

    // Adjust split paces if pace plan exists
    if (window._runwellAdjustSplits) {
      window._runwellAdjustSplits(lastWeatherAdj);
      alert(`Applied +${Math.round(lastWeatherAdj)}s/mi weather adjustment to all splits.`);
    } else {
      alert(`Weather adjustment: +${Math.round(lastWeatherAdj)}s/mi. Open Pace Planner to apply to your splits.`);
    }

    closeModal("weather-modal");
    // Reset
    document.getElementById("weather-calculate").style.display = "";
    document.getElementById("weather-apply").style.display = "none";
    document.getElementById("weather-results").style.display = "none";
  }

  // ─── Pro gate ─────────────────────────────────────────────────

  function initProGate() {
    const modal = document.getElementById("pro-gate-modal");
    document.getElementById("pro-gate-close").addEventListener("click", () => { modal.style.display = "none"; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
  }

  // ─── Coach: Athlete Management ─────────────────────────────────

  let athletes = [];
  let activeAthlete = "__default__";

  function isCoach() {
    const user = getUser();
    return user && user.plan === "coach";
  }

  function getAthletesKey() {
    const user = getUser();
    return user ? `runwell-athletes-${user.email}` : "runwell-athletes";
  }

  function loadAthletes() {
    try { athletes = JSON.parse(localStorage.getItem(getAthletesKey()) || "[]"); } catch { athletes = []; }
  }

  function saveAthletes() {
    localStorage.setItem(getAthletesKey(), JSON.stringify(athletes));
  }

  function initCoachFeatures() {
    const selector = document.getElementById("athlete-selector");
    const select = document.getElementById("athlete-select");
    const addBtn = document.getElementById("athlete-add-btn");
    const modal = document.getElementById("athlete-modal");

    if (!selector || !select || !modal) return;

    // Show selector only for coaches
    if (!isCoach()) { selector.style.display = "none"; return; }
    selector.style.display = "";

    loadAthletes();
    renderAthleteSelect();

    // Switch athlete
    select.addEventListener("change", () => {
      activeAthlete = select.value;
      // Swap localStorage keys by setting a prefix
      window._runwellAthletePrefix = activeAthlete === "__default__" ? "" : `athlete-${activeAthlete}-`;
      // Reload the page with the athlete context
      // For simplicity, we store active athlete and reload markers/pace
      localStorage.setItem("runwell-active-athlete", activeAthlete);
      window.location.reload();
    });

    // Add athlete button
    addBtn.addEventListener("click", () => {
      document.getElementById("athlete-name").value = "";
      document.getElementById("athlete-goal").value = "";
      document.getElementById("athlete-weight").value = "";
      document.getElementById("athlete-notes").value = "";
      modal.style.display = "flex";
    });

    document.getElementById("athlete-cancel").addEventListener("click", () => { modal.style.display = "none"; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });

    document.getElementById("athlete-save").addEventListener("click", () => {
      const name = document.getElementById("athlete-name").value.trim();
      if (!name) { alert("Please enter a name."); return; }

      const id = name.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Date.now();
      athletes.push({
        id,
        name,
        goal: document.getElementById("athlete-goal").value.trim(),
        weight: document.getElementById("athlete-weight").value,
        weightUnit: document.getElementById("athlete-weight-unit").value,
        notes: document.getElementById("athlete-notes").value.trim(),
        createdAt: new Date().toISOString(),
      });

      saveAthletes();
      renderAthleteSelect();
      modal.style.display = "none";

      // Switch to new athlete
      select.value = id;
      select.dispatchEvent(new Event("change"));
    });

    // Restore active athlete
    const saved = localStorage.getItem("runwell-active-athlete");
    if (saved && (saved === "__default__" || athletes.find((a) => a.id === saved))) {
      activeAthlete = saved;
      select.value = saved;
      window._runwellAthletePrefix = saved === "__default__" ? "" : `athlete-${saved}-`;
    }
  }

  function renderAthleteSelect() {
    const select = document.getElementById("athlete-select");
    if (!select) return;
    select.innerHTML = `<option value="__default__">My Plan</option>` +
      athletes.map((a) => `<option value="${a.id}">${a.name}</option>`).join("");
  }

  // ─── Init ─────────────────────────────────────────────────────

  function init() {
    initProGate();
    initCoachFeatures();
    initRaceHistory();
    initNutrition();
    initWeather();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
