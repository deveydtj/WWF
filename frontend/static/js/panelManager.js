/**
 * Panel management for WordSquad game interface.
 * Handles visibility and toggling of side panels (history, definition, chat).
 */

import { positionSidePanels, updateChatPanelPosition, focusFirstElement } from './utils.js';

// DOM elements
const definitionText = document.getElementById('definitionText');
const historyBox = document.getElementById('historyBox');
const definitionBoxEl = document.getElementById('definitionBox');
const chatBox = document.getElementById('chatBox');
const boardArea = document.getElementById('boardArea');

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
  if (window.innerWidth > 1550) {
    // Full mode - show panels if they have content OR if manually toggled
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
    
    positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);
    updateChatPanelPosition(); // Update chat panel position after panel visibility changes
  }
}

// Toggle one of the side panels while closing any others in medium mode
function togglePanel(panelClass) {
  if (document.body.dataset.mode === 'medium') {
    ['history-open', 'definition-open', 'chat-open', 'info-open'].forEach(c => {
      if (c !== panelClass) document.body.classList.remove(c);
    });
  }
  document.body.classList.toggle(panelClass);
  positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);
  
  // Update chat panel position when panels are toggled (especially when definition panel is toggled)
  if (panelClass === 'definition-open' || panelClass === 'chat-open') {
    updateChatPanelPosition();
  }
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