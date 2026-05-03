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
import { LAYOUT_MODES } from './layoutModes.js';
import { getCurrentLayoutState } from './layoutManager.js';
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
  const { mode, historyPopup } = getCurrentLayoutState();
  const manualPanelToggles = getManualOverlayState();
  
  if (mode === LAYOUT_MODES.DESKTOP && !historyPopup) {
    // Desktop mode with grid-based panels - show panels if they have content OR if manually toggled
    setOverlayOpen(OVERLAYS.HISTORY, hasHistoryContent() || manualPanelToggles.history, {
      closeCompeting: false
    });
    
    setOverlayOpen(OVERLAYS.DEFINITION, hasDefinitionContent() || manualPanelToggles.definition, {
      closeCompeting: false
    });
  } else if ((mode === LAYOUT_MODES.DESKTOP && historyPopup) || (mode === LAYOUT_MODES.TABLET && !historyPopup)) {
    // Desktop mode with history popup OR tablet mode with grid-based history
    // History panel can be in grid (tablet with space) or popup (narrow desktop)
    // In tablet mode with grid, history uses grid positioning like desktop mode
    if (mode === LAYOUT_MODES.TABLET && !historyPopup) {
      // Tablet mode with grid layout - show history if it has content OR if manually toggled
      setOverlayOpen(OVERLAYS.HISTORY, hasHistoryContent() || manualPanelToggles.history, {
        closeCompeting: false
      });
      
      // In tablet mode with grid, definition and chat are overlays - respect manual toggles
      // Don't automatically re-open them just because there's content
      setOverlayOpen(OVERLAYS.DEFINITION, manualPanelToggles.definition && hasDefinitionContent(), {
        closeCompeting: false
      });
    } else {
      // Desktop mode with history popup - only show history when manually toggled
      if (!manualPanelToggles.history) {
        setOverlayOpen(OVERLAYS.HISTORY, false, { closeCompeting: false });
      }
      
      // Definition panel in desktop mode with history popup
      setOverlayOpen(OVERLAYS.DEFINITION, hasDefinitionContent() || manualPanelToggles.definition, {
        closeCompeting: false
      });
    }
  }
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
  
  // Restore history panel if it should remain visible in tablet mode with grid layout
  const { mode, historyPopup } = getCurrentLayoutState();
  if (mode === LAYOUT_MODES.TABLET && !historyPopup) {
    updatePanelVisibility();
  }
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
