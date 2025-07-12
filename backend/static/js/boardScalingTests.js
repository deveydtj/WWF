/**
 * Board scaling verification test suite
 * Provides utilities to test and verify board scaling across different devices
 */

import { 
  testBoardScalingAcrossDevices, 
  verifyElementsFitInViewport,
  getBoardContainerInfo,
  calculateOptimalTileSize
} from './boardContainer.js';

/**
 * Run comprehensive board scaling tests
 * @returns {Object} Test results
 */
export function runBoardScalingTests() {
  console.log('🧪 Running Board Scaling Tests...');
  
  // Test current viewport
  const currentVerification = verifyElementsFitInViewport();
  console.log('📊 Current Viewport Verification:', currentVerification);
  
  // Test across different device sizes
  const deviceTests = testBoardScalingAcrossDevices();
  console.log('📱 Device Scaling Tests:', deviceTests);
  
  // Test container info calculation
  const containerInfo = getBoardContainerInfo();
  console.log('📐 Container Information:', containerInfo);
  
  if (containerInfo) {
    const optimalSizing = calculateOptimalTileSize(containerInfo);
    console.log('🎯 Optimal Sizing:', optimalSizing);
  }
  
  return {
    currentVerification,
    deviceTests,
    containerInfo,
    timestamp: new Date().toISOString()
  };
}

/**
 * Log detailed board measurements to console
 */
export function debugBoardMeasurements() {
  const board = document.getElementById('board');
  const boardArea = document.getElementById('boardArea');
  const appContainer = document.getElementById('appContainer');
  
  if (board && boardArea && appContainer) {
    console.log('🔍 Board Debug Measurements:');
    console.log('Board rect:', board.getBoundingClientRect());
    console.log('Board area rect:', boardArea.getBoundingClientRect());
    console.log('App container rect:', appContainer.getBoundingClientRect());
    console.log('Viewport:', {
      width: window.innerWidth,
      height: window.innerHeight,
      visualViewport: window.visualViewport ? {
        width: window.visualViewport.width,
        height: window.visualViewport.height
      } : 'Not available'
    });
    
    // Log computed styles
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);
    console.log('CSS Variables:', {
      '--tile-size': computedStyle.getPropertyValue('--tile-size'),
      '--tile-gap': computedStyle.getPropertyValue('--tile-gap'),
      '--board-width': computedStyle.getPropertyValue('--board-width'),
      '--ui-scale': computedStyle.getPropertyValue('--ui-scale')
    });
  }
}

/**
 * Add visual indicators to show board container boundaries
 */
export function addVisualDebugIndicators() {
  removeVisualDebugIndicators(); // Remove existing ones first
  
  const boardArea = document.getElementById('boardArea');
  if (!boardArea) return;
  
  // Create container outline
  const containerOutline = document.createElement('div');
  containerOutline.id = 'debug-container-outline';
  containerOutline.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border: 2px dashed #ff6b6b;
    pointer-events: none;
    z-index: 1000;
  `;
  boardArea.appendChild(containerOutline);
  
  // Create board outline
  const board = document.getElementById('board');
  if (board) {
    const boardOutline = document.createElement('div');
    boardOutline.id = 'debug-board-outline';
    const boardRect = board.getBoundingClientRect();
    const areaRect = boardArea.getBoundingClientRect();
    boardOutline.style.cssText = `
      position: absolute;
      left: ${boardRect.left - areaRect.left}px;
      top: ${boardRect.top - areaRect.top}px;
      width: ${boardRect.width}px;
      height: ${boardRect.height}px;
      border: 2px dashed #4ecdc4;
      pointer-events: none;
      z-index: 1001;
    `;
    boardArea.appendChild(boardOutline);
  }
  
  // Add measurement labels
  const label = document.createElement('div');
  label.id = 'debug-measurements-label';
  label.style.cssText = `
    position: absolute;
    top: -25px;
    left: 0;
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 4px 8px;
    font-size: 12px;
    border-radius: 4px;
    pointer-events: none;
    z-index: 1002;
  `;
  
  const containerInfo = getBoardContainerInfo();
  if (containerInfo) {
    label.textContent = `Container: ${Math.round(containerInfo.containerRect.width)}×${Math.round(containerInfo.containerRect.height)} | Available: ${Math.round(containerInfo.availableSpace.width)}×${Math.round(containerInfo.availableSpace.height)}`;
  }
  
  boardArea.appendChild(label);
  
  console.log('✨ Visual debug indicators added. Call removeVisualDebugIndicators() to remove them.');
}

/**
 * Remove visual debug indicators
 */
export function removeVisualDebugIndicators() {
  const indicators = [
    'debug-container-outline',
    'debug-board-outline', 
    'debug-measurements-label'
  ];
  
  indicators.forEach(id => {
    const element = document.getElementById(id);
    if (element) element.remove();
  });
}

/**
 * Test board scaling with a specific viewport size
 * @param {number} width - Test width
 * @param {number} height - Test height
 * @param {string} deviceName - Device name for logging
 */
export function testSpecificViewportSize(width, height, deviceName = 'Custom') {
  console.log(`🔬 Testing viewport size: ${deviceName} (${width}×${height})`);
  
  const testResults = testBoardScalingAcrossDevices([
    { name: deviceName, width, height }
  ]);
  
  console.log('Test Results:', testResults);
  return testResults;
}

/**
 * Monitor board scaling in real-time during window resize
 */
export function enableRealtimeScalingMonitor() {
  console.log('👀 Real-time scaling monitor enabled. Resize window to see updates.');
  
  let monitorTimeout;
  const monitor = () => {
    clearTimeout(monitorTimeout);
    monitorTimeout = setTimeout(() => {
      const verification = verifyElementsFitInViewport();
      const containerInfo = getBoardContainerInfo();
      
      console.log(`📊 Resize Event - Viewport: ${window.innerWidth}×${window.innerHeight}`);
      console.log('Verification:', verification.success ? '✅ PASS' : '❌ FAIL');
      
      if (!verification.success && verification.recommendations) {
        console.warn('Recommendations:', verification.recommendations);
      }
      
      if (containerInfo) {
        const optimal = calculateOptimalTileSize(containerInfo);
        console.log(`Tile size: ${optimal?.tileSize}px, Scale: ${optimal?.scaleFactor?.toFixed(2)}`);
      }
    }, 250);
  };
  
  window.addEventListener('resize', monitor);
  window.addEventListener('orientationchange', monitor);
  
  // Return cleanup function
  return () => {
    window.removeEventListener('resize', monitor);
    window.removeEventListener('orientationchange', monitor);
    console.log('👋 Real-time scaling monitor disabled.');
  };
}

// Make functions available globally for console testing
if (typeof window !== 'undefined') {
  window.boardScalingTests = {
    runBoardScalingTests,
    debugBoardMeasurements,
    addVisualDebugIndicators,
    removeVisualDebugIndicators,
    testSpecificViewportSize,
    enableRealtimeScalingMonitor,
    verifyElementsFitInViewport,
    getBoardContainerInfo,
    calculateOptimalTileSize
  };
  
  console.log('🔧 Board scaling test utilities available at window.boardScalingTests');
}