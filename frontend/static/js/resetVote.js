/**
 * Squad vote card for resetting a word mid-round.
 *
 * Each voter is a board tile: green when they vote to scrap the word, grey
 * when they vote to keep playing, blank while they decide. A passed vote
 * refunds the round's points; settled rounds never need a vote.
 */

import { voteReset } from './api.js';
import { getMyEmoji, getMyPlayerId, applyEmojiVariantStyling, getBaseEmoji } from './emoji.js';
import { showMessage, announce } from './utils.js';
import { hapticFeedback } from './haptics.js';

const RESULT_MESSAGES = {
  passed: 'Squad vote passed. New word, and this round’s points were refunded.',
  failed: 'Vote failed. The squad keeps playing.',
  expired: 'Vote ran out of time. The squad keeps playing.',
};
// Results older than this were missed (e.g. a reload) and aren't announced.
const RESULT_FRESH_SECONDS = 15;

let card = null;
let parts = {};
let messageHandlers = null;
let lobbyCode = null;
let refreshState = null;
let lastRoundPoints = {};
let currentVote = null;
let deadline = 0;
let duration = 30;
let clockTimer = null;
let seenResultId = undefined;
let busy = false;
// Once you've voted the card shrinks so the board stays playable; the
// toggle re-opens it to change your vote.
let expanded = false;

