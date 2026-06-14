const stops = [
  { at: 0, color: "#0466C8" },
  { at: 0.14, color: "#0353A4" },
  { at: 0.3, color: "#023E7D" },
  { at: 0.5, color: "#002855" },
  { at: 0.72, color: "#001845" },
  { at: 1, color: "#001233" },
];

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const depthValue = document.querySelector("#depth-value");
const depthMarker = document.querySelector("#depth-marker");
const sunRays = document.querySelector(".sun-rays");
const ticks = document.querySelector(".meter-ticks");
const track = document.querySelector(".meter-track");
const canvas = document.querySelector("#marine-snow");
const ctx = canvas.getContext("2d");

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
    from.g + (to.g - from.g) * local
  )}, ${Math.round(from.b + (to.b - from.b) * local)})`;
}

function getProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max <= 0 ? 0 : Math.min(window.scrollY / max, 1);
}

function updateDepth() {
  const progress = getProgress();
  const depth = Math.round(progress * 3000);
  const trackHeight = track.getBoundingClientRect().height;

  document.body.style.backgroundColor = mixColor(progress);
  depthValue.textContent = `${String(depth).padStart(4, "0")}m`;
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

  particles = Array.from({ length: Math.min(90, Math.floor(width / 16)) }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: Math.random() * 1.8 + 0.4,
    speed: Math.random() * 0.42 + 0.12,
    drift: Math.random() * 0.42 - 0.21,
    phase: Math.random() * Math.PI * 2,
  }));
}

function drawSnow(time = 0) {
  ctx.clearRect(0, 0, width, height);

  if (snowOpacity > 0.01) {
    ctx.globalAlpha = snowOpacity;
    particles.forEach((particle) => {
      particle.y += particle.speed;
      particle.x += particle.drift + Math.sin(time / 1400 + particle.phase) * 0.12;

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
    { threshold: 0.18 }
  );

  document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
}

createTicks();
resizeCanvas();
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
