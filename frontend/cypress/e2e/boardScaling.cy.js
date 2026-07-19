/**
 * Board scaling verification tests.
 *
 * Measurement helpers intentionally live in this test module. Production code
 * owns sizing through responsiveScaling.js and does not expose mutable scaling
 * APIs on window for a browser test harness.
 */

const DEVICE_SIZES = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 12', width: 390, height: 844 },
  { name: 'iPhone 12 Pro Max', width: 428, height: 926 },
  { name: 'iPad Mini', width: 768, height: 1024 },
  { name: 'iPad Air', width: 820, height: 1180 },
  { name: 'Galaxy S20', width: 360, height: 800 },
  { name: 'Galaxy Note', width: 412, height: 915 },
  { name: 'Desktop Small', width: 1024, height: 768 },
  { name: 'Desktop Medium', width: 1366, height: 768 },
  { name: 'Desktop Large', width: 1920, height: 1080 }
];

function captureScaling(win) {
  const board = win.document.querySelector('#board');
  const keyboard = win.document.querySelector('#keyboard');
  const titleBar = win.document.querySelector('#titleBar');

  if (!board || !keyboard) {
    return { success: false, error: 'Board or keyboard element not found' };
  }

  const viewport = {
    width: Math.max(win.document.documentElement.clientWidth, win.innerWidth || 0),
    height: Math.max(win.document.documentElement.clientHeight, win.innerHeight || 0)
  };
  const boardRect = board.getBoundingClientRect();
  const keyboardRect = keyboard.getBoundingClientRect();
  const titleBarRect = titleBar?.getBoundingClientRect() || {
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  };
  const styles = win.getComputedStyle(win.document.documentElement);
  const isVisible = (rect) => rect.width > 0
    && rect.height > 0
    && rect.top < viewport.height
    && rect.left < viewport.width
    && rect.bottom > 0
    && rect.right > 0;
  const fitsHorizontally = boardRect.left >= 0
    && keyboardRect.left >= 0
    && boardRect.right <= viewport.width
    && keyboardRect.right <= viewport.width;
  const fitsVertically = boardRect.top >= 0
    && keyboardRect.top >= 0
    && boardRect.bottom <= viewport.height
    && keyboardRect.bottom <= viewport.height;

  return {
    success: fitsHorizontally && fitsVertically,
    fitsHorizontally,
    fitsVertically,
    viewport,
    containerRect: {
      width: boardRect.width,
      height: boardRect.height
    },
    optimalSizing: {
      tileSize: parseFloat(styles.getPropertyValue('--tile-size')) || 0,
      keyHeight: parseFloat(styles.getPropertyValue('--keyboard-key-height')) || 0,
      boardWidth: parseFloat(styles.getPropertyValue('--board-width')) || 0
    },
    elementChecks: {
      board: { visible: isVisible(boardRect) },
      keyboard: { visible: isVisible(keyboardRect) },
      titleBar: { visible: isVisible(titleBarRect) }
    }
  };
}

describe('Board Scaling and Container Management', () => {
  beforeEach(() => {
    cy.visit('/game.html');
    cy.get('#board').should('be.visible');
    cy.get('#keyboard').should('be.visible');
  });

  it('does not expose deprecated production scaling globals', () => {
    cy.window().then((win) => {
      expect(win).not.to.have.property('boardScalingTests');
      expect(win).not.to.have.property('tuneSizing');
      expect(win).not.to.have.property('recalculateScaling');
      expect(win).not.to.have.property('enhancedScaling');
    });
  });

  it('should verify board fits on desktop viewport', () => {
    cy.viewport(1920, 1080);
    cy.window().then((win) => {
      const verification = captureScaling(win);
      expect(verification.success).to.be.true;
      expect(verification.fitsHorizontally).to.be.true;
      expect(verification.fitsVertically).to.be.true;
    });
  });

  it('should verify board fits on tablet viewport', () => {
    cy.viewport(768, 1024);
    cy.window().then((win) => {
      const verification = captureScaling(win);
      expect(verification.success).to.be.true;
      expect(verification.optimalSizing.tileSize).to.be.at.least(20);
    });
  });

  it('should verify board fits on mobile viewport', () => {
    cy.viewport(375, 667);
    cy.window().then((win) => {
      const verification = captureScaling(win);
      expect(verification.success).to.be.true;
      expect(verification.optimalSizing.tileSize).to.be.at.least(20);
    });
  });

  it('should keep tiles usable on a very small viewport', () => {
    cy.viewport(320, 568);
    cy.window().then((win) => {
      const verification = captureScaling(win);
      expect(verification.optimalSizing.tileSize).to.be.at.least(20);
    });
  });

  it('should verify all key game elements are visible', () => {
    cy.viewport(1366, 768);
    cy.window().then((win) => {
      const { elementChecks } = captureScaling(win);
      expect(elementChecks.board.visible).to.be.true;
      expect(elementChecks.keyboard.visible).to.be.true;
      expect(elementChecks.titleBar.visible).to.be.true;
    });
  });

  it('should measure the actual viewport across multiple device sizes', () => {
    const results = [];

    DEVICE_SIZES.forEach((device) => {
      cy.viewport(device.width, device.height);
      cy.window().then((win) => {
        const measurement = captureScaling(win);
        results.push(measurement);
        expect(measurement.viewport).to.deep.equal({
          width: device.width,
          height: device.height
        });
        expect(measurement.optimalSizing.tileSize).to.be.at.least(20);
      });
    });

    cy.then(() => {
      expect(results).to.have.length(DEVICE_SIZES.length);
    });
  });

  it('should provide test-owned board measurements', () => {
    cy.window().then((win) => {
      const measurement = captureScaling(win);
      expect(measurement.containerRect).to.have.property('width');
      expect(measurement.containerRect).to.have.property('height');
      expect(measurement.viewport).to.have.property('width');
      expect(measurement.viewport).to.have.property('height');
    });
  });

  it('should recalculate through the shared viewport pipeline after resize', () => {
    cy.viewport(1920, 1080);
    cy.window().then((win) => {
      const initialTileSize = captureScaling(win).optimalSizing.tileSize;

      cy.viewport(375, 667);
      cy.window().should((resizedWindow) => {
        const resized = captureScaling(resizedWindow);
        expect(resized.optimalSizing.tileSize).to.be.lessThan(initialTileSize);
        expect(resized.success).to.be.true;
      });
    });
  });
});
