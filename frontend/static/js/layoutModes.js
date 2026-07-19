/**
 * Legacy responsive layout contract.
 *
 * @deprecated New code must consume the capability profile from
 * layout/layoutProfile.js. These labels remain only while the existing
 * stylesheets and callers are migrated.
 */

export const LAYOUT_MODES = Object.freeze({
  PHONE: 'phone',
  TABLET: 'tablet',
  DESKTOP: 'desktop'
});

export const LAYOUT_BREAKPOINTS = Object.freeze({
  PHONE_MAX: 600,
  TABLET_MAX: 900
});

const LEGACY_LAYOUT_MODE_ALIASES = Object.freeze({
  light: LAYOUT_MODES.PHONE,
  mobile: LAYOUT_MODES.PHONE,
  medium: LAYOUT_MODES.TABLET,
  full: LAYOUT_MODES.DESKTOP
});

export function normalizeLayoutMode(mode) {
  return LEGACY_LAYOUT_MODE_ALIASES[mode] || mode;
}

export function getLayoutModeForWidth(width) {
  if (width <= LAYOUT_BREAKPOINTS.PHONE_MAX) {
    return LAYOUT_MODES.PHONE;
  }

  if (width <= LAYOUT_BREAKPOINTS.TABLET_MAX) {
    return LAYOUT_MODES.TABLET;
  }

  return LAYOUT_MODES.DESKTOP;
}

export function isPhoneLayout(mode) {
  return normalizeLayoutMode(mode) === LAYOUT_MODES.PHONE;
}

export function isTabletLayout(mode) {
  return normalizeLayoutMode(mode) === LAYOUT_MODES.TABLET;
}

export function isDesktopLayout(mode) {
  return normalizeLayoutMode(mode) === LAYOUT_MODES.DESKTOP;
}

export function isSmallLayout(mode) {
  const normalized = normalizeLayoutMode(mode);
  return normalized === LAYOUT_MODES.PHONE || normalized === LAYOUT_MODES.TABLET;
}