function formatPoints(points) {
  const rounded = Math.round(points * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

function build() {
  card = document.createElement('section');
  card.id = 'resetVote';
  card.className = 'reset-vote';
  card.hidden = true;
  card.setAttribute('aria-labelledby', 'resetVoteTitle');
  card.innerHTML = `
    <div class="reset-vote-head">
      <span class="reset-vote-eyebrow">Squad vote</span>
      <span class="reset-vote-clock" aria-hidden="true"></span>
      <button type="button" class="reset-vote-toggle" aria-expanded="true" aria-controls="resetVote">Hide</button>
    </div>
    <p id="resetVoteTitle" class="reset-vote-title"></p>
    <p class="reset-vote-note">If it passes, everyone gets this round’s points back.</p>
    <ul class="reset-vote-tiles" aria-label="Votes"></ul>
    <p class="reset-vote-count" role="status" aria-live="polite"></p>
    <div class="reset-vote-actions">
      <button type="button" class="reset-vote-yes" aria-pressed="false">Scrap it</button>
      <button type="button" class="reset-vote-no" aria-pressed="false">Keep playing</button>
    </div>
    <p class="reset-vote-sitout" hidden>You joined after this vote started.</p>
    <span class="reset-vote-timer" aria-hidden="true"><span></span></span>`;
  parts = {
    clock: card.querySelector('.reset-vote-clock'),
    title: card.querySelector('.reset-vote-title'),
    tiles: card.querySelector('.reset-vote-tiles'),
    count: card.querySelector('.reset-vote-count'),
    actions: card.querySelector('.reset-vote-actions'),
    yes: card.querySelector('.reset-vote-yes'),
    no: card.querySelector('.reset-vote-no'),
    sitout: card.querySelector('.reset-vote-sitout'),
    bar: card.querySelector('.reset-vote-timer > span'),
    toggle: card.querySelector('.reset-vote-toggle'),
  };
  parts.toggle.addEventListener('click', () => {
    expanded = card.classList.contains('reset-vote-compact');
    if (currentVote) renderVote(currentVote, lastRoundPoints);
  });
  window.addEventListener('resize', placeCard);
  parts.yes.addEventListener('click', () => castVote('yes'));
  parts.no.addEventListener('click', () => castVote('no'));
  (document.getElementById('appContainer') || document.body).appendChild(card);
}

export function initResetVote(deps = {}) {
  messageHandlers = deps.messageHandlers || null;
  lobbyCode = deps.lobbyCode || null;
  refreshState = deps.fetchState || null;
  if (!card) build();
}

function notify(text) {
  if (messageHandlers?.messageEl && messageHandlers?.messagePopup) {
    showMessage(text, messageHandlers);
  }
  announce(text);
}

/**
 * Ask the server to start the next word, or call/answer a squad vote.
 * Returns the server response; callers decide how to animate.
 */
export async function sendResetVote(choice = 'yes') {
  return voteReset(lobbyCode, getMyEmoji(), getMyPlayerId(), choice);
}

async function castVote(choice) {
  if (busy) return;
  busy = true;
  hapticFeedback(12);
  try {
    const resp = await sendResetVote(choice);
    if (!resp || resp.status !== 'ok') {
      notify(resp?.msg || 'Could not record your vote.');
      return;
    }
    expanded = false;
    if (resp.vote) renderVote(resp.vote, lastRoundPoints);
    else hide();
    if (resp.outcome === 'passed') notify(RESULT_MESSAGES.passed);
    refreshState?.();
  } catch {
    notify('Could not record your vote.');
  } finally {
    busy = false;
  }
}

// Sit just below the lobby header so the leaderboard stays visible.
function placeCard() {
  if (!card || card.hidden) return;
  const header = document.getElementById('lobbyHeader');
  const bottom = header && header.offsetParent !== null ? header.getBoundingClientRect().bottom : 0;
  card.style.setProperty('--reset-vote-top', `${Math.max(0, Math.round(bottom))}px`);
}

function hide() {
  currentVote = null;
  clearInterval(clockTimer);
  clockTimer = null;
  if (card) card.hidden = true;
}

function tickClock() {
  const left = Math.max(0, (deadline - performance.now()) / 1000);
  parts.clock.textContent = `${Math.ceil(left)}s`;
  parts.bar.style.width = `${(left / duration) * 100}%`;
  card.classList.toggle('reset-vote-urgent', left <= 5);
  // The server closes the vote on its next request; stop showing it now.
  if (left <= 0) hide();
}

function renderVote(vote, roundPoints) {
  const me = getMyEmoji();
  const isNew = !currentVote || currentVote.id !== vote.id;
  if (isNew) expanded = false;
  currentVote = vote;
  duration = vote.duration || 30;
  deadline = performance.now() + vote.seconds_left * 1000;

  const starter = getBaseEmoji(vote.starter || '');
  parts.title.textContent = vote.starter === me
    ? 'You called a vote to scrap this word'
    : `${starter} wants to scrap this word`;

  const previous = new Map([...parts.tiles.children].map(li => [li.dataset.emoji, li.dataset.vote]));
  parts.tiles.replaceChildren();
  for (const emoji of vote.eligible) {
    const choice = vote.yes.includes(emoji) ? 'yes' : vote.no.includes(emoji) ? 'no' : 'waiting';
    const li = document.createElement('li');
    li.className = `reset-vote-tile vote-${choice}`;
    li.dataset.emoji = emoji;
    li.dataset.vote = choice;
    if (!isNew && previous.get(emoji) !== choice) li.classList.add('reset-vote-flip');
    if (emoji === me) li.classList.add('reset-vote-me');
    const face = document.createElement('span');
    face.className = 'reset-vote-face';
    applyEmojiVariantStyling(face, emoji);
    li.appendChild(face);
    const points = roundPoints && roundPoints[emoji];
    if (points) {
      const stake = document.createElement('span');
      stake.className = 'reset-vote-stake';
      stake.textContent = formatPoints(points);
      li.appendChild(stake);
    }
    const label = choice === 'yes' ? 'scrap it' : choice === 'no' ? 'keep playing' : 'deciding';
    li.setAttribute('aria-label', `${getBaseEmoji(emoji)}: ${label}${points ? `, ${formatPoints(points)} this round` : ''}`);
    parts.tiles.appendChild(li);
  }

  const waiting = vote.eligible.length - vote.yes.length - vote.no.length;
  parts.count.textContent = `${vote.yes.length} of ${vote.needed} needed to scrap` +
    (waiting ? ` · ${waiting} deciding` : '');

  const eligible = vote.eligible.includes(me);
  parts.actions.hidden = !eligible;
  parts.sitout.hidden = eligible;
  parts.yes.setAttribute('aria-pressed', String(vote.yes.includes(me)));
  parts.no.setAttribute('aria-pressed', String(vote.no.includes(me)));

  const voted = vote.yes.includes(me) || vote.no.includes(me);
  const compact = (voted || !eligible) && !expanded;
  card.classList.toggle('reset-vote-compact', compact);
  parts.toggle.hidden = !voted;
  parts.toggle.textContent = compact ? 'Change vote' : 'Hide';
  parts.toggle.setAttribute('aria-expanded', String(!compact));

  if (card.hidden) {
    card.hidden = false;
    placeCard();
    card.classList.remove('reset-vote-enter');
    void card.offsetWidth;
    card.classList.add('reset-vote-enter');
    if (vote.starter !== me) {
      hapticFeedback([12, 40, 12]);
      announce(`${starter} called a squad vote to scrap this word.`);
    }
  }
  if (!clockTimer) clockTimer = setInterval(tickClock, 250);
  tickClock();
}

function handleResult(result) {
  if (seenResultId === undefined) {
    // First snapshot after loading: remember, don't announce old news.
    seenResultId = result?.id ?? null;
    return;
  }
  if (!result || result.id === seenResultId) return;
  seenResultId = result.id;
  const text = RESULT_MESSAGES[result.outcome];
  if (text && result.age <= RESULT_FRESH_SECONDS) notify(text);
}

/**
 * Sync the card with a server state snapshot.
 * @param {Object} state - Server state payload.
 */
export function renderResetVote(state) {
  if (!card || !state) return;
  handleResult(state.reset_vote_result);
  if (!state.reset_vote) {
    hide();
    return;
  }
  lastRoundPoints = state.round_points || {};
  renderVote(state.reset_vote, lastRoundPoints);
}

export function isResetVoteOpen() {
  return !!currentVote;
}
