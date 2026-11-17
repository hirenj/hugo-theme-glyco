// Generic theme-takeover controller (plans/theme-takeover-architecture.md, phase 2). Extracted
// from secret-mode.js, which used to hardcode all of this to 'neon': this module knows how to
// attach a theme at a given scope and swap renderer-hosting elements within it, but nothing about
// Konami codes, neon, Tone.js, or any other trigger or theme. A trigger (secret-mode.js today; a
// stored-preference reader later) registers a theme once with registerTheme(), then calls
// applyTheme()/revertTheme() by name whenever it decides to - the "when" and "why" are entirely
// the trigger's business, not this module's.
//
// A theme's CSS is itself lazy, same as its music: registerTheme()'s optional loadCss field is a
// () => Promise<string> (a dynamic import() of a .css file through a bundler that hands back raw
// text), injected into a <style> tag the first time that theme is actually applied - so a page
// that never triggers secret mode fetches neither Tone.js nor neon.css's own ~51 KB of
// base64-embedded font.
//
// Deliberately has no dependency on sviewer: rather than editing its shared element class, this
// patches the live class object straight out of the custom-element registry
// (customElements.get('ccg-sviewer-lite')), the same way ccg-searchbox.js already pulls its base
// class from the registry instead of importing it. Every sviewer-family tag (ccg-sviewer,
// ccg-sugarbuilder, ccg-sviewer-cache) shares that one base class and calls super() properly, so
// patching it once covers all of them - including any other site's pages, with zero changes there
// either, the moment they load a current sviewer build and this same script.

const TAGS = ['ccg-sviewer', 'ccg-sviewer-lite', 'ccg-sugarbuilder', 'ccg-sviewer-cache'];
const ACTIVE = Symbol('themeTakeoverActive');
const RESTORE = Symbol('themeTakeoverRestoreRenderer');

const registry = new Map();   // name -> descriptor

// scope element -> { name, savedTheme, savedColorOverride, savedVars }. A plain Map, not a
// WeakMap: applyTheme()/revertTheme() always add/remove their own entry in pairs, so this never
// accumulates across normal use, and it needs to be iterable (see activeDescriptorFor below),
// which a WeakMap can't be.
const activations = new Map();

// Theme names whose CSS text has already been fetched and injected into <head>, ever - see
// ensureCss() below. Separate from `activations`: unlike renderer/cssVars state, injected CSS is
// never removed on revert (a dormant <style> costs nothing - its selectors just don't match once
// data-theme is gone, same reasoning neon.css's own header gives for the whole file), so this only
// ever grows, by at most one entry per theme actually used in a page's lifetime.
const injectedCss = new Set();

// descriptor: {
//   dataTheme = name:    the data-theme value to set (matches a [data-theme="..."] CSS override)
//   cssVars = {}:        custom properties to force as an INLINE style on the scope element, not
//                        just via the stylesheet - needed to beat a pre-existing inline override
//                        on the same element (ccg-userstatus's accent-colour picker sets
//                        --base-hue/-saturation/-lum as inline style on <html>, which always wins
//                        over a stylesheet rule on that same element regardless of selector
//                        specificity, so a theme that wants to force those values has to match
//                        that fight, not just add a stylesheet rule and hope).
//   renderer:            the renderer attribute value to set on matched sviewer-family elements
//                        within scope (e.g. 'neon') - a string sviewer's own renderer registry
//                        already understands, not a class reference.
//   loadMusic:           optional () => Promise<{ start(), stop() }>, called (and awaited before
//                        start()) on apply, with stop() called on revert. Callers typically pass a
//                        dynamic import() here so the module (and whatever it pulls in, e.g.
//                        Tone.js) is only ever fetched the first time this specific theme actually
//                        activates - see secret-mode.js's own loadMusic for why that import has to
//                        happen synchronously inside the activating user gesture, not awaited
//                        first.
//   loadCss:             optional () => Promise<string>, the theme's CSS as raw text (e.g. a
//                        dynamic import() of a .css file through a bundler configured to hand text
//                        back, same as ccg-styles.js already relies on for glycosuite.css). Fetched
//                        and injected into a <style data-theme-takeover="name"> tag in <head> the
//                        first time THIS theme is applied, ever, on this page - not re-fetched on
//                        later apply/revert cycles, and not awaited before the rest of applyTheme()
//                        proceeds (renderer swap and cssVars land immediately; the theme's visual
//                        CSS rules may paint a beat later - a brief, accepted flash, same tradeoff
//                        loadMusic already makes for when the audio actually starts).
// }
export function registerTheme(name, descriptor) {
    registry.set(name, { dataTheme: name, cssVars: {}, ...descriptor });
}

