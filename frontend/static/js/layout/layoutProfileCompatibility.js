import { LAYOUT_DENSITIES } from './layoutProfile.js';
import { LAYOUT_MODES } from '../layoutModes.js';

/**
 * Temporary bridge from capability profiles to the stylesheet classes used by
 * the pre-refactor responsive shell.
 *
 * @deprecated Remove when the legacy mobile/desktop stylesheets are replaced
 * by profile data attributes in Phase 5.
 */

const LEGACY_MODE_BY_DENSITY = Object.freeze({
  [LAYOUT_DENSITIES.COMPACT]: LAYOUT_MODES.PHONE,
  [LAYOUT_DENSITIES.COMFORTABLE]: LAYOUT_MODES.TABLET,
  [LAYOUT_DENSITIES.SPACIOUS]: LAYOUT_MODES.DESKTOP
});

export const LEGACY_LAYOUT_CLASSES = Object.freeze([
  'phone-layout',
  'tablet-layout',
  'desktop-layout'
]);

/**
 * Map a capability profile to the closest legacy stylesheet mode.
 *
 * This is rendering compatibility only. New behavior must read the profile
 * fields directly instead of treating the returned device label as state.
 *
 * @deprecated Consume layout profile fields directly in new code.
 * @param {{density:string}} profile
 * @returns {'phone'|'tablet'|'desktop'}
 */
export function getLegacyLayoutModeForProfile(profile) {
  const mode = LEGACY_MODE_BY_DENSITY[profile?.density];
  if (!mode) {
    throw new TypeError(
      `Cannot map layout profile density to a legacy mode: ${String(profile?.density)}`
    );
  }
  return mode;
}

/**
 * Apply exactly one legacy layout class for an authoritative profile.
 *
 * The `mobile-layout` alias is retained for existing selectors and is not a
 * fourth layout mode.
 *
 * @deprecated Use profile data attributes once the responsive shell migrates.
 * @param {{density:string}} profile
 * @param {{classList:{toggle:function(string, boolean):void}}} [target]
 * @returns {'phone'|'tablet'|'desktop'}
 */
export function applyLegacyLayoutClasses(
  profile,
  target = (typeof document !== 'undefined' ? document.body : null)
) {
  if (!target?.classList || typeof target.classList.toggle !== 'function') {
    throw new TypeError('A target with a classList is required');
  }

  const mode = getLegacyLayoutModeForProfile(profile);
  LEGACY_LAYOUT_CLASSES.forEach((className) => {
    target.classList.toggle(className, className === `${mode}-layout`);
  });
  target.classList.toggle('mobile-layout', mode !== LAYOUT_MODES.DESKTOP);

  return mode;
}
