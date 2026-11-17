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

import { registerTheme, applyTheme, revertTheme, isThemeActive } from './theme-takeover.js';

const SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

// Dynamic import() so Tone.js and neon-music.js (~100 KB gzipped together) only ever get fetched
// the first time secret mode actually activates on a page, in their own webpack chunk - a normal
// page never loads either. The activating keypress (below) is a trusted user gesture, which is
// what lets Tone.start() inside the resolved module unlock audio without the browser's autoplay
// restrictions blocking it: applyTheme() calls this synchronously inside that same keydown
// handler's call stack (it kicks the import() off and does not await it before returning), so the
// gesture is still live when the resolved module's start() runs.
const loadMusic = () => import(/* webpackChunkName: "neon-music" */ './neon-music.js');

registerTheme('neon', {
    // The vivid saturation/lum neon.css's own :root[data-theme="neon"] block uses - duplicated
    // here only because they also need forcing as an inline style, to beat a pre-existing inline
    // accent colour (ccg-userstatus.js's colour picker, via accent-color.js, sets
    // --base-saturation/--base-lum as inline style on <html>, which always wins over any
    // stylesheet rule on the same element regardless of selector specificity) - see
    // theme-takeover.js's registerTheme() comment. Hue is deliberately left out of cssVars, so a
    // user's own accent-colour pick keeps flowing through untouched.
    cssVars: { '--base-saturation': '96%', '--base-lum': '62%' },
    renderer: 'neon',
    loadMusic,
});

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
    if (isThemeActive('neon')) revertTheme('neon');
    else applyTheme('neon');
}

let index = 0;

window.addEventListener('keydown', (ev) => {
    if (isTypingTarget()) return;

    if (ev.key === 'Escape') {
        if (isThemeActive('neon')) { toggle(); ev.preventDefault(); }
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
