const { test, expect } = require('@playwright/test');

test('analyze stamps and history panel positioning', async ({ page }) => {
  // Navigate to the game HTML file directly
  await page.goto('game.html');
  
  // Wait for page to load
  await page.waitForLoadState('networkidle');
  
  // Set viewport to a typical desktop size
  await page.setViewportSize({ width: 1200, height: 800 });
  
  // Create some test content to see the layout
  await page.evaluate(() => {
    // Add some mock history items
    const historyList = document.getElementById('historyList');
    if (historyList) {
      historyList.innerHTML = `
        <li class="history-item">
          <span class="history-emoji">🎯</span>
          <span class="history-guess">HOUSE</span>
          <span class="history-points">+12</span>
        </li>
        <li class="history-item">
          <span class="history-emoji">🔥</span>
          <span class="history-guess">PLANE</span>
          <span class="history-points">+8</span>
        </li>
        <li class="history-item">
          <span class="history-emoji">💎</span>
          <span class="history-guess">TIGER</span>
          <span class="history-points">+15</span>
        </li>
      `;
    }
    
    // Add some mock stamps
    const stampContainer = document.getElementById('stampContainer');
    if (stampContainer) {
      stampContainer.innerHTML = `
        <div class="emoji-stamp" data-guess-index="0" style="top: 0px;">🎯</div>
        <div class="emoji-stamp" data-guess-index="1" style="top: 70px;">🔥</div>
        <div class="emoji-stamp" data-guess-index="2" style="top: 140px;">💎</div>
      `;
      stampContainer.style.display = 'block';
    }
    
    // Show the history panel
    const historyBox = document.getElementById('historyBox');
    if (historyBox) {
      historyBox.style.display = 'block';
    }
  });
  
  // Take a screenshot to see the current layout
  await page.screenshot({ path: 'stamps_analysis_before.png', fullPage: true });
  
  // Analyze the positions
  const stampContainer = page.locator('#stampContainer');
  const historyBox = page.locator('#historyBox');
  const board = page.locator('#board');
  
  // Get bounding boxes
  const stampContainerBox = await stampContainer.boundingBox();
  const historyBoxBox = await historyBox.boundingBox();
  const boardBox = await board.boundingBox();
  
  console.log('=== CURRENT LAYOUT ANALYSIS ===');
  console.log('Board position:', boardBox);
  console.log('Stamp container position:', stampContainerBox);
  console.log('History box position:', historyBoxBox);
  
  if (stampContainerBox && historyBoxBox) {
    const overlap = {
      horizontal: stampContainerBox.x < historyBoxBox.x + historyBoxBox.width &&
                  stampContainerBox.x + stampContainerBox.width > historyBoxBox.x,
      vertical: stampContainerBox.y < historyBoxBox.y + historyBoxBox.height &&
                stampContainerBox.y + stampContainerBox.height > historyBoxBox.y
    };
    
    const overlapArea = overlap.horizontal && overlap.vertical;
    
    console.log('Horizontal overlap:', overlap.horizontal);
    console.log('Vertical overlap:', overlap.vertical);
    console.log('Area overlap:', overlapArea);
    
    if (overlapArea) {
      console.log('❌ OVERLAP DETECTED: Stamps are overlaying the history panel');
      
      // Calculate the overlap dimensions
      const overlapLeft = Math.max(stampContainerBox.x, historyBoxBox.x);
      const overlapRight = Math.min(stampContainerBox.x + stampContainerBox.width, 
                                    historyBoxBox.x + historyBoxBox.width);
      const overlapTop = Math.max(stampContainerBox.y, historyBoxBox.y);
      const overlapBottom = Math.min(stampContainerBox.y + stampContainerBox.height, 
                                     historyBoxBox.y + historyBoxBox.height);
      
      const overlapWidth = overlapRight - overlapLeft;
      const overlapHeight = overlapBottom - overlapTop;
      
      console.log(`Overlap area: ${overlapWidth}px x ${overlapHeight}px`);
      console.log(`Stamps need to move right by at least ${historyBoxBox.x + historyBoxBox.width - stampContainerBox.x + 10}px`);
    } else {
      console.log('✅ No overlap detected');
    }
  }
  
  // Test at different viewport sizes
  const viewportSizes = [
    { width: 1400, height: 800 },
    { width: 1200, height: 800 },
    { width: 1000, height: 800 },
    { width: 900, height: 800 }
  ];
  
  for (let i = 0; i < viewportSizes.length; i++) {
    const size = viewportSizes[i];
    await page.setViewportSize(size);
    await page.waitForTimeout(100);
    
    const stampPos = await stampContainer.boundingBox();
    const historyPos = await historyBox.boundingBox();
    
    console.log(`\n--- Viewport ${size.width}x${size.height} ---`);
    console.log('Stamp container left:', stampPos?.x);
    console.log('History box left:', historyPos?.x, 'right:', (historyPos?.x || 0) + (historyPos?.width || 0));
    
    if (stampPos && historyPos) {
      const hasHorizontalOverlap = stampPos.x < historyPos.x + historyPos.width &&
                                   stampPos.x + stampPos.width > historyPos.x;
      console.log('Horizontal overlap at this size:', hasHorizontalOverlap);
    }
  }
});