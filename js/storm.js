(function () {
  const menu = document.getElementById("menu");
  const openers = document.querySelectorAll("[data-menu]");
  const closers = document.querySelectorAll("[data-close-menu]");

  function setMenu(open) {
    if (!menu) return;
    menu.classList.toggle("is-open", open);
    document.body.classList.toggle("menu-open", open);
    if (window.lenis) {
      open ? window.lenis.stop() : window.lenis.start();
    }
  }

  openers.forEach((btn) => btn.addEventListener("click", () => setMenu(true)));
  closers.forEach((btn) => btn.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setMenu(false);
  });

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (window.Lenis && !reduce) {
    window.lenis = new Lenis({
      duration: 1.15,
      smoothWheel: true,
      autoRaf: false,
    });
    if (window.gsap && window.ScrollTrigger) {
      window.lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((time) => window.lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      function raf(time) {
        window.lenis.raf(time);
        requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);
    }
  }

  const frames = Array.from(document.querySelectorAll("#figure img"));
  let frameIndex = 0;
  let galleryTimer;

  function showFrame(i) {
    if (!frames.length) return;
    frameIndex = (i + frames.length) % frames.length;
    frames.forEach((img, n) => img.classList.toggle("is-on", n === frameIndex));
  }

  function startGallery() {
    if (galleryTimer || frames.length < 2 || reduce) return;
    galleryTimer = setInterval(() => showFrame(frameIndex + 1), 2200);
  }

  function stopGallery() {
    clearInterval(galleryTimer);
    galleryTimer = null;
  }

  startGallery();

  const modelState = initModel();

  function initModel() {
    const host = document.getElementById("model");
    const lab = document.querySelector(".lab");
    if (!host || !window.THREE || reduce) return null;

    const sources = (host.dataset.frames || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!sources.length) return null;

    const THREE = window.THREE;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
    camera.position.set(0, 0, 8.6);

    const group = new THREE.Group();
    scene.add(group);

    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const fragmentShader = `
      uniform sampler2D map;
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(map, vUv);
        float isOrange = smoothstep(0.48, 0.78, c.r) * (1.0 - smoothstep(0.22, 0.55, c.g)) * (1.0 - smoothstep(0.16, 0.48, c.b));
        float g = dot(c.rgb, vec3(0.22, 0.71, 0.07));
        float a = c.a * opacity * (1.0 - isOrange) * smoothstep(0.0, 0.1, vUv.y);
        if (a < 0.04) discard;
        gl_FragColor = vec4(vec3(g * 0.92), a);
      }
    `;

    const loader = new THREE.TextureLoader();
    const meshes = [];
    let loaded = 0;
    const mouse = { x: 0, y: 0 };
    const state = { progress: 0, pose: 0, poseClock: 0, baseX: 1.02, baseS: 0.66 };

    sources.forEach((src, i) => {
      loader.load(src, (tex) => {
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.anisotropy = 8;
        const mat = new THREE.ShaderMaterial({
          uniforms: {
            map: { value: tex },
            opacity: { value: i === 0 ? 1 : 0 },
          },
          vertexShader,
          fragmentShader,
          transparent: true,
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 6.0, 1, 1), mat);
        group.add(mesh);
        meshes[i] = mesh;
        loaded += 1;
        if (loaded === sources.length) {
          host.classList.add("is-ready");
          if (lab) lab.classList.add("is-webgl");
        }
      });
    });

    window.addEventListener("pointermove", (e) => {
      mouse.x = (e.clientX / innerWidth) * 2 - 1;
      mouse.y = (e.clientY / innerHeight) * 2 - 1;
    });

    function resize() {
      const w = host.clientWidth || innerWidth;
      const h = host.clientHeight || innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const tall = w / h < 1.05;
      state.baseX = tall ? 0.18 : 1.08;
      state.baseS = tall ? 0.8 : 0.72;
    }

    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = state.progress;
      const live = 1 - p;

      group.rotation.y = Math.sin(now * 0.00055) * 0.12 * live + mouse.x * 0.16 * live + p * -0.08;
      group.rotation.x = Math.sin(now * 0.0004) * 0.05 * live + mouse.y * -0.08 * live + p * 0.04;
      group.position.set(state.baseX - p * 0.28, -0.06 + p * 0.08, p * 0.55);
      group.scale.setScalar(state.baseS + p * 0.62);
      camera.position.z = 8.6 - p * 2.6;
      host.style.opacity = String(Math.max(0, 1 - Math.max(0, p - 0.8) * 5.5));

      if (p < 0.12 && meshes.length > 1) {
        state.poseClock += dt;
        if (state.poseClock > 2.2) {
          state.poseClock = 0;
          state.pose = (state.pose + 1) % sources.length;
        }
      } else if (p >= 0.12) {
        state.pose = Math.min(sources.length - 1, Math.floor(p * sources.length * 1.05));
      }

      meshes.forEach((mesh, i) => {
        if (!mesh) return;
        const target = i === state.pose ? 1 : 0;
        const cur = mesh.material.uniforms.opacity.value;
        mesh.material.uniforms.opacity.value = cur + (target - cur) * 0.08;
      });

      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
    return state;
  }

  function splitFill(line) {
    const html = line.innerHTML
      .replace(/<em>(.*?)<\/em>/gi, "$1")
      .replace(/<br\s*\/?>/gi, "\n")
      .trim();
    line.innerHTML = html
      .split(/(\n)|(\s+)/)
      .filter((tok) => tok !== undefined && tok !== "")
      .map((tok) => {
        if (tok === "\n") return "<br />";
        if (/^\s+$/.test(tok)) return " ";
        const accent = /next\.?/i.test(tok.replace(/[^\w.]/g, ""));
        return `<span class="word${accent ? " word--accent" : ""}">${tok}</span>`;
      })
      .join("");
  }

  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    if (window.lenis) window.lenis.scrollTo(0, { immediate: true });

    const figure = document.getElementById("figure");
    const wrap = document.querySelector(".lab__figure-wrap");
    const lab = document.querySelector(".lab");

    if (lab && figure) {
      ScrollTrigger.create({
        trigger: lab,
        start: "top top",
        end: "+=240%",
        pin: true,
        pinSpacing: true,
        scrub: 1.05,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          const p = self.progress;
          lab.classList.toggle("is-pinned", p > 0.02);
          if (p > 0.08) stopGallery();
          else startGallery();
          const pose = Math.min(frames.length - 1, Math.floor(p * frames.length * 1.15));
          if (p > 0.08) showFrame(pose);
          if (modelState) modelState.progress = p;
          if (!lab.classList.contains("is-webgl") && wrap) {
            gsap.set(figure, {
              scale: 1 + p * 0.95,
              yPercent: p * -18,
              xPercent: p * 10,
              rotateY: -8 + p * 14,
              rotateX: 2 - p * 4,
            });
          }
          lab.style.setProperty("--intro-opacity", String(Math.max(0, 1 - p * 1.45)));
          lab.style.setProperty("--intro-shift", `${p * 28}px`);
          lab.style.backgroundColor = p < 0.78 ? "#ff3b12" : "#0b0b0b";
        },
      });
    }

    document.querySelectorAll("[data-fill]").forEach(splitFill);

    document.querySelectorAll("[data-manifesto]").forEach((track) => {
      const words = track.querySelectorAll(".word");
      ScrollTrigger.create({
        trigger: track,
        start: "top top",
        end: "+=220%",
        pin: true,
        pinSpacing: true,
        scrub: 0.55,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          const p = self.progress;
          words.forEach((word, i) => {
            const t = (i + 0.12) / Math.max(words.length, 1);
            word.classList.toggle("is-on", p > t * 0.78);
          });
        },
      });
    });

    document.querySelectorAll(".chapter__title").forEach((title) => {
      if (title.classList.contains("fill")) return;
      splitFill(title);
      const words = title.querySelectorAll(".word");
      let filled = false;
      function fillTitle() {
        if (filled) return;
        filled = true;
        words.forEach((word, i) => {
          gsap.delayedCall(i * 0.14, () => word.classList.add("is-on"));
        });
      }
      ScrollTrigger.create({
        trigger: title,
        start: "top 88%",
        once: true,
        onEnter: fillTitle,
        onRefresh: (self) => {
          if (self.start <= window.scrollY + window.innerHeight * 0.88) fillTitle();
        },
      });
    });

    const offerCards = gsap.utils.toArray(".offer");
    offerCards.forEach((card) => {
      card.classList.remove("is-hot");
      card.addEventListener("click", (e) => {
        if (e.target.closest("a")) return;
        const on = !card.classList.contains("is-hot");
        offerCards.forEach((c) => c.classList.toggle("is-hot", on && c === card));
      });
    });

    gsap.utils.toArray(".details, .founder, .layers li, .form, .chapter__lede").forEach((el) => {
      gsap.from(el, {
        y: 40,
        opacity: 0,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: {
          trigger: el,
          start: "top 88%",
          toggleActions: "play none none reverse",
        },
      });
    });

    requestAnimationFrame(() => ScrollTrigger.refresh());
    window.addEventListener("load", () => ScrollTrigger.refresh());
  }

  function docTop(el) {
    let top = 0;
    let node = el;
    while (node) {
      top += node.offsetTop;
      node = node.offsetParent;
    }
    return top;
  }

  function flowStart(el) {
    const parent = el.parentElement;
    if (!parent) return docTop(el);
    let top = docTop(parent);
    let sib = parent.firstElementChild;
    while (sib && sib !== el) {
      top += sib.offsetHeight + (parseFloat(getComputedStyle(sib).marginBottom) || 0);
      sib = sib.nextElementSibling;
    }
    return top;
  }

  function initExpedition() {
    const root = document.querySelector(".nk-ex");
    if (!root) return;

    const hero = root.querySelector(".ex-hero");
    const chapters = Array.from(root.querySelectorAll(".ex-ch[data-ex]"));

    root.querySelectorAll(".nk-lines, .nk-rv").forEach((el) => {
      requestAnimationFrame(() => el.classList.add("is-in"));
    });

    function clamp(n, a, b) {
      return Math.max(a, Math.min(b, n));
    }

    function scrollY() {
      return window.lenis ? window.lenis.scroll : window.scrollY || window.pageYOffset || 0;
    }

    function tick() {
      const vh = window.innerHeight;
      const y = scrollY();

      if (hero) {
        const run = Math.max(hero.offsetHeight - vh, 1);
        const p = clamp((y - docTop(hero)) / run, 0, 1);
        hero.style.setProperty("--p", p.toFixed(4));
      }

      let active = 0;
      chapters.forEach((ch, i) => {
        const start = flowStart(ch);
        const gap = Math.max(vh * 0.7, 1);
        const p = clamp((y - start) / gap, 0, 1);
        ch.style.setProperty("--t", `${(p * vh * 0.22).toFixed(1)}px`);
        ch.style.setProperty("--cover", (p * 0.94).toFixed(3));
        ch.style.setProperty("--edge", p > 0.02 ? Math.min(1, p * 8).toFixed(3) : "0");
        if (y + 8 >= start) active = i;
      });

      chapters.forEach((ch, i) => {
        ch.querySelectorAll(".ex-rail li").forEach((li, n) => {
          li.classList.toggle("is-on", n === active);
          li.classList.toggle("is-done", n < active);
        });
      });
    }

    chapters.forEach((ch) => {
      ch.querySelectorAll(".ex-rail li").forEach((li, n) => {
        li.addEventListener("click", () => {
          const target = chapters[n];
          if (!target) return;
          const top = flowStart(target);
          if (window.lenis) window.lenis.scrollTo(top, { duration: 1.15 });
          else window.scrollTo({ top, behavior: "smooth" });
        });
      });
    });

    tick();
    if (window.lenis) window.lenis.on("scroll", tick);
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick);
    if (window.ScrollTrigger) ScrollTrigger.addEventListener("refresh", tick);

    function loop() {
      tick();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  initExpedition();

  function initCrewLabs() {
    const tracks = Array.from(document.querySelectorAll("[data-crew]"));
    if (!tracks.length) return;

    function clamp(n, a, b) {
      return Math.max(a, Math.min(b, n));
    }

    function scrollY() {
      return window.lenis ? window.lenis.scroll : window.scrollY || window.pageYOffset || 0;
    }

    function tick() {
      const y = scrollY();
      const vh = window.innerHeight;
      tracks.forEach((track) => {
        const sticky = track.querySelector(".lab-layers__sticky");
        if (!sticky) return;
        const start = docTop(track);
        const run = Math.max(track.offsetHeight - vh, 1);
        const p = clamp((y - start) / run, 0, 1);
        sticky.style.setProperty("--s", p.toFixed(4));
        const sep = sticky.querySelector("[data-k='s']");
        if (sep) sep.textContent = p.toFixed(2);
        let active = "";
        if (p > 0.06 && p < 0.9) active = String(Math.min(3, Math.floor((p - 0.06) / 0.21)));
        else if (p >= 0.9) active = "all";
        sticky.dataset.active = active;
        sticky.querySelectorAll(".lab-label").forEach((li, i) => {
          li.classList.toggle("is-on", active === "all" || active === String(i));
        });

        const svg = sticky.querySelector(".lab-leaders");
        if (svg) {
          const box = sticky.getBoundingClientRect();
          sticky.querySelectorAll(".lab-label").forEach((label) => {
            const i = label.dataset.i;
            const layer = sticky.querySelector(`.lab-layer[data-i="${i}"]`);
            const g = svg.querySelector(`g[data-i="${i}"]`);
            if (!layer || !g) return;
            const lr = label.getBoundingClientRect();
            const ar = layer.getBoundingClientRect();
            const x1 = lr.left + lr.width * 0.12 - box.left;
            const y1 = lr.top - box.top;
            const x2 = ar.left + ar.width * 0.62 - box.left;
            const y2 = ar.top + ar.height * 0.38 - box.top;
            const path = g.querySelector("path");
            const rect = g.querySelector("rect");
            if (path) path.setAttribute("d", `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`);
            if (rect) {
              rect.setAttribute("x", (x2 - 4).toFixed(1));
              rect.setAttribute("y", (y2 - 4).toFixed(1));
            }
            g.classList.toggle("is-on", label.classList.contains("is-on"));
          });
        }
      });
    }

    window.addEventListener("pointermove", (e) => {
      const x = ((e.clientX / innerWidth) * 2 - 1) * 8;
      const y = ((e.clientY / innerHeight) * 2 - 1) * -4;
      document.documentElement.style.setProperty("--mx", `${x.toFixed(2)}deg`);
      document.documentElement.style.setProperty("--my", `${y.toFixed(2)}deg`);
      tracks.forEach((track) => {
        track.style.setProperty("--mx", `${x.toFixed(2)}deg`);
        track.style.setProperty("--my", `${y.toFixed(2)}deg`);
      });
    });

    tick();
    if (window.lenis) window.lenis.on("scroll", tick);
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick);
    function loop() {
      tick();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  initCrewLabs();

  const canvas = document.getElementById("rain");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const sparkleEl = document.getElementById("sparkle");
  const confettiEl = document.getElementById("confetti");
  const burstEl = document.getElementById("burst");
  const pauseBtn = document.getElementById("pause");
  const aweEl = document.getElementById("awesomeness");
  const sparkleVal = document.getElementById("sparkleVal");
  const confettiVal = document.getElementById("confettiVal");
  const burstVal = document.getElementById("burstVal");
  const COLORS = ["#ffffff", "#ffd76a", "#2ea8ff", "#ff3b12", "#111111"];

  let sparkles = [];
  let confetti = [];
  let paused = false;
  let awesomeness = 28;

  function read(el, fallback) {
    return el ? Number(el.value) / 100 : fallback;
  }

  function pct(el) {
    return el ? Number(el.value) : 0;
  }

  function resize() {
    canvas.width = canvas.offsetWidth * devicePixelRatio;
    canvas.height = canvas.offsetHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    seed();
  }

  function burstScale() {
    return 0.45 + read(burstEl, 0.3) * 1.8;
  }

  function spawnSparkle(anywhere) {
    const s = burstScale();
    return {
      x: Math.random() * canvas.offsetWidth,
      y: anywhere ? Math.random() * canvas.offsetHeight : -12,
      r: (2.2 + Math.random() * 5.5) * s,
      tw: Math.random() * Math.PI * 2,
      tws: 0.04 + Math.random() * 0.08,
      vx: (Math.random() - 0.5) * 0.45,
      vy: 0.15 + Math.random() * 0.55,
      rot: Math.random() * Math.PI,
    };
  }

  function spawnConfetti(anywhere) {
    const s = burstScale();
    return {
      x: Math.random() * canvas.offsetWidth,
      y: anywhere ? Math.random() * canvas.offsetHeight : -18,
      w: (5 + Math.random() * 8) * s,
      h: (3 + Math.random() * 5) * s,
      vx: (Math.random() - 0.5) * 1.6,
      vy: 1.4 + Math.random() * 2.8,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.18,
      color: COLORS[(Math.random() * COLORS.length) | 0],
    };
  }

  function seed() {
    const w = Math.max(canvas.offsetWidth, 1);
    const sparkleCount = Math.round((w / 14) * read(sparkleEl, 0.35) * 1.8);
    const confettiCount = Math.round((w / 18) * read(confettiEl, 0.2) * 2.2);
    sparkles = Array.from({ length: sparkleCount }, () => spawnSparkle(true));
    confetti = Array.from({ length: confettiCount }, () => spawnConfetti(true));
  }

  function drawStar(x, y, r, rot, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.moveTo(0, -r);
    ctx.lineTo(0, r);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
    const target = (pct(sparkleEl) + pct(confettiEl) + pct(burstEl)) / 3;
    awesomeness += (target - awesomeness) * 0.08;

    if (!paused) {
      sparkles.forEach((p) => {
        p.tw += p.tws;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += 0.02;
        if (p.y > canvas.offsetHeight + 16 || p.x < -16 || p.x > canvas.offsetWidth + 16) {
          Object.assign(p, spawnSparkle(false));
        }
        const flash = 0.35 + Math.abs(Math.sin(p.tw)) * 0.65;
        drawStar(p.x, p.y, p.r, p.rot, flash);
      });

      confetti.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.spin;
        p.vx += Math.sin(p.y * 0.02) * 0.03;
        if (p.y > canvas.offsetHeight + 20 || p.x < -24 || p.x > canvas.offsetWidth + 24) {
          Object.assign(p, spawnConfetti(false));
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      ctx.globalAlpha = 1;
    }

    if (aweEl) {
      const shown = Math.max(0, Math.min(100, Math.round(awesomeness)));
      aweEl.textContent = String(shown).padStart(2, "0");
    }
    requestAnimationFrame(tick);
  }

  function syncLabels() {
    if (sparkleVal && sparkleEl) sparkleVal.textContent = `${sparkleEl.value}%`;
    if (confettiVal && confettiEl) confettiVal.textContent = `${confettiEl.value}%`;
    if (burstVal && burstEl) burstVal.textContent = `${burstEl.value}%`;
    seed();
  }

  [sparkleEl, confettiEl, burstEl].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", syncLabels);
  });

  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      paused = !paused;
      pauseBtn.textContent = paused ? "▶" : "❚❚";
    });
  }

  window.addEventListener("resize", () => {
    resize();
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  });
  resize();
  syncLabels();
  tick();
})();
