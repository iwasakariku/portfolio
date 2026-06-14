const stops = [
  { at: 0, color: "#0466C8" },
  { at: 0.14, color: "#0353A4" },
  { at: 0.3, color: "#023E7D" },
  { at: 0.5, color: "#002855" },
  { at: 0.72, color: "#001845" },
  { at: 1, color: "#001233" },
];

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
const depthValue = document.querySelector("#depth-value");
const depthMarker = document.querySelector("#depth-marker");
const sunRays = document.querySelector(".sun-rays");
const ticks = document.querySelector(".meter-ticks");
const track = document.querySelector(".meter-track");
const surface = document.querySelector("#surface");
const canvas = document.querySelector("#marine-snow");
const ctx = canvas.getContext("2d");
const meterLabel = document.querySelector(".meter-label");
const skyEl = document.querySelector("#sky");
const skyContent = document.querySelector(".sky-content");

if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

let ticking = false;
let snowOpacity = 0;
let particles = [];
let width = 0;
let height = 0;

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function mixColor(progress) {
  const nextIndex = stops.findIndex((stop) => stop.at >= progress);
  const end = stops[Math.max(nextIndex, 1)];
  const start = stops[Math.max(nextIndex - 1, 0)];
  const local = (progress - start.at) / Math.max(end.at - start.at, 0.001);
  const from = hexToRgb(start.color);
  const to = hexToRgb(end.color);

  return `rgb(${Math.round(from.r + (to.r - from.r) * local)}, ${Math.round(
    from.g + (to.g - from.g) * local,
  )}, ${Math.round(from.b + (to.b - from.b) * local)})`;
}

function getScrollState() {
  const diveStart = surface ? surface.offsetTop : 0;
  const maxDiveScroll =
    document.documentElement.scrollHeight - window.innerHeight - diveStart;
  const progress =
    maxDiveScroll <= 0 ? 0 : (window.scrollY - diveStart) / maxDiveScroll;
  const skyRatio =
    diveStart <= 0 ? 0 : (diveStart - window.scrollY) / diveStart;

  return {
    progress: Math.max(0, Math.min(progress, 1)),
    skyRatio: Math.max(0, Math.min(skyRatio, 1)),
    skyDescent: 0,
  };
}

function updateDepth() {
  const { progress } = getScrollState();
  const depth = Math.round(progress * 3000);
  const trackHeight = track.getBoundingClientRect().height;

  document.body.style.backgroundColor = mixColor(progress);

  // sky overlay が管理していない時だけ DEPTH 表示を更新
  if (!skyActive && !skyFullyOpen) {
    document.body.classList.remove("is-in-sky");
    meterLabel.textContent = "DEPTH";
    depthValue.textContent = `${String(depth).padStart(4, "0")}m`;
  }

  depthMarker.style.top = `${progress * trackHeight}px`;
  sunRays.style.opacity = String(Math.max(0, 1 - progress * 4.8));
  snowOpacity = Math.max(0, Math.min(1, (depth - 500) / 950));
  ticking = false;
}

function requestDepthUpdate() {
  if (!ticking) {
    window.requestAnimationFrame(updateDepth);
    ticking = true;
  }
}

function createTicks() {
  const fragment = document.createDocumentFragment();
  for (let index = 0; index <= 30; index += 1) {
    const tick = document.createElement("span");
    tick.style.top = `${(index / 30) * 100}%`;
    if (index % 5 === 0) {
      tick.className = "major";
    }
    fragment.append(tick);
  }
  ticks.append(fragment);
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  particles = Array.from(
    { length: Math.min(90, Math.floor(width / 16)) },
    () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.8 + 0.4,
      speed: Math.random() * 0.42 + 0.12,
      drift: Math.random() * 0.42 - 0.21,
      phase: Math.random() * Math.PI * 2,
    }),
  );
}

