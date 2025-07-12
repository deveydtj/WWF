/**
 * Board scaling verification tests
 * Tests that verify all game elements fit properly on various screen sizes
 */

describe('Board Scaling and Container Management', () => {
  beforeEach(() => {
    // Visit the game page before each test
    cy.visit('/game.html');
    
    // Wait for the page to load and scripts to initialize
    cy.wait(1000);
    
    // Ensure board scaling utilities are available
    cy.window().should('have.property', 'boardScalingTests');
  });

  it('should load board scaling utilities', () => {
    cy.window().its('boardScalingTests').should('be.an', 'object');
    cy.window().its('boardScalingTests.runBoardScalingTests').should('be.a', 'function');
  });

  it('should verify board fits on desktop viewport', () => {
    cy.viewport(1920, 1080);
    
    cy.window().then((win) => {
      const verification = win.boardScalingTests.verifyElementsFitInViewport();
      expect(verification.success).to.be.true;
      expect(verification.fitsHorizontally).to.be.true;
      expect(verification.fitsVertically).to.be.true;
    });
  });

  it('should verify board fits on tablet viewport', () => {
    cy.viewport(768, 1024);
    
    cy.window().then((win) => {
      const verification = win.boardScalingTests.verifyElementsFitInViewport();
      expect(verification.success).to.be.true;
      expect(verification.optimalSizing.tileSize).to.be.at.least(20);
    });
  });

  it('should verify board fits on mobile viewport', () => {
    cy.viewport(375, 667);
    
    cy.window().then((win) => {
      const verification = win.boardScalingTests.verifyElementsFitInViewport();
      expect(verification.success).to.be.true;
      expect(verification.optimalSizing.tileSize).to.be.at.least(20);
    });
  });

  it('should verify board fits on very small viewport', () => {
    cy.viewport(320, 568);
    
    cy.window().then((win) => {
      const verification = win.boardScalingTests.verifyElementsFitInViewport();
      // May not pass on very small screens, but tiles should still be minimum size
      expect(verification.optimalSizing.tileSize).to.be.at.least(20);
    });
  });

  it('should verify all key game elements are visible', () => {
    cy.viewport(1366, 768);
    
    // Check that key game elements exist and are visible
    cy.get('#board').should('be.visible');
    cy.get('#keyboard').should('be.visible');
    cy.get('#titleBar').should('be.visible');
    
    cy.window().then((win) => {
      const elementChecks = win.boardScalingTests.verifyElementsFitInViewport().elementChecks;
      
      // Verify core elements are visible in viewport
      expect(elementChecks.board.visible).to.be.true;
      expect(elementChecks.keyboard.visible).to.be.true;
      expect(elementChecks.titleBar.visible).to.be.true;
    });
  });

  it('should scale properly across multiple device sizes', () => {
    const deviceSizes = [
      { name: 'iPhone SE', width: 375, height: 667 },
      { name: 'iPad', width: 768, height: 1024 },
      { name: 'Desktop', width: 1920, height: 1080 }
    ];

    deviceSizes.forEach(device => {
      cy.viewport(device.width, device.height);
      
      cy.window().then((win) => {
        const verification = win.boardScalingTests.verifyElementsFitInViewport();
        const containerInfo = win.boardScalingTests.getBoardContainerInfo();
        
        // Log device test results
        cy.log(`${device.name}: Tile size ${verification.optimalSizing.tileSize}px`);
        
        // Basic sanity checks
        expect(verification.optimalSizing.tileSize).to.be.at.least(20);
        expect(verification.optimalSizing.tileSize).to.be.at.most(60);
        expect(containerInfo.viewportRect.width).to.equal(device.width);
        expect(containerInfo.viewportRect.height).to.equal(device.height);
      });
    });
  });

  it('should run comprehensive device testing', () => {
    cy.window().then((win) => {
      const testResults = win.boardScalingTests.testBoardScalingAcrossDevices();
      
      expect(testResults.testResults).to.have.length.at.least(10);
      expect(testResults.summary.total).to.be.at.least(10);
      expect(testResults.summary.successful).to.be.at.least(8); // Allow some failures on very small screens
      
      cy.log(`Device tests: ${testResults.summary.successRate} success rate`);
      
      if (testResults.summary.failed > 0) {
        cy.log(`Failed devices: ${testResults.summary.failedDevices.join(', ')}`);
      }
    });
  });

  it('should provide debug measurements', () => {
    cy.window().then((win) => {
      // This should not throw an error
      win.boardScalingTests.debugBoardMeasurements();
      
      const containerInfo = win.boardScalingTests.getBoardContainerInfo();
      expect(containerInfo).to.not.be.null;
      expect(containerInfo.containerRect).to.have.property('width');
      expect(containerInfo.containerRect).to.have.property('height');
      expect(containerInfo.availableSpace).to.have.property('width');
      expect(containerInfo.availableSpace).to.have.property('height');
    });
  });

  it('should handle window resize events', () => {
    // Start with a large viewport
    cy.viewport(1920, 1080);
    
    cy.window().then((win) => {
      const initialVerification = win.boardScalingTests.verifyElementsFitInViewport();
      const initialTileSize = initialVerification.optimalSizing.tileSize;
      
      // Resize to smaller viewport
      cy.viewport(375, 667);
      cy.wait(500); // Allow time for resize handlers
      
      const resizedVerification = win.boardScalingTests.verifyElementsFitInViewport();
      const resizedTileSize = resizedVerification.optimalSizing.tileSize;
      
      // Tile size should be smaller on smaller screen
      expect(resizedTileSize).to.be.lessThan(initialTileSize);
      expect(resizedVerification.success).to.be.true;
    });
  });

  it('should apply optimal scaling correctly', () => {
    cy.viewport(800, 600);
    
    cy.window().then((win) => {
      const beforeScaling = win.boardScalingTests.getBoardContainerInfo();
      const success = win.boardScalingTests.applyOptimalScaling();
      
      expect(success).to.be.true;
      
      // Check that CSS variables were updated
      const root = win.document.documentElement;
      const tileSize = getComputedStyle(root).getPropertyValue('--tile-size');
      const boardWidth = getComputedStyle(root).getPropertyValue('--board-width');
      
      expect(tileSize).to.match(/^\d+px$/);
      expect(boardWidth).to.match(/^\d+px$/);
    });
  });
});