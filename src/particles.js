export function initParticleEffects(container) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  const selector = 'button, .key, .close-btn, [role="button"], .tile';
  document.addEventListener('pointerdown', e => {
    if (!document.body.classList.contains('glass-theme')) return;
    const target = e.target.closest(selector);
    if (!target) return;
    const rect = container.getBoundingClientRect();
    emitBurst(e.clientX - rect.left, e.clientY - rect.top, container);
  });
}

function emitBurst(x, y, container) {
  const colors = ['var(--accent-blue)', 'var(--accent-purple)', 'var(--accent-pink)', 'var(--accent-cyan)'];
  for (let i = 0; i < 8; i++) {
    const p = document.createElement('div');
    const size = 8 + Math.random() * 12;
    p.className = 'particle';
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.left = `${x - size / 2}px`;
    p.style.top = `${y - size / 2}px`;
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    const angle = Math.random() * 2 * Math.PI;
    const distance = 20 + Math.random() * 20;
    p.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
    container.appendChild(p);
    p.addEventListener('animationend', () => p.remove(), { once: true });
  }
}
