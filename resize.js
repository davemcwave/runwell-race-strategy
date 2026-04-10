/**
 * Resizable panels for the planner page.
 * - Horizontal handle: resize elevation panel height (map vs elevation in left column)
 * - Vertical handle: resize splits panel width (left column vs right column)
 */
(function () {
  "use strict";

  const STORAGE_KEY = "runwell-panel-sizes";

  function loadSizes() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
  }

  function saveSizes(sizes) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
  }

  function init() {
    const resizeH = document.getElementById("resize-h");
    const resizeV = document.getElementById("resize-v");
    const elevPanel = document.getElementById("elevation-panel");
    const splitsPanel = document.getElementById("splits-panel");
    const mainContent = document.getElementById("main-content");

    if (!resizeH || !elevPanel) return;

    // Restore saved sizes
    const saved = loadSizes();
    if (saved.elevHeight) elevPanel.style.height = saved.elevHeight + "px";
    if (saved.splitsWidth) splitsPanel.style.width = saved.splitsWidth + "px";

    // ─── Horizontal resize (elevation panel height) ─────────────

    let startY, startHeight;

    resizeH.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startY = e.clientY;
      startHeight = elevPanel.offsetHeight;
      document.body.classList.add("resizing");
      resizeH.classList.add("dragging");
      document.addEventListener("mousemove", onMouseMoveH);
      document.addEventListener("mouseup", onMouseUpH);
    });

    function onMouseMoveH(e) {
      const delta = startY - e.clientY;
      const newHeight = Math.max(80, Math.min(window.innerHeight * 0.5, startHeight + delta));
      elevPanel.style.height = newHeight + "px";
      window.dispatchEvent(new Event("resize"));
    }

    function onMouseUpH() {
      document.body.classList.remove("resizing");
      resizeH.classList.remove("dragging");
      document.removeEventListener("mousemove", onMouseMoveH);
      document.removeEventListener("mouseup", onMouseUpH);
      const sizes = loadSizes();
      sizes.elevHeight = elevPanel.offsetHeight;
      saveSizes(sizes);
      window.dispatchEvent(new Event("resize"));
    }

    // ─── Vertical resize (splits panel width) ───────────────────

    if (!resizeV || !splitsPanel) return;

    let startX, startWidth;

    resizeV.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = splitsPanel.offsetWidth;
      document.body.classList.add("resizing-v");
      resizeV.classList.add("dragging");
      document.addEventListener("mousemove", onMouseMoveV);
      document.addEventListener("mouseup", onMouseUpV);
    });

    function onMouseMoveV(e) {
      const delta = startX - e.clientX;
      const newWidth = Math.max(260, Math.min(window.innerWidth * 0.5, startWidth + delta));
      splitsPanel.style.width = newWidth + "px";
      window.dispatchEvent(new Event("resize"));
    }

    function onMouseUpV() {
      document.body.classList.remove("resizing-v");
      resizeV.classList.remove("dragging");
      document.removeEventListener("mousemove", onMouseMoveV);
      document.removeEventListener("mouseup", onMouseUpV);
      const sizes = loadSizes();
      sizes.splitsWidth = splitsPanel.offsetWidth;
      saveSizes(sizes);
      window.dispatchEvent(new Event("resize"));
    }

    // ─── Touch support ──────────────────────────────────────────

    resizeH.addEventListener("touchstart", (e) => {
      const touch = e.touches[0];
      startY = touch.clientY;
      startHeight = elevPanel.offsetHeight;
      resizeH.classList.add("dragging");
      document.addEventListener("touchmove", onTouchMoveH, { passive: false });
      document.addEventListener("touchend", onTouchEndH);
    });

    function onTouchMoveH(e) {
      e.preventDefault();
      const delta = startY - e.touches[0].clientY;
      const newHeight = Math.max(80, Math.min(window.innerHeight * 0.5, startHeight + delta));
      elevPanel.style.height = newHeight + "px";
      window.dispatchEvent(new Event("resize"));
    }

    function onTouchEndH() {
      resizeH.classList.remove("dragging");
      document.removeEventListener("touchmove", onTouchMoveH);
      document.removeEventListener("touchend", onTouchEndH);
      const sizes = loadSizes();
      sizes.elevHeight = elevPanel.offsetHeight;
      saveSizes(sizes);
      window.dispatchEvent(new Event("resize"));
    }

    resizeV.addEventListener("touchstart", (e) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startWidth = splitsPanel.offsetWidth;
      resizeV.classList.add("dragging");
      document.addEventListener("touchmove", onTouchMoveV, { passive: false });
      document.addEventListener("touchend", onTouchEndV);
    });

    function onTouchMoveV(e) {
      e.preventDefault();
      const delta = startX - e.touches[0].clientX;
      const newWidth = Math.max(260, Math.min(window.innerWidth * 0.5, startWidth + delta));
      splitsPanel.style.width = newWidth + "px";
      window.dispatchEvent(new Event("resize"));
    }

    function onTouchEndV() {
      resizeV.classList.remove("dragging");
      document.removeEventListener("touchmove", onTouchMoveV);
      document.removeEventListener("touchend", onTouchEndV);
      const sizes = loadSizes();
      sizes.splitsWidth = splitsPanel.offsetWidth;
      saveSizes(sizes);
      window.dispatchEvent(new Event("resize"));
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
