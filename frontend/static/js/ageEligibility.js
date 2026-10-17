// Eligibility comes from the signed server session, never a localStorage flag.
let pendingCheck;

export async function getAgeStatus() {
  const response = await fetch('/age-status', { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error('Could not check eligibility. Please try again.');
  return response.json();
}

function clearGameIdentity() {
  sessionStorage.removeItem('privateRoom');
  try {
    for (const key of Object.keys(localStorage)) {
      if (['playerId', 'myEmoji', 'lastLobby', 'hostToken'].includes(key) || key.startsWith('hintState-')) {
        localStorage.removeItem(key);
      }
    }
  } catch { /* Storage can be unavailable; server eligibility still applies. */ }
}

async function checkEligibility() {
  let eligibility;
  let error;
  try {
    ({ eligibility } = await getAgeStatus());
    if (eligibility === 'eligible') return true;
  } catch (failure) {
    error = failure.message;
  }

  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.id = 'ageCheckDialog';
    dialog.setAttribute('aria-labelledby', 'ageCheckHeading');
    dialog.innerHTML = `
      <h2 id="ageCheckHeading">Before you play</h2>
      <p id="ageCheckDescription">We use your answer to determine whether you can participate.
        We remember only the result for this browser session, not your age.</p>
      <form id="ageCheckForm">
        <label for="ageInput">How old are you?</label>
        <input id="ageInput" name="age" type="number" min="0" max="120" step="1"
          inputmode="numeric" autocomplete="off" required aria-describedby="ageCheckDescription ageCheckError">
        <p id="ageCheckError" role="alert"></p>
        <button type="submit">Continue</button>
      </form>
      <p id="ageBlockedMessage" hidden role="status">Multiplayer and chat are unavailable for this session.
        You can still read how to play on the home page.</p>
      <button id="ageRetry" type="button" hidden>Wrong age? Try again</button>
      <button id="ageCheckClose" type="button">Back to browsing</button>`;
    document.body.appendChild(dialog);
    const form = dialog.querySelector('form');
    const input = dialog.querySelector('input');
    const message = dialog.querySelector('#ageCheckError');
    const continueButton = form.querySelector('button');
    let accepted = false;

    const retryButton = dialog.querySelector('#ageRetry');

    function block() {
      clearGameIdentity();
      form.hidden = true;
      dialog.querySelector('#ageCheckDescription').hidden = true;
      dialog.querySelector('#ageBlockedMessage').hidden = false;
      retryButton.hidden = false;
      dialog.querySelector('#ageCheckClose').focus();
    }

    // A mistyped age can be corrected by answering again.
    function retry() {
      form.hidden = false;
      dialog.querySelector('#ageCheckDescription').hidden = false;
      dialog.querySelector('#ageBlockedMessage').hidden = true;
      retryButton.hidden = true;
      message.textContent = '';
      input.value = '';
      input.focus();
    }
    retryButton.addEventListener('click', retry);
    if (eligibility === 'blocked') block();
    if (error) {
      message.textContent = error;
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity() || continueButton.disabled) return;
      const age = Number(input.value);
      input.value = '';
      continueButton.disabled = true;
      message.textContent = '';
      try {
        const response = await fetch('/age-check', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ age })
        });
        const result = await response.json();
        if (result.eligibility === 'blocked') {
          block();
        } else if (response.ok && result.eligibility === 'eligible') {
          // Cookies may be disabled. Do not proceed without a server session.
          const confirmed = await getAgeStatus();
          if (confirmed.eligibility !== 'eligible') {
            throw new Error('Allow cookies for this website to continue.');
          }
          accepted = true;
          dialog.close();
        } else {
          throw new Error(result.msg || 'Could not check eligibility. Please try again.');
        }
      } catch (failure) {
        message.textContent = failure.message;
      } finally {
        continueButton.disabled = false;
      }
    });
    dialog.querySelector('#ageCheckClose').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(accepted);
    }, { once: true });
    dialog.showModal();
  });
}

export function ensureAgeEligibility() {
  if (!pendingCheck) {
    pendingCheck = checkEligibility().finally(() => { pendingCheck = undefined; });
  }
  return pendingCheck;
}
