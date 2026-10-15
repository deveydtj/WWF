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
  localStorage.setItem('darkMode', String(!document.body.classList.contains('dark-mode')));
  applyDarkModePreference(menuDarkMode, true);
}

function showInfo() {
  openDialog(infoPopup);
}

function closeOptionsMenu() {
  closeDialog(optionsMenu);
}

export {
  toggleDarkMode,
  showInfo,
  closeOptionsMenu
};
