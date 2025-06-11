export const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

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

export function updatePopupMode(boardArea, historyBox, definitionBox) {
  const wasPopup = document.body.classList.contains('popup-mode');
  if (window.innerWidth > 600) {
    const total =
      historyBox.offsetWidth +
      boardArea.offsetWidth +
      definitionBox.offsetWidth +
      120; // margins used in positioning
    if (total > window.innerWidth) {
      document.body.classList.add('popup-mode');
      document.body.classList.remove('history-open');
      document.body.classList.remove('definition-open');
    } else {
      document.body.classList.remove('popup-mode');
    }
  } else {
    document.body.classList.remove('popup-mode');
  }
  const isPopup = document.body.classList.contains('popup-mode');
  if (wasPopup && !isPopup && window.innerWidth > 600) {
    document.body.classList.add('history-open');
    document.body.classList.add('definition-open');
  }
}

export function updateVH() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
