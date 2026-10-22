import { tryLoggingIn, getLoginStatus, performLogout, ensureApiLogin, getUserId, getUserName,
         getFullName, getLastUserName, getPrefs, setPrefs }
    from '../js/auth/cloudflare.js';

import { glycoStyles } from 'ccg-shared-elements/styles';

const DEFAULT_HUE = 170;
const RAINBOW = 'rainbow';

let _user = 'anonymous';
let _checking = true;
const _instances = new Set();

// Only --base-hue is ever user-controlled (saturation/lightness stay the
// theme's own derived values) — so the picker only needs to round-trip hue,
// not a full colour, hence the single `h` pulled out of the hex->HSL math
// below rather than a general colour-space conversion helper.
function hueFromHex(hex) {
    if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === min) return 0;
    const d = max - min;
    let h;
    switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4; break;
    }
    h *= 60;
    return h < 0 ? h + 360 : h;
}

// The reverse of hueFromHex, at a fixed fully-saturated mid lightness — only
// used to seed the native colour input with *something* reasonable derived
// from the hue currently in effect, not to round-trip the user's exact
// original colour (which --base-hue alone can't represent anyway).
function hexFromHue(hue) {
    const c = 1, x = 1 - Math.abs(((hue / 60) % 2) - 1);
    let [r, g, b] = [0, 0, 0];
    if (hue < 60) [r, g, b] = [c, x, 0];
    else if (hue < 120) [r, g, b] = [x, c, 0];
    else if (hue < 180) [r, g, b] = [0, c, x];
    else if (hue < 240) [r, g, b] = [0, x, c];
    else if (hue < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const toHex = v => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function _applyColor(color) {
    if (color === RAINBOW) {
        document.documentElement.style.removeProperty('--base-hue');
        document.documentElement.setAttribute(RAINBOW, '');
    } else {
        document.documentElement.removeAttribute(RAINBOW);
        document.documentElement.style.setProperty('--base-hue', hueFromHex(color) ?? DEFAULT_HUE);
    }
}

function _setUser(user, color) {
    _user = user;
    if (user !== 'anonymous') {
        _applyColor(color);
        document.body.setAttribute('data-authenticated', '');
    } else {
        document.documentElement.style.removeProperty('--base-hue');
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
        const currentHue = parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--base-hue')
        );
        input.value = hexFromHue(Number.isFinite(currentHue) ? currentHue : DEFAULT_HUE);
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
