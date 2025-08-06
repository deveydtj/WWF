/**
 * Mobile Layout Optimization
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
          console.log('🚀 Enhanced scaling disabled for mobile - using CSS responsive design');
        };
      }
      
      // Disable automatic scaling adjustments  
      if (window.applyOptimalScaling) {
        window.applyOptimalScaling = () => {
          console.log('📱 Optimal scaling disabled for mobile - using modern CSS');
        };
      }
      
      // Disable problematic keyboard checks
      if (window.checkKeyboardVisibility) {
        window.checkKeyboardVisibility = () => {
          console.log('⌨️ Keyboard visibility checks disabled - using CSS sticky positioning');
          return true;
        };
      }
      
      if (window.ensureKeyboardVisibility) {
        window.ensureKeyboardVisibility = () => {
          console.log('⌨️ Keyboard visibility enforcement disabled for mobile');
        };
      }
      
      if (window.adjustKeyboardForViewport) {
        window.adjustKeyboardForViewport = () => {
          console.log('⌨️ Keyboard viewport adjustments disabled for mobile');
        };
      }
      
      // Disable fitBoardToContainer interference
      if (window.fitBoardToContainer) {
        const originalFit = window.fitBoardToContainer;
        window.fitBoardToContainer = () => {
          console.log('📐 Board fitting disabled for mobile - using CSS grid');
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
    
    console.log('📱 Mobile layout optimization active');
  }
})();