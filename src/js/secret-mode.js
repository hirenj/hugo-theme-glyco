// Secret neon mode (plans/secret-neon-mode.md, plans/theme-takeover-architecture.md): type the
// Konami code anywhere to toggle a dark, laser-glow theme (neon.css) and switch every
// glycan-drawing widget on the page to the 'neon' renderer. Not persisted - a reload, the same
// code again, or Escape all leave it.
//
// This file is now just the trigger: it registers 'neon' with theme-takeover.js's generic
// controller once, then does nothing but match the Konami sequence and call applyTheme('neon')/
// revertTheme('neon') - the controller (not this file) owns actually touching the DOM. The
// renderer-swap mechanics, previously hardcoded here, now live in theme-takeover.js; see its own
// comments for how they work.
//
// Everything neon-specific (the renderer name, neon.css's cssVars, and how to load its CSS and
// its Tone.js music) comes from neon-glycan.js's own theme descriptor - this file only knows
// Konami codes and Escape now, per plans/theme-takeover-architecture.md's provider/controller
// split. loadMusic/loadCss there are both dynamic import()s, only fetched the first time secret
// mode actually activates on a page; see that module's own comment for why the activating
// keypress's user gesture matters for Tone.start().

import { registerTheme, applyTheme, revertTheme, isThemeActive } from './theme-takeover.js';
import { renderer, cssVars, loadMusic, loadCss } from 'neon-glycan.js/theme';

const THEME = 'neon';

const SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

registerTheme(THEME, { renderer, cssVars, loadMusic, loadCss });

// document.activeElement is retargeted to the shadow *host* when focus is inside an open shadow
// root - this codebase has real shadow-DOM text inputs a user could legitimately be typing into
// (ccg-search.js's own <input>, ccg-sugarbuilder's own linkage/donor form fields), so this drills
// through to the actual focused element before checking it.
function isTypingTarget() {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function toggle() {
    if (isThemeActive(THEME)) revertTheme(THEME);
    else applyTheme(THEME);
}

let index = 0;

window.addEventListener('keydown', (ev) => {
    if (isTypingTarget()) return;

    if (ev.key === 'Escape') {
        if (isThemeActive(THEME)) { toggle(); ev.preventDefault(); }
        return;
    }

    const want = SEQUENCE[index];
    const got = want.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (got === want) {
        index += 1;
        if (index === SEQUENCE.length) {
            index = 0;
            toggle();
        }
    } else {
        // Rolling restart: a wrong key might itself be a valid *first* key - the only
        // self-overlap this exact sequence has is SEQUENCE[0] ('ArrowUp') repeating at
        // SEQUENCE[1].
        index = (got === SEQUENCE[0]) ? 1 : 0;
    }
});
