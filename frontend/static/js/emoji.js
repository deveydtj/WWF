import { sendEmoji } from './api.js';
import { openDialog, closeDialog, enableClickOffDismiss } from './utils.js';

const emojiModal = typeof document !== 'undefined' ? document.getElementById('emojiModal') : null;
enableClickOffDismiss(emojiModal);

/**
 * Retrieve the player's stored emoji identifier.
 *
 * @returns {string|null} Saved emoji or null if none.
 */
export function getMyEmoji() {
  return localStorage.getItem('myEmoji') || null;
}

export function getMyPlayerId() {
  return localStorage.getItem('playerId') || null;
}

/**
 * Persist the player's chosen emoji locally.
 *
 * @param {string} e - Emoji string.
 */
export function setMyEmoji(e) {
  localStorage.setItem('myEmoji', e);
}

export function setMyPlayerId(pid) {
  if (pid) localStorage.setItem('playerId', pid);
}

export const allEmojis = [
  "🐶", "🦊", "🐼", "🐸", "🐵", "🐧", "🐙", "🦉", "🦄", "🦁",
  "🐯", "🐨", "🐻", "🦖", "🦕", "🐝", "🐳", "🦋", "🐢", "🐬"
];

/**
 * Extract the base emoji from a variant.
 * @param {string} emojiVariant - Either a base emoji or variant (e.g., "🐶" or "🐶-red")
 * @returns {string} The base emoji string
 */
export function getBaseEmoji(emojiVariant) {
  if (typeof emojiVariant === 'string' && emojiVariant.includes('-')) {
    return emojiVariant.split('-')[0];
  }
  return emojiVariant;
}

/**
 * Get the variant name from an emoji variant.
 * @param {string} emojiVariant - Either a base emoji or variant (e.g., "🐶" or "🐶-red")
 * @returns {string|null} The variant name or null if it's a base emoji
 */
export function getEmojiVariant(emojiVariant) {
  if (typeof emojiVariant === 'string' && emojiVariant.includes('-')) {
    return emojiVariant.split('-')[1];
  }
  return null;
}

/**
 * Apply visual styling to an emoji element based on its variant.
 * @param {HTMLElement} element - The element containing the emoji
 * @param {string} emojiVariant - The emoji variant string
 */
export function applyEmojiVariantStyling(element, emojiVariant) {
  const variant = getEmojiVariant(emojiVariant);
  const baseEmoji = getBaseEmoji(emojiVariant);
  
  // Set the base emoji as text content
  element.textContent = baseEmoji;
  
  // Remove any existing variant classes
  element.classList.remove('emoji-variant-red', 'emoji-variant-blue', 'emoji-variant-green', 
                           'emoji-variant-yellow', 'emoji-variant-purple', 'emoji-variant-orange',
                           'emoji-variant-pink', 'emoji-variant-cyan', 'emoji-variant-numbered');
  
  if (variant) {
    // Check if it's a numbered variant (like "9", "10", etc.)
    if (/^\d+$/.test(variant)) {
      element.classList.add('emoji-variant-numbered');
      // Add a small number indicator
      element.setAttribute('data-variant', variant);
    } else {
      // Apply the color variant class
      element.classList.add(`emoji-variant-${variant}`);
    }
  }
}

/**
 * Display the emoji picker modal.
 *
 * @param {Array<string>} takenEmojis - Emojis already claimed by others.
 * @param {{onChosen:function, skipAutoCloseRef:{value:boolean}}} options
 */
export function showEmojiModal(takenEmojis, {
  onChosen,
  skipAutoCloseRef,
  onError
}) {
  const modal = document.getElementById('emojiModal');
  const choices = document.getElementById('emojiChoices');
  const errorEl = document.getElementById('emojiModalError');
  choices.innerHTML = '';

  allEmojis.forEach(e => {
    const btn = document.createElement('span');
    btn.className = 'emoji-choice';
    btn.innerText = e;
    
    // Check if this base emoji is taken
    const baseEmojiTaken = takenEmojis.some(taken => getBaseEmoji(taken) === e);
    
    if (baseEmojiTaken) {
      // Add a visual indicator that this emoji will get a variant
      btn.classList.add('emoji-variant-available');
      btn.title = 'This emoji is in use - you\'ll get a colored variant';
    }

    btn.onclick = async () => {
    const data = await sendEmoji(e, getMyPlayerId(), window.LOBBY_CODE);
    if (data.status === 'ok') {
      if (data.player_id) setMyPlayerId(data.player_id);
      if (skipAutoCloseRef) skipAutoCloseRef.value = false;
      // Store the assigned variant emoji, not just the base emoji
      const assignedEmoji = data.emoji || e;
      setMyEmoji(assignedEmoji);
      if (typeof onChosen === 'function') onChosen(assignedEmoji);
      closeDialog(modal);
    } else {
      errorEl.textContent = data.msg || 'That emoji is taken.';
      if (typeof onError === 'function') onError(data.msg);
    }
  };

    choices.appendChild(btn);
  });

  errorEl.textContent = '';
  modal.style.display = 'flex';
  openDialog(modal);
}
