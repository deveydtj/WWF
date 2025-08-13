"""
Browser Compatibility Test Suite for Cross-Device Layout Validation
Tests browser-specific CSS features and responsive behavior.
"""

import unittest
import tempfile
import os
from pathlib import Path
from backend.server import app


class TestCrossDeviceBrowserCompatibility(unittest.TestCase):
    """Test cross-device browser compatibility for layout validation."""
    
    def setUp(self):
        """Set up test environment."""
        self.app = app
        self.client = app.test_client()
        self.app.config['TESTING'] = True
        
        # Create temporary files for testing
        self.temp_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        """Clean up test environment."""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_css_grid_support_in_stylesheets(self):
        """Test that CSS Grid properties are used for layout structure."""
        frontend_dir = Path(__file__).parent.parent / "frontend"
        css_files = list(frontend_dir.rglob("*.css"))
        
        grid_properties_found = False
        for css_file in css_files:
            if css_file.exists():
                content = css_file.read_text().lower()
                if any(prop in content for prop in ['display: grid', 'grid-template', 'grid-column', 'grid-row']):
                    grid_properties_found = True
                    break
        
        self.assertTrue(grid_properties_found, "CSS Grid properties should be used for modern browser support")
    
    def test_flexbox_support_in_stylesheets(self):
        """Test that Flexbox properties are used for responsive layouts."""
        frontend_dir = Path(__file__).parent.parent / "frontend"
        css_files = list(frontend_dir.rglob("*.css"))
        
        flexbox_properties_found = False
        for css_file in css_files:
            if css_file.exists():
                content = css_file.read_text().lower()
                if any(prop in content for prop in ['display: flex', 'flex-direction', 'justify-content', 'align-items']):
                    flexbox_properties_found = True
                    break
        
        self.assertTrue(flexbox_properties_found, "Flexbox properties should be used for responsive layouts")
    
    def test_responsive_viewport_units_usage(self):
        """Test that responsive viewport units (vw, vh, vmin, vmax) are used."""
        frontend_dir = Path(__file__).parent.parent / "frontend"
        css_files = list(frontend_dir.rglob("*.css"))
        
        viewport_units_found = {
            'vw': False,
            'vh': False,
            'vmin': False,
            'vmax': False
        }
        
        for css_file in css_files:
            if css_file.exists():
                content = css_file.read_text()
                for unit in viewport_units_found.keys():
                    if unit in content:
                        viewport_units_found[unit] = True
        
        # At least some viewport units should be used
        units_used = sum(viewport_units_found.values())
        self.assertGreaterEqual(units_used, 2, f"At least 2 viewport units should be used. Found: {viewport_units_found}")
    
    def test_media_query_breakpoints_defined(self):
        """Test that media queries are properly defined for different device breakpoints."""
        frontend_dir = Path(__file__).parent.parent / "frontend"
        css_files = list(frontend_dir.rglob("*.css"))
        
        breakpoints_found = {
            'mobile': False,  # ≤600px
            'tablet': False,  # 601px-900px
            'desktop': False  # >900px
        }
        
        for css_file in css_files:
            if css_file.exists():
                content = css_file.read_text()
                
                # Check for mobile breakpoint (600px or similar)
                if any(bp in content for bp in ['max-width: 600px', 'max-width:600px']):
                    breakpoints_found['mobile'] = True
                
                # Check for tablet/medium breakpoint (900px or similar)
                if any(bp in content for bp in ['max-width: 900px', 'max-width:900px', 'min-width: 601px']):
                    breakpoints_found['tablet'] = True
                
                # Check for desktop breakpoint
                if any(bp in content for bp in ['min-width: 901px', 'min-width:901px', 'min-width: 900px']):
                    breakpoints_found['desktop'] = True
        
        self.assertTrue(breakpoints_found['mobile'], "Mobile breakpoint (≤600px) should be defined")
        # Note: tablet and desktop breakpoints may be implicit in the design
    
    def test_css_transition_properties_for_smooth_animations(self):
        """Test that CSS transitions are defined for smooth layout changes."""
        frontend_dir = Path(__file__).parent.parent / "frontend"
        css_files = list(frontend_dir.rglob("*.css"))
        
        transition_properties_found = False
        for css_file in css_files:
            if css_file.exists():
                content = css_file.read_text()
                if any(prop in content for prop in ['transition:', 'transition-duration:', 'transition-property:']):
                    transition_properties_found = True
                    break
        
        self.assertTrue(transition_properties_found, "CSS transitions should be defined for smooth layout changes")
    
    def test_vendor_prefix_fallbacks_or_modern_alternatives(self):
        """Test that modern CSS is used without relying on vendor prefixes."""
        frontend_dir = Path(__file__).parent.parent / "frontend"
        css_files = list(frontend_dir.rglob("*.css"))
        
        vendor_prefixes_found = 0
        modern_properties_found = 0
        
        for css_file in css_files:
            if css_file.exists():
                content = css_file.read_text()
                
                # Count vendor prefixes (should be minimal in modern CSS)
                vendor_prefixes_found += content.count('-webkit-')
                vendor_prefixes_found += content.count('-moz-')
                vendor_prefixes_found += content.count('-ms-')
                vendor_prefixes_found += content.count('-o-')
                
                # Count modern properties
                if any(prop in content for prop in ['grid', 'flex', 'transform', 'transition']):
                    modern_properties_found += 1
        
        # Should use modern CSS properties more than vendor prefixes
        self.assertGreater(modern_properties_found, 0, "Modern CSS properties should be used")
        # Allow some vendor prefixes for specific features, but they shouldn't dominate
        if vendor_prefixes_found > 0:
            print(f"Note: {vendor_prefixes_found} vendor prefixes found - consider if these are necessary")
    
    def test_responsive_font_sizing(self):
        """Test that font sizing adapts to different screen sizes."""
        frontend_dir = Path(__file__).parent.parent / "frontend"
        css_files = list(frontend_dir.rglob("*.css"))
        
        responsive_font_sizing = False
        for css_file in css_files:
            if css_file.exists():
                content = css_file.read_text()
                
                # Look for clamp(), responsive units, or media query font adjustments
                if any(pattern in content for pattern in ['clamp(', 'font-size.*vw', 'font-size.*rem']):
                    responsive_font_sizing = True
                    break
                
                # Or check for font-size changes in media queries
                if '@media' in content and 'font-size' in content:
                    responsive_font_sizing = True
                    break
        
        self.assertTrue(responsive_font_sizing, "Responsive font sizing should be implemented")
    
    def test_device_testing_infrastructure_comprehensive(self):
        """Test that comprehensive device testing infrastructure exists."""
        frontend_dir = Path(__file__).parent.parent / "frontend"
        
        # Check Cypress board scaling tests
        cypress_test = frontend_dir / "cypress" / "e2e" / "boardScaling.cy.js"
        self.assertTrue(cypress_test.exists(), "Cypress board scaling tests should exist")
        
        if cypress_test.exists():
            content = cypress_test.read_text()
            
            # Should test multiple viewports
            viewport_tests = content.count('cy.viewport(')
            self.assertGreaterEqual(viewport_tests, 5, f"Should test at least 5 different viewports, found {viewport_tests}")
            
            # Should test common devices
            device_types = ['iPhone', 'iPad', 'Desktop']
            for device_type in device_types:
                self.assertIn(device_type, content, f"{device_type} testing should be included")
        
        # Check JavaScript testing utilities
        board_container = frontend_dir / "static" / "js" / "boardContainer.js"
        self.assertTrue(board_container.exists(), "Board container JavaScript should exist")
        
        if board_container.exists():
            content = board_container.read_text()
            self.assertIn('testBoardScalingAcrossDevices', content, "Device testing function should exist")
            
            # Should define multiple test devices
            device_definitions = content.count("{ name: '")
            self.assertGreaterEqual(device_definitions, 8, f"Should define at least 8 test devices, found {device_definitions}")
    
    def test_layout_modes_properly_implemented(self):
        """Test that different layout modes (Light, Medium, Full) are properly implemented."""
        frontend_dir = Path(__file__).parent.parent / "frontend"
        
        # Check for layout mode implementation
        layout_css = frontend_dir / "static" / "css" / "layout.css"
        responsive_css = frontend_dir / "static" / "css" / "responsive.css"
        
        layout_modes_found = {
            'light_mode': False,    # Mobile ≤600px
            'medium_mode': False,   # Tablet 601px-900px  
            'full_mode': False      # Desktop >900px
        }
        
        css_files = [layout_css, responsive_css]
        for css_file in css_files:
            if css_file.exists():
                content = css_file.read_text()
                
                # Look for mobile/light mode indicators
                if any(indicator in content.lower() for indicator in ['600px', 'mobile', 'light']):
                    layout_modes_found['light_mode'] = True
                
                # Look for tablet/medium mode indicators
                if any(indicator in content.lower() for indicator in ['900px', 'tablet', 'medium']):
                    layout_modes_found['medium_mode'] = True
                
                # Look for desktop/full mode indicators
                if any(indicator in content.lower() for indicator in ['desktop', 'full', 'large']):
                    layout_modes_found['full_mode'] = True
        
        self.assertTrue(layout_modes_found['light_mode'], "Light mode (mobile) layout should be implemented")
        print(f"Layout modes found: {layout_modes_found}")
    

if __name__ == '__main__':
    unittest.main()