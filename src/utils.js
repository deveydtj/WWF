export const isMobile =
  typeof navigator !== 'undefined' &&
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export function showMessage(msg, {messageEl, messagePopup}) {
  if (isMobile) {
    messagePopup.textContent = msg;
    messagePopup.style.display = 'block';
    messagePopup.style.animation = 'fadeInOut 2s';
    messagePopup.addEventListener('animationend', () => {
      messagePopup.style.display = 'none';
      messagePopup.style.animation = '';
    }, { once: true });
  } else {
    messageEl.textContent = msg;
    if (msg) {
      messageEl.style.visibility = 'visible';
      messageEl.style.animation = 'fadeInOut 2s';
      messageEl.addEventListener('animationend', () => {
        messageEl.style.visibility = 'hidden';
        messageEl.style.animation = '';
      }, { once: true });
    } else {
      messageEl.style.visibility = 'hidden';
    }
  }
}

export function applyDarkModePreference(toggle) {
  const prefersDark = localStorage.getItem('darkMode') === 'true';
  document.body.classList.toggle('dark-mode', prefersDark);
  toggle.textContent = prefersDark ? '☀️' : '🌙';
  toggle.title = prefersDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
}
export function applyThemePreference(link, toggle) {
  const theme = localStorage.getItem("theme") || "neumorphic";
  link.href = `${theme}.css`;
  if (toggle) {
    toggle.textContent = theme === "neumorphic" ? "Liquid Glass" : "Neumorphic";
    toggle.title = theme === "neumorphic" ? "Switch to Liquid Glass Theme" : "Switch to Neumorphic Theme";
  }
}


export function shakeInput(input) {
  input.style.animation = 'shake 0.4s';
  input.addEventListener('animationend', () => {
    input.style.animation = '';
  }, { once: true });
}

export function repositionResetButton() {
  const resetWrapper = document.getElementById('resetWrapper');
  const titleBar = document.getElementById('titleBar');
  const inputArea = document.getElementById('inputArea');
  if (window.innerWidth <= 600) {
    if (!titleBar.contains(resetWrapper)) {
      titleBar.insertBefore(resetWrapper, titleBar.firstChild);
    }
  } else if (!inputArea.contains(resetWrapper)) {
    inputArea.appendChild(resetWrapper);
  }
}

export function positionSidePanels(boardArea, historyBox, definitionBox, chatBox) {
  if (window.innerWidth > 900) {
    const boardRect = boardArea.getBoundingClientRect();
    const top = boardRect.top + window.scrollY;
    const left = boardRect.left + window.scrollX;
    const right = boardRect.right + window.scrollX;

    historyBox.style.position = 'absolute';
    historyBox.style.top = `${top}px`;
    historyBox.style.left = `${left - historyBox.offsetWidth - 60}px`;

    definitionBox.style.position = 'absolute';
    definitionBox.style.top = `${top}px`;
    definitionBox.style.left = `${right + 60}px`;
    if (chatBox) {
      chatBox.style.position = 'absolute';
      chatBox.style.left = `${right + 60}px`;
      chatBox.style.top = `${top + definitionBox.offsetHeight + 20}px`;
    }
  } else {
    historyBox.style.position = '';
    historyBox.style.top = '';
    historyBox.style.left = '';
    definitionBox.style.position = '';
    definitionBox.style.top = '';
    definitionBox.style.left = '';
    if (chatBox) {
      chatBox.style.position = '';
      chatBox.style.top = '';
      chatBox.style.left = '';
    }
  }
}


export function updateVH() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

export function applyLayoutMode() {
  const width = window.innerWidth;
  let mode = 'full';
  if (width <= 600) {
    mode = 'light';
  } else if (width <= 900) {
    mode = 'medium';
  }
  if (document.body.dataset.mode !== mode) {
    document.body.dataset.mode = mode;
  }
}

export function positionPopup(popup, anchor) {
  const rect = anchor.getBoundingClientRect();
  const menuWidth = popup.offsetWidth;
  const menuHeight = popup.offsetHeight;
  let left = rect.right + 10 + window.scrollX;
  if (window.innerWidth - rect.right < menuWidth + 10) {
    if (rect.left >= menuWidth + 10) {
      left = rect.left - menuWidth - 10 + window.scrollX;
    } else {
      left = Math.max(10 + window.scrollX, window.innerWidth - menuWidth - 10);
    }
  }
  let top = rect.top + window.scrollY;
  if (rect.bottom + menuHeight > window.scrollY + window.innerHeight - 10) {
    top = window.scrollY + window.innerHeight - menuHeight - 10;
  }
  top = Math.max(top, window.scrollY + 10);
  popup.style.position = 'absolute';
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

export function showPopup(popup, anchor) {
  popup.style.display = 'block';
  positionPopup(popup, anchor);
}

export function createBokehOverlay(el, opts = {}) {
  const { small = false } = opts;
  const overlay = document.createElement('div');
  overlay.className = 'bokeh-overlay';
  const count = small ? 3 : 4;
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('span');
    dot.className = 'particle';
    const size = (small ? 8 : 15) + Math.random() * (small ? 12 : 25);
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.left = `${Math.random() * 100}%`;
    dot.style.top = `${Math.random() * 100}%`;
    const dur = small ? 0.8 + Math.random() * 0.6 : 1.5 + Math.random() * 2.5;
    dot.style.animationDuration = `${dur}s`;
    overlay.appendChild(dot);
  }
  if (getComputedStyle(el).position === 'static') {
    el.style.position = 'relative';
  }
  el.appendChild(overlay);
  return overlay;
}

export function removeBokehOverlay(el) {
  const overlay = el.querySelector(':scope > .bokeh-overlay');
  if (overlay) overlay.remove();
}

export function installBokehListeners() {
  document.addEventListener(
    'animationstart',
    (e) => {
      if ((localStorage.getItem('theme') || 'neumorphic') === 'liquid-glass') {
        createBokehOverlay(e.target);
      }
    },
    true
  );
  document.addEventListener(
    'animationend',
    (e) => {
      removeBokehOverlay(e.target);
    },
    true
  );

  document.addEventListener(
    'pointerdown',
    (e) => {
      if ((localStorage.getItem('theme') || 'neumorphic') === 'liquid-glass') {
        createBokehOverlay(e.target, { small: true });
        setTimeout(() => removeBokehOverlay(e.target), 600);
      }
    },
    true
  );
}
