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

// DOM elements
const definitionText = document.getElementById('definitionText');
const historyBox = document.getElementById('historyBox');
const definitionBoxEl = document.getElementById('definitionBox');
const chatBox = document.getElementById('chatBox');

// Track manual panel toggles to avoid overriding user actions
let manualPanelToggles = {
  history: false,
  definition: false,
  chat: false
};

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
  const mode = document.body.dataset.mode;
  const isHistoryPopup = document.body.dataset.historyPopup === 'true';
  
  if (mode === 'full' && !isHistoryPopup) {
    // Full mode with grid-based panels - show panels if they have content OR if manually toggled
    if (hasHistoryContent() || manualPanelToggles.history) {
      document.body.classList.add('history-open');
    } else if (!manualPanelToggles.history) {
      document.body.classList.remove('history-open');
    }
    
    if (hasDefinitionContent() || manualPanelToggles.definition) {
      document.body.classList.add('definition-open');
    } else if (!manualPanelToggles.definition) {
      document.body.classList.remove('definition-open');
    }
  } else if (mode === 'full' && isHistoryPopup) {
    // Full mode but history panel is popup - only show history when manually toggled
    if (!manualPanelToggles.history) {
      document.body.classList.remove('history-open');
    }
    
    // Definition panel still uses grid positioning
    if (hasDefinitionContent() || manualPanelToggles.definition) {
      document.body.classList.add('definition-open');
    } else if (!manualPanelToggles.definition) {
      document.body.classList.remove('definition-open');
    }
  }
}

// Toggle one of the side panels while closing any others in medium mode or history popup mode
function togglePanel(panelClass) {
  const isHistoryPopup = document.body.dataset.historyPopup === 'true';
  
  if (document.body.dataset.mode === 'medium' || (isHistoryPopup && panelClass === 'history-open')) {
    const wasChatOpen = document.body.classList.contains('chat-open');
    ['history-open', 'definition-open', 'chat-open', 'info-open'].forEach(c => {
      if (c !== panelClass) document.body.classList.remove(c);
    });
    
    // If chat was open and is being closed due to another panel opening, restore the chat notification icon
    if (wasChatOpen && panelClass !== 'chat-open') {
      const chatNotify = document.getElementById('chatNotify');
      if (chatNotify) {
        chatNotify.style.display = 'block';
      }
    }
  }
  document.body.classList.toggle(panelClass);
}

function toggleHistory() {
  // Track that this is a manual toggle
  manualPanelToggles.history = !document.body.classList.contains('history-open');
  togglePanel('history-open');
  if (document.body.classList.contains('history-open')) {
    focusFirstElement(historyBox);
  }
}

function toggleDefinition() {
  // Track that this is a manual toggle
  manualPanelToggles.definition = !document.body.classList.contains('definition-open');
  togglePanel('definition-open');
  if (document.body.classList.contains('definition-open')) {
    focusFirstElement(definitionBoxEl);
  }
}

// Get the manual panel toggles for external access
function getManualPanelToggles() {
  return manualPanelToggles;
}

// Set manual panel toggle state
function setManualPanelToggle(panel, value) {
  if (manualPanelToggles.hasOwnProperty(panel)) {
    manualPanelToggles[panel] = value;
  }
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