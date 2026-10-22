import { tryLoggingIn, getLoginStatus, performLogout, ensureApiLogin, getUserId, getUserName,
         getFullName, getLastUserName, getPrefs, setPrefs }
    from '../js/auth/cloudflare.js';

import { glycoStyles } from 'ccg-shared-elements/styles';

const DEFAULT_HUE = 170;
// Only used to seed the native colour input when nothing is in effect yet —
// --base-saturation/--base-lum themselves are never defaulted: see
// _applyColor, which removes rather than sets them when there's no stored
// colour, leaving the theme's own derived values in place.
const DEFAULT_SAT = 100;
const DEFAULT_LUM = 50;
const RAINBOW = 'rainbow';

let _user = 'anonymous';
let _checking = true;
const _instances = new Set();

// Full hex -> HSL, so the picker can round-trip the user's exact colour
// (hue, saturation and lightness are all stored/applied independently).
function hslFromHex(hex) {
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

// The reverse of hslFromHex — used to seed the native colour input from
// whichever of hue/saturation/lightness are currently in effect.
function hexFromHSL(h, s, l) {
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

function _clearColorProps() {
    document.documentElement.style.removeProperty('--base-hue');
    document.documentElement.style.removeProperty('--base-saturation');
    document.documentElement.style.removeProperty('--base-lum');
}

function _applyColor(color) {
    if (color === RAINBOW) {
        _clearColorProps();
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

function _setUser(user, color) {
    _user = user;
    if (user !== 'anonymous') {
        _applyColor(color);
        document.body.setAttribute('data-authenticated', '');
    } else {
        _clearColorProps();
        document.documentElement.removeAttribute(RAINBOW);
        document.body.removeAttribute('data-authenticated');
    }
    // render_menu.html marks private-menu items aria-hidden by default and
    // leaves correcting that to whoever resolves auth state — that's us.
    document.querySelectorAll('li.nav-private').forEach(li =>
        li.setAttribute('aria-hidden', user === 'anonymous' ? 'true' : 'false'));
    for (const el of _instances) el._update();
}

function _setChecking(checking) {
    _checking = checking;
    for (const el of _instances) el._update();
}

function _displayName() {
    // getFullName() is the one populated for every real login (old or new —
    // see cloudflare.js); given/family only ever come from a still-valid
    // pre-cutover Access session (plans/orcid-self-service-login.md Phase
    // 2b/4) and take priority while present since they're more specific
    // (first name only, vs. a full name string). Falls back to the raw
    // ORCID iD only if neither is available at all.
    let given = null, family = null, fullName = null;
    try {
        [given, family] = getUserName();
        fullName = getFullName();
    } catch (e) { /* no profile stored yet */ }
    if (given) return family ? `${given.split(' ')[0]} ${family}` : given.split(' ')[0];
    if (fullName) return fullName;
    return _user;
}

const tmpl = document.createElement('template');
tmpl.innerHTML = `
<style>
    :host { display: contents; }
    /* user-select: none — otherwise double-clicking to open the colour
       picker also selects the username text as a word, and a selection
       drag starting on the second click can suppress the dblclick event
       outright in some browsers/trackpads. */
    .username { margin-right: 0.5em; cursor: pointer; -webkit-user-select: none; user-select: none; }
    button.glyco { cursor: pointer; }

    :host([hero]) p {
        display: inline-block;
        position: absolute;
        top: 1em;
        bottom: 2.5em;
        margin: 0;
        left: 2em;
        right: 2em;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
    }
    :host([hero]) .button_box {
        position: absolute;
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        right: 0;
        margin-right: 1.5em;
        max-width: 10em;
        bottom: 1em;
    }
</style>
<span class="root"></span>`;

class CCGUserStatus extends HTMLElement {

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.appendChild(tmpl.content.cloneNode(true));
        this.shadowRoot.adoptedStyleSheets = [glycoStyles];
        this._root = this.shadowRoot.querySelector('.root');
    }

    connectedCallback() {
        _instances.add(this);
        this._checkUser();
        this._update();
    }

    disconnectedCallback() {
        _instances.delete(this);
    }

    _update() {
        this._root.innerHTML = '';
        if (this.hasAttribute('hero')) {
            this._renderHero();
        } else {
            this._renderCompact();
        }
    }

    _renderCompact() {
        if (_user !== 'anonymous') {
            // Plain <span>, not <label>: a <label> wrapping a <button> (a
            // labelable element) forwards every click on the label — including
            // each half of a double-click on the username — straight to the
            // button, logging the user out while they're trying to open the
            // colour picker. There's no actual form control being labelled
            // here, so there's no semantic reason for it to be a <label>.
            const label = document.createElement('span');
            const name = document.createElement('span');
            name.className = 'username';
            name.textContent = _user;
            name.title = 'Double-click to pick an accent colour\nShift+double-click for rainbow\nAlt+double-click to reset to default';
            name.addEventListener('dblclick', event => this._openColorPicker(event));
            const btn = document.createElement('button');
            btn.className = 'glyco';
            btn.innerHTML = 'Log out &nbsp;&raquo;';
            btn.addEventListener('click', () => this._logout());
            label.appendChild(name);
            label.appendChild(btn);
            this._root.appendChild(label);
        } else {
            const label = document.createElement('label');
            label.style.cursor = 'pointer';
            label.innerHTML = 'Log in &nbsp;&raquo;';
            label.addEventListener('click', () => this._login());
            this._root.appendChild(label);
        }
    }

    _renderHero() {
        if (_checking) {
            const p = document.createElement('p');
            p.className = 'checkingUser';
            p.textContent = `Logging in as ${getLastUserName() || 'anonymous'}`;
            this._root.appendChild(p);
            return;
        }
        if (_user === 'anonymous') {
            const lastUser = getLastUserName();
            const p = document.createElement('p');
            p.innerHTML = lastUser
                ? `Log in as <br/> ${lastUser}`
                : 'Log in using <br/>your UCPH<br/> account';
            const box = document.createElement('div');
            box.className = 'button_box';
            const go = document.createElement('button');
            go.className = 'glyco';
            go.innerHTML = 'go &nbsp;&raquo;';
            go.addEventListener('click', () => this._login());
            box.appendChild(go);
            // "Log in as another user" hidden for now — it can't actually force a
            // different ORCID identity chooser. ORCID keeps its own independent
            // browser session, and Access has no config to override that, so this
            // only ever misleadingly implied a capability we don't have.
            this._root.appendChild(p);
            this._root.appendChild(box);
            return;
        }
        const p = document.createElement('p');
        p.textContent = `Hi ${_displayName()}`;
        const box = document.createElement('div');
        box.className = 'button_box';
        const btn = document.createElement('button');
        btn.className = 'glyco';
        btn.innerHTML = 'logout &nbsp;&raquo;';
        btn.addEventListener('click', () => this._logout());
        box.appendChild(btn);
        this._root.appendChild(p);
        this._root.appendChild(box);
    }

    _checkUser() {
        _setChecking(true);
        return getLoginStatus().then(status => {
            if (!status) {
                _setUser('anonymous');
                return status;
            }
            return getPrefs().then(prefs => _setUser(getUserId(), prefs?.color));
        }).finally(() => _setChecking(false));
    }

    // Lazily created single hidden <input type="color"> per instance — this
    // is the whole "colour wheel picker": the native control, invoked
    // programmatically since there's no visible <input> to click on.
    _colorInput() {
        if (!this._colorInputEl) {
            this._colorInputEl = document.createElement('input');
            this._colorInputEl.type = 'color';
            // Not display:none — Safari silently refuses to open the native
            // picker from a programmatic .click() on an element that isn't
            // actually in the render tree. Zero-size and out of the way
            // instead, which WebKit is fine with.
            Object.assign(this._colorInputEl.style, {
                position: 'fixed',
                width: '0',
                height: '0',
                opacity: '0',
                pointerEvents: 'none',
            });
            this._colorInputEl.addEventListener('change', () => {
                _applyColor(this._colorInputEl.value);
                setPrefs({ color: this._colorInputEl.value })
                    .catch(err => console.error('ccg-userstatus setPrefs failed', err));
            });
            this.shadowRoot.appendChild(this._colorInputEl);
        }
        return this._colorInputEl;
    }

    _openColorPicker(event) {
        if (event.altKey) {
            // null (not omitting the field) explicitly clears a previously
            // stored colour/rainbow preference — _applyColor(null) falls
            // through to DEFAULT_HUE the same way "never set" does.
            setPrefs({ color: null })
                .catch(err => console.error('ccg-userstatus setPrefs failed', err));
            _applyColor(null);
            return;
        }
        if (event.shiftKey) {
            setPrefs({ color: RAINBOW })
                .catch(err => console.error('ccg-userstatus setPrefs failed', err));
            _applyColor(RAINBOW);
            return;
        }
        const input = this._colorInput();
        const style = getComputedStyle(document.documentElement);
        const currentHue = parseFloat(style.getPropertyValue('--base-hue'));
        const currentSat = parseFloat(style.getPropertyValue('--base-saturation'));
        const currentLum = parseFloat(style.getPropertyValue('--base-lum'));
        input.value = hexFromHSL(
            Number.isFinite(currentHue) ? currentHue : DEFAULT_HUE,
            Number.isFinite(currentSat) ? currentSat : DEFAULT_SAT,
            Number.isFinite(currentLum) ? currentLum : DEFAULT_LUM
        );
        input.click();
    }

    _logout() {
        performLogout()
            .then(() => ensureApiLogin())
            .then(() => _setUser('anonymous'))
            .catch(err => console.error('ccg-userstatus logout failed', err));
    }

    _login() {
        tryLoggingIn()
            .then(() => this._checkUser())
            .catch(err => console.error('ccg-userstatus login failed', err));
    }

}

customElements.define('ccg-userstatus', CCGUserStatus);
