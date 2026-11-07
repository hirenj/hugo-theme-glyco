// Shared accent-colour logic used by both the double-click picker on the
// username (ccg-userstatus.js) and the main colour selector on the settings
// page (glycome's ccg-settings-page.js) - kept in one place so the two
// controls can't drift out of sync on how a colour is stored/applied.

export const DEFAULT_HUE = 170;
// Only used to seed a colour input when nothing is in effect yet —
// --base-saturation/--base-lum themselves are never defaulted: see
// applyColor, which removes rather than sets them when there's no stored
// colour, leaving the theme's own derived values in place.
export const DEFAULT_SAT = 100;
export const DEFAULT_LUM = 50;
export const RAINBOW = 'rainbow';

// Full hex -> HSL, so a picker can round-trip the user's exact colour (hue,
// saturation and lightness are all stored/applied independently).
export function hslFromHex(hex) {
    if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
    const d = max - min;
    const s = d / (1 - Math.abs(2 * l - 1));
    let h;
    switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
    return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
}

// The reverse of hslFromHex — used to seed a colour input from whichever of
// hue/saturation/lightness are currently in effect.
export function hexFromHSL(h, s, l) {
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let [r, g, b] = [0, 0, 0];
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function clearColorProps() {
    document.documentElement.style.removeProperty('--base-hue');
    document.documentElement.style.removeProperty('--base-saturation');
    document.documentElement.style.removeProperty('--base-lum');
}

export function applyColor(color) {
    if (color === RAINBOW) {
        clearColorProps();
        document.documentElement.setAttribute(RAINBOW, '');
    } else {
        document.documentElement.removeAttribute(RAINBOW);
        const hsl = hslFromHex(color);
        // Hue alone falls back to DEFAULT_HUE to match prior behaviour;
        // saturation/lum are never defaulted — an invalid/missing colour
        // just clears them so the theme's own values show through.
        document.documentElement.style.setProperty('--base-hue', hsl?.h ?? DEFAULT_HUE);
        if (hsl) {
            document.documentElement.style.setProperty('--base-saturation', `${hsl.s}%`);
            document.documentElement.style.setProperty('--base-lum', `${hsl.l}%`);
        } else {
            document.documentElement.style.removeProperty('--base-saturation');
            document.documentElement.style.removeProperty('--base-lum');
        }
    }
}

// Hex for whatever colour is currently in effect (falling back to the
// defaults above), for seeding a visible <input type="color">.
export function currentColorHex() {
    const style = getComputedStyle(document.documentElement);
    const hue = parseFloat(style.getPropertyValue('--base-hue'));
    const sat = parseFloat(style.getPropertyValue('--base-saturation'));
    const lum = parseFloat(style.getPropertyValue('--base-lum'));
    return hexFromHSL(
        Number.isFinite(hue) ? hue : DEFAULT_HUE,
        Number.isFinite(sat) ? sat : DEFAULT_SAT,
        Number.isFinite(lum) ? lum : DEFAULT_LUM
    );
}
