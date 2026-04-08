/**
 * RunWell - Marathon Race Strategy Planner
 * Main application logic — loads GPX data dynamically
 */

(function () {
  "use strict";

  let course = null;
  let map, routeLine, elevationChart;
  let runnerMarker = null;
  let runnerMile = 0;
  let customMarkers = [];
  let mapMarkers = {};

  // Pace plan state: per-mile data
  let pacePlan = {
    goalTime: null,       // total seconds
    strategy: "even",
    splits: [],           // [{ mile, pace, effort, cumTime }]
  };

  // Effort zone colors
  const EFFORT_COLORS = {
    easy: "#34d399",
    moderate: "#41ae9f",
    hard: "#fb923c",
    sprint: "#f87171",
  };

  // ─── GPX Parsing ──────────────────────────────────────────────

  function parseGPX(xmlString) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlString, "text/xml");
    const nameEl = xml.querySelector("metadata > name") || xml.querySelector("trk > name");
    const name = nameEl ? nameEl.textContent : "Unknown Race";
    const trkpts = xml.querySelectorAll("trkpt");
    if (trkpts.length === 0) throw new Error("No track points found in GPX file");

    const route = [];
    const elevation = [];
    let totalDist = 0;
    let lastElevMile = -1;

    trkpts.forEach((pt, i) => {
      const lat = parseFloat(pt.getAttribute("lat"));
      const lon = parseFloat(pt.getAttribute("lon"));
      const eleNode = pt.querySelector("ele");
      const eleFeet = eleNode ? parseFloat(eleNode.textContent) * 3.28084 : 0;
      route.push([lat, lon]);
      if (i > 0) totalDist += haversine(route[i - 1][0], route[i - 1][1], lat, lon);
      if (elevation.length === 0 || totalDist - lastElevMile >= 0.25) {
        elevation.push({ mile: Math.round(totalDist * 100) / 100, elev: Math.round(eleFeet) });
        lastElevMile = totalDist;
      }
    });

    const lastPt = trkpts[trkpts.length - 1];
    const lastEle = lastPt.querySelector("ele");
    if (elevation[elevation.length - 1].mile < totalDist - 0.1) {
      elevation.push({
        mile: Math.round(totalDist * 100) / 100,
        elev: Math.round((lastEle ? parseFloat(lastEle.textContent) * 3.28084 : 0)),
      });
    }

    let displayRoute = route;
    if (route.length > 500) {
      const step = Math.ceil(route.length / 500);
      displayRoute = route.filter((_, i) => i % step === 0 || i === route.length - 1);
    }

    return { name, distance: Math.round(totalDist * 100) / 100, route: displayRoute, routeFull: route, elevation };
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 3958.8;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ─── Course helpers ───────────────────────────────────────────

  function getMilePosition(mile) {
    const pts = course.routeFull || course.route;
    const fraction = Math.max(0, Math.min(1, mile / course.distance));
    const index = fraction * (pts.length - 1);
    const lower = Math.floor(index);
    const upper = Math.min(lower + 1, pts.length - 1);
    const t = index - lower;
    return [pts[lower][0] + t * (pts[upper][0] - pts[lower][0]), pts[lower][1] + t * (pts[upper][1] - pts[lower][1])];
  }

  function getElevationAtMile(mile) {
    const pts = course.elevation;
    if (mile <= pts[0].mile) return pts[0].elev;
    if (mile >= pts[pts.length - 1].mile) return pts[pts.length - 1].elev;
    for (let i = 0; i < pts.length - 1; i++) {
      if (mile >= pts[i].mile && mile <= pts[i + 1].mile) {
        const t = (mile - pts[i].mile) / (pts[i + 1].mile - pts[i].mile);
        return pts[i].elev + t * (pts[i + 1].elev - pts[i].elev);
      }
    }
    return 0;
  }

  // Get elevation change for a mile segment (in feet)
  function getElevChangeForMile(mile) {
    return getElevationAtMile(mile) - getElevationAtMile(mile - 1);
  }

  // ─── Initialize Map ───────────────────────────────────────────

  function initMap() {
    map = L.map("map", { zoomControl: true, attributionControl: false });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19, subdomains: "abcd" }).addTo(map);
    document.querySelector(".leaflet-tile-pane").style.filter = "none";

    routeLine = L.polyline(course.route, { color: "#41ae9f", weight: 5, opacity: 0.85, smoothFactor: 1.5 }).addTo(map);
    L.polyline(course.route, { color: "#41ae9f", weight: 12, opacity: 0.15, smoothFactor: 1.5 }).addTo(map);
    map.fitBounds(routeLine.getBounds().pad(0.05));

    addHTMLMarker(course.route[0], '<div class="start-marker">Start</div>');
    addHTMLMarker(course.route[course.route.length - 1], '<div class="finish-marker">Finish</div>');

    const totalMiles = Math.floor(course.distance);
    for (let m = 1; m <= totalMiles; m++) {
      addHTMLMarker(getMilePosition(m), `<div class="mile-marker">${m}</div>`);
    }

    placeRunner(0);

    routeLine.on("click", (e) => { const m = latlngToMile(e.latlng); if (m !== null) placeRunner(m); });
    map.on("click", (e) => { const m = latlngToMile(e.latlng); if (m !== null) placeRunner(m); });
  }

  function addHTMLMarker(pos, html, offset) {
    const latlng = Array.isArray(pos) ? pos : [pos.lat || pos[0], pos.lng || pos[1]];
    const icon = L.divIcon({ html, className: "", iconSize: null, iconAnchor: offset ? [12 - offset[0], 12 - offset[1]] : [12, 12] });
    return L.marker(latlng, { icon }).addTo(map);
  }

  function latlngToMile(latlng) {
    let minDist = Infinity, closestIdx = 0;
    const pts = course.route;
    for (let i = 0; i < pts.length; i++) {
      const d = (latlng.lat - pts[i][0]) ** 2 + (latlng.lng - pts[i][1]) ** 2;
      if (d < minDist) { minDist = d; closestIdx = i; }
    }
    if (Math.sqrt(minDist) > 0.015) return null;
    return (closestIdx / (pts.length - 1)) * course.distance;
  }

  // ─── Runner Placement ─────────────────────────────────────────

  function placeRunner(mile) {
    mile = Math.max(0, Math.min(course.distance, mile));
    runnerMile = mile;
    const pos = getMilePosition(mile);

    if (runnerMarker) {
      runnerMarker.setLatLng(pos);
    } else {
      const icon = L.divIcon({ html: '<div class="runner-marker">🏃</div>', className: "", iconSize: [32, 32], iconAnchor: [16, 16] });
      runnerMarker = L.marker(pos, { icon, draggable: true, zIndexOffset: 1000 }).addTo(map);
      runnerMarker.on("drag", (e) => {
        const m = latlngToMile(e.latlng);
        if (m !== null) {
          runnerMile = m;
          runnerMarker.setLatLng(getMilePosition(m));
          updateRunnerInfo(m);
          updateElevationCursor();
          highlightActiveSplit(m);
        }
      });
    }

    updateRunnerInfo(mile);
    updateElevationCursor();
    highlightActiveSplit(mile);
    document.getElementById("runner-info").style.display = "block";
  }

  function updateRunnerInfo(mile) {
    document.getElementById("runner-mile").textContent = `Mile ${mile.toFixed(1)}`;
    const elev = getElevationAtMile(mile);
    const remaining = (course.distance - mile).toFixed(1);
    const gradeMile = Math.min(mile + 0.25, course.distance);
    const grade = (((getElevationAtMile(gradeMile) - elev) / (0.25 * 5280)) * 100).toFixed(1);
    const gradeLabel = grade > 0.3 ? `↑ ${grade}%` : grade < -0.3 ? `↓ ${Math.abs(grade)}%` : "Flat";

    // Current split pace if set
    const currentMile = Math.floor(mile) + 1;
    const split = pacePlan.splits.find((s) => s.mile === Math.min(currentMile, Math.ceil(course.distance)));
    const paceText = split && split.pace ? split.pace : "—";
    const effortText = split && split.effort ? split.effort : "";

    // Next custom marker
    const sorted = [...customMarkers].sort((a, b) => a.mile - b.mile);
    const nextNote = sorted.find((cm) => cm.mile > mile);
    const nextNoteText = nextNote ? `${nextNote.label} (${(nextNote.mile - mile).toFixed(1)} mi)` : "—";

    document.getElementById("runner-details").innerHTML = `
      <div class="detail-row"><span>Elevation</span><span class="detail-value">${Math.round(elev)} ft</span></div>
      <div class="detail-row"><span>Grade</span><span class="detail-value">${gradeLabel}</span></div>
      <div class="detail-row"><span>Target Pace</span><span class="detail-value">${paceText}${effortText ? ` <span class="effort-badge ${effortText}" style="margin-left:4px;">${effortText}</span>` : ""}</span></div>
      <div class="detail-row"><span>Remaining</span><span class="detail-value">${remaining} mi</span></div>
      <div class="detail-row"><span>Next Note</span><span class="detail-value" style="font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${nextNoteText}</span></div>
    `;
  }

  // ─── Elevation Chart ──────────────────────────────────────────

  function initElevationChart() {
    const ctx = document.getElementById("elevation-chart").getContext("2d");
    const labels = course.elevation.map((p) => p.mile);
    const data = course.elevation.map((p) => p.elev);

    let gain = 0, loss = 0, maxElev = 0;
    for (let i = 1; i < data.length; i++) {
      const diff = data[i] - data[i - 1];
      if (diff > 0) gain += diff; else loss += Math.abs(diff);
      if (data[i] > maxElev) maxElev = data[i];
    }
    document.getElementById("stat-gain").textContent = `▲ ${Math.round(gain)} ft gain`;
    document.getElementById("stat-loss").textContent = `▼ ${Math.round(loss)} ft loss`;
    document.getElementById("stat-max").textContent = `Max: ${Math.round(maxElev)} ft`;

    const overlayPlugin = {
      id: "runwellOverlay",
      afterDraw: (chart) => {
        const ctx = chart.ctx;
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;

        // Draw effort zone backgrounds on chart
        pacePlan.splits.forEach((split) => {
          if (!split.effort) return;
          const startMile = split.mile - 1;
          const endMile = split.mile;
          const idxStart = findClosestIndex(labels, Math.max(0, startMile));
          const idxEnd = findClosestIndex(labels, endMile);
          const x1 = xScale.getPixelForValue(idxStart);
          const x2 = xScale.getPixelForValue(idxEnd);
          ctx.save();
          ctx.fillStyle = (EFFORT_COLORS[split.effort] || "#41ae9f") + "18"; // very transparent
          ctx.fillRect(x1, yScale.top, x2 - x1, yScale.bottom - yScale.top);
          ctx.restore();
        });

        // Runner position line
        if (runnerMile !== undefined) {
          const idx = findClosestIndex(labels, runnerMile);
          if (idx >= 0) {
            const xPixel = xScale.getPixelForValue(idx);
            const yPixel = yScale.getPixelForValue(getElevationAtMile(runnerMile));
            ctx.save();
            ctx.beginPath(); ctx.strokeStyle = "#fb923c"; ctx.lineWidth = 2;
            ctx.moveTo(xPixel, yScale.top); ctx.lineTo(xPixel, yScale.bottom); ctx.stroke();
            ctx.beginPath(); ctx.fillStyle = "#fb923c"; ctx.arc(xPixel, yPixel, 5, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }
        }

        // Custom markers
        const colors = { nutrition: "#fbbf24", water: "#22d3ee", pace: "#a78bfa", note: "#f87171", effort: "#fb923c" };
        customMarkers.forEach((cm) => {
          const idx = findClosestIndex(labels, cm.mile);
          if (idx < 0) return;
          const xPixel = xScale.getPixelForValue(idx);
          ctx.save();
          ctx.beginPath(); ctx.strokeStyle = colors[cm.type] || "#fbbf24"; ctx.lineWidth = 1.5; ctx.setLineDash([2, 2]);
          ctx.moveTo(xPixel, yScale.top); ctx.lineTo(xPixel, yScale.bottom); ctx.stroke();
          ctx.fillStyle = colors[cm.type] || "#fbbf24"; ctx.font = "bold 9px Inter"; ctx.textAlign = "center";
          ctx.fillText(cm.label.slice(0, 14), xPixel, yScale.top - 4);
          ctx.restore();
        });
      },
    };

    Chart.register(overlayPlugin);

    elevationChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{ data, borderColor: "#41ae9f", backgroundColor: createGradient(ctx), fill: true, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: "#41ae9f", tension: 0.3 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1a3539", borderColor: "#264045", borderWidth: 1,
            titleFont: { family: "Inter", size: 12, weight: "600" }, bodyFont: { family: "Inter", size: 11 },
            titleColor: "#e8eaed", bodyColor: "#8b8fa3", padding: 10, cornerRadius: 6,
            callbacks: {
              title: (items) => `Mile ${items[0].label}`,
              label: (item) => {
                const mile = parseFloat(item.label);
                const split = pacePlan.splits.find((s) => s.mile === Math.ceil(mile) || s.mile === Math.floor(mile) + 1);
                let text = `Elevation: ${Math.round(item.raw)} ft`;
                if (split && split.pace) text += `  |  Pace: ${split.pace}`;
                if (split && split.effort) text += `  |  ${split.effort}`;
                return text;
              },
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: "Miles", color: "#8b8fa3", font: { family: "Inter", size: 11 } },
            grid: { color: "rgba(46, 51, 68, 0.5)" },
            ticks: { color: "#8b8fa3", font: { family: "Inter", size: 10 }, callback: (val, idx) => { const m = labels[idx]; const step = course.distance > 20 ? 5 : 2; return m % step === 0 ? m : ""; }, maxTicksLimit: 20 },
          },
          y: {
            title: { display: true, text: "Elevation (ft)", color: "#8b8fa3", font: { family: "Inter", size: 11 } },
            grid: { color: "rgba(46, 51, 68, 0.5)" },
            ticks: { color: "#8b8fa3", font: { family: "Inter", size: 10 } }, min: 0,
          },
        },
        onClick: (evt) => {
          const points = elevationChart.getElementsAtEventForMode(evt, "index", { intersect: false }, false);
          if (points.length > 0) { const mile = labels[points[0].index]; placeRunner(mile); map.panTo(getMilePosition(mile)); }
        },
      },
    });
  }

  function findClosestIndex(labels, mile) {
    let closest = 0, minDiff = Infinity;
    for (let i = 0; i < labels.length; i++) { const d = Math.abs(labels[i] - mile); if (d < minDiff) { minDiff = d; closest = i; } }
    return closest;
  }

  function createGradient(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 200);
    g.addColorStop(0, "rgba(65, 174, 159, 0.25)"); g.addColorStop(1, "rgba(65, 174, 159, 0.02)");
    return g;
  }

  function updateElevationCursor() { if (elevationChart) elevationChart.update("none"); }

  // ─── Pace Planner ─────────────────────────────────────────────

  function parseTimeToSeconds(str) {
    if (!str) return null;
    const parts = str.trim().split(":").map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
    return null;
  }

  function secondsToTime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.round(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function secondsToPace(s) {
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function generateSplits(goalSeconds, strategy) {
    const totalMiles = Math.ceil(course.distance);
    const lastMileFraction = course.distance - Math.floor(course.distance);
    const avgPace = goalSeconds / course.distance; // seconds per mile

    const splits = [];
    let cumTime = 0;

    for (let m = 1; m <= totalMiles; m++) {
      const isLast = m === totalMiles;
      const mileLength = isLast && lastMileFraction > 0.01 ? lastMileFraction : 1;
      let pace = avgPace;
      const halfDist = course.distance / 2;

      if (strategy === "negative") {
        // Slower first half, faster second half
        pace = m <= halfDist ? avgPace + 5 : avgPace - 5;
      } else if (strategy === "positive") {
        // Faster first half, slower second half
        pace = m <= halfDist ? avgPace - 5 : avgPace + 5;
      } else if (strategy === "elevation") {
        // Adjust based on elevation change
        const elevChange = getElevChangeForMile(m);
        // ~6s per 50ft of gain, ~3s per 50ft of loss
        const adjustment = (elevChange / 50) * 6;
        pace = avgPace + adjustment;
      }

      // Auto-assign effort based on pace vs average
      let effort = "";
      if (pace < avgPace - 8) effort = "sprint";
      else if (pace < avgPace - 3) effort = "hard";
      else if (pace > avgPace + 5) effort = "easy";
      else effort = "moderate";

      const splitTime = pace * mileLength;
      cumTime += splitTime;

      splits.push({
        mile: m,
        mileLength,
        pace: secondsToPace(pace),
        paceSeconds: pace,
        effort,
        splitTime,
        cumTime,
      });
    }

    return splits;
  }

  function initPacePlanner() {
    const paceModal = document.getElementById("pace-modal-overlay");

    document.getElementById("btn-pace-planner").addEventListener("click", () => {
      if (pacePlan.goalTime) {
        document.getElementById("goal-time").value = secondsToTime(pacePlan.goalTime);
        document.getElementById("pace-strategy").value = pacePlan.strategy;
      }
      paceModal.style.display = "flex";
    });

    document.getElementById("btn-edit-pace").addEventListener("click", () => {
      if (pacePlan.goalTime) {
        document.getElementById("goal-time").value = secondsToTime(pacePlan.goalTime);
        document.getElementById("pace-strategy").value = pacePlan.strategy;
      }
      paceModal.style.display = "flex";
    });

    document.getElementById("pace-cancel").addEventListener("click", () => { paceModal.style.display = "none"; });
    paceModal.addEventListener("click", (e) => { if (e.target === paceModal) paceModal.style.display = "none"; });

    document.getElementById("pace-generate").addEventListener("click", () => {
      const goalSeconds = parseTimeToSeconds(document.getElementById("goal-time").value);
      if (!goalSeconds || goalSeconds < 60) { alert("Please enter a valid goal time (e.g. 3:30:00)"); return; }

      const strategy = document.getElementById("pace-strategy").value;
      pacePlan.goalTime = goalSeconds;
      pacePlan.strategy = strategy;
      pacePlan.splits = generateSplits(goalSeconds, strategy);

      savePacePlan();
      renderSplitsTable();
      updatePaceSummary();
      if (elevationChart) elevationChart.update("none");
      updateRunnerInfo(runnerMile);

      // Switch to splits tab
      switchTab("splits");
      paceModal.style.display = "none";
    });
  }

  function updatePaceSummary() {
    const el = document.getElementById("pace-summary");
    if (!pacePlan.goalTime) { el.style.display = "none"; return; }
    el.style.display = "block";
    document.getElementById("pace-goal-label").textContent =
      `Goal: ${secondsToTime(pacePlan.goalTime)} · ${pacePlan.strategy} splits · Avg ${secondsToPace(pacePlan.goalTime / course.distance)}/mi`;
  }

  // ─── Splits Table ─────────────────────────────────────────────

  function renderSplitsTable() {
    const tbody = document.getElementById("splits-table-body");
    if (pacePlan.splits.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;font-size:13px;">
        No pace plan yet. Click <strong>Pace Planner</strong> to generate splits.
      </td></tr>`;
      return;
    }

    tbody.innerHTML = pacePlan.splits.map((s, i) => {
      const elevChange = getElevChangeForMile(s.mile);
      const elevIcon = elevChange > 20 ? "↑" : elevChange < -20 ? "↓" : "—";
      const elevColor = elevChange > 20 ? "var(--accent-red)" : elevChange < -20 ? "var(--accent-green)" : "var(--text-muted)";
      const mileLabel = s.mileLength < 1 ? `${s.mile - 1}→${course.distance.toFixed(1)}` : s.mile;

      return `<tr data-mile="${s.mile}" class="${Math.floor(runnerMile) + 1 === s.mile ? 'active-row' : ''}">
        <td>${mileLabel}</td>
        <td style="color:${elevColor}">${elevIcon} ${Math.abs(Math.round(elevChange))}′</td>
        <td>
          <div class="pace-cell">
            <input type="text" value="${s.pace}" data-idx="${i}" class="split-pace-input" />
          </div>
        </td>
        <td>
          <select class="effort-select" data-idx="${i}" style="background:transparent;border:none;color:${EFFORT_COLORS[s.effort] || 'var(--text-muted)'};font-size:11px;font-family:inherit;cursor:pointer;outline:none;">
            <option value="" ${!s.effort ? "selected" : ""}>—</option>
            <option value="easy" ${s.effort === "easy" ? "selected" : ""} style="color:#34d399">Easy</option>
            <option value="moderate" ${s.effort === "moderate" ? "selected" : ""} style="color:#41ae9f">Moderate</option>
            <option value="hard" ${s.effort === "hard" ? "selected" : ""} style="color:#fb923c">Hard</option>
            <option value="sprint" ${s.effort === "sprint" ? "selected" : ""} style="color:#f87171">Sprint</option>
          </select>
        </td>
        <td style="color:var(--text-muted);font-size:11px;">${secondsToTime(s.cumTime)}</td>
      </tr>`;
    }).join("");

    // Pace edit handlers
    tbody.querySelectorAll(".split-pace-input").forEach((input) => {
      input.addEventListener("change", (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const parts = e.target.value.split(":").map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          const newPace = parts[0] * 60 + parts[1];
          pacePlan.splits[idx].paceSeconds = newPace;
          pacePlan.splits[idx].pace = secondsToPace(newPace);
          recalcCumulativeTimes();
          savePacePlan();
          renderSplitsTable();
          if (elevationChart) elevationChart.update("none");
          updateRunnerInfo(runnerMile);
        }
      });
    });

    // Effort edit handlers
    tbody.querySelectorAll(".effort-select").forEach((sel) => {
      sel.addEventListener("change", (e) => {
        const idx = parseInt(e.target.dataset.idx);
        pacePlan.splits[idx].effort = e.target.value;
        savePacePlan();
        renderSplitsTable();
        if (elevationChart) elevationChart.update("none");
        updateRunnerInfo(runnerMile);
      });
    });

    // Click row to navigate
    tbody.querySelectorAll("tr[data-mile]").forEach((tr) => {
      tr.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
        const mile = parseFloat(tr.dataset.mile) - 0.5;
        placeRunner(mile);
        map.panTo(getMilePosition(mile));
      });
    });
  }

  function recalcCumulativeTimes() {
    let cum = 0;
    pacePlan.splits.forEach((s) => {
      s.splitTime = s.paceSeconds * s.mileLength;
      cum += s.splitTime;
      s.cumTime = cum;
    });
    // Update goal time to match actual sum
    if (pacePlan.splits.length > 0) {
      const totalTime = pacePlan.splits[pacePlan.splits.length - 1].cumTime;
      pacePlan.goalTime = totalTime;
      updatePaceSummary();
    }
  }

  // ─── Tabs ─────────────────────────────────────────────────────

  function initTabs() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });
  }

  function switchTab(tabName) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tabName));
    document.getElementById("tab-notes").style.display = tabName === "notes" ? "" : "none";
    document.getElementById("tab-splits").style.display = tabName === "splits" ? "" : "none";
  }

  // ─── Notes Panel (splits-list) ────────────────────────────────

  function renderSplitsList() {
    const list = document.getElementById("splits-list");
    let items = [];

    const keyMiles = [];
    const step = course.distance > 20 ? 5 : (course.distance > 10 ? 2 : 1);
    for (let m = step; m < course.distance; m += step) keyMiles.push(m);
    if (course.distance >= 13.1) keyMiles.push(13.1);
    keyMiles.push(course.distance);

    [...new Set(keyMiles)].sort((a, b) => a - b).forEach((m) => {
      const label = Math.abs(m - 13.1) < 0.01 ? "Half Marathon" : Math.abs(m - course.distance) < 0.01 ? "Finish Line" : `Mile ${m}`;
      items.push({ mile: m, type: "mile", label, icon: Math.abs(m - course.distance) < 0.01 ? "🏁" : Math.abs(m - 13.1) < 0.01 ? "½" : m, deletable: false });
    });

    customMarkers.forEach((cm, idx) => {
      const icons = { nutrition: "🍊", water: "💧", pace: "⏱", note: "📝", effort: "💪" };
      items.push({ mile: cm.mile, type: cm.type, label: cm.label, icon: icons[cm.type] || "📌", deletable: true, customIdx: idx, pace: cm.pace, effort: cm.effort, notes: cm.notes });
    });

    items.sort((a, b) => a.mile - b.mile);

    list.innerHTML = items.map((item) => `
      <div class="split-item" data-mile="${item.mile}" data-type="${item.type}">
        <div class="split-icon ${item.type}">${item.icon}</div>
        <div class="split-info">
          <div class="split-label">${item.label}${item.effort ? ` <span class="effort-badge ${item.effort}">${item.effort}</span>` : ""}</div>
          <div class="split-meta">
            Mile ${item.mile.toFixed(1)} · ${Math.round(getElevationAtMile(item.mile))} ft
            ${item.pace ? ` · ${item.pace}/mi` : ""}
          </div>
          ${item.notes ? `<div class="split-notes">${item.notes}</div>` : ""}
        </div>
        ${item.deletable ? `<button class="split-delete" data-idx="${item.customIdx}">×</button>` : ""}
      </div>
    `).join("");

    list.querySelectorAll(".split-item").forEach((el) => {
      el.addEventListener("click", () => { const mile = parseFloat(el.dataset.mile); placeRunner(mile); map.panTo(getMilePosition(mile)); });
    });

    list.querySelectorAll(".split-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        if (customMarkers[idx]._mapMarker) map.removeLayer(customMarkers[idx]._mapMarker);
        customMarkers.splice(idx, 1);
        saveCustomMarkers();
        renderSplitsList();
        if (elevationChart) elevationChart.update();
      });
    });

    highlightActiveSplit(runnerMile);
  }

  function highlightActiveSplit(mile) {
    document.querySelectorAll(".split-item").forEach((el) => {
      el.classList.toggle("active", Math.abs(parseFloat(el.dataset.mile) - mile) < 0.5);
    });
    // Also highlight active row in splits table
    document.querySelectorAll("#splits-table-body tr").forEach((tr) => {
      const m = parseFloat(tr.dataset.mile);
      tr.classList.toggle("active-row", Math.floor(mile) + 1 === m);
    });
  }

  // ─── Custom Markers ───────────────────────────────────────────

  function addCustomMarker(data) {
    const pos = getMilePosition(data.mile);
    const icons = { nutrition: "🍊", water: "💧", pace: "⏱", note: "📝", effort: "💪" };
    const marker = addHTMLMarker(pos, `<div class="custom-marker ${data.type}">${icons[data.type] || "📌"}</div>`);
    let popupContent = `<strong>${data.label}</strong><br>Mile ${data.mile}`;
    if (data.pace) popupContent += `<br>Pace: ${data.pace}/mi`;
    if (data.effort) popupContent += `<br>Effort: ${data.effort}`;
    if (data.notes) popupContent += `<br><em>${data.notes}</em>`;
    marker.bindPopup(popupContent);
    data._mapMarker = marker;
    customMarkers.push(data);
    saveCustomMarkers();
    renderSplitsList();
    if (elevationChart) elevationChart.update();
  }

  // ─── Persistence (per race) ───────────────────────────────────

  function getRaceId() {
    return new URLSearchParams(window.location.search).get("race") || "default";
  }

  function getStorageKey() { return `runwell-markers-${getRaceId()}`; }
  function getPaceStorageKey() { return `runwell-pace-${getRaceId()}`; }

  function saveCustomMarkers() {
    const data = customMarkers.map(({ mile, type, label, pace, effort, notes }) => ({ mile, type, label, pace, effort, notes }));
    localStorage.setItem(getStorageKey(), JSON.stringify(data));
  }

  function loadCustomMarkers() {
    try { JSON.parse(localStorage.getItem(getStorageKey()) || "[]").forEach((d) => addCustomMarker(d)); } catch (e) {}
  }

  function savePacePlan() {
    const data = { goalTime: pacePlan.goalTime, strategy: pacePlan.strategy, splits: pacePlan.splits.map(({ mile, mileLength, pace, paceSeconds, effort }) => ({ mile, mileLength, pace, paceSeconds, effort })) };
    localStorage.setItem(getPaceStorageKey(), JSON.stringify(data));
  }

  function loadPacePlan() {
    try {
      const saved = JSON.parse(localStorage.getItem(getPaceStorageKey()));
      if (saved && saved.splits && saved.splits.length > 0) {
        pacePlan.goalTime = saved.goalTime;
        pacePlan.strategy = saved.strategy;
        // Recalculate cumulative times
        let cum = 0;
        pacePlan.splits = saved.splits.map((s) => {
          const splitTime = s.paceSeconds * s.mileLength;
          cum += splitTime;
          return { ...s, splitTime, cumTime: cum };
        });
      }
    } catch (e) {}
  }

  // ─── Modals ───────────────────────────────────────────────────

  function initModals() {
    const modal = document.getElementById("modal-overlay");

    document.getElementById("btn-add-marker").addEventListener("click", () => {
      document.getElementById("modal-mile").value = runnerMile.toFixed(1);
      document.getElementById("modal-mile").max = course.distance;
      document.getElementById("modal-label").value = "";
      document.getElementById("modal-pace").value = "";
      document.getElementById("modal-effort").value = "";
      document.getElementById("modal-notes").value = "";
      modal.style.display = "flex";
    });

    document.getElementById("modal-cancel").addEventListener("click", () => { modal.style.display = "none"; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });

    document.getElementById("modal-save").addEventListener("click", () => {
      const mile = parseFloat(document.getElementById("modal-mile").value);
      const type = document.getElementById("modal-type").value;
      const label = document.getElementById("modal-label").value || `${type} at mile ${mile.toFixed(1)}`;
      const pace = document.getElementById("modal-pace").value;
      const effort = document.getElementById("modal-effort").value;
      const notes = document.getElementById("modal-notes").value;
      addCustomMarker({ mile, type, label, pace, effort, notes });
      modal.style.display = "none";
    });

    // Export
    document.getElementById("btn-export").addEventListener("click", exportPlan);

    // Escape key closes any modal
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        modal.style.display = "none";
        document.getElementById("pace-modal-overlay").style.display = "none";
      }
    });
  }

  // ─── Export ────────────────────────────────────────────────────

  function exportPlan() {
    let text = `RunWell Race Plan - ${course.name}\n`;
    text += `Distance: ${course.distance.toFixed(2)} miles\n`;
    if (pacePlan.goalTime) {
      text += `Goal Time: ${secondsToTime(pacePlan.goalTime)} (${pacePlan.strategy} splits)\n`;
      text += `Average Pace: ${secondsToPace(pacePlan.goalTime / course.distance)}/mi\n`;
    }
    text += `${"=".repeat(60)}\n\n`;

    // Splits table
    if (pacePlan.splits.length > 0) {
      text += "MILE-BY-MILE SPLITS\n";
      text += "-".repeat(60) + "\n";
      text += "Mile   Elev   Pace      Effort     Cumul. Time\n";
      text += "-".repeat(60) + "\n";
      pacePlan.splits.forEach((s) => {
        const elevChange = getElevChangeForMile(s.mile);
        const elevStr = (elevChange >= 0 ? "+" : "") + Math.round(elevChange) + "′";
        text += `${String(s.mile).padStart(4)}   ${elevStr.padStart(6)}   ${s.pace.padStart(5)}/mi   ${(s.effort || "—").padEnd(10)} ${secondsToTime(s.cumTime)}\n`;
      });
      text += "\n";
    }

    // Notes
    if (customMarkers.length > 0) {
      text += "RACE NOTES\n";
      text += "-".repeat(60) + "\n";
      [...customMarkers].sort((a, b) => a.mile - b.mile).forEach((cm) => {
        const elev = Math.round(getElevationAtMile(cm.mile));
        text += `Mile ${cm.mile.toFixed(1).padStart(5)} | ${cm.type.toUpperCase().padEnd(10)} | ${cm.label}`;
        if (cm.pace) text += ` | Pace: ${cm.pace}/mi`;
        if (cm.effort) text += ` | Effort: ${cm.effort}`;
        if (cm.notes) text += `\n         ${cm.notes}`;
        text += "\n";
      });
    }

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `race-plan-${(course.name || "plan").replace(/[^a-z0-9]/gi, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Load Course & Boot ───────────────────────────────────────

  async function loadCourse() {
    const params = new URLSearchParams(window.location.search);
    const raceId = params.get("race");
    if (!raceId) { window.location.href = "index.html"; return; }

    let gpxText;

    if (raceId === "custom") {
      gpxText = sessionStorage.getItem("custom-gpx");
      if (!gpxText) { alert("No GPX data found."); window.location.href = "index.html"; return; }
      document.getElementById("race-title").textContent = sessionStorage.getItem("custom-gpx-name") || "Custom Race";
    } else {
      const race = typeof RACES !== "undefined" && RACES.find((r) => r.id === raceId);
      if (!race) { alert(`Race "${raceId}" not found.`); window.location.href = "index.html"; return; }
      document.getElementById("race-title").textContent = race.name;
      document.title = `RunWell - ${race.name}`;
      try {
        const response = await fetch(race.file);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        gpxText = await response.text();
      } catch (err) { alert(`Failed to load GPX: ${err.message}`); return; }
    }

    try { course = parseGPX(gpxText); } catch (err) { alert(`GPX parse error: ${err.message}`); return; }

    document.getElementById("loading").style.display = "none";
    document.getElementById("main-content").style.display = "flex";

    initMap();
    initElevationChart();
    initTabs();
    initModals();
    initPacePlanner();
    loadCustomMarkers();
    loadPacePlan();
    renderSplitsList();
    renderSplitsTable();
    updatePaceSummary();

    // Expose hooks for pro-features.js
    window._runwellCourseDistance = course.distance;
    window._runwellAddMarker = function (data) {
      addCustomMarker(data);
    };
    window._runwellAdjustSplits = function (adjSeconds) {
      if (pacePlan.splits.length === 0) return;
      pacePlan.splits.forEach((s) => {
        s.paceSeconds += adjSeconds;
        s.pace = secondsToPace(s.paceSeconds);
      });
      recalcCumulativeTimes();
      savePacePlan();
      renderSplitsTable();
      updatePaceSummary();
      if (elevationChart) elevationChart.update("none");
      updateRunnerInfo(runnerMile);
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadCourse);
  else loadCourse();
})();
