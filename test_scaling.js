// Test the board scaling functionality
console.log('Testing board scaling...');

// Check if the utilities are available
if (typeof window !== 'undefined' && window.boardScalingTests) {
  console.log('✅ Board scaling utilities are available');
  
  // Run comprehensive tests
  const results = window.boardScalingTests.runBoardScalingTests();
  console.log('Test Results:', results);
} else {
  console.log('❌ Board scaling utilities not found');
}
