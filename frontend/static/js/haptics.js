export function supportsHaptics() {
  return typeof navigator !== 'undefined'
    && navigator.maxTouchPoints > 0
    && typeof navigator.vibrate === 'function';
}

export function hapticFeedback(pattern = 8) {
  if (!supportsHaptics() || document.visibilityState === 'hidden'
    || localStorage.getItem('hapticsEnabled') === 'false') return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    // A browser refusing vibration must not interrupt a game action.
    return false;
  }
}

export function initHaptics() {
  const toggle = document.getElementById('menuHaptics');
  if (!toggle) return;
  toggle.hidden = !supportsHaptics();
  if (toggle.hidden) return;

  const updateLabel = () => {
    const enabled = localStorage.getItem('hapticsEnabled') !== 'false';
    toggle.textContent = enabled ? '📳 Haptics On' : '📳 Haptics Off';
    toggle.setAttribute('aria-pressed', String(enabled));
    return enabled;
  };
  updateLabel();
  toggle.addEventListener('click', () => {
    localStorage.setItem('hapticsEnabled', String(localStorage.getItem('hapticsEnabled') === 'false'));
    if (updateLabel()) hapticFeedback();
    else {
      try { navigator.vibrate(0); } catch {}
    }
  });

  document.addEventListener('click', (event) => {
    const control = event.target.closest?.('#optionsToggle, #optionsMenu button:not(#menuHaptics), .close-btn, #hostControls button, #chatNotify');
    if (control && !control.disabled) hapticFeedback();
  });
}
