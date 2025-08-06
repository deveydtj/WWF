/**
 * Simple Mobile Layout Optimization
 * Disables complex scaling systems on mobile to let CSS handle responsive design
 */

(function() {
  'use strict';
  
  const isMobile = window.innerWidth <= 600;
  
  if (isMobile) {
    // Add mobile optimization flag
    document.documentElement.classList.add('mobile-optimized');
    
    // Set CSS custom properties for mobile
    document.documentElement.style.setProperty('--current-tile-size', 'var(--mobile-tile-size)');
    document.documentElement.style.setProperty('--current-scale-factor', '1');
    
    // Override problematic functions when they're loaded
    const overrideScalingFunctions = () => {
      // Disable enhanced scaling
      if (window.initializeEnhancedScaling) {
        window.initializeEnhancedScaling = () => {
          console.log('📱 Enhanced scaling disabled for mobile - using CSS responsive design');
        };
      }
      
      // Disable automatic scaling adjustments  
      if (window.applyOptimalScaling) {
        window.applyOptimalScaling = () => {
          console.log('📱 Optimal scaling disabled for mobile - using simple CSS');
        };
      }
      
      // Disable problematic keyboard checks
      if (window.checkKeyboardVisibility) {
        window.checkKeyboardVisibility = () => {
          return true;
        };
      }
      
      if (window.ensureKeyboardVisibility) {
        window.ensureKeyboardVisibility = () => {
          // Do nothing
        };
      }
      
      if (window.adjustKeyboardForViewport) {
        window.adjustKeyboardForViewport = () => {
          // Do nothing
        };
      }
      
      // Disable fitBoardToContainer interference
      if (window.fitBoardToContainer) {
        window.fitBoardToContainer = () => {
          return {
            tileSize: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mobile-tile-size')),
            gap: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mobile-board-gap')),
            boardWidth: 'auto',
            boardHeight: 'auto'
          };
        };
      }
    };
    
    // Override functions immediately and after DOM load
    overrideScalingFunctions();
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', overrideScalingFunctions);
    }
    
    // Also override after a delay to catch late-loading scripts
    setTimeout(overrideScalingFunctions, 100);
    setTimeout(overrideScalingFunctions, 500);
    
    console.log('📱 Simple mobile layout optimization active');
  }
})();