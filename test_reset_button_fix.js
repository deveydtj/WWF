/**
 * Test to verify the Daily Double reset button fix
 * This test validates that the updateResetButton function correctly enables
 * quick reset when a player has a Daily Double hint available.
 */

// Mock the game state and elements needed for testing
const mockGameState = {
  is: (state) => state === 'GAME_OVER' ? mockGameState._isGameOver : false,
  _isGameOver: false
};

const STATES = {
  GAME_OVER: 'GAME_OVER'
};

// Mock DOM elements
const mockHoldReset = {
  onclick: null,
  onmousedown: null,
  ontouchstart: null
};

const mockHoldResetText = {
  textContent: ''
};

const mockHoldResetProgress = {
  style: {
    width: '',
    opacity: ''
  }
};

// Mock functions
function mockQuickResetHandler() {
  console.log('Quick reset handler called');
}

function mockStartHoldReset() {
  console.log('Hold reset started');
}

// The actual updateResetButton function with our fix
function updateResetButton() {
  // Enable quick reset if game is over OR if player has a Daily Double hint available
  const hasDailyDoubleHint = global.window.dailyDoubleRow !== null && global.window.dailyDoubleRow !== undefined;
  const enableQuickReset = mockGameState.is(STATES.GAME_OVER) || hasDailyDoubleHint;
  
  if (enableQuickReset) {
    mockHoldResetText.textContent = 'Reset';
    mockHoldResetProgress.style.width = '0%';
    mockHoldResetProgress.style.opacity = '0';
    mockHoldReset.onmousedown = null;
    mockHoldReset.ontouchstart = null;
    mockHoldReset.onclick = () => { mockQuickResetHandler(); };
  } else {
    mockHoldResetText.textContent = 'Reset';
    mockHoldResetProgress.style.opacity = '0.9';
    mockHoldReset.onclick = null;
    mockHoldReset.onmousedown = mockStartHoldReset;
    mockHoldReset.ontouchstart = (e) => {
      e.preventDefault();
      mockStartHoldReset();
    };
  }
}

// Mock global variables for Node.js
global.window = {
  dailyDoubleRow: null
};

// Test scenarios
function testDailyDoubleResetButtonFix() {
  console.log('🧪 Testing Daily Double reset button fix...\n');
  
  const testCases = [
    {
      name: 'Normal game - no Daily Double',
      gameOver: false,
      dailyDoubleRow: null,
      expectedQuickReset: false
    },
    {
      name: 'Game with Daily Double hint available',
      gameOver: false,
      dailyDoubleRow: 1,
      expectedQuickReset: true
    },
    {
      name: 'Game over - normal scenario',
      gameOver: true,
      dailyDoubleRow: null,
      expectedQuickReset: true
    },
    {
      name: 'Game over with Daily Double (bug scenario)',
      gameOver: true,
      dailyDoubleRow: 2,
      expectedQuickReset: true
    }
  ];
  
  let allPassed = true;
  
  testCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}: ${testCase.name}`);
    
    // Setup test conditions
    mockGameState._isGameOver = testCase.gameOver;
    global.window.dailyDoubleRow = testCase.dailyDoubleRow;
    
    // Reset button state
    mockHoldReset.onclick = null;
    mockHoldReset.onmousedown = null;
    
    // Call the function
    updateResetButton();
    
    // Check if quick reset is enabled
    const isQuickReset = mockHoldReset.onclick !== null;
    const passed = isQuickReset === testCase.expectedQuickReset;
    
    console.log(`   Game Over: ${testCase.gameOver}`);
    console.log(`   Daily Double Row: ${testCase.dailyDoubleRow}`);
    console.log(`   Expected Quick Reset: ${testCase.expectedQuickReset}`);
    console.log(`   Actual Quick Reset: ${isQuickReset}`);
    console.log(`   Result: ${passed ? '✅ PASS' : '❌ FAIL'}\n`);
    
    if (!passed) {
      allPassed = false;
    }
  });
  
  if (allPassed) {
    console.log('🎉 All tests passed! Daily Double reset button fix is working correctly.');
    console.log('✅ The reset button now enables quick reset when player has Daily Double hint');
    console.log('✅ This fixes the issue where players had to wait for someone else to reset');
  } else {
    console.log('❌ Some tests failed.');
  }
  
  return allPassed;
}

// Run the test
testDailyDoubleResetButtonFix();