function ensureCss(name, descriptor) {
    if (!descriptor.loadCss || injectedCss.has(name)) return;
    injectedCss.add(name);
    descriptor.loadCss().then((cssText) => {
        const style = document.createElement('style');
        style.dataset.themeTakeover = name;
        style.textContent = cssText;
        document.head.appendChild(style);
    }).catch((err) => {
        injectedCss.delete(name);   // let a later applyTheme() retry
        console.error(`theme-takeover: "${name}"'s CSS failed to load`, err);
    });
}

export function isThemeActive(name, scope = document.documentElement) {
    const saved = activations.get(scope);
    return !!saved && saved.name === name;
}

// Finds every sviewer-family element under root, crossing shadow boundaries downward -
// ccg-afstudio and ccg-sugarbuilder-page (both Lit components) render their
// <ccg-sugarbuilder>/<ccg-sviewer> inside their own shadow root, not the light DOM, so this is
// the common case to handle, not an edge case. Cost: one pass over every element and open shadow
// root under root, O(subtree size); only run on apply/revert, never on a timer or observer.
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

// The reverse direction - is el under scope, crossing shadow boundaries upward? Node.contains()
// alone can't answer this: it stops at a shadow root instead of continuing through its host.
// Only needed for a SCOPED (non-root) takeover; the root case below skips this entirely, since
// "the whole page" trivially contains everything.
function containsAcrossShadow(scope, el) {
    let node = el;
    while (node) {
        if (node === scope) return true;
        node = node.parentNode || (node.host ?? null);
    }
    return false;
}

// Which theme, if any, currently claims el - for an element connecting to the page for the first
// time *after* its scope's takeover was already applied (e.g. a Lit host re-rendering a fresh
// <ccg-sugarbuilder> into existence). Elements already connected at apply() time are handled
// directly there instead, via findSviewerElements(scope).
function activeDescriptorFor(el) {
    for (const [scope, saved] of activations) {
        if (scope === document.documentElement || containsAcrossShadow(scope, el)) {
            return registry.get(saved.name);
        }
    }
    return null;
}

