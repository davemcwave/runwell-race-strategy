/**
 * RunWell - Marathon Race Strategy Planner
 * Main application logic - loads GPX data dynamically
 */

(function () {
  "use strict";

  let course = null;
  let map, routeLine, elevationChart;
  let runnerMarker = null;
  let runnerMile = 0;
  let customMarkers = [];
  let mapMarkers = {};
  let fuelMiles = new Set();
  let fuelMapMarkers = {};

  // Pace plan state: per-mile data
  let pacePlan = {
    goalTime: null,       // total seconds
    strategy: "even",
    startApproach: "even-start",
    splits: [],           // [{ mile, pace, effort, cumTime }]
  };

  // Coach: Goal A/B support
  let activeGoal = "A";
  let pacePlanB = {
    goalTime: null,
    strategy: "even",
    startApproach: "even-start",
    splits: [],
  };

  // Effort 0-10 color scale (green → amber → orange → red)
  function effortColor(e) {
    const n = parseInt(e) || 0;
    if (n <= 3) return "#41ae9f";   // easy: teal
    if (n <= 5) return "#d97706";   // moderate: amber
    if (n <= 7) return "#ea580c";   // hard: deep orange
    return "#ef4444";               // max effort: red
  }

  function effortLabel(e) {
    const n = parseInt(e) || 0;
    if (n === 0) return "";
    return `${n}/10`;
  }

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

    // Build cumulative distance array for accurate mile position lookups
    const cumDist = [0];
    for (let i = 1; i < route.length; i++) {
      cumDist.push(cumDist[i - 1] + haversine(route[i - 1][0], route[i - 1][1], route[i][0], route[i][1]));
    }

    return { name, distance: Math.round(totalDist * 100) / 100, route: displayRoute, routeFull: route, elevation, cumDist };
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
    const cd = course.cumDist;
    if (!cd || cd.length !== pts.length) {
      // Fallback: linear interpolation
      const fraction = Math.max(0, Math.min(1, mile / course.distance));
      const index = fraction * (pts.length - 1);
      const lower = Math.floor(index);
      const upper = Math.min(lower + 1, pts.length - 1);
      const t = index - lower;
      return [pts[lower][0] + t * (pts[upper][0] - pts[lower][0]), pts[lower][1] + t * (pts[upper][1] - pts[lower][1])];
    }
    // Binary search for the segment that contains this mile
    const targetDist = Math.max(0, Math.min(course.distance, mile));
    let lo = 0, hi = cd.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cd[mid] <= targetDist) lo = mid; else hi = mid;
    }
    const segLen = cd[hi] - cd[lo];
    const t = segLen > 0 ? (targetDist - cd[lo]) / segLen : 0;
    return [pts[lo][0] + t * (pts[hi][0] - pts[lo][0]), pts[lo][1] + t * (pts[hi][1] - pts[lo][1])];
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
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { maxZoom: 19, subdomains: "abcd" }).addTo(map);

    routeLine = L.polyline(course.route, { color: "#334264", weight: 5, opacity: 0.85, smoothFactor: 1.5 }).addTo(map);
    L.polyline(course.route, { color: "#334264", weight: 12, opacity: 0.15, smoothFactor: 1.5 }).addTo(map);
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
    // Search against the full route for accuracy
    const pts = course.routeFull || course.route;
    const cd = course.cumDist;
    let minDist = Infinity, closestIdx = 0;
    for (let i = 0; i < pts.length; i++) {
      const d = (latlng.lat - pts[i][0]) ** 2 + (latlng.lng - pts[i][1]) ** 2;
      if (d < minDist) { minDist = d; closestIdx = i; }
    }
    if (Math.sqrt(minDist) > 0.015) return null;
    // Use cumDist for accurate mile
    if (cd && cd.length === pts.length) return cd[closestIdx];
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
      const icon = L.divIcon({ html: '<div class="runner-marker"><svg width="32" height="32" viewBox="0 0 24 24" fill="#F5F35C" stroke="#334264" stroke-width="0.5"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/></svg></div>', className: "", iconSize: [40, 40], iconAnchor: [20, 20] });
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
    const paceText = split && split.pace ? split.pace : "-";
    const effortVal = split ? split.effort : 0;

    // Next custom marker
    const sorted = [...customMarkers].sort((a, b) => a.mile - b.mile);
    const nextNote = sorted.find((cm) => cm.mile > mile);
    const nextNoteText = nextNote ? `${nextNote.label} (${(nextNote.mile - mile).toFixed(1)} mi)` : "-";

    document.getElementById("runner-details").innerHTML = `
      <div class="detail-row"><span>Elevation</span><span class="detail-value">${Math.round(elev)} ft</span></div>
      <div class="detail-row"><span>Grade</span><span class="detail-value">${gradeLabel}</span></div>
      <div class="detail-row"><span>Target Pace</span><span class="detail-value">${paceText}${effortVal ? ` <span style="margin-left:4px;color:${effortColor(effortVal)};font-size:11px;">${effortVal}/10</span>` : ""}</span></div>
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
          ctx.fillStyle = effortColor(split.effort) + "18"; // very transparent
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
        datasets: [{ data, borderColor: "#334264", backgroundColor: createGradient(ctx), fill: true, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: "#334264", tension: 0.3 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#ffffff", borderColor: "#e2e5e9", borderWidth: 1,
            titleFont: { family: "Inter", size: 12, weight: "600" }, bodyFont: { family: "Inter", size: 11 },
            titleColor: "#1a1a2e", bodyColor: "#6b7280", padding: 10, cornerRadius: 6,
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
            title: { display: true, text: "Miles", color: "#6b7280", font: { family: "Inter", size: 11 } },
            grid: { color: "rgba(0, 0, 0, 0.06)" },
            ticks: { color: "#6b7280", font: { family: "Inter", size: 10 }, callback: (val, idx) => { const m = labels[idx]; const step = course.distance > 20 ? 5 : 2; return m % step === 0 ? m : ""; }, maxTicksLimit: 20 },
          },
          y: {
            title: { display: true, text: "Elevation (ft)", color: "#6b7280", font: { family: "Inter", size: 11 } },
            grid: { color: "rgba(0, 0, 0, 0.06)" },
            ticks: { color: "#6b7280", font: { family: "Inter", size: 10 } }, min: 0,
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
    g.addColorStop(0, "rgba(51, 66, 100, 0.2)"); g.addColorStop(1, "rgba(51, 66, 100, 0.02)");
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

  function generateSplits(goalSeconds, strategy, startApproach, elevAdjusted) {
    const totalMiles = Math.ceil(course.distance);
    const lastMileFraction = course.distance - Math.floor(course.distance);
    const avgPace = goalSeconds / course.distance; // seconds per mile
    const halfDist = course.distance / 2;

    const splits = [];
    let cumTime = 0;

    for (let m = 1; m <= totalMiles; m++) {
      const isLast = m === totalMiles;
      const mileLength = isLast && lastMileFraction > 0.01 ? lastMileFraction : 1;

      // 1) Elevation adjustment (optional)
      const elevChange = getElevChangeForMile(m);
      const elevAdj = elevAdjusted !== false ? (elevChange / 50) * 5 : 0; // ~5s per 50ft gain

      // 2) Apply strategy modifier (split approach for first vs second half)
      let strategyAdj = 0;
      if (strategy === "negative") {
        strategyAdj = m <= halfDist ? 5 : -5;
      } else if (strategy === "aggressive-negative") {
        strategyAdj = m <= halfDist ? 10 : -10;
      } else if (strategy === "positive") {
        strategyAdj = m <= halfDist ? -5 : 5;
      } else if (strategy === "aggressive-positive") {
        strategyAdj = m <= halfDist ? -10 : 10;
      }
      // "even" = 0

      // 3) Apply start approach modifier (first 3-5 miles)
      let startAdj = 0;
      if (startApproach === "conservative") {
        if (m <= 3) startAdj = 8;
        else if (m <= 5) startAdj = 4;
      } else if (startApproach === "very-conservative") {
        if (m <= 3) startAdj = 15;
        else if (m <= 6) startAdj = 8;
        else if (m <= 8) startAdj = 3;
      }
      // "even-start" = 0

      let pace = avgPace + elevAdj + strategyAdj + startAdj;
      // Don't let pace go below 60% of avg (safety floor)
      pace = Math.max(pace, avgPace * 0.6);

      // Auto-assign effort 0-10 based on pace vs average
      // 5/10 = average pace needed to hit goal time
      let effort = 5;
      const pctDiff = ((pace - avgPace) / avgPace) * 100;
      if (pctDiff < -4) effort = 9;
      else if (pctDiff < -2.5) effort = 8;
      else if (pctDiff < -1.5) effort = 7;
      else if (pctDiff < -0.5) effort = 6;
      else if (pctDiff <= 0.5) effort = 5;  // average pace = 5/10
      else if (pctDiff < 1.5) effort = 4;
      else if (pctDiff < 2.5) effort = 3;
      else effort = 2;

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

  // Walk/Run calculation helpers
  function parsePaceInput(str) {
    if (!str) return 0;
    const raw = str.replace("/mi", "").trim();
    if (raw.includes(":")) {
      const p = raw.split(":").map(Number);
      return p.length === 2 && !isNaN(p[0]) && !isNaN(p[1]) ? p[0] * 60 + p[1] : 0;
    }
    const n = parseInt(raw);
    if (isNaN(n)) return 0;
    if (n < 20) return n * 60;
    if (n >= 100) { const m = Math.floor(n/100), s = n%100; return s < 60 ? m*60+s : 0; }
    return n * 60;
  }

  function calcWalkRunFromDurations(goalSeconds, runMinPerCycle, walkMinPerCycle, distance) {
    // Given: run X min, walk Y min per cycle, and a goal finish time
    // Calculate: what run pace and walk pace are needed
    const goalPacePerMile = goalSeconds / distance; // seconds per mile needed
    const cycleMin = runMinPerCycle + walkMinPerCycle;
    const runFraction = runMinPerCycle / cycleMin;
    const walkFraction = walkMinPerCycle / cycleMin;

    // Assume walk pace is ~2.5x run pace (typical ratio)
    // goalPace = runFraction * runPace + walkFraction * walkPace
    // walkPace = runPace * 2.5 (reasonable assumption)
    // goalPace = runFraction * runPace + walkFraction * runPace * 2.5
    // goalPace = runPace * (runFraction + walkFraction * 2.5)
    // runPace = goalPace / (runFraction + walkFraction * 2.5)
    const walkRatio = 2.5;
    const runPaceSec = goalPacePerMile / (runFraction + walkFraction * walkRatio);
    const walkPaceSec = runPaceSec * walkRatio;

    if (runPaceSec < 180 || runPaceSec > 1200 || walkPaceSec > 2400) return null; // sanity check

    return {
      runPace: Math.round(runPaceSec),
      walkPace: Math.round(walkPaceSec),
      runPaceStr: secondsToPace(runPaceSec),
      walkPaceStr: secondsToPace(walkPaceSec),
      avgPaceStr: secondsToPace(goalPacePerMile),
      runFraction: Math.round(runFraction * 100),
      walkFraction: Math.round(walkFraction * 100),
      runMinPerCycle: runMinPerCycle,
      walkMinPerCycle: walkMinPerCycle,
    };
  }

  function calcWalkRunIntervals(goalSeconds, runPaceSec, walkPaceSec, distance) {
    // Goal avg pace per mile
    const goalPacePerMile = goalSeconds / distance;
    // Solve: runFraction * runPace + (1 - runFraction) * walkPace = goalPace
    // runFraction = (goalPace - walkPace) / (runPace - walkPace)
    if (runPaceSec >= walkPaceSec) return null; // run must be faster than walk
    const runFraction = (goalPacePerMile - walkPaceSec) / (runPaceSec - walkPaceSec);

    if (runFraction < 0 || runFraction > 1) return null; // impossible to achieve goal

    const runMinutes = runFraction; // fraction of each mile running
    const walkMinutes = 1 - runFraction;

    // Common interval: per mile, how many minutes running vs walking
    const runTimePerMile = runFraction * runPaceSec;
    const walkTimePerMile = walkMinutes * walkPaceSec;

    return {
      runPace: runPaceSec,
      walkPace: walkPaceSec,
      runFraction: Math.round(runFraction * 100),
      walkFraction: Math.round(walkMinutes * 100),
      runSecsPerMile: Math.round(runTimePerMile),
      walkSecsPerMile: Math.round(walkTimePerMile),
      avgPace: secondsToPace(goalPacePerMile),
    };
  }

  function initPacePlanner() {
    const paceModal = document.getElementById("pace-modal-overlay");

    function prefillModal() {
      if (pacePlan.goalTime) {
        document.getElementById("goal-time").value = secondsToTime(pacePlan.goalTime);
        document.getElementById("pace-strategy").value = pacePlan.strategy;
        document.getElementById("start-approach").value = pacePlan.startApproach || "even-start";
        document.getElementById("elev-adjust").checked = pacePlan.elevAdjusted !== false;
      }
    }

    document.getElementById("btn-pace-planner").addEventListener("click", () => { prefillModal(); paceModal.style.display = "flex"; });
    document.getElementById("btn-edit-pace").addEventListener("click", () => { prefillModal(); paceModal.style.display = "flex"; });
    document.getElementById("pace-cancel").addEventListener("click", () => { paceModal.style.display = "none"; });
    document.getElementById("pace-clear-all").addEventListener("click", () => {
      document.getElementById("goal-time").value = "";
      document.getElementById("pace-strategy").value = "even";
      document.getElementById("start-approach").value = "even-start";
      document.getElementById("elev-adjust").checked = true;
      document.getElementById("race-start-time").value = "08:00";
      pacePlan.goalTime = null;
      pacePlan.strategy = "even";
      pacePlan.startApproach = "even-start";
      pacePlan.elevAdjusted = true;
      pacePlan.walkRun = null;
      pacePlan.splits = [];
      savePacePlan();
      renderSplitsTable();
      updatePaceSummary();
      if (elevationChart) elevationChart.update("none");
      paceModal.style.display = "none";
    });
    paceModal.addEventListener("click", (e) => { if (e.target === paceModal) paceModal.style.display = "none"; });

    document.getElementById("pace-generate").addEventListener("click", () => {
      const goalSeconds = parseTimeToSeconds(document.getElementById("goal-time").value);
      if (!goalSeconds || goalSeconds < 60) { alert("Please enter a valid goal time (e.g. 3:30:00)"); return; }

      const strategy = document.getElementById("pace-strategy").value;
      const startApproach = document.getElementById("start-approach").value;
      const elevAdjusted = document.getElementById("elev-adjust").checked;
      const startTimeEl = document.getElementById("race-start-time");

      pacePlan.goalTime = goalSeconds;
      pacePlan.strategy = strategy;
      pacePlan.startApproach = startApproach;
      pacePlan.elevAdjusted = elevAdjusted;
      pacePlan.startTime = startTimeEl ? startTimeEl.value : null;
      pacePlan.splits = generateSplits(goalSeconds, strategy, startApproach, elevAdjusted);

      savePacePlan();
      renderSplitsTable();
      updatePaceSummary();
      if (elevationChart) elevationChart.update("none");
      updateRunnerInfo(runnerMile);
      switchTab("splits");
      paceModal.style.display = "none";
    });
  }

  function updatePaceSummary() {
    const el = document.getElementById("pace-summary");
    if (!pacePlan.goalTime) { el.style.display = "none"; return; }
    el.style.display = "block";
    const stratLabel = { even: "Even", negative: "Negative", "aggressive-negative": "Agg. Negative", positive: "Positive", "aggressive-positive": "Agg. Positive" }[pacePlan.strategy] || pacePlan.strategy;
    const startLabel = { "even-start": "Even Start", conservative: "Conservative Start", "very-conservative": "Very Conservative" }[pacePlan.startApproach] || "";
    const elevLabel = pacePlan.elevAdjusted !== false ? "Elev-Adjusted" : "Flat Pacing";
    const wrLabel = pacePlan.walkRun ? ` · Walk/Run (${pacePlan.walkRun.runMinPerCycle}min run / ${pacePlan.walkRun.walkMinPerCycle}min walk)` : "";
    document.getElementById("pace-goal-label").textContent =
      `Goal: ${secondsToTime(pacePlan.goalTime)} · ${stratLabel}${startLabel ? " · " + startLabel : ""} · Avg ${secondsToPace(pacePlan.goalTime / course.distance)}/mi · ${elevLabel}${wrLabel}`;
  }

  // ─── Splits Table ─────────────────────────────────────────────

  function renderSplitsTable() {
    const tbody = document.getElementById("splits-table-body");
    const isAdvanced = (() => { try { const u = JSON.parse(localStorage.getItem("runwell-user")); return u && (u.plan === "advanced" || u.plan === "pro" || u.plan === "coach"); } catch { return false; } })();
    const isCoachPlan = (() => { try { const u = JSON.parse(localStorage.getItem("runwell-user")); return u && u.plan === "coach"; } catch { return false; } })();
    const hasStartTime = pacePlan.startTime && isAdvanced;

    const hasWalkRun = pacePlan.walkRun && pacePlan.walkRun.runPaceStr;

    // Show/hide time-of-day column
    document.querySelectorAll(".tod-col").forEach((el) => { el.style.display = hasStartTime ? "" : "none"; });
    // Show/hide effort column (Coach only)
    document.querySelectorAll(".effort-col").forEach((el) => { el.classList.toggle("show", isCoachPlan); });
    // Show/hide walk/run columns (headers and filter labels)
    document.querySelectorAll(".col-runpace").forEach((el) => {
      if (el.tagName === "TH" || el.closest("#col-filter-bar")) el.style.display = hasWalkRun ? "" : "none";
    });
    document.querySelectorAll(".col-walkpace").forEach((el) => {
      if (el.tagName === "TH" || el.closest("#col-filter-bar")) el.style.display = hasWalkRun ? "" : "none";
    });

    if (pacePlan.splits.length === 0) {
      const colCount = 5 + (isCoachPlan ? 1 : 0) + (hasStartTime ? 1 : 0);
      tbody.innerHTML = `<tr><td colspan="${colCount}" style="padding:16px;">
        <div style="max-width:380px;margin:0 auto;">
          <div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:12px;text-align:center;">Set Your Race Plan</div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <label style="font-size:11px;font-weight:600;color:var(--text-muted);display:flex;flex-direction:column;gap:4px;">Goal Finish Time
              <input type="text" id="inline-goal-time" placeholder="e.g. 3:30:00" style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-pill);font-size:14px;font-family:inherit;outline:none;text-align:center;" />
            </label>
            <label style="font-size:11px;font-weight:600;color:var(--text-muted);display:flex;flex-direction:column;gap:4px;">Race Strategy
              <select id="inline-strategy" style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-pill);font-size:13px;font-family:inherit;outline:none;">
                <option value="even">Even Pacing</option>
                <option value="negative">Negative Split</option>
                <option value="aggressive-negative">Aggressive Negative Split</option>
                <option value="positive">Positive Split</option>
                <option value="aggressive-positive">Aggressive Positive Split</option>
              </select>
            </label>
            <label style="font-size:11px;font-weight:600;color:var(--text-muted);display:flex;flex-direction:column;gap:4px;">Start Approach
              <select id="inline-start-approach" style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-pill);font-size:13px;font-family:inherit;outline:none;">
                <option value="even-start">Evenly Paced Start</option>
                <option value="conservative">Conservative Start</option>
                <option value="very-conservative">Very Conservative Start</option>
              </select>
            </label>
            <button id="inline-generate" style="padding:10px;background:var(--primary);color:#fff;border:none;border-radius:var(--radius-pill);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;margin-top:4px;">Generate Splits</button>
          </div>
        </div>
      </td></tr>`;

      // Wire up the inline generate button
      const inlineBtn = document.getElementById("inline-generate");
      if (inlineBtn) {
        inlineBtn.addEventListener("click", () => {
          const goalSeconds = parseTimeToSeconds(document.getElementById("inline-goal-time").value);
          if (!goalSeconds || goalSeconds < 60) { alert("Please enter a valid goal time (e.g. 3:30:00)"); return; }
          const strategy = document.getElementById("inline-strategy").value;
          const startApproach = document.getElementById("inline-start-approach").value;

          pacePlan.goalTime = goalSeconds;
          pacePlan.strategy = strategy;
          pacePlan.startApproach = startApproach;
          pacePlan.elevAdjusted = true;
          pacePlan.startTime = "08:00";
          pacePlan.splits = generateSplits(goalSeconds, strategy, startApproach, true);
          savePacePlan();
          renderSplitsTable();
          updatePaceSummary();
          if (elevationChart) elevationChart.update("none");
          updateRunnerInfo(runnerMile);
          switchTab("splits");
        });
      }
      return;
    }

    // Parse start time for time-of-day calculation
    let startSeconds = 0;
    if (hasStartTime) {
      const parts = pacePlan.startTime.split(":").map(Number);
      startSeconds = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60;
    }

    tbody.innerHTML = pacePlan.splits.map((s, i) => {
      const elevChange = getElevChangeForMile(s.mile);
      const elevIcon = elevChange > 20 ? "↑" : elevChange < -20 ? "↓" : "-";
      const elevColor = elevChange > 20 ? "var(--accent-red)" : elevChange < -20 ? "var(--accent-green)" : "var(--text-muted)";
      const mileLabel = s.mileLength < 1 ? `${s.mile - 1}→${course.distance.toFixed(1)}` : s.mile;

      // Time of day
      let todCell = "";
      if (hasStartTime) {
        const todSec = startSeconds + s.cumTime;
        const todH = Math.floor(todSec / 3600) % 24;
        const todM = Math.floor((todSec % 3600) / 60);
        const ampm = todH >= 12 ? "PM" : "AM";
        const h12 = todH % 12 || 12;
        todCell = `<td class="tod-col" style="color:var(--navy);font-size:11px;font-weight:600;">${h12}:${String(todM).padStart(2, "0")} ${ampm}</td>`;
      }

      return `<tr data-mile="${s.mile}" class="${Math.floor(runnerMile) + 1 === s.mile ? 'active-row' : ''}">
        <td>${mileLabel}</td>
        <td class="col-elev" style="color:${elevColor}">${elevIcon} ${Math.abs(Math.round(elevChange))}′</td>
        <td class="col-pace">
          <div class="pace-cell">
            <input type="text" value="${s.pace}" data-idx="${i}" class="split-pace-input" />
          </div>
        </td>
        <td class="col-runpace" style="font-size:11px;color:var(--navy);font-weight:600;${hasWalkRun ? '' : 'display:none;'}">${hasWalkRun ? pacePlan.walkRun.runPaceStr + '/mi' : ''}</td>
        <td class="col-walkpace" style="font-size:11px;color:var(--text-muted);${hasWalkRun ? '' : 'display:none;'}">${hasWalkRun ? pacePlan.walkRun.walkPaceStr + '/mi' : ''}</td>
        <td class="effort-col col-effort${isCoachPlan ? ' show' : ''}" style="text-align:center;">
          <input type="number" class="effort-input" data-idx="${i}" min="1" max="10" value="${s.effort || 5}" style="width:40px;background:transparent;border:1px solid var(--border);color:${effortColor(s.effort)};font-size:12px;font-family:inherit;text-align:center;border-radius:4px;padding:2px;outline:none;" />
        </td>
        <td class="col-cumul" style="color:var(--text-muted);font-size:11px;">${secondsToTime(s.cumTime)}</td>
        ${todCell}
        <td class="col-fuel" style="text-align:center;">
          <button class="fuel-toggle" data-mile="${s.mile}" title="${fuelMiles.has(s.mile) ? 'Remove fuel stop' : 'Add fuel stop'}" style="width:28px;height:28px;border-radius:50%;border:1.5px solid ${fuelMiles.has(s.mile) ? 'var(--primary)' : 'var(--border)'};background:${fuelMiles.has(s.mile) ? 'rgba(65,174,159,0.1)' : 'transparent'};cursor:pointer;font-size:${fuelMiles.has(s.mile) ? '16px' : '14px'};line-height:1;color:${fuelMiles.has(s.mile) ? 'var(--primary)' : 'var(--text-muted)'};transition:all 0.15s;padding:0;">${fuelMiles.has(s.mile) ? '🍊' : '+'}</button>
        </td>
      </tr>`;
    }).join("");

    // Pace edit handlers
    tbody.querySelectorAll(".split-pace-input").forEach((input) => {
      input.addEventListener("change", (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const raw = e.target.value.trim();
        let newPace = null;

        if (raw.includes(":")) {
          // Format: M:SS or MM:SS
          const parts = raw.split(":").map(Number);
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            newPace = parts[0] * 60 + parts[1];
          }
        } else {
          // No colon - interpret as minutes (e.g. "8" → 8:00, "730" → 7:30, "815" → 8:15)
          const num = parseInt(raw);
          if (!isNaN(num)) {
            if (num < 20) {
              // Single or double digit: treat as whole minutes (e.g. 8 → 8:00)
              newPace = num * 60;
            } else if (num >= 100) {
              // 3+ digits: first digit(s) = minutes, last two = seconds (e.g. 730 → 7:30, 815 → 8:15)
              const mins = Math.floor(num / 100);
              const secs = num % 100;
              if (secs < 60) newPace = mins * 60 + secs;
            } else {
              // 20-99: treat as minutes + 0 seconds (e.g. 45 → 45:00... unlikely, but safe)
              newPace = num * 60;
            }
          }
        }

        if (newPace && newPace > 0) {
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

    // Effort edit handlers (0-10) - adjusts pace relative to effort
    // Effort 5 = average goal pace, each point = ~2% pace change
    tbody.querySelectorAll(".effort-input").forEach((input) => {
      input.addEventListener("change", (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const val = Math.max(1, Math.min(10, parseInt(e.target.value) || 5));
        const split = pacePlan.splits[idx];
        const avgPace = pacePlan.goalTime / course.distance;

        // Map effort to pace: 5 = avgPace, higher effort = faster, lower = slower
        // Each effort point shifts pace by ~2% of average
        const effortDiff = val - 5;
        const newPace = avgPace * (1 - effortDiff * 0.02);

        split.effort = val;
        split.paceSeconds = Math.max(newPace, avgPace * 0.6);
        split.pace = secondsToPace(split.paceSeconds);
        recalcCumulativeTimes();
        savePacePlan();
        renderSplitsTable();
        if (elevationChart) elevationChart.update("none");
        updateRunnerInfo(runnerMile);
      });
    });

    // Fuel toggle handlers
    tbody.querySelectorAll(".fuel-toggle").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const mile = parseInt(btn.dataset.mile);
        if (fuelMiles.has(mile)) {
          fuelMiles.delete(mile);
        } else {
          fuelMiles.add(mile);
        }
        saveFuelMiles();
        renderFuelMapMarkers();
        renderSplitsTable();
      });
    });

    // Click row to navigate
    tbody.querySelectorAll("tr[data-mile]").forEach((tr) => {
      tr.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "BUTTON") return;
        const mile = parseFloat(tr.dataset.mile) - 0.5;
        placeRunner(mile);
        map.panTo(getMilePosition(mile));
      });
    });

    updateFinishTime();

    // Re-apply column checkbox visibility to new th and td cells
    document.querySelectorAll(".col-check").forEach(function(cb) {
      if (!cb.checked) {
        var col = cb.dataset.col;
        document.querySelectorAll(".col-" + col).forEach(function(el) {
          if (el.closest("#col-filter-bar")) return;
          el.classList.add("col-hidden");
          el.style.display = "none";
        });
      }
    });
  }

  // ─── KM Splits View ──────────────────────────────────────────

  const MI_TO_KM = 1.60934;

  function renderKmSplits() {
    const tbody = document.getElementById("km-splits-body");
    if (!tbody || pacePlan.splits.length === 0) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;font-size:13px;">Generate a pace plan first to see KM splits.</td></tr>';
      return;
    }

    const totalKm = course.distance * MI_TO_KM;
    const totalKmCeil = Math.ceil(totalKm);

    let rows = [];
    let cumTime = 0;

    for (let km = 1; km <= totalKmCeil; km++) {
      const isLast = km === totalKmCeil;
      const kmLength = isLast ? (totalKm - Math.floor(totalKm)) || 1 : 1;

      const mileAtKm = km / MI_TO_KM;
      const mileIdx = Math.min(Math.ceil(mileAtKm), pacePlan.splits.length) - 1;
      const split = pacePlan.splits[mileIdx] || pacePlan.splits[pacePlan.splits.length - 1];

      const pacePerKm = split.paceSeconds / MI_TO_KM;
      const splitTime = pacePerKm * kmLength;
      cumTime += splitTime;

      const elevChange = getElevChangeForMile(Math.ceil(mileAtKm)) / MI_TO_KM;
      const elevIcon = elevChange > 12 ? "↑" : elevChange < -12 ? "↓" : "-";
      const elevColor = elevChange > 12 ? "var(--accent-red)" : elevChange < -12 ? "var(--accent-green)" : "var(--text-muted)";

      const kmLabel = isLast && kmLength < 1 ? `${km - 1}→${totalKm.toFixed(1)}` : km;
      const hasFuel = fuelMiles.has(Math.ceil(mileAtKm));

      rows.push(`<tr data-km="${km}">
        <td>${kmLabel}</td>
        <td style="color:${elevColor}">${elevIcon} ${Math.abs(Math.round(elevChange))}′</td>
        <td>
          <div class="pace-cell">
            <input type="text" value="${secondsToPace(pacePerKm)}" data-km="${km}" class="km-pace-input" style="width:52px;" />
          </div>
        </td>
        <td style="color:var(--text-muted);font-size:11px;">${secondsToTime(cumTime)}</td>
        <td style="text-align:center;">
          <button class="km-fuel-toggle" data-mile="${Math.ceil(mileAtKm)}" title="${hasFuel ? 'Remove fuel stop' : 'Add fuel stop'}" style="width:28px;height:28px;border-radius:50%;border:1.5px solid ${hasFuel ? 'var(--primary)' : 'var(--border)'};background:${hasFuel ? 'rgba(65,174,159,0.1)' : 'transparent'};cursor:pointer;font-size:${hasFuel ? '16px' : '14px'};line-height:1;color:${hasFuel ? 'var(--primary)' : 'var(--text-muted)'};transition:all 0.15s;padding:0;">${hasFuel ? '🍊' : '+'}</button>
        </td>
      </tr>`);
    }

    tbody.innerHTML = rows.join("");

    // Pace edit handlers (km view)
    tbody.querySelectorAll(".km-pace-input").forEach(function(input) {
      input.addEventListener("change", function(e) {
        const km = parseInt(e.target.dataset.km);
        const raw = e.target.value.trim();
        let newPaceKm = null;

        if (raw.includes(":")) {
          const p = raw.split(":").map(Number);
          if (p.length === 2 && !isNaN(p[0]) && !isNaN(p[1])) newPaceKm = p[0] * 60 + p[1];
        } else {
          const n = parseInt(raw);
          if (!isNaN(n)) {
            if (n < 20) newPaceKm = n * 60;
            else if (n >= 100) { const m = Math.floor(n/100), s = n%100; if (s < 60) newPaceKm = m*60+s; }
            else newPaceKm = n * 60;
          }
        }

        if (newPaceKm && newPaceKm > 0) {
          // Convert /km pace back to /mi pace and update the corresponding mile split
          const newPaceMi = newPaceKm * MI_TO_KM;
          const mileAtKm = km / MI_TO_KM;
          const mileIdx = Math.min(Math.ceil(mileAtKm), pacePlan.splits.length) - 1;
          pacePlan.splits[mileIdx].paceSeconds = newPaceMi;
          pacePlan.splits[mileIdx].pace = secondsToPace(newPaceMi);
          recalcCumulativeTimes();
          savePacePlan();
          renderKmSplits();
          if (elevationChart) elevationChart.update("none");
          updateRunnerInfo(runnerMile);
        }
      });
    });

    // Fuel toggle handlers (km view)
    tbody.querySelectorAll(".km-fuel-toggle").forEach(function(btn) {
      btn.addEventListener("click", function(e) {
        e.stopPropagation();
        const mile = parseInt(btn.dataset.mile);
        if (fuelMiles.has(mile)) fuelMiles.delete(mile);
        else fuelMiles.add(mile);
        saveFuelMiles();
        renderFuelMapMarkers();
        renderKmSplits();
      });
    });

    // Click row to navigate
    tbody.querySelectorAll("tr[data-km]").forEach(function(tr) {
      tr.addEventListener("click", function(e) {
        if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
        const km = parseInt(tr.dataset.km);
        const mile = km / MI_TO_KM;
        placeRunner(mile - 0.3);
        map.panTo(getMilePosition(mile - 0.3));
      });
    });
  }

  function updateFinishTime() {
    const bar = document.getElementById("finish-time-bar");
    const val = document.getElementById("finish-time-value");
    if (!bar || !val) return;
    if (pacePlan.splits.length === 0) { bar.style.display = "none"; return; }
    const lastSplit = pacePlan.splits[pacePlan.splits.length - 1];
    bar.style.display = "";
    val.textContent = secondsToTime(lastSplit.cumTime);
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
    if (!list) return;
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
          <div class="split-label">${item.label}${item.effort ? ` <span style="background:${effortColor(item.effort)}22;color:${effortColor(item.effort)};padding:1px 6px;border-radius:10px;font-size:10px;font-weight:700;">${item.effort}/10</span>` : ""}</div>
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
    renderReviews();
  }

  // ─── Reviews (free feature) ───────────────────────────────────

  let reviews = [];

  function getReviewsKey() { return `runwell-reviews-${getRaceId()}`; } // Reviews are shared, not per-athlete

  function loadReviews() {
    try { reviews = JSON.parse(localStorage.getItem(getReviewsKey()) || "[]"); } catch { reviews = []; }
  }

  function saveReviews() {
    localStorage.setItem(getReviewsKey(), JSON.stringify(reviews));
  }

  function renderReviews() {
    const list = document.getElementById("reviews-container");
    if (!list) return;
    // Remove old reviews section if exists
    const oldSection = list.querySelector(".reviews-section");
    if (oldSection) oldSection.remove();

    const section = document.createElement("div");
    section.className = "reviews-section";

    section.innerHTML = `
      <div class="reviews-header">
        <h4>Course Reviews</h4>
        <span class="review-count">${reviews.length} review${reviews.length !== 1 ? "s" : ""}</span>
      </div>
      <div class="review-input-row">
        <div class="star-rating" id="star-rating">
          <span data-val="1">&#9733;</span>
          <span data-val="2">&#9733;</span>
          <span data-val="3">&#9733;</span>
          <span data-val="4">&#9733;</span>
          <span data-val="5">&#9733;</span>
        </div>
        <input class="review-input" id="review-input" placeholder="Share your thoughts on this course..." />
        <button class="review-submit" id="review-submit">Post</button>
      </div>
      <div class="review-list" id="review-list">
        ${reviews.length === 0
          ? '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:12px;">No reviews yet. Be the first!</div>'
          : reviews.slice().reverse().map((r) => `
            <div class="review-item">
              <div class="review-item-header">
                <span class="review-author">${r.author}</span>
                <span class="review-date">${r.date}</span>
                <span class="review-stars">${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)}</span>
              </div>
              <div class="review-text">${r.text}</div>
            </div>
          `).join("")
        }
      </div>
    `;

    list.appendChild(section);

    // Star rating interaction
    let selectedStars = 0;
    const starEls = section.querySelectorAll("#star-rating span");
    starEls.forEach((star) => {
      star.addEventListener("mouseenter", () => {
        const val = parseInt(star.dataset.val);
        starEls.forEach((s) => s.classList.toggle("active", parseInt(s.dataset.val) <= val));
      });
      star.addEventListener("click", () => {
        selectedStars = parseInt(star.dataset.val);
      });
    });
    section.querySelector("#star-rating").addEventListener("mouseleave", () => {
      starEls.forEach((s) => s.classList.toggle("active", parseInt(s.dataset.val) <= selectedStars));
    });

    // Submit review
    section.querySelector("#review-submit").addEventListener("click", () => {
      const text = section.querySelector("#review-input").value.trim();
      if (!text) return;
      const user = (() => { try { return JSON.parse(localStorage.getItem("runwell-user")); } catch { return null; } })();
      reviews.push({
        author: user ? user.name : "Anonymous",
        date: new Date().toLocaleDateString(),
        stars: selectedStars || 5,
        text,
      });
      saveReviews();
      renderReviews();
    });
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

  function getAthletePrefix() { return window._runwellAthletePrefix || ""; }
  function getStorageKey() { return `runwell-${getAthletePrefix()}markers-${getRaceId()}`; }
  function getPaceStorageKey() { return `runwell-${getAthletePrefix()}pace-${activeGoal === "B" ? "B-" : ""}${getRaceId()}`; }
  function getFuelKey() { return `runwell-${getAthletePrefix()}fuel-${getRaceId()}`; }

  function saveFuelMiles() {
    localStorage.setItem(getFuelKey(), JSON.stringify([...fuelMiles]));
  }

  function loadFuelMiles() {
    try { fuelMiles = new Set(JSON.parse(localStorage.getItem(getFuelKey()) || "[]")); } catch { fuelMiles = new Set(); }
  }

  function renderFuelMapMarkers() {
    // Remove old markers
    Object.values(fuelMapMarkers).forEach(m => map.removeLayer(m));
    fuelMapMarkers = {};
    // Add markers for each fuel mile
    fuelMiles.forEach(mile => {
      const pos = getMilePosition(mile - 0.5);
      if (!pos) return;
      const icon = L.divIcon({
        html: '<div style="font-size:20px;text-align:center;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3));">🍊</div>',
        className: "",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      fuelMapMarkers[mile] = L.marker(pos, { icon, interactive: false, zIndexOffset: 500 }).addTo(map);
    });
  }

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
        pacePlan.startApproach = saved.startApproach || "even-start";
        pacePlan.elevAdjusted = saved.elevAdjusted;
        // Recalculate cumulative times
        let cum = 0;
        pacePlan.splits = saved.splits.map((s) => {
          const splitTime = s.paceSeconds * s.mileLength;
          cum += splitTime;
          return { ...s, splitTime, cumTime: cum };
        });
      } else {
        // No saved plan for this goal - reset
        pacePlan.goalTime = null;
        pacePlan.strategy = "even";
        pacePlan.startApproach = "even-start";
        pacePlan.splits = [];
      }
    } catch (e) {
      pacePlan.goalTime = null;
      pacePlan.strategy = "even";
      pacePlan.startApproach = "even-start";
      pacePlan.splits = [];
    }
  }

  // ─── Modals ───────────────────────────────────────────────────

  function initModals() {
    const modal = document.getElementById("modal-overlay");

    const addMarkerBtn = document.getElementById("btn-add-marker");
    if (addMarkerBtn) addMarkerBtn.addEventListener("click", () => {
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

    // Export (Advanced / Coach only)
    document.getElementById("btn-export").addEventListener("click", () => {
      if (typeof requirePro === "function") {
        requirePro(() => exportPlan());
      } else {
        exportPlan();
      }
    });

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
    const btn = document.getElementById("btn-export");
    btn.textContent = "Generating…";
    btn.disabled = true;

    // Capture elevation chart
    const elevImg = document.getElementById("elevation-chart").toDataURL("image/png", 1.0);

    // Capture the Leaflet map container as an image
    const mapContainer = document.getElementById("map");
    const mapCanvas = document.createElement("canvas");
    const rect = mapContainer.getBoundingClientRect();
    mapCanvas.width = rect.width * 2;
    mapCanvas.height = rect.height * 2;
    const ctx = mapCanvas.getContext("2d");
    ctx.scale(2, 2);

    // Use html2canvas on just the map div
    const doExport = (mapDataUrl) => {
      const freeNotes = document.getElementById("race-notes-freetext")?.value || "";
      const html = buildExportHTML(mapDataUrl, elevImg, freeNotes);
      const w = window.open("", "_blank");
      if (!w) { alert("Please allow popups to export."); btn.textContent = "Export Plan"; btn.disabled = false; return; }
      w.document.write(html);
      w.document.close();
      btn.textContent = "Export Plan";
      btn.disabled = false;
    };

    // Fit map to route bounds before capture, wait for tiles to load
    map.fitBounds(routeLine.getBounds().pad(0.05));
    map.invalidateSize();

    const captureMap = () => {
      // Wait a beat for tiles to render after fitBounds
      setTimeout(() => {
        html2canvas(mapContainer, {
          useCORS: true,
          allowTaint: true,
          scale: 2,
          logging: false,
          backgroundColor: "#ffffff",
        }).then(c => doExport(c.toDataURL("image/png"))).catch(() => doExport(null));
      }, 800);
    };

    if (typeof html2canvas !== "undefined") {
      captureMap();
    } else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      s.onload = captureMap;
      s.onerror = () => doExport(null);
      document.head.appendChild(s);
    }
  }

  function buildExportHTML(mapImg, elevImg, freeNotes) {
    const raceName = course.name || "Race Plan";
    const dist = course.distance.toFixed(2);
    const goalStr = pacePlan.goalTime ? secondsToTime(pacePlan.goalTime) : "-";
    const stratStr = pacePlan.strategy || "-";
    const avgPace = pacePlan.goalTime ? secondsToPace(pacePlan.goalTime / course.distance) + "/mi" : "-";
    const elevGain = Math.round(course.elevation.reduce((sum, p, i, arr) => i === 0 ? 0 : sum + Math.max(0, p.elev - arr[i - 1].elev), 0));
    const elevLoss = Math.round(course.elevation.reduce((sum, p, i, arr) => i === 0 ? 0 : sum + Math.max(0, arr[i - 1].elev - p.elev), 0));

    const icons = { nutrition: "🍊", water: "💧", pace: "⏱", note: "📝", effort: "💪" };
    const fuelStops = [...fuelMiles].sort((a, b) => a - b);
    const allNotes = [...customMarkers].sort((a, b) => a.mile - b.mile);

    // Build splits rows
    let splitsHTML = "";
    if (pacePlan.splits.length > 0) {
      pacePlan.splits.forEach((s) => {
        const elevChange = getElevChangeForMile(s.mile);
        const elevIcon = elevChange > 20 ? "↑" : elevChange < -20 ? "↓" : "-";
        const elevColor = elevChange > 20 ? "#ef4444" : elevChange < -20 ? "#41AE9F" : "#6b7280";
        const mileLabel = s.mileLength < 1 ? `${s.mile - 1}→${course.distance.toFixed(1)}` : s.mile;
        // Check if there's a fuel stop at this mile
        const hasFuel = fuelMiles.has(s.mile);
        const fuelIcons = hasFuel ? '🍊' : '';
        splitsHTML += `<tr>
          <td>${mileLabel}</td>
          <td style="color:${elevColor}">${elevIcon}${Math.abs(Math.round(elevChange))}′</td>
          <td>${s.pace}</td>
          <td>${secondsToTime(s.cumTime)}</td>
          <td class="fuel-cell">${fuelIcons}</td>
        </tr>`;
      });
    }

    // Build notes section
    let notesHTML = "";
    if (allNotes.length > 0) {
      allNotes.forEach(cm => {
        notesHTML += `<div class="note-item">
          <span class="note-icon">${icons[cm.type] || "📌"}</span>
          <span class="note-mile">Mile ${cm.mile.toFixed(1)}</span>
          <span class="note-label">${cm.label}</span>
          ${cm.notes ? `<span class="note-detail">${cm.notes}</span>` : ""}
        </div>`;
      });
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${raceName} | Race Plan</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  @page { size: letter; margin: 0.5in; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    color: #1a1a2e;
    background: #fff;
    width: 7.5in;
    margin: 0 auto;
    padding: 0.25in 0;
  }
  @media print {
    body { width: auto; padding: 0; padding-top: 0 !important; }
    #print-bar { display: none !important; }
  }
  body { padding-top: 50px; }

  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid #41AE9F;
    padding-bottom: 12px;
    margin-bottom: 16px;
  }
  .header-left h1 {
    font-size: 22px;
    font-weight: 800;
    color: #334264;
    letter-spacing: -0.5px;
  }
  .header-left .subtitle {
    font-size: 11px;
    color: #6b7280;
    margin-top: 2px;
  }
  .header-right {
    text-align: right;
    font-size: 10px;
    color: #6b7280;
  }
  .brand {
    font-size: 12px;
    font-weight: 700;
    color: #41AE9F;
  }

  /* Stats bar */
  .stats-bar {
    display: flex;
    gap: 0;
    margin-bottom: 14px;
    border: 1px solid #e2e5e9;
    border-radius: 8px;
    overflow: hidden;
  }
  .stat {
    flex: 1;
    padding: 10px 12px;
    text-align: center;
    border-right: 1px solid #e2e5e9;
  }
  .stat:last-child { border-right: none; }
  .stat-label { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: #6b7280; }
  .stat-value { font-size: 16px; font-weight: 800; color: #334264; margin-top: 2px; }
  .stat-value small { font-size: 11px; font-weight: 500; color: #6b7280; }

  .section-title {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #6b7280;
    margin-bottom: 4px;
  }

  /* Map + splits overlay */
  .map-splits-row {
    display: flex;
    gap: 0;
    margin-bottom: 8px;
    border: 1px solid #e2e5e9;
    border-radius: 8px;
    overflow: hidden;
    min-height: 340px;
  }
  .map-col {
    flex: 1;
    position: relative;
    min-width: 0;
  }
  .map-col img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .splits-col {
    width: 230px;
    flex-shrink: 0;
    overflow-y: auto;
    background: #fff;
    border-left: 1px solid #e2e5e9;
  }

  /* Splits table - compact */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9px;
  }
  thead th {
    background: #334264;
    color: #fff;
    font-weight: 600;
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    padding: 3px 4px;
    text-align: left;
    position: sticky;
    top: 0;
  }
  tbody td {
    padding: 2px 4px;
    border-bottom: 1px solid #f0f2f4;
    white-space: nowrap;
  }
  tbody tr:nth-child(even) { background: #f8f9fa; }
  td.fuel-cell { font-size: 12px; text-align: center; }

  /* Elevation */
  .elevation-section { margin-bottom: 8px; }
  .elevation-img {
    width: 100%;
    height: auto;
    max-height: 100px;
    object-fit: contain;
    border: 1px solid #e2e5e9;
    border-radius: 6px;
  }

  /* Notes section */
  .notes-section { margin-bottom: 10px; }
  .note-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 0;
    border-bottom: 1px solid #f0f2f4;
    font-size: 10px;
  }
  .note-icon { font-size: 14px; flex-shrink: 0; }
  .note-mile { font-weight: 700; color: #334264; min-width: 48px; }
  .note-label { font-weight: 500; }
  .note-detail { color: #6b7280; font-style: italic; }

  /* Footer */
  .footer {
    margin-top: 10px;
    padding-top: 6px;
    border-top: 1px solid #e2e5e9;
    display: flex;
    justify-content: space-between;
    font-size: 8px;
    color: #6b7280;
  }

  /* Page break for notes */
  .notes-page { page-break-before: always; }
</style>
</head>
<body>

  <div class="header">
    <div class="header-left">
      <h1>${raceName}</h1>
      <div class="subtitle">${dist} miles &middot; ${stratStr} splits strategy</div>
    </div>
    <div class="header-right">
      <div class="brand">Interactive Race Strategies</div>
      <div>Powered by RunWell Clinic</div>
      <div>Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
    </div>
  </div>

  <div class="stats-bar">
    <div class="stat">
      <div class="stat-label">Goal Time</div>
      <div class="stat-value">${goalStr}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Avg Pace</div>
      <div class="stat-value">${avgPace}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Distance</div>
      <div class="stat-value">${dist} <small>mi</small></div>
    </div>
    <div class="stat">
      <div class="stat-label">Elev Gain</div>
      <div class="stat-value">▲${elevGain}′</div>
    </div>
    <div class="stat">
      <div class="stat-label">Elev Loss</div>
      <div class="stat-value">▼${elevLoss}′</div>
    </div>
    ${fuelStops.length > 0 ? `<div class="stat">
      <div class="stat-label">Fuel Stops</div>
      <div class="stat-value">${fuelStops.length}</div>
    </div>` : ""}
  </div>

  <div class="map-splits-row">
    <div class="map-col">
      ${mapImg ? `<img src="${mapImg}" alt="Course Map" />` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;background:#f8f9fa;color:#6b7280;font-size:12px;">Course Map</div>`}
    </div>
    ${splitsHTML ? `<div class="splits-col">
      <table>
        <thead>
          <tr><th>Mi</th><th>Elev</th><th>Pace</th><th>Time</th><th></th></tr>
        </thead>
        <tbody>${splitsHTML}</tbody>
      </table>
    </div>` : ""}
  </div>

  <div class="elevation-section">
    <div class="section-title">Elevation Profile</div>
    <img class="elevation-img" src="${elevImg}" alt="Elevation Profile" />
  </div>

  <div class="footer">
    <span>RunWell Clinic &middot; Interactive Race Strategies</span>
    <span>runwellclinic.com</span>
  </div>

  ${(notesHTML || freeNotes) ? `
  <div style="page-break-before:always;"></div>
  <div class="header" style="margin-top:0;">
    <div class="header-left">
      <h1>${raceName}</h1>
      <div class="subtitle">Race Notes</div>
    </div>
    <div class="header-right">
      <div class="brand">Interactive Race Strategies</div>
    </div>
  </div>
  ${notesHTML ? `<div class="notes-section">
    <div class="section-title">Course Markers</div>
    ${notesHTML}
  </div>` : ""}
  ${freeNotes ? `<div class="notes-section">
    <div class="section-title">Notes</div>
    <div style="font-size:12px;line-height:1.7;color:#1a1a2e;white-space:pre-wrap;border:1px solid #e2e5e9;border-radius:8px;padding:14px;background:#f8f9fa;">${freeNotes.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
  </div>` : ""}
  <div class="footer">
    <span>RunWell Clinic &middot; Interactive Race Strategies</span>
    <span>runwellclinic.com</span>
  </div>
  ` : ""}
  <div id="print-bar" style="position:fixed;top:0;left:0;right:0;background:#334264;color:#fff;text-align:center;padding:10px;font-size:14px;font-weight:600;z-index:9999;">
    <button onclick="window.print()" style="background:#41AE9F;color:#fff;border:none;padding:8px 24px;border-radius:20px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">Save as PDF</button>
    <span style="margin-left:12px;font-size:12px;opacity:0.8;">Use "Save as PDF" in the print dialog</span>
  </div>
</body>
</html>`;
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
    loadReviews();
    loadCustomMarkers();
    loadPacePlan();
    loadFuelMiles();
    renderFuelMapMarkers();
    renderSplitsList();
    renderReviews();
    renderSplitsTable();
    updatePaceSummary();

    // Column filter checkboxes (hide both th and td)
    document.querySelectorAll(".col-check").forEach(function(cb) {
      cb.addEventListener("change", function() {
        var col = cb.dataset.col;
        var show = cb.checked;
        document.querySelectorAll(".col-" + col).forEach(function(el) {
          if (el.closest("#col-filter-bar")) return;
          if (show) {
            el.classList.remove("col-hidden");
            el.style.display = "";
          } else {
            el.classList.add("col-hidden");
            el.style.display = "none";
          }
        });
      });
    });

    // Walk/Run modal
    initWalkRunModal();

    // Splits view toggle (Per Mile / KM / Segments)
    initSplitsViewToggle();

    // Free-text race notes persistence
    const notesTextarea = document.getElementById("race-notes-freetext");
    if (notesTextarea) {
      const notesKey = `runwell-${getAthletePrefix()}notes-${getRaceId()}`;
      notesTextarea.value = localStorage.getItem(notesKey) || "";
      notesTextarea.addEventListener("input", () => localStorage.setItem(notesKey, notesTextarea.value));
    }

    // Bottom panel tabs (Elevation / Weather)
    initBottomTabs();

    // Coach: Goal A/B toggle
    initGoalToggle();

    // Expose hooks for pro-features.js
    window._runwellCourseDistance = course.distance;
    window._runwellPacePlan = pacePlan;
    window._runwellFuelMiles = fuelMiles;
    window._runwellSaveFuelMiles = saveFuelMiles;
    window._runwellRenderFuelMapMarkers = renderFuelMapMarkers;
    window._runwellRenderSplitsTable = renderSplitsTable;
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

    // ─── Save Plan on Navigate Away ─────────────────────────
    initSavePlan();
  }

  // ─── Save Plan ──────────────────────────────────────────────

  function getSavedPlans() {
    try { return JSON.parse(localStorage.getItem("runwell-saved-plans") || "[]"); } catch { return []; }
  }

  function setSavedPlans(plans) {
    localStorage.setItem("runwell-saved-plans", JSON.stringify(plans));
  }

  function initSavePlan() {
    const saveModal = document.getElementById("save-plan-modal");
    const savedPlansModal = document.getElementById("saved-plans-modal");
    let pendingNavUrl = null;

    // Intercept "Change Race" link
    document.getElementById("btn-change-race").addEventListener("click", (e) => {
      e.preventDefault();
      if (pacePlan.splits.length > 0) {
        pendingNavUrl = "index.html";
        showSavePrompt();
      } else {
        window.location.href = "index.html";
      }
    });

    function showSavePrompt() {
      const raceId = getRaceId();
      const race = typeof RACES !== "undefined" && RACES.find(r => r.id === raceId);
      const defaultName = race ? race.name : "Race Plan";
      document.getElementById("save-plan-name").value = defaultName;

      // Show email section if not logged in
      const user = (() => { try { return JSON.parse(localStorage.getItem("runwell-user")); } catch { return null; } })();
      document.getElementById("save-plan-email-section").style.display = user ? "none" : "";

      saveModal.style.display = "flex";
      setTimeout(() => document.getElementById("save-plan-name").focus(), 100);
    }

    // Save button
    document.getElementById("save-plan-confirm").addEventListener("click", () => {
      const name = document.getElementById("save-plan-name").value.trim();
      if (!name) { alert("Please enter a plan name."); return; }

      // Check if user needs to create account
      let user = (() => { try { return JSON.parse(localStorage.getItem("runwell-user")); } catch { return null; } })();
      if (!user) {
        const email = document.getElementById("save-plan-email").value.trim();
        if (!email || !email.includes("@")) { alert("Please enter a valid email to create your free account."); return; }
        user = { email: email, name: email.split("@")[0], plan: "free" };
        localStorage.setItem("runwell-user", JSON.stringify(user));
      }

      // Save the plan
      const raceId = getRaceId();
      const plans = getSavedPlans();
      plans.push({
        id: Date.now().toString(),
        name: name,
        raceId: raceId,
        date: new Date().toISOString(),
        goalTime: pacePlan.goalTime,
        strategy: pacePlan.strategy,
        splits: pacePlan.splits.length,
        data: {
          goalTime: pacePlan.goalTime,
          strategy: pacePlan.strategy,
          startApproach: pacePlan.startApproach,
          elevAdjusted: pacePlan.elevAdjusted,
          walkRun: pacePlan.walkRun,
          fuelMiles: [...fuelMiles],
        }
      });
      setSavedPlans(plans);

      saveModal.style.display = "none";
      if (pendingNavUrl) {
        window.location.href = pendingNavUrl;
        pendingNavUrl = null;
      }
    });

    // Don't Save button
    document.getElementById("save-plan-skip").addEventListener("click", () => {
      saveModal.style.display = "none";
      if (pendingNavUrl) {
        window.location.href = pendingNavUrl;
        pendingNavUrl = null;
      }
    });

    saveModal.addEventListener("click", (e) => { if (e.target === saveModal) saveModal.style.display = "none"; });

    // Saved Plans modal
    document.getElementById("saved-plans-close").addEventListener("click", () => { savedPlansModal.style.display = "none"; });
    savedPlansModal.addEventListener("click", (e) => { if (e.target === savedPlansModal) savedPlansModal.style.display = "none"; });

    // Expose for the dropdown
    window._openSavedPlans = function() {
      const plans = getSavedPlans();
      const list = document.getElementById("saved-plans-list");

      if (plans.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">No saved plans yet. Plans are saved when you navigate away from a race.</div>';
      } else {
        list.innerHTML = plans.sort((a, b) => new Date(b.date) - new Date(a.date)).map((p, i) => {
          const race = typeof RACES !== "undefined" && RACES.find(r => r.id === p.raceId);
          const raceName = race ? race.name : p.raceId;
          const goalStr = p.goalTime ? secondsToTime(p.goalTime) : "No goal";
          const dateStr = new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border-bottom:1px solid var(--border);">
            <div style="flex:1;min-width:0;">
              <div style="font-size:14px;font-weight:600;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${raceName} &middot; ${goalStr} &middot; ${p.splits} splits &middot; ${dateStr}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;margin-left:10px;">
              <a href="planner.html?race=${p.raceId}" style="padding:5px 12px;background:var(--primary);color:#fff;border-radius:var(--radius-pill);font-size:11px;font-weight:600;text-decoration:none;">Open</a>
              <button class="saved-plan-delete" data-idx="${i}" style="padding:5px 8px;background:none;border:1px solid var(--border);border-radius:var(--radius-pill);font-size:11px;cursor:pointer;font-family:inherit;color:var(--text-muted);">×</button>
            </div>
          </div>`;
        }).join("");

        // Delete handlers
        list.querySelectorAll(".saved-plan-delete").forEach(btn => {
          btn.addEventListener("click", () => {
            const sorted = plans.sort((a, b) => new Date(b.date) - new Date(a.date));
            const idx = parseInt(btn.dataset.idx);
            const target = sorted[idx];
            const origIdx = plans.findIndex(p => p.id === target.id);
            if (origIdx >= 0) plans.splice(origIdx, 1);
            setSavedPlans(plans);
            window._openSavedPlans(); // re-render
          });
        });
      }

      savedPlansModal.style.display = "flex";
    };
  }

  // ─── Bottom Panel Tabs (Elevation / Weather) ─────────────────

  // ─── Walk/Run Modal ─────────────────────────────────────────

  function initWalkRunModal() {
    const modal = document.getElementById("walkrun-modal");
    const goalInput = document.getElementById("wr-goal-time");
    const runDurInput = document.getElementById("wr-run-dur");
    const walkDurInput = document.getElementById("wr-walk-dur");
    const resultDiv = document.getElementById("wr-calc-result");
    const errorDiv = document.getElementById("wr-error");

    document.getElementById("btn-walk-run").addEventListener("click", () => {
      // Prefill goal time from pace plan
      if (pacePlan.goalTime && goalInput) {
        goalInput.value = secondsToTime(pacePlan.goalTime);
      }
      // Restore saved walk/run data
      if (pacePlan.walkRun) {
        runDurInput.value = pacePlan.walkRun.runMinPerCycle || "";
        walkDurInput.value = pacePlan.walkRun.walkMinPerCycle || "";
      }
      modal.style.display = "flex";
      updateWRCalc();
    });

    let wrRunMode = "time"; // "time" or "dist"
    let wrWalkMode = "time";

    window._setWRFieldMode = function(field, mode) {
      if (field === "run") {
        wrRunMode = mode;
        document.getElementById("wr-run-time-input").style.display = mode === "time" ? "" : "none";
        document.getElementById("wr-run-dist-input").style.display = mode === "dist" ? "" : "none";
      } else {
        wrWalkMode = mode;
        document.getElementById("wr-walk-time-input").style.display = mode === "time" ? "" : "none";
        document.getElementById("wr-walk-dist-input").style.display = mode === "dist" ? "" : "none";
      }
      // Update toggle button styles
      document.querySelectorAll('.wr-field-toggle[data-field="' + field + '"]').forEach(function(btn) {
        var isActive = btn.dataset.mode === mode;
        btn.style.background = isActive ? "#fff" : "transparent";
        btn.style.color = isActive ? "var(--navy)" : "var(--text-muted)";
        btn.style.boxShadow = isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none";
      });
    };

    document.getElementById("wr-close").addEventListener("click", () => { modal.style.display = "none"; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });

    // Calculate button
    document.getElementById("wr-calculate").addEventListener("click", () => {
      const goalSec = parseTimeToSeconds(goalInput.value);
      if (!goalSec) { alert("Please enter a goal finish time."); return; }

      const goalPacePerMile = goalSec / course.distance;
      const walkRatio = 2.5;

      // Get run value (time or distance)
      let runMin;
      if (wrRunMode === "time") {
        runMin = parseFloat(runDurInput.value);
        if (!runMin) { alert("Please enter a run duration."); return; }
      } else {
        const runDist = parseFloat(document.getElementById("wr-run-dist").value);
        if (!runDist) { alert("Please enter a run distance."); return; }
        // Estimate run pace to convert distance to time
        // First pass: assume even split to get approximate run pace
        const approxRunPace = goalPacePerMile / (1 + 0); // will refine below
        runMin = null; // will be calculated after we know walk value
      }

      // Get walk value (time or distance)
      let walkMin;
      if (wrWalkMode === "time") {
        walkMin = parseFloat(walkDurInput.value);
        if (!walkMin) { alert("Please enter a walk duration."); return; }
      } else {
        const walkDist = parseFloat(document.getElementById("wr-walk-dist").value);
        if (!walkDist) { alert("Please enter a walk distance."); return; }
        walkMin = null; // will be calculated below
      }

      // Handle mixed mode calculations
      // We need runMin and walkMin to feed into calcWalkRunFromDurations
      // If one is distance-based, we need to solve for the time equivalent
      if (runMin === null || walkMin === null) {
        const runDistVal = wrRunMode === "dist" ? parseFloat(document.getElementById("wr-run-dist").value) : null;
        const walkDistVal = wrWalkMode === "dist" ? parseFloat(document.getElementById("wr-walk-dist").value) : null;
        const runTimeVal = wrRunMode === "time" ? parseFloat(runDurInput.value) : null;
        const walkTimeVal = wrWalkMode === "time" ? parseFloat(walkDurInput.value) : null;

        if (runDistVal !== null && walkDistVal !== null) {
          // Both distance: same as old distance mode
          const cycleDist = runDistVal + walkDistVal;
          const runFrac = runDistVal / cycleDist;
          const walkFrac = walkDistVal / cycleDist;
          const runPaceSec = goalPacePerMile / (runFrac + walkFrac * walkRatio);
          runMin = (runDistVal * runPaceSec) / 60;
          walkMin = (walkDistVal * runPaceSec * walkRatio) / 60;
        } else if (runDistVal !== null && walkTimeVal !== null) {
          // Run by distance, walk by time
          // Iterate: guess run pace, compute cycle, check if avg matches goal
          let bestRunPace = goalPacePerMile * 0.7;
          for (let iter = 0; iter < 20; iter++) {
            const runTimeSec = runDistVal * bestRunPace;
            const walkTimeSec = walkTimeVal * 60;
            const cycleSec = runTimeSec + walkTimeSec;
            const walkPace = bestRunPace * walkRatio;
            const walkDist = walkTimeSec / walkPace;
            const cycleDist = runDistVal + walkDist;
            const avgPace = cycleSec / cycleDist;
            bestRunPace += (goalPacePerMile - avgPace) * 0.5;
          }
          runMin = (runDistVal * bestRunPace) / 60;
          walkMin = walkTimeVal;
        } else if (runTimeVal !== null && walkDistVal !== null) {
          // Run by time, walk by distance
          let bestRunPace = goalPacePerMile * 0.7;
          for (let iter = 0; iter < 20; iter++) {
            const runTimeSec = runTimeVal * 60;
            const runDist = runTimeSec / bestRunPace;
            const walkPace = bestRunPace * walkRatio;
            const walkTimeSec = walkDistVal * walkPace;
            const cycleSec = runTimeSec + walkTimeSec;
            const cycleDist = runDist + walkDistVal;
            const avgPace = cycleSec / cycleDist;
            bestRunPace += (goalPacePerMile - avgPace) * 0.5;
          }
          runMin = runTimeVal;
          walkMin = (walkDistVal * bestRunPace * walkRatio) / 60;
        }
      }

      const data = calcWalkRunFromDurations(goalSec, runMin, walkMin, course.distance);
      if (!data) {
        resultDiv.style.display = "none";
        errorDiv.style.display = "";
        errorDiv.textContent = "Cannot achieve this goal with these intervals. Try adjusting your durations or goal time.";
        document.getElementById("wr-apply").style.display = "none";
        return;
      }

      errorDiv.style.display = "none";
      resultDiv.style.display = "";
      document.getElementById("wr-apply").style.display = "";
      document.getElementById("wr-run-pace-display").textContent = data.runPaceStr + "/mi";
      document.getElementById("wr-walk-pace-display").textContent = data.walkPaceStr + "/mi";
      document.getElementById("wr-avg-pace-display").textContent = data.avgPaceStr + "/mi";
      document.getElementById("wr-run-dur-label").textContent = `${runMin} min running`;
      document.getElementById("wr-walk-dur-label").textContent = `${walkMin} min walking`;

      // Build mile-by-mile breakdown
      const totalMiles = Math.ceil(course.distance);
      const lastFraction = course.distance - Math.floor(course.distance);
      const cycleMin = runMin + walkMin;
      const totalCycles = Math.floor((goalSec / 60) / cycleMin);
      let cumTime = 0;
      let breakdownHTML = "";

      for (let m = 1; m <= totalMiles; m++) {
        const isLast = m === totalMiles;
        const mileLength = isLast && lastFraction > 0.01 ? lastFraction : 1;
        const mileTime = (goalSec / course.distance) * mileLength;
        const runTimeInMile = (runMin / cycleMin) * mileTime;
        const walkTimeInMile = (walkMin / cycleMin) * mileTime;
        cumTime += mileTime;
        const mileLabel = isLast && mileLength < 1 ? `${m-1}→${course.distance.toFixed(1)}` : m;

        breakdownHTML += `<tr style="border-bottom:1px solid var(--surface-2);">
          <td style="padding:4px 8px;">${mileLabel}</td>
          <td style="padding:4px 8px;color:var(--navy);font-weight:600;">${data.runPaceStr}/mi <span style="font-weight:400;color:var(--text-muted);font-size:10px;">(${Math.floor(runTimeInMile/60)}:${String(Math.round(runTimeInMile%60)).padStart(2,"0")})</span></td>
          <td style="padding:4px 8px;color:var(--text-muted);">${data.walkPaceStr}/mi <span style="font-size:10px;">(${Math.floor(walkTimeInMile/60)}:${String(Math.round(walkTimeInMile%60)).padStart(2,"0")})</span></td>
          <td style="padding:4px 8px;font-weight:600;">${secondsToTime(mileTime)}</td>
          <td style="padding:4px 8px;color:var(--text-muted);font-size:11px;">${secondsToTime(cumTime)}</td>
        </tr>`;
      }
      document.getElementById("wr-mile-breakdown").innerHTML = breakdownHTML;

      // Build detail text based on each field's mode
      const runLabel = wrRunMode === "dist"
        ? `Run <strong>${document.getElementById("wr-run-dist").value} mi</strong> (~${runMin.toFixed(1)} min)`
        : `Run <strong>${runMin} min</strong>`;
      const walkLabel = wrWalkMode === "dist"
        ? `Walk <strong>${document.getElementById("wr-walk-dist").value} mi</strong> (~${walkMin.toFixed(1)} min)`
        : `Walk <strong>${walkMin} min</strong>`;

      document.getElementById("wr-detail").innerHTML =
        `<div>${runLabel}, ${walkLabel} per cycle (${cycleMin.toFixed(1)} min total)</div>` +
        `<div>~<strong>${totalCycles} cycles</strong> over the full race</div>` +
        `<div>${data.runFraction}% running, ${data.walkFraction}% walking</div>` +
        `<div style="margin-top:4px;">Estimated finish: <strong>${secondsToTime(goalSec)}</strong></div>`;

      // Save walk/run data
      pacePlan.walkRun = data;
      savePacePlan();
      renderSplitsTable();
      updatePaceSummary();
    });

    // Apply to splits
    document.getElementById("wr-apply").addEventListener("click", () => {
      const goalSec = parseTimeToSeconds(goalInput.value);
      if (!goalSec || !pacePlan.walkRun) { alert("Calculate paces first."); return; }

      pacePlan.goalTime = goalSec;
      if (!pacePlan.strategy) pacePlan.strategy = "even";
      if (!pacePlan.startApproach) pacePlan.startApproach = "even-start";
      if (pacePlan.elevAdjusted === undefined) pacePlan.elevAdjusted = true;
      if (!pacePlan.startTime) pacePlan.startTime = "08:00";

      pacePlan.splits = generateSplits(goalSec, pacePlan.strategy, pacePlan.startApproach, pacePlan.elevAdjusted);
      savePacePlan();
      renderSplitsTable();
      updatePaceSummary();
      if (elevationChart) elevationChart.update("none");
      updateRunnerInfo(runnerMile);
      switchTab("splits");
      modal.style.display = "none";
    });

    // Clear
    document.getElementById("wr-clear").addEventListener("click", () => {
      goalInput.value = "";
      runDurInput.value = "";
      walkDurInput.value = "";
      document.getElementById("wr-run-dist").value = "";
      document.getElementById("wr-walk-dist").value = "";
      resultDiv.style.display = "none";
      errorDiv.style.display = "none";
      document.getElementById("wr-apply").style.display = "none";
      pacePlan.walkRun = null;
      savePacePlan();
      renderSplitsTable();
      updatePaceSummary();
    });
  }

  // ─── Splits View Toggle (Per Mile / Segments) ──────────────

  let segments = [];
  let activeView = "mile";
  let segmentUnit = "mi"; // "mi" or "km"

  function parsePaceStr(str) {
    if (!str) return 0;
    const raw = str.replace("/mi", "").trim();
    if (raw.includes(":")) {
      const p = raw.split(":").map(Number);
      return p.length === 2 && !isNaN(p[0]) && !isNaN(p[1]) ? p[0] * 60 + p[1] : 0;
    }
    const n = parseInt(raw);
    if (isNaN(n)) return 0;
    if (n < 20) return n * 60;
    if (n >= 100) { const m = Math.floor(n/100), s = n%100; return s < 60 ? m*60+s : 0; }
    return n * 60;
  }

  function getSegmentElevation(startMile, endMile) {
    let totalGain = 0, totalLoss = 0;
    for (let m = startMile; m <= endMile; m++) {
      const change = getElevChangeForMile(m);
      if (change > 0) totalGain += change;
      else totalLoss += Math.abs(change);
    }
    return { gain: Math.round(totalGain), loss: Math.round(totalLoss) };
  }

  function initSplitsViewToggle() {
    loadSegments();

    window._switchSplitsView = function(view) {
      if (view === "segment") {
        var isAdvanced = false;
        try { var u = JSON.parse(localStorage.getItem("runwell-user")); isAdvanced = u && (u.plan === "advanced" || u.plan === "pro" || u.plan === "coach"); } catch(e) {}
        if (!isAdvanced) {
          var gateModal = document.getElementById("pro-gate-modal");
          if (gateModal) gateModal.style.display = "flex";
          return;
        }
      }
      if (view === activeView) return;
      activeView = view;

      // Update all toggle button styles
      ["mile", "km", "segment"].forEach(function(v) {
        var btn = document.getElementById("view-btn-" + v);
        if (btn) {
          btn.style.background = view === v ? "#fff" : "transparent";
          btn.style.color = view === v ? "var(--navy)" : "var(--text-muted)";
          btn.style.boxShadow = view === v ? "0 1px 3px rgba(0,0,0,0.08)" : "none";
        }
      });

      document.getElementById("splits-table-wrapper").style.display = view === "mile" ? "" : "none";
      document.getElementById("km-table-wrapper").style.display = view === "km" ? "" : "none";
      document.getElementById("segment-view").style.display = view === "segment" ? "block" : "none";

      if (view === "km") {
        renderKmSplits();
      }
      if (view === "segment") {
        if (segments.length === 0) buildDefaultSegments();
        renderSegments();
      }
    };

    window._setSegmentUnit = function(unit) {
      segmentUnit = unit;
      document.getElementById("seg-unit-mi").style.background = unit === "mi" ? "#fff" : "transparent";
      document.getElementById("seg-unit-mi").style.color = unit === "mi" ? "var(--navy)" : "var(--text-muted)";
      document.getElementById("seg-unit-mi").style.boxShadow = unit === "mi" ? "0 1px 3px rgba(0,0,0,0.08)" : "none";
      document.getElementById("seg-unit-km").style.background = unit === "km" ? "#fff" : "transparent";
      document.getElementById("seg-unit-km").style.color = unit === "km" ? "var(--navy)" : "var(--text-muted)";
      document.getElementById("seg-unit-km").style.boxShadow = unit === "km" ? "0 1px 3px rgba(0,0,0,0.08)" : "none";
      renderSegments();
    };

    window._addSegment = function() {
      var dist = course.distance;
      var lastEnd = segments.length > 0 ? segments[segments.length - 1].end : 0;
      if (lastEnd >= dist) return;
      var newStart = Math.round((lastEnd + 0.1) * 10) / 10;
      if (newStart < 1) newStart = 1;
      var newEnd = Math.min(Math.round((newStart + 4) * 10) / 10, dist);
      var defaultPace = pacePlan.goalTime ? secondsToPace(pacePlan.goalTime / course.distance) : "";
      segments.push({ start: newStart, end: newEnd, label: "", pace: defaultPace });
      renderSegments();
      saveSegments();
    };
  }

  function buildDefaultSegments() {
    const dist = course.distance; // e.g. 26.2 or 13.1
    const defaultPace = pacePlan.goalTime ? secondsToPace(pacePlan.goalTime / dist) : "";

    if (dist <= 15) {
      // Half marathon (13.1)
      segments = [
        { start: 1, end: 3, label: "Warm up", pace: defaultPace },
        { start: 4, end: 8, label: "Settle in", pace: defaultPace },
        { start: 9, end: 11, label: "Push", pace: defaultPace },
        { start: 12, end: 13.1, label: "Finish", pace: defaultPace },
      ];
    } else {
      // Full marathon (26.2)
      segments = [
        { start: 1, end: 3, label: "Warm up", pace: defaultPace },
        { start: 4, end: 10, label: "Settle in", pace: defaultPace },
        { start: 11, end: 16, label: "Mid race", pace: defaultPace },
        { start: 17, end: 20, label: "Stay strong", pace: defaultPace },
        { start: 21, end: 26.2, label: "Finish push", pace: defaultPace },
      ];
    }

    // Adjust paces from splits if available
    if (pacePlan.splits.length > 0) {
      segments.forEach(seg => {
        const matching = pacePlan.splits.filter(s => s.mile >= seg.start && s.mile <= seg.end);
        if (matching.length > 0) {
          const avg = matching.reduce((sum, s) => sum + s.paceSeconds, 0) / matching.length;
          seg.pace = secondsToPace(avg);
        }
      });
    }
    saveSegments();
  }

  function renderSegments() {
    const wrapper = document.getElementById("segment-table-wrapper");
    const distMi = course.distance; // always in miles internally
    const isKm = segmentUnit === "km";
    const conv = isKm ? MI_TO_KM : 1;
    const unitLabel = isKm ? "Kilometers" : "Miles";
    const paceLabel = isKm ? "/km" : "/mi";

    let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += `<thead><tr style="background:var(--navy);color:#fff;">
      <th style="padding:6px 8px;font-size:10px;font-weight:600;text-transform:uppercase;">${unitLabel}</th>
      <th style="padding:6px 8px;font-size:10px;font-weight:600;">Label</th>
      <th style="padding:6px 8px;font-size:10px;font-weight:600;">Pace</th>
      <th style="padding:6px 8px;font-size:10px;font-weight:600;">Elev</th>
      <th style="padding:6px 8px;font-size:10px;font-weight:600;">Time</th>
      <th style="padding:6px 4px;width:24px;"></th>
    </tr></thead><tbody>`;

    let grandTotal = 0;
    const displayDist = Math.round(distMi * conv * 10) / 10;

    segments.forEach((seg, i) => {
      // Segments stored in miles internally
      const displayStart = Math.round(seg.start * conv * 10) / 10;
      const displayEnd = Math.round(seg.end * conv * 10) / 10;
      const miles = Math.round((seg.end - seg.start + 1) * 10) / 10;

      // Pace: stored as /mi, display as /km if needed
      const storedPaceSec = parsePaceStr(seg.pace);
      const displayPaceSec = isKm && storedPaceSec > 0 ? storedPaceSec / MI_TO_KM : storedPaceSec;
      const displayPace = displayPaceSec > 0 ? secondsToPace(displayPaceSec) : seg.pace;

      const segTime = storedPaceSec > 0 ? storedPaceSec * miles : 0;
      grandTotal += segTime;
      const elev = getSegmentElevation(seg.start, seg.end);
      const elevStr = `↑${elev.gain}′ ↓${elev.loss}′`;
      const elevColor = elev.gain > elev.loss ? "var(--accent-red)" : elev.gain < elev.loss ? "var(--accent-green)" : "var(--text-muted)";

      html += `<tr style="border-bottom:1px solid var(--border);">
        <td style="padding:6px 8px;white-space:nowrap;">
          <input type="number" class="seg-input seg-start" data-idx="${i}" value="${displayStart}" min="${conv}" max="${displayDist}" step="0.1" style="width:46px;padding:2px;border:1px solid var(--border);border-radius:4px;font-size:11px;text-align:center;font-family:inherit;" />
          <span style="color:var(--text-muted);font-size:10px;margin:0 2px;">to</span>
          <input type="number" class="seg-input seg-end" data-idx="${i}" value="${displayEnd}" min="${conv}" max="${displayDist}" step="0.1" style="width:46px;padding:2px;border:1px solid var(--border);border-radius:4px;font-size:11px;text-align:center;font-family:inherit;" />
        </td>
        <td style="padding:6px 8px;">
          <input type="text" class="seg-input seg-label" data-idx="${i}" value="${seg.label}" placeholder="Label" style="width:100%;padding:2px 5px;border:1px solid var(--border);border-radius:4px;font-size:11px;font-family:inherit;" />
        </td>
        <td style="padding:6px 8px;">
          <input type="text" class="seg-input seg-pace" data-idx="${i}" value="${displayPace}" placeholder="${isKm ? '5:00' : '8:00'}" style="width:52px;padding:2px 5px;border:1px solid var(--border);border-radius:4px;font-size:11px;text-align:center;font-family:inherit;" />
        </td>
        <td style="padding:6px 8px;font-size:10px;color:${elevColor};white-space:nowrap;">${elevStr}</td>
        <td style="padding:6px 8px;font-size:11px;color:var(--text-muted);font-weight:600;">${segTime > 0 ? secondsToTime(segTime) : ""}</td>
        <td style="padding:6px 4px;">
          <button class="seg-remove" data-idx="${i}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px;padding:0;">×</button>
        </td>
      </tr>`;
    });

    html += '</tbody></table>';

    // Finish estimate
    if (grandTotal > 0) {
      html += `<div style="padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);margin-top:8px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Estimated Finish</span>
        <span style="font-size:22px;font-weight:800;color:var(--navy);">${secondsToTime(grandTotal)}</span>
      </div>`;
    }

    wrapper.innerHTML = html;

    // Wire up all handlers
    const isKmMode = segmentUnit === "km";
    const convBack = isKmMode ? (1 / MI_TO_KM) : 1;

    wrapper.querySelectorAll(".seg-start").forEach(el => el.addEventListener("change", e => {
      segments[+e.target.dataset.idx].start = Math.round((parseFloat(e.target.value) || 1) * convBack * 10) / 10;
      renderSegments(); saveSegments();
    }));
    wrapper.querySelectorAll(".seg-end").forEach(el => el.addEventListener("change", e => {
      const val = (parseFloat(e.target.value) || 1) * convBack;
      segments[+e.target.dataset.idx].end = Math.min(Math.round(val * 10) / 10, course.distance);
      renderSegments(); saveSegments();
    }));
    wrapper.querySelectorAll(".seg-label").forEach(el => el.addEventListener("change", e => {
      segments[+e.target.dataset.idx].label = e.target.value;
      saveSegments();
    }));
    wrapper.querySelectorAll(".seg-pace").forEach(el => el.addEventListener("change", e => {
      const idx = +e.target.dataset.idx;
      const val = e.target.value.trim();
      let sec = parsePaceStr(val);
      // If in km mode, convert entered /km pace to /mi for storage
      if (isKmMode && sec > 0) sec = sec * MI_TO_KM;
      segments[idx].pace = sec > 0 ? secondsToPace(sec) : val;
      renderSegments(); saveSegments();
    }));
    wrapper.querySelectorAll(".seg-remove").forEach(el => el.addEventListener("click", e => {
      segments.splice(+e.target.dataset.idx, 1);
      renderSegments(); saveSegments();
    }));
  }

  function saveSegments() {
    localStorage.setItem(`runwell-${getAthletePrefix()}segments-${activeGoal === "B" ? "B-" : ""}${getRaceId()}`, JSON.stringify(segments));
  }

  function loadSegments() {
    try {
      const saved = JSON.parse(localStorage.getItem(`runwell-${getAthletePrefix()}segments-${activeGoal === "B" ? "B-" : ""}${getRaceId()}`));
      if (saved && saved.length > 0) segments = saved;
    } catch (e) {}
  }

  function initGoalToggle() {
    const toggle = document.getElementById("goal-toggle");
    if (!toggle) return;

    // goal-toggle uses effort-col class, so it's only visible for Coach
    // Wire up the tab clicks
    toggle.querySelectorAll(".goal-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const goal = tab.dataset.goal;
        if (goal === activeGoal) return;

        // Save current plan before switching
        savePacePlan();

        // Swap pace plan in memory
        if (activeGoal === "A") {
          // Store A, load B
          pacePlanB = { ...pacePlan, splits: [...pacePlan.splits] };
          activeGoal = "B";
          loadPacePlan(); // loads from B key
        } else {
          // Store B, load A
          pacePlanB = { ...pacePlan, splits: [...pacePlan.splits] };
          activeGoal = "A";
          loadPacePlan(); // loads from A key
        }

        // Update tab UI
        toggle.querySelectorAll(".goal-tab").forEach(t => {
          const isActive = t.dataset.goal === activeGoal;
          t.style.background = isActive ? "#fff" : "transparent";
          t.style.color = isActive ? "var(--navy)" : "var(--text-muted)";
          t.style.boxShadow = isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none";
          t.classList.toggle("active", isActive);
        });

        renderSplitsTable();
        updatePaceSummary();
        updateFinishTime();
        if (elevationChart) elevationChart.update("none");
      });
    });
  }

  let weatherLoaded = false;

  function initBottomTabs() {
    document.querySelectorAll(".bottom-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const which = tab.dataset.bottomTab;

        document.querySelectorAll(".bottom-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById("elevation-chart-wrapper").style.display = which === "elevation" ? "" : "none";
        document.getElementById("elevation-stats").style.display = which === "elevation" ? "" : "none";
        document.getElementById("weather-panel").style.display = which === "weather" ? "" : "none";
        if (which === "weather" && !weatherLoaded) {
          weatherLoaded = true;
          loadWeatherData();
        }
      });
    });
  }

  function renderInlineHistory() {
    const container = document.getElementById("history-inline-content");
    if (!container) return;
    let history = [];
    try { history = JSON.parse(localStorage.getItem("runwell-race-history") || "[]"); } catch (e) {}

    container.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:flex-end;">
        <div style="flex:2;min-width:140px;">
          <label style="display:block;font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px;">Race Name</label>
          <input type="text" id="inline-hist-name" placeholder="e.g. NYC Marathon" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px;font-family:inherit;" />
        </div>
        <div style="flex:1;min-width:100px;">
          <label style="display:block;font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px;">Date</label>
          <input type="date" id="inline-hist-date" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px;font-family:inherit;" />
        </div>
        <div style="flex:1;min-width:100px;">
          <label style="display:block;font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px;">Distance</label>
          <select id="inline-hist-dist" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px;font-family:inherit;">
            <option value="26.2">Marathon</option>
            <option value="13.1">Half</option>
            <option value="6.2">10K</option>
            <option value="3.1">5K</option>
          </select>
        </div>
        <div style="flex:1;min-width:90px;">
          <label style="display:block;font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px;">Finish Time</label>
          <input type="text" id="inline-hist-time" placeholder="3:45:00" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px;font-family:inherit;" />
        </div>
        <button id="inline-hist-add" style="background:var(--primary);color:#fff;border:none;padding:7px 14px;border-radius:var(--radius-pill);font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">+ Add</button>
      </div>
      ${history.length === 0 ?
        '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px;">No past races logged yet. Add your previous race results above.</div>' :
        `<table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:var(--surface-2);">
              <th style="padding:5px 8px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;color:var(--text-muted);">Race</th>
              <th style="padding:5px 8px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;color:var(--text-muted);">Date</th>
              <th style="padding:5px 8px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;color:var(--text-muted);">Dist</th>
              <th style="padding:5px 8px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;color:var(--text-muted);">Time</th>
              <th style="padding:5px 8px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;color:var(--text-muted);">Pace</th>
              <th style="width:24px;"></th>
            </tr>
          </thead>
          <tbody>
            ${[...history].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((r, i) => {
              const distMi = parseFloat(r.distance);
              const timeParts = r.time.split(":").map(Number);
              let totalSec = 0;
              if (timeParts.length === 3) totalSec = timeParts[0]*3600 + timeParts[1]*60 + timeParts[2];
              else if (timeParts.length === 2) totalSec = timeParts[0]*60 + timeParts[1];
              const paceSec = distMi > 0 ? totalSec / distMi : 0;
              const paceMin = Math.floor(paceSec / 60);
              const paceS = Math.round(paceSec % 60);
              const paceStr = paceSec > 0 ? `${paceMin}:${String(paceS).padStart(2,"0")}/mi` : "";
              return `<tr style="border-bottom:1px solid var(--surface-2);">
                <td style="padding:5px 8px;font-weight:600;">${r.name}</td>
                <td style="padding:5px 8px;color:var(--text-muted);">${r.date || ""}</td>
                <td style="padding:5px 8px;">${distMi === 26.2 ? "Marathon" : distMi === 13.1 ? "Half" : distMi + " mi"}</td>
                <td style="padding:5px 8px;font-weight:600;">${r.time}</td>
                <td style="padding:5px 8px;color:var(--text-muted);">${paceStr}</td>
                <td style="padding:5px 4px;"><button class="inline-hist-remove" data-idx="${i}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px;">×</button></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>`
      }
    `;

    // Add handler
    document.getElementById("inline-hist-add").addEventListener("click", () => {
      const name = document.getElementById("inline-hist-name").value.trim();
      const date = document.getElementById("inline-hist-date").value;
      const distance = document.getElementById("inline-hist-dist").value;
      const time = document.getElementById("inline-hist-time").value.trim();
      if (!name || !time) { alert("Please enter a race name and finish time."); return; }
      let h = [];
      try { h = JSON.parse(localStorage.getItem("runwell-race-history") || "[]"); } catch (e) {}
      h.push({ name, date, distance, time });
      localStorage.setItem("runwell-race-history", JSON.stringify(h));
      renderInlineHistory();
    });

    // Remove handlers
    document.querySelectorAll(".inline-hist-remove").forEach(btn => {
      btn.addEventListener("click", () => {
        let h = [];
        try { h = JSON.parse(localStorage.getItem("runwell-race-history") || "[]"); } catch (e) {}
        const sorted = [...h].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        const target = sorted[parseInt(btn.dataset.idx)];
        const origIdx = h.findIndex(r => r.name === target.name && r.time === target.time && r.date === target.date);
        if (origIdx >= 0) h.splice(origIdx, 1);
        localStorage.setItem("runwell-race-history", JSON.stringify(h));
        renderInlineHistory();
      });
    });
  }

  function getHistoricalRaceDates(schedule, years) {
    // Compute past race dates for the given schedule
    const dates = [];
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 1; y >= currentYear - years; y--) {
      try {
        const d = _nthWeekday(y, schedule.month, schedule.week, schedule.day);
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        dates.push({ year: y, date: `${y}-${mm}-${dd}` });
      } catch (e) { /* skip */ }
    }
    return dates;
  }

  async function loadWeatherData() {
    const loading = document.getElementById("weather-loading");
    const content = document.getElementById("weather-content");

    // Find race info
    const raceId = new URLSearchParams(window.location.search).get("race");
    const race = typeof RACES !== "undefined" && RACES.find(r => r.id === raceId);

    if (!race || !race.schedule || !race.lat || !race.lng) {
      loading.textContent = "Weather data not available for this course.";
      return;
    }

    const historicalDates = getHistoricalRaceDates(race.schedule, 10);
    if (historicalDates.length === 0) {
      loading.textContent = "Could not compute historical race dates.";
      return;
    }

    // Fetch from Open-Meteo Historical API
    const startDate = historicalDates[historicalDates.length - 1].date;
    const endDate = historicalDates[0].date;
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${race.lat}&longitude=${race.lng}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,relative_humidity_2m_mean&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=auto`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      // Extract data for each historical race date
      const dailyDates = data.daily?.time || [];
      const results = [];
      historicalDates.forEach(hd => {
        const idx = dailyDates.indexOf(hd.date);
        if (idx === -1) return;
        results.push({
          year: hd.year,
          date: hd.date,
          tempMax: data.daily.temperature_2m_max[idx],
          tempMin: data.daily.temperature_2m_min[idx],
          precip: data.daily.precipitation_sum[idx],
          wind: data.daily.windspeed_10m_max[idx],
          humidity: data.daily.relative_humidity_2m_mean?.[idx],
        });
      });

      if (results.length === 0) {
        loading.textContent = "No historical weather data found for race dates.";
        return;
      }

      // Compute averages
      const avgHigh = (results.reduce((s, r) => s + (r.tempMax || 0), 0) / results.length).toFixed(0);
      const avgLow = (results.reduce((s, r) => s + (r.tempMin || 0), 0) / results.length).toFixed(0);
      const avgWind = (results.reduce((s, r) => s + (r.wind || 0), 0) / results.length).toFixed(0);
      const avgHumidity = (results.reduce((s, r) => s + (r.humidity || 0), 0) / results.length).toFixed(0);
      const rainyDays = results.filter(r => r.precip > 0.05).length;

      content.innerHTML = `
        <div class="weather-summary">
          <div class="weather-summary-stat">
            <div class="ws-label">Avg High</div>
            <div class="ws-value">${avgHigh}°F</div>
          </div>
          <div class="weather-summary-stat">
            <div class="ws-label">Avg Low</div>
            <div class="ws-value">${avgLow}°F</div>
          </div>
          <div class="weather-summary-stat">
            <div class="ws-label">Avg Wind</div>
            <div class="ws-value">${avgWind} mph</div>
          </div>
          <div class="weather-summary-stat">
            <div class="ws-label">Avg Humidity</div>
            <div class="ws-value">${avgHumidity}%</div>
          </div>
          <div class="weather-summary-stat">
            <div class="ws-label">Rain Chance</div>
            <div class="ws-value">${Math.round(rainyDays / results.length * 100)}%</div>
          </div>
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;">Based on race day weather for the last ${results.length} years. Click a year for details.</div>
        <div class="weather-year-list">
          ${results.map((r, i) => {
            const precipIcon = r.precip > 0.05 ? "🌧" : "☀️";
            return `<div class="weather-year-row" data-weather-idx="${i}">
              <span class="wyr-year">${r.year}</span>
              <span class="wyr-temp">${Math.round(r.tempMax)}°/${Math.round(r.tempMin)}°F</span>
              <span class="wyr-icon">${precipIcon}</span>
              <span class="wyr-wind">${Math.round(r.wind)} mph</span>
              <span class="wyr-expand">&#9662;</span>
            </div>
            <div class="weather-year-detail" id="weather-detail-${i}" style="display:none;">
              <div class="wyd-grid">
                <div class="wyd-item"><span class="wyd-label">High</span><span class="wyd-val">${Math.round(r.tempMax)}°F</span></div>
                <div class="wyd-item"><span class="wyd-label">Low</span><span class="wyd-val">${Math.round(r.tempMin)}°F</span></div>
                <div class="wyd-item"><span class="wyd-label">Wind</span><span class="wyd-val">${Math.round(r.wind)} mph</span></div>
                <div class="wyd-item"><span class="wyd-label">Humidity</span><span class="wyd-val">${r.humidity != null ? Math.round(r.humidity) + "%" : "-"}</span></div>
                <div class="wyd-item"><span class="wyd-label">Precip</span><span class="wyd-val">${r.precip > 0.05 ? r.precip.toFixed(2) + '"' : "None"}</span></div>
                <div class="wyd-item"><span class="wyd-label">Date</span><span class="wyd-val">${r.date}</span></div>
              </div>
            </div>`;
          }).join("")}
        </div>
      `;

      // Year row click to expand/collapse
      content.querySelectorAll(".weather-year-row").forEach(row => {
        row.addEventListener("click", () => {
          const idx = row.dataset.weatherIdx;
          const detail = document.getElementById("weather-detail-" + idx);
          const arrow = row.querySelector(".wyr-expand");
          const isOpen = detail.style.display !== "none";
          detail.style.display = isOpen ? "none" : "";
          arrow.innerHTML = isOpen ? "&#9662;" : "&#9652;";
          row.classList.toggle("expanded", !isOpen);
        });
      });

      loading.style.display = "none";
      content.style.display = "";
    } catch (err) {
      loading.textContent = "Failed to load weather data. Please try again.";
      console.error("Weather fetch error:", err);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadCourse);
  else loadCourse();
})();
