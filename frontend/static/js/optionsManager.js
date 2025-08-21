/**
 * Options and settings management for WordSquad.
 * Handles the options menu, dark mode, and info dialog.
 */

import { applyDarkModePreference, openDialog, closeDialog } from './utils.js';

// DOM elements
const optionsMenu = document.getElementById('optionsMenu');
const infoPopup = document.getElementById('infoPopup');
const menuDarkMode = document.getElementById('menuDarkMode');

function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', isDark);
  applyDarkModePreference(menuDarkMode);
}

function showInfo() {
  infoPopup.style.display = 'flex';
  openDialog(infoPopup);
}

// Helper function to reset options menu positioning
function resetOptionsMenuPositioning() {
  optionsMenu.style.position = '';
  optionsMenu.style.top = '';
  optionsMenu.style.left = '';
  optionsMenu.style.transform = '';
  optionsMenu.style.zIndex = '';
}

// Helper function to close options menu with cleanup
function closeOptionsMenu() {
  // Start the close dialog animation first
  closeDialog(optionsMenu);
  
  // Reset positioning after the close animation completes (300ms)
  // This prevents the menu from jumping to upper left during the animation
  setTimeout(() => {
    resetOptionsMenuPositioning();
  }, 300);
}

export {
  toggleDarkMode,
  showInfo,
  resetOptionsMenuPositioning,
  closeOptionsMenu
};