function drawSnow(time = 0) {
  ctx.clearRect(0, 0, width, height);

  if (snowOpacity > 0.01) {
    ctx.globalAlpha = snowOpacity;
    particles.forEach((particle) => {
      particle.y += particle.speed;
      particle.x +=
        particle.drift + Math.sin(time / 1400 + particle.phase) * 0.12;

      if (particle.y > height + 8) {
        particle.y = -8;
        particle.x = Math.random() * width;
      }

      if (particle.x < -8) particle.x = width + 8;
      if (particle.x > width + 8) particle.x = -8;

      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(234, 241, 248, .72)";
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  window.requestAnimationFrame(drawSnow);
}

function setupReveal() {
  if (prefersReducedMotion) {
    document.querySelectorAll(".reveal").forEach((element) => {
      element.classList.add("is-visible");
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18 },
  );

  document
    .querySelectorAll(".reveal")
    .forEach((element) => observer.observe(element));
}

// ─── Sky overlay control ─────────────────────────────────────────────────────
// sky は fixed オーバーレイ。hero で上スクロールするとホイール量を蓄積し、
// 段階的に sky が上から降りてくる演出をする。
//
// phase 0 (0–2 steps) : 静止。水色のまま。ALT ↑0m → ↑30m
// phase 1 (2–3 steps) : 白いオーバーレイが浮き上がる。ALT ↑30m → ↑100m
// phase 2 (3–4 steps) : sky コンテンツがフェードイン。ALT ↑100m → ↑120m
// phase 3 (4–5 steps) : sky が完全に画面を覆い、snap で固定
//
// sky の translateY: step 0 = -100%, step 5 = 0%

const SKY_STEPS = 5;
const SKY_WHEEL_STEP = 200; // 1 step あたりのホイール量

let skyStep = 0; // 0〜SKY_STEPS の連続値
let skyActive = false; // hero で上スクロール中のホイールロック
let skyFullyOpen = false; // sky が完全に開いた状態

function setSkyStep(val) {
  skyStep = Math.max(0, Math.min(SKY_STEPS, val));
  renderSkyStep(skyStep);
}
function renderSkyStep(s) {
  if (!skyEl) return;

  // translateY: 0step = -100vh, 5step = 0
  const translatePct = -100 + (s / SKY_STEPS) * 100;
  skyEl.style.transform = `translateY(${translatePct}%)`;

  // sky が画面を覆い始めたら is-in-sky を適用
  const coverRatio = s / SKY_STEPS; // 0〜1
  document.body.classList.toggle("is-in-sky", coverRatio > 0.6);
  meterLabel.textContent = coverRatio > 0.2 ? "ALT" : "DEPTH";

  // ALT 値: phase0(0–2) で 0→30, phase1(2–3) で 30→100, phase2(3–4) で 100→120
  let alt = 0;
  if (s <= 2) {
    alt = Math.round((s / 2) * 30);
  } else if (s <= 3) {
    alt = Math.round(30 + (s - 2) * 70);
  } else {
    alt = Math.round(100 + (s - 3) * 20);
  }
  depthValue.textContent =
    coverRatio > 0.2
      ? `↑${String(alt).padStart(4, "0")}m`
      : depthValue.textContent;

  // sky コンテンツ: phase2(3–4) でフェードイン
  if (skyContent) {
    const contentProgress = Math.max(0, Math.min(s - 3, 1));
    const eased =
      contentProgress < 0.5
        ? 2 * contentProgress * contentProgress
        : 1 - Math.pow(-2 * contentProgress + 2, 2) / 2;
    skyContent.style.opacity = String(eased);
    skyContent.style.transform = `translateY(${(1 - eased) * 20}px)`;
  }

  // 完全に開いたら landing クラスを付与
  skyFullyOpen = s >= SKY_STEPS;
  skyEl.classList.toggle("is-landing", skyFullyOpen);
}

function setupSkyOverlay() {
  if (!skyEl || prefersReducedMotion) {
    // モーション無効時は sky を非表示にするだけ
    if (skyEl) skyEl.style.display = "none";
    return;
  }

  // 初期状態
  skyEl.style.transform = "translateY(-100%)";
  skyEl.style.transition = "none";
  if (skyContent) {
    skyContent.style.opacity = "0";
    skyContent.style.transform = "translateY(20px)";
  }

  let isAtHeroTop = () => {
    const heroEl = surface;
    if (!heroEl) return false;
    return Math.abs(window.scrollY - heroEl.offsetTop) < 4;
  };

  // ホイールイベント
  window.addEventListener(
    "wheel",
    (e) => {
      // sky が途中まで開いている or 完全に開いている → すべて横取り
      if (skyActive || skyFullyOpen) {
        e.preventDefault();

        // 上スクロール（sky をさらに開く / 完全開放維持）
        if (e.deltaY < 0) {
          const newStep = skyStep - e.deltaY / SKY_WHEEL_STEP;
          setSkyStep(Math.min(SKY_STEPS, newStep));
          return;
        }

        // 下スクロール（sky を閉じる）
        if (e.deltaY > 0) {
          const newStep = skyStep - e.deltaY / SKY_WHEEL_STEP;
          if (newStep <= 0) {
            setSkyStep(0);
            skyActive = false;
          } else {
            setSkyStep(newStep);
          }
          return;
        }
      }

      // hero の先頭で上スクロール → sky を引き上げ始める
      if (!skyActive && e.deltaY < 0 && isAtHeroTop()) {
        e.preventDefault();
        skyActive = true;
        const newStep = skyStep - e.deltaY / SKY_WHEEL_STEP;
        setSkyStep(Math.min(SKY_STEPS, newStep));
        return;
      }
    },
    { passive: false },
  );

  // タッチ対応
  let touchStartY = 0;
  window.addEventListener(
    "touchstart",
    (e) => {
      touchStartY = e.touches[0].clientY;
    },
    { passive: true },
  );

  window.addEventListener(
    "touchmove",
    (e) => {
      const deltaY = touchStartY - e.touches[0].clientY; // 上方向が正
      touchStartY = e.touches[0].clientY;

      // 上スワイプで sky を開き始める
      if (!skyActive && deltaY < 0 && isAtHeroTop()) {
        skyActive = true;
      }

      if (skyActive || skyFullyOpen) {
        e.preventDefault();
        // 上スワイプ(deltaY<0)で開く、下スワイプ(deltaY>0)で閉じる
        const step = skyStep + -deltaY / (SKY_WHEEL_STEP * 0.7);
        if (step >= SKY_STEPS) {
          setSkyStep(SKY_STEPS);
        } else if (step <= 0) {
          setSkyStep(0);
          skyActive = false;
        } else {
          setSkyStep(step);
        }
      }
    },
    { passive: false },
  );
}

function getHashTarget() {
  const hash = window.location.hash.slice(1);
  return hash ? document.getElementById(hash) : null;
}

function setupInitialPosition() {
  if (!surface || getHashTarget()) return;

  if (window.location.hash) {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }

  const jumpToSurface = () => {
    const originalScrollBehavior =
      document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, surface.offsetTop);
    document.documentElement.style.scrollBehavior = originalScrollBehavior;
    updateDepth();
  };

  jumpToSurface();
  window.requestAnimationFrame(jumpToSurface);
  window.addEventListener("load", jumpToSurface, { once: true });
}

createTicks();
resizeCanvas();
setupInitialPosition();
setupSkyOverlay();
setupReveal();
updateDepth();

window.addEventListener("scroll", requestDepthUpdate, { passive: true });
window.addEventListener("resize", () => {
  resizeCanvas();
  updateDepth();
});

if (!prefersReducedMotion) {
  window.requestAnimationFrame(drawSnow);
}