function enter(el, targetRenderer) {
    if (el[ACTIVE]) return;
    el[ACTIVE] = targetRenderer;
    el[RESTORE] = el.hasAttribute('renderer') ? el.getAttribute('renderer') : undefined;
    if (el.getAttribute('renderer') !== targetRenderer) el.setAttribute('renderer', targetRenderer);
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

// Patches the one shared sviewer base class once it's registered on the page (a page with no
// glycan widgets never defines it, so this promise just never resolves - harmless).
// ccg-sviewer/ccg-sugarbuilder/ccg-sviewer-cache all override connectedCallback/
// attributeChangedCallback but always call super.xxx() - a super call resolves against the
// prototype at call time, dynamically, so patching the one base here covers every subclass
// without touching any of them. Patched exactly once, the first time any theme is applied; every
// later takeover (a different name/renderer, a different scope) reuses the same patch, since it
// looks the applicable theme up per element rather than hardcoding one.
let patched = false;
function ensurePatched() {
    if (patched) return;
    patched = true;
    customElements.whenDefined('ccg-sviewer-lite').then(() => {
        const Cls = customElements.get('ccg-sviewer-lite');
        const origConnected = Cls.prototype.connectedCallback;
        const origAttrChanged = Cls.prototype.attributeChangedCallback;

        Cls.prototype.connectedCallback = function (...args) {
            const result = origConnected?.apply(this, args);
            const descriptor = activeDescriptorFor(this);
            if (descriptor && this.getAttribute('renderer') !== descriptor.renderer) enter(this, descriptor.renderer);
            return result;
        };
        Cls.prototype.attributeChangedCallback = function (name, ...rest) {
            if (name === 'renderer' && this[ACTIVE] && this.getAttribute('renderer') !== this[ACTIVE]) {
                // Something (a Lit host re-rendering from an unrelated property change, devtools,
                // etc.) changed renderer away from the active takeover's target while active for
                // this element. Remember it as the restore target and force it straight back -
                // this synchronously re-enters this same method with the attribute already set to
                // the target, which falls through to the original implementation exactly once and
                // does the real renderer switch. Not infinite recursion: that nested call's guard
                // condition is false (attribute already matches [ACTIVE]), so it falls through
                // instead of setting the attribute again.
                this[RESTORE] = this.getAttribute('renderer');
                this.setAttribute('renderer', this[ACTIVE]);
                return;
            }
            return origAttrChanged?.call(this, name, ...rest);
        };
    });
}

// Applies `name`'s theme at `scope` (default: the whole page, via <html>). Sets scope's
// data-theme, forces the descriptor's cssVars as inline style on scope (see the descriptor
// comment above), adds glycosuite.css's own [color-override] attribute when scope isn't the root
// (glycosuite's --base-hue -> --base-color computation is gated to the selector
// `:root, [color-override]`, so a scoped container needs that attribute for the override to take
// effect at all - see plans/theme-takeover-architecture.md), swaps every sviewer-family element
// within scope to the descriptor's renderer, and starts music if the descriptor has any. Calling
// this twice for the same scope without reverting in between just re-applies (harmless, but not
// reference-counted - the second call's revert data overwrites the first's).
export function applyTheme(name, { scope = document.documentElement } = {}) {
    const descriptor = registry.get(name);
    if (!descriptor) throw new Error(`theme-takeover: no theme registered as "${name}"`);
    ensurePatched();
    ensureCss(name, descriptor);

    const savedVars = {};
    for (const prop of Object.keys(descriptor.cssVars)) {
        savedVars[prop] = scope.style.getPropertyValue(prop);
    }
    const isRoot = scope === document.documentElement;
    activations.set(scope, {
        name,
        savedTheme: scope.dataset.theme,
        savedColorOverride: isRoot ? undefined : scope.hasAttribute('color-override'),
        savedVars,
    });

    scope.dataset.theme = descriptor.dataTheme;
    if (!isRoot) scope.setAttribute('color-override', '');
    for (const [prop, value] of Object.entries(descriptor.cssVars)) {
        scope.style.setProperty(prop, value);
    }
    for (const el of findSviewerElements(isRoot ? document : scope)) {
        enter(el, descriptor.renderer);
    }
    if (descriptor.loadMusic) {
        descriptor.loadMusic().then((m) => m.start()).catch((err) => console.error(`theme-takeover: "${name}"'s music failed to load`, err));
    }
    document.dispatchEvent(new CustomEvent('theme-takeover', { detail: { active: true, name, scope } }));
}

export function revertTheme(name, { scope = document.documentElement } = {}) {
    const descriptor = registry.get(name);
    const saved = activations.get(scope);
    if (!descriptor || !saved || saved.name !== name) return;
    activations.delete(scope);

    const isRoot = scope === document.documentElement;
    if (saved.savedTheme === undefined) scope.removeAttribute('data-theme');
    else scope.dataset.theme = saved.savedTheme;
    if (!isRoot && saved.savedColorOverride === false) scope.removeAttribute('color-override');
    for (const [prop, value] of Object.entries(saved.savedVars)) {
        if (value) scope.style.setProperty(prop, value);
        else scope.style.removeProperty(prop);
    }
    for (const el of findSviewerElements(isRoot ? document : scope)) {
        exit(el);
    }
    if (descriptor.loadMusic) {
        descriptor.loadMusic().then((m) => m.stop()).catch(() => {});
    }
    document.dispatchEvent(new CustomEvent('theme-takeover', { detail: { active: false, name, scope } }));
}
