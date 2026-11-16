// Secret neon mode (plans/secret-neon-mode.md): type the Konami code
// anywhere to toggle a dark, laser-glow theme (neon.css) and switch every
// glycan-drawing widget on the page to the 'neon' renderer. Not persisted -
// a reload, the same code again, or Escape all leave it.
//
// Deliberately has no dependency on sviewer: rather than editing its shared
// element class, this patches the live class object straight out of the
// custom-element registry (customElements.get('ccg-sviewer-lite')), the
// same way ccg-searchbox.js already pulls its base class from the registry
// instead of importing it. Every sviewer-family tag (ccg-sviewer,
// ccg-sugarbuilder, ccg-sviewer-cache) shares that one base class and calls
// super() properly, so patching it once covers all of them - including any
// other site's pages, with zero changes there either, the moment they load
// a current sviewer build and this same script.

const SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

// The vivid saturation/lum neon.css's own :root[data-theme="neon"] block
// uses - duplicated here only because they also need setting as an inline
// style, to beat a pre-existing inline accent colour (ccg-userstatus.js's
// colour picker, via accent-color.js, sets --base-saturation/--base-lum as
// inline style on <html>, which always wins over any stylesheet rule on
// the same element regardless of selector specificity). Hue is
// deliberately left untouched - see activate() below.
const NEON_SATURATION = '96%';
const NEON_LUM = '62%';

const TAGS = ['ccg-sviewer', 'ccg-sviewer-lite', 'ccg-sugarbuilder', 'ccg-sviewer-cache'];
const ACTIVE = Symbol('secretModeActive');
const RESTORE = Symbol('secretRestoreRenderer');

let savedTheme;   // dataset.theme value from before activation, or undefined if there wasn't one
let savedSat;     // inline --base-saturation before activation, or '' if there wasn't one
let savedLum;

const isActive = () => document.documentElement.dataset.theme === 'neon';

// Finds every sviewer-family element on the page, crossing shadow
// boundaries - ccg-afstudio and ccg-sugarbuilder-page (both Lit
// components) render their <ccg-sugarbuilder>/<ccg-sviewer> inside their
// own shadow root, not the light DOM, so this is the common case to
// handle, not an edge case. Cost: one pass over every element and open
// shadow root on the page, O(page size); only run on activate/deactivate,
// never on a timer or observer.
function findSviewerElements(root = document) {
    const found = [];
    (function walk(node) {
        for (const el of node.querySelectorAll('*')) {
            if (TAGS.includes(el.localName)) found.push(el);
            if (el.shadowRoot) walk(el.shadowRoot);
        }
    })(root);
    return found;
}

function enter(el) {
    if (el[ACTIVE]) return;
    el[ACTIVE] = true;
    el[RESTORE] = el.hasAttribute('renderer') ? el.getAttribute('renderer') : undefined;
    if (el.getAttribute('renderer') !== 'neon') el.setAttribute('renderer', 'neon');
}

function exit(el) {
    if (!el[ACTIVE]) return;
    el[ACTIVE] = false;
    const restore = el[RESTORE];
    el[RESTORE] = undefined;
    if (restore === undefined) {
        if (el.hasAttribute('renderer')) el.removeAttribute('renderer');
    } else if (el.getAttribute('renderer') !== restore) {
        el.setAttribute('renderer', restore);
    }
}

// Patches the one shared sviewer base class once it's registered on the
// page (a page with no glycan widgets never defines it, so this promise
// just never resolves - harmless). ccg-sviewer/ccg-sugarbuilder/
// ccg-sviewer-cache all override connectedCallback/attributeChangedCallback
// but always call super.xxx() - a super call resolves against the
// prototype at call time, dynamically, so patching the one base here
// covers every subclass without touching any of them.
customElements.whenDefined('ccg-sviewer-lite').then(() => {
    const Cls = customElements.get('ccg-sviewer-lite');
    const origConnected = Cls.prototype.connectedCallback;
    const origAttrChanged = Cls.prototype.attributeChangedCallback;

    Cls.prototype.connectedCallback = function (...args) {
        const result = origConnected?.apply(this, args);
        if (isActive() && this.getAttribute('renderer') !== 'neon') enter(this);
        return result;
    };
    Cls.prototype.attributeChangedCallback = function (name, ...rest) {
        if (name === 'renderer' && this[ACTIVE] && this.getAttribute('renderer') !== 'neon') {
            // Something (a Lit host re-rendering from an unrelated property
            // change, devtools, etc.) changed renderer away from 'neon'
            // while active for this element. Remember it as the restore
            // target and force it straight back - this synchronously
            // re-enters this same method with the attribute already
            // 'neon', which falls through to the original implementation
            // exactly once and does the real renderer switch. Not infinite
            // recursion: that nested call's guard condition is false
            // (attribute already 'neon'), so it falls through instead of
            // setting the attribute again.
            this[RESTORE] = this.getAttribute('renderer');
            this.setAttribute('renderer', 'neon');
            return;
        }
        return origAttrChanged?.call(this, name, ...rest);
    };

    // Elements already connected by now (anything in the page's initial
    // HTML - custom-element upgrade for pre-parsed elements happens
    // synchronously inside customElements.define(), strictly before this
    // .then() callback's microtask runs) won't get the patched
    // connectedCallback retroactively - sync them directly, once, right
    // now, in case secret mode is somehow already active.
    if (isActive()) for (const el of findSviewerElements()) enter(el);
});

function activate() {
    const root = document.documentElement;
    savedTheme = root.dataset.theme;
    savedSat = root.style.getPropertyValue('--base-saturation');
    savedLum = root.style.getPropertyValue('--base-lum');
    root.dataset.theme = 'neon';
    root.style.setProperty('--base-saturation', NEON_SATURATION);
    root.style.setProperty('--base-lum', NEON_LUM);
    for (const el of findSviewerElements()) enter(el);
}

function deactivate() {
    const root = document.documentElement;
    if (savedTheme === undefined) root.removeAttribute('data-theme');
    else root.dataset.theme = savedTheme;
    if (savedSat) root.style.setProperty('--base-saturation', savedSat);
    else root.style.removeProperty('--base-saturation');
    if (savedLum) root.style.setProperty('--base-lum', savedLum);
    else root.style.removeProperty('--base-lum');
    for (const el of findSviewerElements()) exit(el);
}

function toggle() {
    if (isActive()) deactivate();
    else activate();
    document.dispatchEvent(new CustomEvent('secret-mode', { detail: { active: isActive() } }));
}

// document.activeElement is retargeted to the shadow *host* when focus is
// inside an open shadow root - this codebase has real shadow-DOM text
// inputs a user could legitimately be typing into (ccg-search.js's own
// <input>, ccg-sugarbuilder's own linkage/donor form fields), so this
// drills through to the actual focused element before checking it.
function isTypingTarget() {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

let index = 0;

window.addEventListener('keydown', (ev) => {
    if (isTypingTarget()) return;

    if (ev.key === 'Escape') {
        if (isActive()) { toggle(); ev.preventDefault(); }
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
        // Rolling restart: a wrong key might itself be a valid *first* key -
        // the only self-overlap this exact sequence has is SEQUENCE[0]
        // ('ArrowUp') repeating at SEQUENCE[1].
        index = (got === SEQUENCE[0]) ? 1 : 0;
    }
});
