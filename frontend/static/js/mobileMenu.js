/* ─────────────────────────────────────────────
   Mobile Menu - JavaScript functionality for collapsible mobile menu
   ───────────────────────────────────────────── */

let mobileMenuOpen = false;

export function initializeMobileMenu() {
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const mobileMenuClose = document.getElementById('mobileMenuClose');
  const mobileOptionsToggle = document.getElementById('mobileOptionsToggle');
  const mobileChatNotify = document.getElementById('mobileChatNotify');
  
  if (!mobileMenu || !mobileMenuToggle) {
    console.warn('Mobile menu elements not found');
    return;
  }

  // Toggle menu open/close
  mobileMenuToggle.addEventListener('click', toggleMobileMenu);
  
  // Close menu button
  if (mobileMenuClose) {
    mobileMenuClose.addEventListener('click', closeMobileMenu);
  }
  
  // Delegate button clicks to original buttons
  if (mobileOptionsToggle) {
    mobileOptionsToggle.addEventListener('click', () => {
      const originalButton = document.getElementById('optionsToggle');
      if (originalButton) {
        originalButton.click();
      }
      closeMobileMenu();
    });
  }
  
  if (mobileChatNotify) {
    mobileChatNotify.addEventListener('click', () => {
      const originalButton = document.getElementById('chatNotify');
      if (originalButton) {
        originalButton.click();
      }
      closeMobileMenu();
    });
  }
  
  // Close menu when clicking outside
  document.addEventListener('click', (event) => {
    if (mobileMenuOpen && !mobileMenu.contains(event.target)) {
      closeMobileMenu();
    }
  });
  
  // Close menu on escape key
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mobileMenuOpen) {
      closeMobileMenu();
    }
  });
  
  // Handle resize to close menu if we move to desktop size
  window.addEventListener('resize', () => {
    if (window.innerWidth > 600 && mobileMenuOpen) {
      closeMobileMenu();
    }
  });
}

function toggleMobileMenu() {
  if (mobileMenuOpen) {
    closeMobileMenu();
  } else {
    openMobileMenu();
  }
}

function openMobileMenu() {
  const mobileMenu = document.getElementById('mobileMenu');
  if (mobileMenu) {
    mobileMenu.classList.add('open');
    mobileMenuOpen = true;
    
    // Focus first menu item for accessibility
    const firstMenuItem = mobileMenu.querySelector('.mobile-menu-item');
    if (firstMenuItem) {
      setTimeout(() => firstMenuItem.focus(), 100);
    }
  }
}

function closeMobileMenu() {
  const mobileMenu = document.getElementById('mobileMenu');
  if (mobileMenu) {
    mobileMenu.classList.remove('open');
    mobileMenuOpen = false;
  }
}

// Export functions for external use if needed
export { openMobileMenu, closeMobileMenu, toggleMobileMenu };