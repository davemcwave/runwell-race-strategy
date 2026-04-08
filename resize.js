/**
 * Resizable panels for the planner page.
 * - Horizontal handle: resize bottom panel height (map vs bottom)
 * - Vertical handle: resize elevation vs splits width
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
    const bottomPanel = document.getElementById("bottom-panel");
    const elevPanel = document.getElementById("elevation-panel");
    const splitsPanel = document.getElementById("splits-panel");
    const mainContent = document.getElementById("main-content");

    if (!resizeH || !bottomPanel) return;

    // Restore saved sizes
    const saved = loadSizes();
    if (saved.bottomHeight) bottomPanel.style.height = saved.bottomHeight + "px";
    if (saved.elevFlex && saved.splitsFlex) {
      elevPanel.style.flex = "0 0 " + saved.elevFlex + "px";
      splitsPanel.style.flex = "0 0 " + saved.splitsFlex + "px";
    }

    // ─── Horizontal resize (bottom panel height) ────────────────

    let startY, startHeight;

    resizeH.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startY = e.clientY;
      startHeight = bottomPanel.offsetHeight;
      document.body.classList.add("resizing");
      resizeH.classList.add("dragging");
      document.addEventListener("mousemove", onMouseMoveH);
      document.addEventListener("mouseup", onMouseUpH);
    });

    function onMouseMoveH(e) {
      const delta = startY - e.clientY;
      const newHeight = Math.max(80, Math.min(window.innerHeight * 0.8, startHeight + delta));
      bottomPanel.style.height = newHeight + "px";
      // Trigger chart resize
      window.dispatchEvent(new Event("resize"));
    }

    function onMouseUpH() {
      document.body.classList.remove("resizing");
      resizeH.classList.remove("dragging");
      document.removeEventListener("mousemove", onMouseMoveH);
      document.removeEventListener("mouseup", onMouseUpH);
      // Save & trigger final resize for map/chart
      const sizes = loadSizes();
      sizes.bottomHeight = bottomPanel.offsetHeight;
      saveSizes(sizes);
      window.dispatchEvent(new Event("resize"));
    }

    // ─── Vertical resize (elevation vs splits width) ────────────

    if (!resizeV) return;

    let startX, startElevW, startSplitsW;

    resizeV.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startX = e.clientX;
      startElevW = elevPanel.offsetWidth;
      startSplitsW = splitsPanel.offsetWidth;
      document.body.classList.add("resizing-v");
      resizeV.classList.add("dragging");
      document.addEventListener("mousemove", onMouseMoveV);
      document.addEventListener("mouseup", onMouseUpV);
    });

    function onMouseMoveV(e) {
      const delta = e.clientX - startX;
      const totalW = startElevW + startSplitsW;
      const newElevW = Math.max(200, Math.min(totalW - 180, startElevW + delta));
      const newSplitsW = totalW - newElevW;

      elevPanel.style.flex = "0 0 " + newElevW + "px";
      splitsPanel.style.flex = "0 0 " + newSplitsW + "px";
      window.dispatchEvent(new Event("resize"));
    }

    function onMouseUpV() {
      document.body.classList.remove("resizing-v");
      resizeV.classList.remove("dragging");
      document.removeEventListener("mousemove", onMouseMoveV);
      document.removeEventListener("mouseup", onMouseUpV);
      const sizes = loadSizes();
      sizes.elevFlex = elevPanel.offsetWidth;
      sizes.splitsFlex = splitsPanel.offsetWidth;
      saveSizes(sizes);
      window.dispatchEvent(new Event("resize"));
    }

    // ─── Touch support ──────────────────────────────────────────

    resizeH.addEventListener("touchstart", (e) => {
      const touch = e.touches[0];
      startY = touch.clientY;
      startHeight = bottomPanel.offsetHeight;
      resizeH.classList.add("dragging");
      document.addEventListener("touchmove", onTouchMoveH, { passive: false });
      document.addEventListener("touchend", onTouchEndH);
    });

    function onTouchMoveH(e) {
      e.preventDefault();
      const delta = startY - e.touches[0].clientY;
      const newHeight = Math.max(80, Math.min(window.innerHeight * 0.8, startHeight + delta));
      bottomPanel.style.height = newHeight + "px";
      window.dispatchEvent(new Event("resize"));
    }

    function onTouchEndH() {
      resizeH.classList.remove("dragging");
      document.removeEventListener("touchmove", onTouchMoveH);
      document.removeEventListener("touchend", onTouchEndH);
      const sizes = loadSizes();
      sizes.bottomHeight = bottomPanel.offsetHeight;
      saveSizes(sizes);
      window.dispatchEvent(new Event("resize"));
    }

    resizeV.addEventListener("touchstart", (e) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startElevW = elevPanel.offsetWidth;
      startSplitsW = splitsPanel.offsetWidth;
      resizeV.classList.add("dragging");
      document.addEventListener("touchmove", onTouchMoveV, { passive: false });
      document.addEventListener("touchend", onTouchEndV);
    });

    function onTouchMoveV(e) {
      e.preventDefault();
      const delta = e.touches[0].clientX - startX;
      const totalW = startElevW + startSplitsW;
      const newElevW = Math.max(200, Math.min(totalW - 180, startElevW + delta));
      elevPanel.style.flex = "0 0 " + newElevW + "px";
      splitsPanel.style.flex = "0 0 " + (totalW - newElevW) + "px";
      window.dispatchEvent(new Event("resize"));
    }

    function onTouchEndV() {
      resizeV.classList.remove("dragging");
      document.removeEventListener("touchmove", onTouchMoveV);
      document.removeEventListener("touchend", onTouchEndV);
      const sizes = loadSizes();
      sizes.elevFlex = elevPanel.offsetWidth;
      sizes.splitsFlex = splitsPanel.offsetWidth;
      saveSizes(sizes);
      window.dispatchEvent(new Event("resize"));
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
