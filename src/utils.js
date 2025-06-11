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

function animatePanelToCenter(box) {
  if (typeof box.getBoundingClientRect !== 'function') {
    box.style.transition = '';
    box.style.transform = '';
    box.style.position = '';
    box.style.top = '';
    box.style.left = '';
    return;
  }
  const rect = box.getBoundingClientRect();
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const offsetX = centerX - (rect.left + rect.width / 2);
  const offsetY = centerY - (rect.top + rect.height / 2);
  box.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
  box.style.transform = 'translate(0, 0) scale(1)';
  requestAnimationFrame(() => {
    box.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(0)`;
  });
  setTimeout(() => {
    box.style.transition = '';
    box.style.transform = '';
    box.style.position = '';
    box.style.top = '';
    box.style.left = '';
  }, 310);
}

export function positionSidePanels(boardArea, historyBox, definitionBox) {
  if (window.innerWidth > 600) {
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
  } else {
    historyBox.style.position = '';
    historyBox.style.top = '';
    historyBox.style.left = '';
    definitionBox.style.position = '';
    definitionBox.style.top = '';
    definitionBox.style.left = '';
  }
}

export function updateOverlayMode(boardArea, historyBox, definitionBox) {
  const wasPopup = document.body.classList.contains('overlay-mode');
  let willBePopup = false;
  if (window.innerWidth > 600) {
    const total =
      historyBox.offsetWidth +
      boardArea.offsetWidth +
      definitionBox.offsetWidth +
      120; // margins used in positioning
    willBePopup = total > window.innerWidth;
  }

  if (!wasPopup && willBePopup) {
    animatePanelToCenter(historyBox);
    animatePanelToCenter(definitionBox);
  }

  if (willBePopup) {
    document.body.classList.add('overlay-mode');
    document.body.classList.remove('history-open');
    document.body.classList.remove('definition-open');
  } else {
    document.body.classList.remove('overlay-mode');
  }

  const isPopup = document.body.classList.contains('overlay-mode');

  if (wasPopup && !isPopup && window.innerWidth > 600) {
    document.body.classList.add('history-open');
    document.body.classList.add('definition-open');
  }
  // When switching to narrow screens or into overlay mode, reset inline styles
  // so panels are positioned by CSS rules instead of leftover absolute values.
  if (window.innerWidth <= 600 || isPopup) {
    // styles will be cleared after animation by animatePanelToCenter
    if (wasPopup || !isPopup) {
      historyBox.style.position = '';
      historyBox.style.top = '';
      historyBox.style.left = '';
      definitionBox.style.position = '';
      definitionBox.style.top = '';
      definitionBox.style.left = '';
    }
  }
}

export function updateVH() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
