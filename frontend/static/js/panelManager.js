/**
 * Panel management for WordSquad game interface.
 * Handles visibility and toggling of side panels (history, definition, chat).
 * 
 * ARCHITECTURE NOTE:
 * This module manages panel visibility state through CSS classes only.
 * All panel positioning is handled by CSS Grid layout defined in layout.css
 * and responsive.css. No JavaScript positioning calculations are performed.
 * 
 * Panel visibility is controlled via body classes:
 * - 'history-open' - shows/hides #historyBox
 * - 'definition-open' - shows/hides #definitionBox  
 * - 'chat-open' - shows/hides #chatBox
 * 
 * CSS Grid handles all positioning automatically based on grid-template-areas
 * defined in media queries for each breakpoint (mobile, tablet, desktop).
 */

import { focusFirstElement } from './utils.js';
import { getCurrentLayoutProfile } from './layoutManager.js';
import {
  OVERLAYS,
  getManualOverlayState,
  getOverlayKeyFromClass,
  isOverlayOpen,
  setManualOverlayState,
  setOverlayOpen,
  toggleOverlay
} from './overlayState.js';

// DOM elements
const definitionText = document.getElementById('definitionText');
const historyBox = document.getElementById('historyBox');
const definitionBoxEl = document.getElementById('definitionBox');
const chatBox = document.getElementById('chatBox');

function hasHistoryContent() {
  const historyList = document.getElementById('historyList');
  return historyList && historyList.children.length > 0;
}

// Check if definition panel has content to display
function hasDefinitionContent() {
  return definitionText && definitionText.textContent.trim() !== '';
}

// Show or hide panels based on content and viewport size
function updatePanelVisibility() {
  const capacity = getCurrentLayoutProfile().panelCapacity;
  const manual = getManualOverlayState();
  setOverlayOpen(OVERLAYS.HISTORY, manual.history || (capacity >= 1 && hasHistoryContent()), {
    closeCompeting: false, activate: false
  });
  setOverlayOpen(OVERLAYS.DEFINITION,
    manual.definition || (capacity >= 2 && hasDefinitionContent() && !isOverlayOpen(OVERLAYS.CHAT)),
    { closeCompeting: false, activate: false });

  const panels = [
    [historyBox, OVERLAYS.HISTORY, capacity >= 1],
    [definitionBoxEl, OVERLAYS.DEFINITION, capacity >= 2],
    [chatBox, OVERLAYS.CHAT, capacity >= 2]
  ];
  panels.forEach(([element, , rail]) => {
    element?.setAttribute('role', rail ? 'complementary' : 'dialog');
    element?.setAttribute('aria-modal', rail ? 'false' : 'true');
  });
  document.body.dataset.modalPanelOpen = String(
    panels.some(([, key, rail]) => !rail && isOverlayOpen(key)) || isOverlayOpen(OVERLAYS.PLAYERS)
  );
}

// Toggle one of the side panels while closing any others in tablet mode or history popup mode
function togglePanel(panelClass) {
  const overlayKey = getOverlayKeyFromClass(panelClass) || panelClass;
  const wasChatOpen = isOverlayOpen(OVERLAYS.CHAT);
  const isOpen = toggleOverlay(overlayKey);

  // If chat was open and is being closed due to another panel opening, restore the chat notification icon
  if (wasChatOpen && overlayKey !== OVERLAYS.CHAT && !isOverlayOpen(OVERLAYS.CHAT)) {
    const chatNotify = document.getElementById('chatNotify');
    if (chatNotify) {
      chatNotify.style.display = 'block';
    }
  }

  return isOpen;
}

function toggleHistory() {
  // Track that this is a manual toggle
  setManualOverlayState(OVERLAYS.HISTORY, !isOverlayOpen(OVERLAYS.HISTORY));
  const isOpen = togglePanel('history-open');
  if (isOpen) {
    focusFirstElement(historyBox);
  }
}

function toggleDefinition() {
  // Track that this is a manual toggle
  setManualOverlayState(OVERLAYS.DEFINITION, !isOverlayOpen(OVERLAYS.DEFINITION));
  const isOpen = togglePanel('definition-open');
  if (isOpen) {
    focusFirstElement(definitionBoxEl);
  }
  
  updatePanelVisibility();
}

// Get the manual panel toggles for external access
function getManualPanelToggles() {
  return getManualOverlayState();
}

// Set manual panel toggle state
function setManualPanelToggle(panel, value) {
  setManualOverlayState(panel, value);
}

export {
  hasHistoryContent,
  hasDefinitionContent,
  updatePanelVisibility,
  togglePanel,
  toggleHistory,
  toggleDefinition,
  getManualPanelToggles,
  setManualPanelToggle
};
