/**
 * Enhanced popup positioning system with viewport boundary detection
 * and grid-based constraint system for better popup placement.
 */

/**
 * Viewport boundaries and safe margins
 */
const VIEWPORT_MARGIN = 10; // Minimum distance from viewport edges
const POPUP_OFFSET = 10; // Default offset from anchor element

/**
 * Positioning strategies in order of preference
 */
const POSITION_STRATEGIES = [
  'right',
  'left', 
  'bottom',
  'top',
  'center'
];

/**
 * Calculate available space in all directions from an anchor element
 * @param {DOMRect} anchorRect - Bounding rectangle of anchor element
 * @param {number} viewportWidth - Current viewport width
 * @param {number} viewportHeight - Current viewport height
 * @returns {Object} Available space in each direction
 */
function calculateAvailableSpace(anchorRect, viewportWidth, viewportHeight) {
  return {
    right: viewportWidth - anchorRect.right - VIEWPORT_MARGIN,
    left: anchorRect.left - VIEWPORT_MARGIN,
    bottom: viewportHeight - anchorRect.bottom - VIEWPORT_MARGIN,
    top: anchorRect.top - VIEWPORT_MARGIN,
    centerX: viewportWidth / 2,
    centerY: viewportHeight / 2
  };
}

/**
 * Calculate popup position for a given strategy
 * @param {string} strategy - Positioning strategy ('right', 'left', 'bottom', 'top', 'center')
 * @param {DOMRect} anchorRect - Bounding rectangle of anchor element
 * @param {number} popupWidth - Width of popup element
 * @param {number} popupHeight - Height of popup element
 * @param {Object} availableSpace - Available space in each direction
 * @returns {Object} Position coordinates {left, top} or null if doesn't fit
 */
function calculatePositionForStrategy(strategy, anchorRect, popupWidth, popupHeight, availableSpace) {
  const scrollX = window.scrollX || 0;
  const scrollY = window.scrollY || 0;
  
  switch (strategy) {
    case 'right':
      if (availableSpace.right >= popupWidth) {
        return {
          left: anchorRect.right + POPUP_OFFSET + scrollX,
          top: Math.max(VIEWPORT_MARGIN + scrollY, 
                       Math.min(anchorRect.top + scrollY, 
                               window.innerHeight - popupHeight - VIEWPORT_MARGIN + scrollY))
        };
      }
      break;
      
    case 'left':
      if (availableSpace.left >= popupWidth) {
        return {
          left: anchorRect.left - popupWidth - POPUP_OFFSET + scrollX,
          top: Math.max(VIEWPORT_MARGIN + scrollY,
                       Math.min(anchorRect.top + scrollY,
                               window.innerHeight - popupHeight - VIEWPORT_MARGIN + scrollY))
        };
      }
      break;
      
    case 'bottom':
      if (availableSpace.bottom >= popupHeight) {
        return {
          left: Math.max(VIEWPORT_MARGIN + scrollX,
                        Math.min(anchorRect.left + scrollX,
                                window.innerWidth - popupWidth - VIEWPORT_MARGIN + scrollX)),
          top: anchorRect.bottom + POPUP_OFFSET + scrollY
        };
      }
      break;
      
    case 'top':
      if (availableSpace.top >= popupHeight) {
        return {
          left: Math.max(VIEWPORT_MARGIN + scrollX,
                        Math.min(anchorRect.left + scrollX,
                                window.innerWidth - popupWidth - VIEWPORT_MARGIN + scrollX)),
          top: anchorRect.top - popupHeight - POPUP_OFFSET + scrollY
        };
      }
      break;
      
    case 'center':
      // Center strategy always works as fallback
      return {
        left: (window.innerWidth - popupWidth) / 2 + scrollX,
        top: (window.innerHeight - popupHeight) / 2 + scrollY
      };
  }
  
  return null;
}

