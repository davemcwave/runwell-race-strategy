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
    "swedish-fish":   { name: "Swedish Fish (5 pcs)",  cal: 55,  carb: 13 },
    "gummy-bears":    { name: "Gummy Bears (10 pcs)",  cal: 87,  carb: 20 },
    "sour-patch":     { name: "Sour Patch Kids (8 pcs)", cal: 80, carb: 19 },
    "skittles":       { name: "Skittles (15 pcs)",     cal: 60,  carb: 14 },
    "jelly-beans":    { name: "Jelly Belly (10 pcs)",  cal: 40,  carb: 10 },
    "nerds-clusters": { name: "Nerds Clusters (10 pcs)", cal: 70, carb: 16 },
  };

  const BREAKFAST_DB = {
    "oatmeal":        { name: "Oatmeal (1 cup cooked)",      cal: 300, carb: 54 },
    "bagel":          { name: "Bagel (plain)",                cal: 270, carb: 53 },
    "bagel-pb":       { name: "Bagel w/ peanut butter",       cal: 370, carb: 55 },
    "toast-2":        { name: "Toast (2 slices white)",       cal: 160, carb: 30 },
    "toast-jam":      { name: "Toast w/ jam (2 slices)",      cal: 230, carb: 46 },
    "banana-bf":      { name: "Banana",                       cal: 105, carb: 27 },
    "english-muffin": { name: "English muffin",               cal: 130, carb: 25 },
    "granola-bar":    { name: "Granola bar",                  cal: 190, carb: 29 },
    "yogurt":         { name: "Greek yogurt (6 oz)",          cal: 100, carb: 6 },
    "rice":           { name: "White rice (1 cup)",           cal: 205, carb: 45 },
    "pancakes-2":     { name: "Pancakes (2 medium)",          cal: 350, carb: 60 },
    "waffle":         { name: "Waffle (1 large)",             cal: 220, carb: 33 },
    "cereal":         { name: "Cereal w/ milk (1 bowl)",      cal: 250, carb: 45 },
    "orange-juice":   { name: "Orange juice (8 oz)",          cal: 110, carb: 26 },
    "coffee":         { name: "Coffee (black)",               cal: 5,   carb: 0 },
    "sports-drink":   { name: "Sports drink (16 oz)",         cal: 120, carb: 30 },
    "honey":          { name: "Honey (1 tbsp)",               cal: 64,  carb: 17 },
    "eggs-2":         { name: "Eggs (2, scrambled)",           cal: 180, carb: 2 },
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
    if (!totalSec || !distMiles) return "-";
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
        <td>${r.date || "-"}</td>
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
        const saved = loadNutritionPlan();

        if (saved && saved.plan && saved.plan.length > 0) {
          // Restore previous plan and inputs
          document.getElementById("nutri-weight").value = saved.weight || "";
          document.getElementById("nutri-weight-unit").value = saved.weightUnit || "lbs";
          document.getElementById("nutri-pace").value = saved.pace || "";
          document.getElementById("nutri-fuel-brand").value = saved.fuelBrand || "";
          document.getElementById("nutri-fuel-secondary").value = saved.fuelSecondary || "";
          document.getElementById("nutri-custom-cal").value = saved.customCal || "";
          document.getElementById("nutri-custom-carb").value = saved.customCarb || "";
          lastNutritionPlan = saved.plan;
          document.getElementById("nutri-results").style.display = "";
          document.getElementById("nutrition-calculate").textContent = "Recalculate";
          document.getElementById("nutrition-calculate").style.display = "";
          document.getElementById("nutrition-apply").style.display = "";
          renderNutriSchedule();

          // Restore breakfast
          if (saved.breakfastEnabled) {
            document.getElementById("nutri-breakfast-toggle").checked = true;
            document.getElementById("nutri-breakfast-section").style.display = "";
            document.getElementById("nutri-breakfast-items").innerHTML = "";
            breakfastItems = [];
            (saved.breakfast || []).forEach(item => {
              addBreakfastRow();
              const idx = breakfastItems.length - 1;
              breakfastItems[idx] = item;
              const rows = document.getElementById("nutri-breakfast-items").children;
              const row = rows[rows.length - 1];
              row.querySelector(".bf-select").value = item.key;
              row.querySelector(".bf-qty").value = item.qty;
            });
            updateBreakfastTotals();
          }
        } else {
          // Fresh start
          document.getElementById("nutri-results").style.display = "none";
          document.getElementById("nutrition-calculate").textContent = "Calculate Plan";
          document.getElementById("nutrition-calculate").style.display = "";
          document.getElementById("nutrition-apply").style.display = "none";
        }

        // Prefill pace from pace plan if not already set
        const paceInput = document.getElementById("nutri-pace");
        if (!paceInput.value) {
          try {
            const pp = window._runwellPacePlan;
            const dist = window._runwellCourseDistance;
            if (pp && pp.goalTime > 0 && dist > 0) {
              const avgPaceSec = pp.goalTime / dist;
              const mins = Math.floor(avgPaceSec / 60);
              const secs = Math.round(avgPaceSec % 60);
              paceInput.value = `${mins}:${String(secs).padStart(2, "0")}`;
            } else {
              const raceId = new URLSearchParams(window.location.search).get("race") || "default";
              const prefix = window._runwellAthletePrefix || "";
              const pSaved = JSON.parse(localStorage.getItem(`runwell-${prefix}pace-${raceId}`) || "{}");
              if (pSaved.goalTime > 0 && dist > 0) {
                const avgPaceSec = pSaved.goalTime / dist;
                const mins = Math.floor(avgPaceSec / 60);
                const secs = Math.round(avgPaceSec % 60);
                paceInput.value = `${mins}:${String(secs).padStart(2, "0")}`;
              }
            }
          } catch (e) { /* leave as is */ }
        }

        openModal("nutrition-modal");
      });
    });

    setupModalClose("nutrition-modal", "nutrition-close");

    document.getElementById("nutrition-calculate").addEventListener("click", calculateNutrition);
    document.getElementById("nutrition-apply").addEventListener("click", applyNutrition);

    // Clear all button
    document.getElementById("nutrition-clear").addEventListener("click", () => {
      lastNutritionPlan = [];
      breakfastItems = [];
      document.getElementById("nutri-weight").value = "";
      document.getElementById("nutri-pace").value = "";
      document.getElementById("nutri-fuel-brand").value = "";
      document.getElementById("nutri-fuel-secondary").value = "";
      document.getElementById("nutri-custom-cal").value = "100";
      document.getElementById("nutri-custom-carb").value = "60";
      document.getElementById("nutri-breakfast-toggle").checked = false;
      document.getElementById("nutri-breakfast-section").style.display = "none";
      document.getElementById("nutri-breakfast-items").innerHTML = "";
      document.getElementById("nutri-results").style.display = "none";
      document.getElementById("nutrition-calculate").textContent = "Calculate Plan";
      document.getElementById("nutrition-calculate").style.display = "";
      document.getElementById("nutrition-apply").style.display = "none";
      localStorage.removeItem(getNutriStorageKey());
    });

    // Add fuel stop button
    document.getElementById("nutri-add-stop").addEventListener("click", () => {
      if (lastNutritionPlan.length === 0) return;
      const lastMile = lastNutritionPlan[lastNutritionPlan.length - 1].mile + 3;
      const fuelKey = document.getElementById("nutri-fuel-brand").value;
      const f = FUEL_DB[fuelKey] || { name: "Gel", cal: 100, carb: 25 };
      const paceStr2 = document.getElementById("nutri-pace").value.trim();
      let ps2 = 8 * 60;
      if (paceStr2) { const pp2 = paceStr2.replace("/mi","").trim().split(":").map(Number); if (pp2.length===2) ps2 = pp2[0]*60+pp2[1]; }
      const courseDist = window._runwellCourseDistance || 26.2;
      const newMile = Math.round(Math.min(lastMile, courseDist - 1) * 10) / 10;
      lastNutritionPlan.push({
        mile: newMile,
        time: formatTime(newMile * ps2),
        product: f.name,
        fuelKey: fuelKey,
        cal: f.cal,
        carb: f.carb,
      });
      lastNutritionPlan.sort((a, b) => a.mile - b.mile);
      renderNutriSchedule();
    });

    // Breakfast toggle
    const bfToggle = document.getElementById("nutri-breakfast-toggle");
    const bfSection = document.getElementById("nutri-breakfast-section");
    bfToggle.addEventListener("change", () => {
      bfSection.style.display = bfToggle.checked ? "" : "none";
      if (bfToggle.checked && document.getElementById("nutri-breakfast-items").children.length === 0) {
        addBreakfastRow();
      }
    });

    document.getElementById("nutri-breakfast-add").addEventListener("click", addBreakfastRow);
  }

  let breakfastItems = [];

  function addBreakfastRow() {
    const container = document.getElementById("nutri-breakfast-items");
    const idx = breakfastItems.length;
    breakfastItems.push({ key: "oatmeal", qty: 1 });

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:6px;align-items:center;margin-bottom:4px;";
    row.innerHTML = `
      <select class="bf-select" data-idx="${idx}" style="flex:1;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:11px;font-family:inherit;">
        ${Object.entries(BREAKFAST_DB).map(([k, f]) => `<option value="${k}"${k === "oatmeal" ? " selected" : ""}>${f.name} (${f.cal} cal, ${f.carb}g)</option>`).join("")}
      </select>
      <input type="number" class="bf-qty" data-idx="${idx}" value="1" min="1" max="10" style="width:40px;padding:4px;border:1px solid var(--border);border-radius:4px;font-size:11px;text-align:center;font-family:inherit;" title="Qty" />
      <button class="bf-remove" data-idx="${idx}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px;padding:0 4px;">×</button>
    `;
    container.appendChild(row);

    row.querySelector(".bf-select").addEventListener("change", (e) => {
      breakfastItems[parseInt(e.target.dataset.idx)].key = e.target.value;
      updateBreakfastTotals();
    });
    row.querySelector(".bf-qty").addEventListener("change", (e) => {
      breakfastItems[parseInt(e.target.dataset.idx)].qty = Math.max(1, parseInt(e.target.value) || 1);
      updateBreakfastTotals();
    });
    row.querySelector(".bf-remove").addEventListener("click", (e) => {
      const i = parseInt(e.target.dataset.idx);
      breakfastItems[i] = null;
      row.remove();
      updateBreakfastTotals();
    });

    updateBreakfastTotals();
  }

  function updateBreakfastTotals() {
    let totalCal = 0, totalCarb = 0;
    breakfastItems.forEach(item => {
      if (!item) return;
      const f = BREAKFAST_DB[item.key];
      if (f) {
        totalCal += f.cal * item.qty;
        totalCarb += f.carb * item.qty;
      }
    });

    document.getElementById("nutri-breakfast-cal").textContent = `${totalCal} cal`;
    document.getElementById("nutri-breakfast-carb").textContent = `${totalCarb}g carbs`;

    // Recommendation: 1-4g carbs per kg, 2-3 hours before
    const weightVal = parseFloat(document.getElementById("nutri-weight").value) || 150;
    const weightUnit = document.getElementById("nutri-weight-unit").value;
    const weightKg = weightUnit === "lbs" ? weightVal * 0.4536 : weightVal;
    const recLow = Math.round(weightKg * 1);
    const recHigh = Math.round(weightKg * 4);
    const status = totalCarb >= recLow && totalCarb <= recHigh ? "✓ on target" : totalCarb < recLow ? `${recLow - totalCarb}g short` : "above range";
    const color = totalCarb >= recLow && totalCarb <= recHigh ? "#41ae9f" : totalCarb < recLow ? "#ef4444" : "#d97706";
    document.getElementById("nutri-breakfast-rec").innerHTML = `Rec: ${recLow}–${recHigh}g carbs &middot; <span style="font-weight:600;color:${color}">${status}</span>`;
  }

  let lastNutritionPlan = [];

  function getNutriStorageKey() {
    const prefix = window._runwellAthletePrefix || "";
    return `runwell-${prefix}nutrition-${getRaceId()}`;
  }

  function saveNutritionPlan() {
    const data = {
      plan: lastNutritionPlan,
      weight: document.getElementById("nutri-weight").value,
      weightUnit: document.getElementById("nutri-weight-unit").value,
      pace: document.getElementById("nutri-pace").value,
      fuelBrand: document.getElementById("nutri-fuel-brand").value,
      fuelSecondary: document.getElementById("nutri-fuel-secondary").value,
      customCal: document.getElementById("nutri-custom-cal").value,
      customCarb: document.getElementById("nutri-custom-carb").value,
      breakfast: breakfastItems.filter(Boolean),
      breakfastEnabled: document.getElementById("nutri-breakfast-toggle").checked,
    };
    localStorage.setItem(getNutriStorageKey(), JSON.stringify(data));
  }

  function loadNutritionPlan() {
    try { return JSON.parse(localStorage.getItem(getNutriStorageKey())); } catch { return null; }
  }

  /**
   * Evidence-based carb/calorie targets for recreational marathon runners.
   * Sources: ACSM Position Stand (2016), Jeukendrup (2014), ISSN (2017).
   *
   * Events <1 hr: mouth rinse only, no fueling needed
   * 1–2 hrs: 30g carbs/hr
   * 2–3 hrs: 60g carbs/hr (single transportable carb sufficient)
   * 3+ hrs: 60–90g carbs/hr (multiple transportable carbs recommended, such as glucose + fructose)
   *
   * Calories derived from carbs at 4 cal/g since carbs are the primary
   * performance fuel; fat oxidation covers the rest.
   */
  function getEvidenceBasedTargets(totalTimeHr, weightKg, customCal, customCarb) {
    let carbPerHr;
    if (totalTimeHr < 1) carbPerHr = 0;
    else if (totalTimeHr < 2) carbPerHr = 30;
    else if (totalTimeHr < 3) carbPerHr = 60;
    else if (totalTimeHr < 4) carbPerHr = 70;   // most recreational marathoners
    else carbPerHr = 80;                          // slower runners, longer exposure

    // Slight body weight adjustment: heavier runners can tolerate/need slightly more
    if (weightKg > 80) carbPerHr += 5;
    else if (weightKg < 60) carbPerHr -= 5;

    const calPerHr = carbPerHr * 4;

    return {
      carbPerHr: customCarb > 0 ? customCarb : carbPerHr,
      calPerHr: customCal > 0 ? customCal : (customCarb > 0 ? customCarb * 4 : calPerHr),
    };
  }

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

    // Evidence-based targets (ACSM/ISSN/Jeukendrup guidelines for recreational runners)
    const customCal = parseFloat(document.getElementById("nutri-custom-cal").value);
    const customCarb = parseFloat(document.getElementById("nutri-custom-carb").value);
    const targets = getEvidenceBasedTargets(totalTimeHr, weightKg, customCal, customCarb);
    const targetCarbPerHr = targets.carbPerHr;
    const targetCalPerHr = targets.calPerHr;

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

    renderNutriSchedule();
    saveNutritionPlan();

    document.getElementById("nutrition-calculate").textContent = "Recalculate";
    document.getElementById("nutrition-calculate").style.display = "";
    document.getElementById("nutrition-apply").style.display = "";
  }

  function renderNutriSchedule() {
    const tbody = document.getElementById("nutri-schedule-body");
    const paceStr = document.getElementById("nutri-pace").value.trim();
    let paceSeconds = 8 * 60;
    if (paceStr) { const pp = paceStr.replace("/mi","").trim().split(":").map(Number); if (pp.length===2) paceSeconds = pp[0]*60+pp[1]; }
    const courseDist = window._runwellCourseDistance || 26.2;

    // Build fuel options for dropdowns
    const fuelOptions = Object.entries(FUEL_DB).map(([key, f]) =>
      `<option value="${key}">${f.name}</option>`
    ).join("");

    tbody.innerHTML = lastNutritionPlan.map((item, i) => {
      const timeAtMile = item.mile * paceSeconds;
      item.time = formatTime(timeAtMile);
      return `<tr>
        <td><input type="number" class="nutri-mile-input" data-idx="${i}" value="${item.mile}" min="1" max="${Math.floor(courseDist)}" step="0.5" style="width:42px;padding:2px 4px;border:1px solid var(--border);border-radius:4px;font-size:11px;font-family:inherit;text-align:center;" /></td>
        <td style="color:var(--text-muted);font-size:10px;">${item.time}</td>
        <td><select class="nutri-product-select" data-idx="${i}" style="padding:2px 4px;border:1px solid var(--border);border-radius:4px;font-size:10px;font-family:inherit;max-width:130px;">${fuelOptions}</select></td>
        <td style="font-size:10px;">${item.cal}</td>
        <td style="font-size:10px;">${item.carb}g</td>
        <td><button class="nutri-remove-btn" data-idx="${i}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px;padding:0 4px;" title="Remove">×</button></td>
      </tr>`;
    }).join("");

    // Set selected product in dropdowns
    lastNutritionPlan.forEach((item, i) => {
      const sel = tbody.querySelector(`.nutri-product-select[data-idx="${i}"]`);
      if (sel) {
        // Find key by name
        const key = Object.entries(FUEL_DB).find(([k, f]) => f.name === item.product)?.[0] || item.fuelKey || "";
        sel.value = key;
      }
    });

    // Mile edit handlers
    tbody.querySelectorAll(".nutri-mile-input").forEach(input => {
      input.addEventListener("change", (e) => {
        const idx = parseInt(e.target.dataset.idx);
        lastNutritionPlan[idx].mile = parseFloat(e.target.value) || lastNutritionPlan[idx].mile;
        lastNutritionPlan.sort((a, b) => a.mile - b.mile);
        renderNutriSchedule();
      });
    });

    // Product select handlers
    tbody.querySelectorAll(".nutri-product-select").forEach(sel => {
      sel.addEventListener("change", (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const f = FUEL_DB[e.target.value];
        if (f) {
          lastNutritionPlan[idx].product = f.name;
          lastNutritionPlan[idx].fuelKey = e.target.value;
          lastNutritionPlan[idx].cal = f.cal;
          lastNutritionPlan[idx].carb = f.carb;
          renderNutriSchedule();
        }
      });
    });

    // Remove handlers
    tbody.querySelectorAll(".nutri-remove-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        lastNutritionPlan.splice(parseInt(btn.dataset.idx), 1);
        renderNutriSchedule();
      });
    });

    // Update running totals
    const totalCal = lastNutritionPlan.reduce((s, item) => s + item.cal, 0);
    const totalCarb = lastNutritionPlan.reduce((s, item) => s + item.carb, 0);
    const totalTimeSec = paceSeconds * courseDist;
    const totalTimeHr = totalTimeSec / 3600;
    const actualCalPerHr = totalTimeHr > 0 ? Math.round(totalCal / totalTimeHr) : 0;
    const actualCarbPerHr = totalTimeHr > 0 ? Math.round(totalCarb / totalTimeHr) : 0;

    // Evidence-based targets (same formula as calculateNutrition)
    const customCal = parseFloat(document.getElementById("nutri-custom-cal").value);
    const customCarb = parseFloat(document.getElementById("nutri-custom-carb").value);
    const weightVal = parseFloat(document.getElementById("nutri-weight").value) || 150;
    const weightUnit = document.getElementById("nutri-weight-unit").value;
    const weightKg = weightUnit === "lbs" ? weightVal * 0.4536 : weightVal;
    const targets = getEvidenceBasedTargets(totalTimeHr, weightKg, customCal, customCarb);
    const targetCarbPerHr = targets.carbPerHr;
    const targetCalPerHr = targets.calPerHr;

    // Compute breakfast totals
    let breakfastCal = 0, breakfastCarb = 0;
    const breakfastEnabled = document.getElementById("nutri-breakfast-toggle").checked;
    if (breakfastEnabled) {
      breakfastItems.forEach(item => {
        if (!item) return;
        const f = BREAKFAST_DB[item.key];
        if (f) {
          breakfastCal += f.cal * item.qty;
          breakfastCarb += f.carb * item.qty;
        }
      });
    }

    // Combined totals (race fuel + breakfast)
    const combinedCal = totalCal + breakfastCal;
    const combinedCarb = totalCarb + breakfastCarb;

    // Compute needed totals and recommended servings
    const neededTotalCal = Math.round(targetCalPerHr * totalTimeHr);
    const neededTotalCarb = Math.round(targetCarbPerHr * totalTimeHr);
    const avgCalPerServing = lastNutritionPlan.length > 0 ? totalCal / lastNutritionPlan.length : 100;
    const recommendedServings = Math.ceil(neededTotalCal / avgCalPerServing);

    const calDiff = combinedCal - neededTotalCal;
    const carbDiff = combinedCarb - neededTotalCarb;
    const calColor = calDiff >= 0 ? "#41ae9f" : "#ef4444";
    const carbColor = carbDiff >= 0 ? "#41ae9f" : "#ef4444";

    document.getElementById("nutri-running-cal").textContent = `${totalCal} cal`;
    document.getElementById("nutri-running-carb").textContent = `${totalCarb}g carbs`;
    document.getElementById("nutri-running-servings").textContent = `${lastNutritionPlan.length} servings`;
    document.getElementById("nutri-running-rate").textContent = `${actualCalPerHr} cal/hr, ${actualCarbPerHr}g carbs/hr`;
    document.getElementById("nutri-total-fuel").textContent = `${lastNutritionPlan.length} servings`;
    // Keep the top summary cards in sync with the recommendation
    document.getElementById("nutri-target-cal").textContent = `${targetCalPerHr} cal/hr`;
    document.getElementById("nutri-target-carb").textContent = `${targetCarbPerHr}g/hr`;

    // Recommendation
    const totalsDiv = document.getElementById("nutri-running-totals");
    let recHTML = totalsDiv.querySelector(".nutri-rec");
    if (!recHTML) {
      recHTML = document.createElement("div");
      recHTML.className = "nutri-rec";
      recHTML.style.cssText = "margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:10px;line-height:1.6;";
      totalsDiv.appendChild(recHTML);
    }

    // Build breakfast line if enabled
    const breakfastLine = breakfastEnabled && breakfastCal > 0
      ? `<div style="margin-top:3px;">Breakfast: <strong>${breakfastCal} cal, ${breakfastCarb}g carbs</strong> (included in totals below)</div>`
      : "";

    // Prompt to add breakfast if short and not enabled
    const breakfastPrompt = (!breakfastEnabled && (calDiff < 0 || carbDiff < 0))
      ? `<div style="margin-top:6px;padding:6px 8px;background:rgba(217,119,6,0.08);border-radius:4px;color:#d97706;font-weight:500;">💡 You're below your target. Add your pre-race breakfast (scroll down on the left) for a more accurate calculation.</div>`
      : "";

    recHTML.innerHTML = `
      <div style="font-weight:600;color:var(--navy);font-size:11px;margin-bottom:3px;">Recommendation</div>
      <div>Target: <strong>${neededTotalCal} cal</strong> / <strong>${neededTotalCarb}g carbs</strong> for race day (${targetCalPerHr} cal/hr × ${totalTimeHr.toFixed(1)} hrs)</div>
      <div>Recommended: <strong>${recommendedServings} servings</strong> of your selected fuel to meet your target</div>
      ${breakfastLine}
      <div style="margin-top:3px;">
        Total (${breakfastEnabled && breakfastCal > 0 ? "breakfast + race fuel" : "race fuel only"}):
        <span style="font-weight:700;color:${calColor}">${combinedCal}/${neededTotalCal} cal ${calDiff >= 0 ? "✓" : `(${Math.abs(calDiff)} short)`}</span>
        &nbsp;&middot;&nbsp;
        <span style="font-weight:700;color:${carbColor}">${combinedCarb}/${neededTotalCarb}g carbs ${carbDiff >= 0 ? "✓" : `(${Math.abs(carbDiff)}g short)`}</span>
      </div>
      ${breakfastPrompt}
    `;

    // Auto-save on every edit
    saveNutritionPlan();
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
      // Add fuel miles to the splits table fuel column
      const fuelSet = window._runwellFuelMiles;
      if (fuelSet) {
        lastNutritionPlan.forEach((item) => {
          const mile = Math.round(item.mile);
          if (mile > 0) fuelSet.add(mile);
        });
        if (window._runwellSaveFuelMiles) window._runwellSaveFuelMiles();
      }

      // Add as custom markers on the map
      lastNutritionPlan.forEach((item) => {
        window._runwellAddMarker({
          mile: item.mile,
          type: "nutrition",
          label: `${item.product} (${item.cal} cal)`,
          pace: "",
          effort: "",
          notes: `${item.carb}g carbs, take at ~${item.time}`,
        });
      });

      // Re-render after everything is added
      if (window._runwellRenderFuelMapMarkers) window._runwellRenderFuelMapMarkers();
      if (window._runwellRenderSplitsTable) window._runwellRenderSplitsTable();
    }, 100);
  }

  // ─── Weather Adjustments ──────────────────────────────────────

  function initWeather() {
    document.getElementById("btn-weather").addEventListener("click", () => {
      requirePro(() => {
        checkWeatherForecastAvailable();
        // Show undo button if weather was previously applied
        document.getElementById("weather-undo").style.display = appliedWeatherAdj > 0 ? "" : "none";
        openModal("weather-modal");
      });
    });

    setupModalClose("weather-modal", "weather-close");

    document.getElementById("weather-calculate").addEventListener("click", calculateWeather);
    document.getElementById("weather-apply").addEventListener("click", applyWeather);
    document.getElementById("weather-auto-fill").addEventListener("click", fetchWeatherForecast);

    // Undo weather adjustment
    document.getElementById("weather-undo").addEventListener("click", () => {
      if (appliedWeatherAdj === 0) return;
      if (window._runwellAdjustSplits) {
        window._runwellAdjustSplits(-appliedWeatherAdj);
        alert(`Removed +${Math.round(appliedWeatherAdj)}s/mi weather adjustment from all splits.`);
        appliedWeatherAdj = 0;
        document.getElementById("weather-undo").style.display = "none";
      }
      closeModal("weather-modal");
    });
  }

  function checkWeatherForecastAvailable() {
    const autoSection = document.getElementById("weather-auto-section");
    const raceId = new URLSearchParams(window.location.search).get("race");
    const race = typeof RACES !== "undefined" && RACES.find(r => r.id === raceId);

    if (!race || !race.schedule || !race.lat || !race.lng) { autoSection.style.display = "none"; return; }

    // Get next race date
    const nextDate = getNextRaceDate(race.schedule);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysOut = Math.round((nextDate - today) / (1000 * 60 * 60 * 24));

    const dateStr = nextDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    autoSection.style.display = "";

    if (daysOut <= 7 && daysOut >= 0) {
      document.getElementById("weather-auto-label").textContent = daysOut === 0
        ? "🟢 Race day is today! Live forecast available."
        : `🟢 Race day forecast available (${daysOut} day${daysOut > 1 ? "s" : ""} away)`;
      document.getElementById("weather-auto-sublabel").textContent = `${dateStr} - ${race.location}`;
      document.getElementById("weather-auto-fill").style.display = "";
    } else if (daysOut <= 16) {
      document.getElementById("weather-auto-label").textContent = `🟡 Extended forecast available (${daysOut} days away)`;
      document.getElementById("weather-auto-sublabel").textContent = `${dateStr} - ${race.location}. More accurate forecast within 7 days.`;
      document.getElementById("weather-auto-fill").style.display = "";
    } else {
      document.getElementById("weather-auto-label").textContent = `Race day: ${dateStr} (${daysOut} days away)`;
      document.getElementById("weather-auto-sublabel").textContent = "Weather conditions will auto-populate starting 7 days before race day. Use historical averages from the Weather Trends tab for now.";
      document.getElementById("weather-auto-fill").style.display = "none";
    }
  }

  async function fetchWeatherForecast() {
    const statusEl = document.getElementById("weather-auto-status");
    const btn = document.getElementById("weather-auto-fill");
    btn.textContent = "Fetching...";
    btn.disabled = true;
    statusEl.style.display = "";
    statusEl.textContent = "Contacting weather service...";

    const raceId = new URLSearchParams(window.location.search).get("race");
    const race = typeof RACES !== "undefined" && RACES.find(r => r.id === raceId);
    if (!race) { statusEl.textContent = "Race not found."; btn.textContent = "Auto-Fill Forecast"; btn.disabled = false; return; }

    const nextDate = getNextRaceDate(race.schedule);
    const dateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${race.lat}&longitude=${race.lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,relative_humidity_2m_mean&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      const d = data.daily;
      if (!d || !d.time || d.time.length === 0) throw new Error("No forecast data returned");

      const tempHigh = d.temperature_2m_max[0];
      const tempLow = d.temperature_2m_min[0];
      const avgTemp = Math.round((tempHigh + tempLow) / 2);
      const humidity = d.relative_humidity_2m_mean ? d.relative_humidity_2m_mean[0] : null;
      const wind = d.windspeed_10m_max[0];
      const precip = d.precipitation_sum[0];

      // Auto-fill the fields
      document.getElementById("weather-temp").value = avgTemp;
      document.getElementById("weather-temp-unit").value = "F";
      if (humidity != null) document.getElementById("weather-humidity").value = Math.round(humidity);
      document.getElementById("weather-wind").value = Math.round(wind);
      document.getElementById("weather-wind-unit").value = "mph";

      // Set conditions based on precipitation
      const condSelect = document.getElementById("weather-conditions");
      if (precip > 0.5) condSelect.value = "rain";
      else if (precip > 0.1) condSelect.value = "drizzle";
      else if (avgTemp < 35 && precip > 0) condSelect.value = "snow";
      else if (humidity > 70) condSelect.value = "cloudy";
      else condSelect.value = "clear";

      statusEl.innerHTML = `<span style="color:#41ae9f;font-weight:600;">✓ Forecast loaded</span> - ${Math.round(tempHigh)}°/${Math.round(tempLow)}°F, Wind ${Math.round(wind)} mph, ${precip > 0.05 ? precip.toFixed(2) + '" rain' : "Dry"}`;
      btn.textContent = "Refresh Forecast";
      btn.disabled = false;
    } catch (err) {
      statusEl.textContent = "Could not fetch forecast. Enter conditions manually.";
      btn.textContent = "Auto-Fill Forecast";
      btn.disabled = false;
      console.error("Weather forecast error:", err);
    }
  }

  let lastWeatherAdj = 0; // total seconds per mile adjustment
  let appliedWeatherAdj = 0; // tracks what was actually applied so it can be undone

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
      lastWeatherAdj > 15 ? "#ef4444" :
      lastWeatherAdj > 5 ? "#ea580c" :
      lastWeatherAdj > 0 ? "#d97706" : "#41ae9f";

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
      appliedWeatherAdj = lastWeatherAdj;
      alert(`Applied +${Math.round(lastWeatherAdj)}s/mi weather adjustment to all splits.`);
    } else {
      alert(`Weather adjustment: +${Math.round(lastWeatherAdj)}s/mi. Open Pace Planner to apply to your splits.`);
    }

    closeModal("weather-modal");
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
    const deleteBtn = document.getElementById("athlete-delete-btn");
    const modal = document.getElementById("athlete-modal");

    if (!selector || !select || !modal) return;

    // Show selector only for coaches
    if (!isCoach()) { selector.style.display = "none"; return; }
    selector.style.display = "";

    loadAthletes();
    renderAthleteSelect();
    updateDeleteBtn();

    // Switch athlete
    select.addEventListener("change", () => {
      activeAthlete = select.value;
      updateDeleteBtn();
      // Swap localStorage keys by setting a prefix
      window._runwellAthletePrefix = activeAthlete === "__default__" ? "" : `athlete-${activeAthlete}-`;
      // Reload the page with the athlete context
      localStorage.setItem("runwell-active-athlete", activeAthlete);
      window.location.reload();
    });

    // Delete athlete button
    deleteBtn.addEventListener("click", () => {
      if (activeAthlete === "__default__") return;
      const athlete = athletes.find((a) => a.id === activeAthlete);
      if (!athlete) return;
      if (!confirm(`Remove "${athlete.name}" from your athletes? Their race plans will be deleted.`)) return;

      // Remove athlete data from localStorage
      const prefix = `athlete-${activeAthlete}-`;
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes(prefix)) keysToRemove.push(key);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));

      // Remove from athletes list
      athletes = athletes.filter((a) => a.id !== activeAthlete);
      saveAthletes();

      // Switch back to default
      activeAthlete = "__default__";
      localStorage.setItem("runwell-active-athlete", "__default__");
      window._runwellAthletePrefix = "";
      renderAthleteSelect();
      select.value = "__default__";
      updateDeleteBtn();
      window.location.reload();
    });

    function updateDeleteBtn() {
      if (deleteBtn) deleteBtn.style.display = activeAthlete === "__default__" ? "none" : "";
    }

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
      updateDeleteBtn();
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
