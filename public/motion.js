const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let frame;
export function celebrate() {
  cancelAnimationFrame(frame);
  const canvas = document.getElementById('confetti');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (reduced.matches) return;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const width = innerWidth;
  const height = innerHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.scale(ratio, ratio);
  const colors = ['#b5ef34', '#7d2a94', '#f2b825', '#d9203f', '#14a89b', '#1b72d6'];
  const particles = Array.from({ length: 48 }, (_, i) => ({
    x: width / 2, y: Math.min(240, height / 3), vx: (Math.random() - .5) * 370,
    vy: -120 - Math.random() * 220, angle: Math.random() * Math.PI,
    spin: Math.random() * 5 - 2.5, color: colors[i % colors.length]
  }));
  const start = performance.now();
  let last = start;
  function draw(now) {
    ctx.clearRect(0, 0, width, height);
    if (reduced.matches || document.hidden || now - start > 2200) return;
    const dt = Math.min((now - last) / 1000, .05);
    last = now;
    ctx.globalAlpha = Math.min(1, (2200 - (now - start)) / 600);
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.angle += p.spin * dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.fillStyle = p.color;
      ctx.fillRect(-3, -2, 6, 4); ctx.restore();
    }
    frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);
}

export function bindTilt(card) {
  let active = false;
  card.addEventListener('pointerdown', () => { active = true; });
  card.addEventListener('pointermove', event => {
    if (reduced.matches || (event.pointerType !== 'mouse' && !active)) return;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    card.style.transform = `perspective(700px) rotateX(${-y * 7}deg) rotateY(${x * 7}deg)`;
  });
  const reset = () => { active = false; card.style.transform = ''; };
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(name => card.addEventListener(name, reset));
  reduced.addEventListener('change', reset);
}