/**
 * Check if popup fits within viewport boundaries with given position
 * @param {Object} position - Position coordinates {left, top}
 * @param {number} popupWidth - Width of popup element
 * @param {number} popupHeight - Height of popup element
 * @returns {boolean} True if popup fits within viewport
 */
function fitsInViewport(position, popupWidth, popupHeight) {
  const scrollX = window.scrollX || 0;
  const scrollY = window.scrollY || 0;
  
  return (
    position.left - scrollX >= VIEWPORT_MARGIN &&
    position.top - scrollY >= VIEWPORT_MARGIN &&
    position.left - scrollX + popupWidth <= window.innerWidth - VIEWPORT_MARGIN &&
    position.top - scrollY + popupHeight <= window.innerHeight - VIEWPORT_MARGIN
  );
}

/**
 * Enhanced popup positioning with viewport boundary detection
 * @param {HTMLElement} popup - Popup element to position
 * @param {HTMLElement} anchor - Anchor element to position relative to
 * @param {Object} options - Positioning options
 * @returns {Object} Applied position and strategy used
 */
export function positionPopupEnhanced(popup, anchor, options = {}) {
  // Get current viewport dimensions
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Check if we're in mobile view - use CSS centering
  if (viewportWidth <= 600) {
    // Reset positioning to let CSS media queries handle mobile layout
    popup.style.position = '';
    popup.style.left = '';
    popup.style.top = '';
    popup.style.transform = '';
    return { strategy: 'css-mobile', position: null };
  }
  
  // Get anchor bounds
  const anchorRect = anchor.getBoundingClientRect();
  
  // Make popup temporarily visible to measure dimensions
  const originalDisplay = popup.style.display;
  const originalVisibility = popup.style.visibility;
  const originalPosition = popup.style.position;
  
  popup.style.display = 'block';
  popup.style.visibility = 'hidden';
  popup.style.position = 'absolute';
  popup.style.left = '-9999px';
  popup.style.top = '-9999px';
  
  // Get popup dimensions
  const popupWidth = popup.offsetWidth;
  const popupHeight = popup.offsetHeight;
  
  // Calculate available space
  const availableSpace = calculateAvailableSpace(anchorRect, viewportWidth, viewportHeight);
  
  // Try positioning strategies in order of preference
  let finalPosition = null;
  let usedStrategy = null;
  
  const strategiesToTry = options.preferredStrategies || POSITION_STRATEGIES;
  
  for (const strategy of strategiesToTry) {
    const position = calculatePositionForStrategy(
      strategy, 
      anchorRect, 
      popupWidth, 
      popupHeight, 
      availableSpace
    );
    
    if (position && (strategy === 'center' || fitsInViewport(position, popupWidth, popupHeight))) {
      finalPosition = position;
      usedStrategy = strategy;
      break;
    }
  }
  
  // Apply the position
  if (finalPosition) {
    popup.style.position = 'absolute';
    popup.style.left = `${finalPosition.left}px`;
    popup.style.top = `${finalPosition.top}px`;
    popup.style.transform = '';
  }
  
  // Restore visibility
  popup.style.display = originalDisplay;
  popup.style.visibility = originalVisibility;
  
  return {
    strategy: usedStrategy,
    position: finalPosition,
    availableSpace,
    popupDimensions: { width: popupWidth, height: popupHeight }
  };
}

/**
 * Smart positioning for context menus and dropdowns
 * Optimized for small popups that appear next to buttons
 * @param {HTMLElement} popup - Popup element
 * @param {HTMLElement} anchor - Anchor element
 * @returns {Object} Positioning result
 */
export function positionContextMenu(popup, anchor) {
  return positionPopupEnhanced(popup, anchor, {
    preferredStrategies: ['right', 'left', 'bottom', 'top', 'center']
  });
}

/**
 * Smart positioning for modal-style popups
 * Prefers centering for larger content
 * @param {HTMLElement} popup - Popup element
 * @param {HTMLElement} anchor - Anchor element  
 * @returns {Object} Positioning result
 */
