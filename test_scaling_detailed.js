/**
 * Detailed scaling test for the specific issue reported by user
 * Tests viewport widths 1328px - 1550px to identify scaling problems
 */

// Function to simulate viewport width and calculate tile sizes
function simulateScalingAt(width, height = 900) {
    console.log(`\n=== Testing viewport ${width}x${height} ===`);
    
    // Simulate the CSS media query logic
    let cssFixedSize = null;
    if (width >= 1200 && width <= 1550) {
        cssFixedSize = 60; // From CSS: --tile-size: 60px
        console.log(`CSS Media Query (1200px-1550px): Fixed tile size = ${cssFixedSize}px`);
    } else if (width >= 1551) {
        cssFixedSize = 60; // From CSS: --tile-size: 60px  
        console.log(`CSS Media Query (1551px+): Fixed tile size = ${cssFixedSize}px`);
    }
    
    // Simulate the JavaScript calculations from boardContainer.js
    
    // Mock container info - estimate typical values
    const titleBarHeight = 50;
    const inputAreaHeight = 40;
    const keyboardHeight = 120;
    const messageHeight = 25;
    const margins = 40;
    
    const totalUIHeight = titleBarHeight + inputAreaHeight + keyboardHeight + messageHeight + margins;
    const availableWidth = width - 40; // Account for container margins
    const availableHeight = height - totalUIHeight;
    
    console.log(`Available space: ${availableWidth}x${availableHeight}`);
    
    // JavaScript tile size calculation (from calculateOptimalTileSize)
    const cols = 5;
    const rows = 6;
    const gapRatio = 0.1;
    
    const gapTotal = (cols - 1) * gapRatio;
    const widthBasedSize = Math.floor(availableWidth / (cols + gapTotal));
    
    const heightGapTotal = (rows - 1) * gapRatio;
    const heightBasedSize = Math.floor(availableHeight / (rows + heightGapTotal));
    
    const constrainedSize = Math.min(widthBasedSize, heightBasedSize);
    console.log(`JS calculated: width-based=${widthBasedSize}px, height-based=${heightBasedSize}px, constrained=${constrainedSize}px`);
    
    // Apply constraints from boardContainer.js
    const minTileSize = 20;
    const maxTileSize = width >= 1200 ? 65 : 60;
    
    let jsOptimalSize = Math.max(minTileSize, Math.min(maxTileSize, constrainedSize));
    console.log(`JS optimal (before viewport adjustments): ${jsOptimalSize}px`);
    
    // Apply the viewport-specific minimums from applyOptimalScaling
    let finalTileSize = jsOptimalSize;
    if (width >= 1200 && width <= 1550) {
        finalTileSize = Math.max(50, jsOptimalSize);
        console.log(`Applied 1200px-1550px minimum (50px): ${finalTileSize}px`);
    } else if (width > 1550) {
        finalTileSize = Math.max(55, jsOptimalSize);
        console.log(`Applied 1551px+ minimum (55px): ${finalTileSize}px`);
    }
    
    // Calculate final board dimensions
    const gap = Math.max(2, finalTileSize * 0.1);
    const boardWidth = 5 * finalTileSize + 4 * gap;
    
    console.log(`Final result: tile=${finalTileSize}px, gap=${gap}px, board=${boardWidth}px`);
    
    // Check if this would be problematic
    const isProblematic = finalTileSize < 45; // Tiles smaller than 45px might feel too small
    if (isProblematic) {
        console.log(`⚠️  ISSUE: Tile size ${finalTileSize}px may be too small for comfortable use`);
    } else {
        console.log(`✅ Tile size ${finalTileSize}px should be acceptable`);
    }
    
    return {
        width,
        height,
        cssFixedSize,
        jsCalculated: {
            widthBasedSize,
            heightBasedSize,
            constrainedSize,
            jsOptimalSize
        },
        finalTileSize,
        gap,
        boardWidth,
        isProblematic,
        availableSpace: { width: availableWidth, height: availableHeight }
    };
}

// Test the specific problematic range mentioned by user
console.log("DETAILED SCALING ANALYSIS FOR VIEWPORT WIDTHS 1200px - 1600px");
console.log("================================================================");

const testWidths = [
    1200, 1250, 1300, 1328, 1350, 1400, 1450, 1500, 1550, 1600
];

const results = testWidths.map(width => simulateScalingAt(width));

console.log("\n\nSUMMARY:");
console.log("========");
results.forEach(result => {
    const status = result.isProblematic ? "❌ PROBLEMATIC" : "✅ OK";
    console.log(`${result.width}px: ${result.finalTileSize}px tiles ${status}`);
});

// Identify the specific issue
const problematicResults = results.filter(r => r.isProblematic);
if (problematicResults.length > 0) {
    console.log("\n⚠️  IDENTIFIED ISSUES:");
    problematicResults.forEach(result => {
        console.log(`- At ${result.width}px: tiles only ${result.finalTileSize}px (too small)`);
        
        // Analyze why it's small
        if (result.jsCalculated.constrainedSize === result.jsCalculated.heightBasedSize) {
            console.log(`  → Constrained by HEIGHT (available: ${result.availableSpace.height}px)`);
        } else {
            console.log(`  → Constrained by WIDTH (available: ${result.availableSpace.width}px)`);
        }
    });
}

console.log("\nPROPOSED FIXES:");
console.log("===============");
console.log("1. Increase CSS fixed tile size from 60px to larger value for 1200px-1550px range");
console.log("2. Increase JavaScript minimum tile size from 50px to 55-60px for 1200px-1550px range");
console.log("3. Reduce UI element heights to provide more space for the board");
console.log("4. Consider adjusting gap calculations to be less aggressive");