(function () {
  const menu = document.getElementById("menu");
  const openers = document.querySelectorAll("[data-menu]");
  const closers = document.querySelectorAll("[data-close-menu]");

  function setMenu(open) {
    if (!menu) return;
    menu.classList.toggle("is-open", open);
    document.body.classList.toggle("menu-open", open);
  }

  openers.forEach((btn) => btn.addEventListener("click", () => setMenu(true)));
  closers.forEach((btn) => btn.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setMenu(false);
  });

  const canvas = document.getElementById("rain");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const intensityEl = document.getElementById("intensity");
  const speedEl = document.getElementById("speed");
  const sizeEl = document.getElementById("size");
  const pauseBtn = document.getElementById("pause");
  const wetEl = document.getElementById("wetness");
  const intensityVal = document.getElementById("intensityVal");
  const speedVal = document.getElementById("speedVal");
  const sizeVal = document.getElementById("sizeVal");

  let drops = [];
  let paused = false;
  let wetness = 1;
  let w = 0;
  let h = 0;

  function read(el, fallback) {
    return el ? Number(el.value) / 100 : fallback;
  }

  function resize() {
    w = canvas.width = canvas.offsetWidth * devicePixelRatio;
    h = canvas.height = canvas.offsetHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    seed();
  }

  function seed() {
    const intensity = read(intensityEl, 0.35);
    const count = Math.max(12, Math.round((canvas.offsetWidth / 6) * (0.2 + intensity * 2.4)));
    drops = Array.from({ length: count }, () => spawn(true));
  }

  function spawn(anywhere) {
    const size = 0.35 + read(sizeEl, 0.24) * 2.4;
    return {
      x: Math.random() * canvas.offsetWidth,
      y: anywhere ? Math.random() * canvas.offsetHeight : -20,
      len: 8 + Math.random() * 18 * size,
      z: 0.45 + Math.random() * 0.8,
    };
  }

  function tick() {
    const intensity = read(intensityEl, 0.35);
    const speed = 0.35 + read(speedEl, 0.8) * 2.8;
    ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

    if (!paused) {
      wetness += (intensity * 42 - wetness) * 0.012;
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1;
      drops.forEach((d) => {
        ctx.globalAlpha = 0.25 + d.z * 0.45;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.len * 0.18, d.y + d.len);
        ctx.stroke();
        d.y += (8 + d.z * 14) * speed;
        d.x += 1.4 * speed;
        if (d.y > canvas.offsetHeight + 20 || d.x > canvas.offsetWidth + 20) {
          Object.assign(d, spawn(false));
        }
      });
      ctx.globalAlpha = 1;
    } else {
      wetness += (1 - wetness) * 0.02;
    }

    if (wetEl) {
      const shown = Math.max(1, Math.min(99, Math.round(wetness)));
      wetEl.textContent = String(shown).padStart(2, "0");
    }
    requestAnimationFrame(tick);
  }

  function syncLabels() {
    if (intensityVal) intensityVal.textContent = `${intensityEl.value}%`;
    if (speedVal) speedVal.textContent = `${speedEl.value}%`;
    if (sizeVal) sizeVal.textContent = `${sizeEl.value}%`;
    seed();
  }

  [intensityEl, speedEl, sizeEl].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", syncLabels);
  });

  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      paused = !paused;
      pauseBtn.textContent = paused ? "▶" : "❚❚";
      pauseBtn.setAttribute("aria-pressed", String(paused));
    });
  }

  window.addEventListener("resize", resize);
  resize();
  syncLabels();
  tick();
})();
