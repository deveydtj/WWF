let palette;
let animation;
let cleanupTimer;

/** Animate the shared palette, including gradient stops and shadows. */
export function applyDarkMode(enabled, { animate = false } = {}) {
  const body = document.body;
  if (typeof window === 'undefined') {
    body.classList.toggle('dark-mode', enabled);
    return;
  }

  const style = getComputedStyle(body);
  if (animate && !palette && window.CSS?.registerProperty) {
    palette = Array.from(style).filter(name =>
      name.startsWith('--') && CSS.supports('color', style.getPropertyValue(name).trim())
    );
    for (const name of palette) {
      CSS.registerProperty({
        name, syntax: '<color>', inherits: true,
        initialValue: style.getPropertyValue(name).trim(),
      });
    }
  }

  const colors = () => {
    const currentStyle = getComputedStyle(body);
    return Object.fromEntries((palette || []).map(name =>
      [name, currentStyle.getPropertyValue(name)]
    ));
  };
  // Capture the current frame before cancelling so rapid toggles reverse smoothly.
  const from = colors();
  animation?.cancel();
  clearTimeout(cleanupTimer);
  body.classList.add('theme-changing');
  body.classList.toggle('theme-interpolating', Boolean(palette) || !animate);
  // Apply transition rules before changing the underlying theme.
  getComputedStyle(body).backgroundColor;
  body.classList.toggle('dark-mode', enabled);
  document.documentElement.style.colorScheme = enabled ? 'dark' : 'light';
  // Once CSS is ready, let the body's animated background paint the canvas.
  document.documentElement.style.removeProperty('background-color');

  const cleanup = () => {
    body.classList.remove('theme-changing', 'theme-interpolating');
  };
  if (animate && palette && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const currentAnimation = body.animate([from, colors()], { duration: 300, easing: 'ease-in-out' });
    animation = currentAnimation;
    currentAnimation.onfinish = () => {
      if (animation === currentAnimation) cleanup();
    };
  } else {
    cleanupTimer = setTimeout(cleanup, 350);
  }
}