export function positionModal(popup, anchor) {
  return positionPopupEnhanced(popup, anchor, {
    preferredStrategies: ['center', 'bottom', 'top', 'right', 'left']
  });
}

/**
 * Grid-based positioning system for layout panels
 * Used for side panels that need to avoid overlapping with main content
 * @param {HTMLElement} popup - Popup element
 * @param {HTMLElement} anchor - Anchor element
 * @param {Object} gridOptions - Grid positioning options
 * @returns {Object} Positioning result
 */
export function positionOnGrid(popup, anchor, gridOptions = {}) {
  const { 
    columns = 12, 
    gutterSize = 20,
    reservedAreas = [] 
  } = gridOptions;
  
  // Calculate grid cell size
  const cellWidth = (window.innerWidth - (gutterSize * (columns + 1))) / columns;
  const availableCells = [];
  
  // Find available grid positions that don't overlap with reserved areas
  for (let col = 0; col < columns; col++) {
    const cellLeft = col * cellWidth + (col + 1) * gutterSize;
    const cellRight = cellLeft + cellWidth;
    
    let isAvailable = true;
    for (const reserved of reservedAreas) {
      if (!(cellRight < reserved.left || cellLeft > reserved.right)) {
        isAvailable = false;
        break;
      }
    }
    
    if (isAvailable) {
      availableCells.push({
        column: col,
        left: cellLeft,
        width: cellWidth
      });
    }
  }
  
  // Choose the best available cell (closest to anchor)
  if (availableCells.length > 0) {
    const anchorRect = anchor.getBoundingClientRect();
    const anchorCenter = anchorRect.left + anchorRect.width / 2;
    
    let bestCell = availableCells[0];
    let bestDistance = Math.abs(bestCell.left + bestCell.width / 2 - anchorCenter);
    
    for (const cell of availableCells) {
      const cellCenter = cell.left + cell.width / 2;
      const distance = Math.abs(cellCenter - anchorCenter);
      if (distance < bestDistance) {
        bestCell = cell;
        bestDistance = distance;
      }
    }
    
    // Position popup in the best cell
    popup.style.position = 'absolute';
    popup.style.left = `${bestCell.left}px`;
    popup.style.top = `${anchorRect.bottom + 20}px`;
    popup.style.width = `${bestCell.width}px`;
    
    return {
      strategy: 'grid',
      position: { left: bestCell.left, top: anchorRect.bottom + 20 },
      gridCell: bestCell
    };
  }
  
  // Fallback to standard positioning
  return positionPopupEnhanced(popup, anchor);
}

/**
 * Responsive positioning coordinator
 * Chooses appropriate positioning strategy based on viewport size and popup type
 * @param {HTMLElement} popup - Popup element
 * @param {HTMLElement} anchor - Anchor element
 * @param {string} popupType - Type of popup ('menu', 'modal', 'panel', 'tooltip')
 * @returns {Object} Positioning result
 */
export function positionResponsive(popup, anchor, popupType = 'menu') {
  const viewportWidth = window.innerWidth;
  
  // Mobile: Let CSS handle positioning
  if (viewportWidth <= 600) {
    popup.style.position = '';
    popup.style.left = '';
    popup.style.top = '';
    popup.style.transform = '';
    return { strategy: 'css-responsive', position: null };
  }
  
  // Choose positioning strategy based on viewport and popup type
  switch (popupType) {
    case 'menu':
    case 'dropdown':
      return positionContextMenu(popup, anchor);
      
    case 'modal':
    case 'dialog':
      return positionModal(popup, anchor);
      
    case 'panel':
      if (viewportWidth > 900) {
        // Use grid positioning for large screens
        return positionOnGrid(popup, anchor);
      } else {
        // Center panels on medium screens
        return positionModal(popup, anchor);
      }
      
    case 'tooltip':
      return positionPopupEnhanced(popup, anchor, {
        preferredStrategies: ['top', 'bottom', 'right', 'left', 'center']
      });
      
    default:
      return positionPopupEnhanced(popup, anchor);
  }
}