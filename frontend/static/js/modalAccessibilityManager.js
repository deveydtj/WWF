/* ─────────────────────────────────────────────
   Modal Accessibility Manager - Fix hidden modal click interception
   ───────────────────────────────────────────── */

/**
 * MODAL MANAGEMENT SYSTEM
 * =======================
 * 
 * This module fixes the critical issue where hidden modals still intercept
 * pointer events, preventing users from clicking on buttons and panels.
 * 
 * Problems Fixed:
 * - Hidden modals with display:none but pointer-events:auto still block clicks
 * - Inconsistent z-index usage with hardcoded values instead of CSS custom properties
 * - Missing accessibility attributes (aria-hidden, inert) for screen readers
 * - Transform stacking contexts causing z-index conflicts
 * 
 * Solution:
 * - Unified modal state management ensuring hidden = non-interactive
 * - Proper accessibility attribute management
 * - Consistent z-index usage from z-index.css custom properties
 * - Focus management for better UX
 */

class ModalAccessibilityManager {
  constructor() {
    this.modals = new Map();
    this.initializeModalTracking();
    this.forceAllModalsHidden(); // Force all modals to start hidden
    this.fixExistingModals();
  }

  /**
   * Force all tracked modals to start in hidden state
   */
  forceAllModalsHidden() {
    this.modals.forEach((modalData) => {
      this.setModalHidden(modalData.element);
    });
  }

  /**
   * Initialize tracking of all modal elements
   */
  initializeModalTracking() {
    // Track all modal elements that can cause click interception
    const modalSelectors = [
      '#emojiModal',
      '#infoPopup', 
      '#shareModal',
      '#closeCallPopup',
      '#optionsMenu',
      '#mobileMenuPopup'
    ];

    modalSelectors.forEach(selector => {
      const modal = document.querySelector(selector);
      if (modal) {
        this.modals.set(selector, {
          element: modal,
          isVisible: false,
          originalDisplay: getComputedStyle(modal).display
        });
      }
    });
  }

  /**
   * Fix existing modals that have incorrect pointer events
   */
  fixExistingModals() {
    this.modals.forEach((modalData, selector) => {
      const modal = modalData.element;
      const computedStyle = getComputedStyle(modal);
      
      // Check if modal is visually hidden or should be treated as hidden by default
      // All modals should start hidden unless explicitly made visible
      const isHidden = computedStyle.display === 'none' || 
                      computedStyle.opacity === '0' || 
                      computedStyle.visibility === 'hidden' ||
                      !modal.classList.contains('show');
      
      if (isHidden) {
        this.setModalHidden(modal);
      } else {
        this.setModalVisible(modal);
      }
    });
  }

  /**
   * Set modal to properly hidden state (non-interactive)
   */
  setModalHidden(modal) {
    modal.style.setProperty('pointer-events', 'none', 'important');
    modal.style.setProperty('opacity', '0', 'important');
    modal.style.setProperty('visibility', 'hidden', 'important');
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('inert', '');
    
    // Remove focus from modal content when hiding
    const focusableElements = modal.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    focusableElements.forEach(el => {
      el.setAttribute('tabindex', '-1');
    });
    
    // Update tracking
    const modalEntry = Array.from(this.modals.entries()).find(([, data]) => data.element === modal);
    if (modalEntry) {
      modalEntry[1].isVisible = false;
    }
  }

  /**
   * Set modal to properly visible state (interactive)
   */
  setModalVisible(modal) {
    modal.style.setProperty('pointer-events', 'auto', 'important');
    modal.style.setProperty('opacity', '1', 'important');
    modal.style.setProperty('visibility', 'visible', 'important');
    modal.setAttribute('aria-hidden', 'false');
    modal.removeAttribute('inert');
    
    // Restore focus capability to modal content
    const focusableElements = modal.querySelectorAll('[tabindex="-1"]');
    focusableElements.forEach(el => {
      el.removeAttribute('tabindex');
    });
    
    // Update tracking
    const modalEntry = Array.from(this.modals.entries()).find(([, data]) => data.element === modal);
    if (modalEntry) {
      modalEntry[1].isVisible = true;
    }
  }

  /**
   * Override display style changes to ensure consistency
   */
  observeDisplayChanges() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
          const element = mutation.target;
          if (this.modals.has(`#${element.id}`)) {
            const computedStyle = getComputedStyle(element);
            
            // Check if modal should be hidden
            const shouldBeHidden = computedStyle.display === 'none' || 
                                 computedStyle.opacity === '0' ||
                                 computedStyle.visibility === 'hidden' ||
                                 !element.classList.contains('show');
            
            if (shouldBeHidden) {
              this.setModalHidden(element);
            } else if (computedStyle.display !== 'none' && 
                      (computedStyle.opacity === '1' || parseFloat(computedStyle.opacity) > 0) &&
                      element.classList.contains('show')) {
              this.setModalVisible(element);
            }
          }
        }
      });
    });

    // Observe all tracked modals
    this.modals.forEach((modalData) => {
      observer.observe(modalData.element, { 
        attributes: true, 
        attributeFilter: ['style', 'class'] 
      });
    });
  }

  /**
   * Fix z-index usage to use CSS custom properties
   */
  fixZIndexUsage() {
    this.modals.forEach((modalData, selector) => {
      const modal = modalData.element;
      const computedZIndex = getComputedStyle(modal).zIndex;
      
      // Replace hardcoded z-index values with CSS custom properties
      if (computedZIndex && computedZIndex !== 'auto') {
        switch(selector) {
          case '#emojiModal':
          case '#shareModal':
          case '#closeCallPopup':
          case '#infoPopup':
            modal.style.zIndex = 'var(--z-modal-backdrop)';
            break;
          case '#optionsMenu':
            modal.style.zIndex = 'var(--z-options-menu)';
            break;
          case '#mobileMenuPopup':
            modal.style.zIndex = 'var(--z-mobile-menu)';
            break;
        }
      }
    });
  }

  /**
   * Add click outside to close functionality
   */
  addClickOutsideHandlers() {
    document.addEventListener('click', (event) => {
      this.modals.forEach((modalData) => {
        if (modalData.isVisible && !modalData.element.contains(event.target)) {
          // Find and trigger close button if it exists
          const closeButton = modalData.element.querySelector('.close-btn, [id$="Close"]');
          if (closeButton) {
            closeButton.click();
          }
        }
      });
    });
  }

  /**
   * Initialize the modal accessibility system
   */
  init() {
    this.observeDisplayChanges();
    this.fixZIndexUsage();
    this.addClickOutsideHandlers();
    
    console.log('✅ Modal Accessibility Manager initialized - fixed', this.modals.size, 'modals');
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.modalAccessibilityManager = new ModalAccessibilityManager();
    window.modalAccessibilityManager.init();
  });
} else {
  window.modalAccessibilityManager = new ModalAccessibilityManager();
  window.modalAccessibilityManager.init();
}

// Export for manual use
window.ModalAccessibilityManager = ModalAccessibilityManager;