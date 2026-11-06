import { tryLoggingIn, getLoginStatus, performLogout, ensureApiLogin, getUserId, getOrcidId, getUserName,
         getFullName, getLastUserName, getPrefs, setPrefs, getFlags,
         loginWithPasskey, registerPasskey, linkOrcid, unlinkOrcid, listPasskeys, removePasskey }
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

// Same convention as render_menu.html's li.nav-private above: a template
// opts an element into flag-gating by adding data-flag="<flag-name>" and
// starting it hidden; this is the one place that corrects it once the
// account's enabled flags are known. `flags` is the full list the backend
// returned (see getFlags()/`/api/account/flags`) — ORCID-less/anonymous
// visitors just get `[]`, so every data-flag element stays hidden for them.
function _applyFlags(flags) {
    document.querySelectorAll('[data-flag]').forEach(el => {
        el.hidden = !flags.includes(el.dataset.flag);
    });
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

// Each view/sub-view below is a <template> rather than built node-by-node
// with createElement() - _tmpl() clones one on demand, _update()'s callers
// just query into the clone to fill in dynamic text and wire listeners.
// Nested <template>s inside this outer one parse correctly (HTML's template
// content model is recursive) and get cloned into every instance's shadow
// root alongside the style/root span below, same as the rest of this markup
// already is.
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
    :host([hero]) .usermessage {
        anchor-name: --user-message;
    }

    :host([hero]) .button_box {
        position: absolute;
        position-anchor: --user-message;
        position-area: bottom right;
        display: flex;
        flex-direction: row;
        max-width: 10em;
        width: fit-content;
        margin-right: 2em;
    }

    button.linked-accounts.glyco {
        anchor-name: --linked-accounts-button;
        font-size: 0.5em;
        position-anchor: --user-message;
        position: absolute;
        position-area: bottom left;
        margin-left: 4em;
    }
    #linked-accounts-popover {
        font-size: 0.75em;
        position-anchor: --linked-accounts-button;
        position-area: bottom span-right;
        margin-top: 0.5em;
        width: 15em;
        padding: 0px;
        overflow: visible;
        border: 0px;
        background: transparent;
    }

    .passkey-list {
        padding: 0px;
        list-style-type: none;
        font-size: 0.5em;
        font-weight: normal;
    }
    .orcid-line {
        font-size: 0.5em;
        font-weight: normal;
    }
    .orcid-line, .passkey-list li {
        display: flex;
        flex-direction: row;
        align-items: center;
    }

</style>
<span class="root"></span>

<template id="compact-loggedin">
    <span class="username" title="Double-click to pick an accent colour
Shift+double-click for rainbow
Alt+double-click to reset to default"></span>
    <label class="logout" style="cursor: pointer;" >Log out &nbsp;&raquo;</label>
</template>

<template id="compact-anonymous">
    <label class="passkey-login" style="cursor:pointer; ">Log in &nbsp;&raquo;</label>
    <label class="orcid-login" style="margin-left:0.75em;cursor:pointer;">ORCID &nbsp;&raquo;</label>
</template>

<template id="hero-checking">
    <p class="checkingUser"></p>
</template>

<template id="hero-anonymous">
    <p class="lastuser usermessage"></p>
    <div class="button_box">
        <button class="glyco go" type="button">Go &nbsp;&raquo;</button>
        <button class="glyco orcid-go" type="button">ORCID &nbsp;&raquo;</button>
    </div>
</template>

<template id="hero-loggedin">
    <p class="greeting usermessage"></p>
    <div class="button_box">
        <button class="glyco logout" type="button">logout &nbsp;&raquo;</button>
    </div>
</template>


<template id="linked-accounts">
    <div class="linked-accounts">
        <button popovertarget="linked-accounts-popover" class="linked-accounts glyco">Accounts</button>

        <div popover id="linked-accounts-popover">
            <section class="info_card">
                <h3>Linked accounts</h3>
                <div style="display: flex; flex-direction: column; align-items: start; gap: 0.5em;">
                    <div class="orcid-line"></div>
                    <div><a href="#" class="glyco add-passkey">Add passkey</a></div>
                    <ul class="passkey-list"></ul>
                </div>
            </section>
        </div>
    </div>
</template>

<template id="orcid-linked"><span>ORCID <span class="orcid-id"></span></span><button class="unlink glyco" style="font-size:0.85em">Unlink</button></template>

<template id="orcid-unlinked"><button class="link glyco">Link ORCID</button></template>

<template id="passkey-item"><li><span class="label"></span> <button class="remove glyco" style="font-size:0.85em">X</button></li></template>

<template id="passkey-empty"><li>No passkeys registered yet.</li></template>
`;

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

    // Clones one of the <template id="..."> fragments above. Returns the
    // DocumentFragment itself (not unwrapped) - callers with a single root
    // element in their template grab it via .firstElementChild when they
    // need the element itself (e.g. to return it, or insert more into a
    // list); callers whose template is multiple sibling nodes just
    // appendChild() the whole fragment, which moves all of them at once.
    _tmpl(id) {
        return this.shadowRoot.getElementById(id).content.cloneNode(true);
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
            // #compact-loggedin's .username is a plain <span>, not a <label>:
            // a <label> wrapping a <button> (a labelable element) forwards
            // every click on the label — including each half of a
            // double-click on the username — straight to the button,
            // logging the user out while they're trying to open the colour
            // picker. There's no actual form control being labelled here, so
            // there's no semantic reason for it to be a <label>.
            const frag = this._tmpl('compact-loggedin');
            const name = frag.querySelector('.username');
            name.textContent = _displayName();
            name.addEventListener('dblclick', event => this._openColorPicker(event));
            frag.querySelector('.logout').addEventListener('click', () => this._logout());
            this._root.appendChild(frag);
        } else {
            // Passkey is the primary action now (section (b) — "passkeys as
            // primary login, ORCID linkable"); the old ORCID popup moves to
            // a smaller secondary link rather than disappearing — some
            // visitors won't have a passkey registered yet and need a way
            // in regardless.
            const frag = this._tmpl('compact-anonymous');
            frag.querySelector('.passkey-login').addEventListener('click', () => this._loginWithPasskey());
            frag.querySelector('.orcid-login').addEventListener('click', event => {
                event.preventDefault();
                this._loginWithOrcid();
            });
            this._root.appendChild(frag);
        }
    }

    _renderHero() {
        if (_checking) {
            const frag = this._tmpl('hero-checking');
            frag.querySelector('.checkingUser').textContent = `Logging in as ${getLastUserName() || 'anonymous'}`;
            this._root.appendChild(frag);
            return;
        }
        if (_user === 'anonymous') {
            const lastUser = getLastUserName();
            const frag = this._tmpl('hero-anonymous');
            frag.querySelector('.lastuser').innerHTML = lastUser
                ? `Log in as <br/> ${lastUser}`
                : 'Log in using <br/>a passkey or ORCID';
            frag.querySelector('.go').addEventListener('click', () => this._loginWithPasskey());
            frag.querySelector('.orcid-go').addEventListener('click', event => {
                event.preventDefault();
                this._loginWithOrcid();
            });
            // "Log in as another user" hidden for now — it can't actually force a
            // different ORCID identity chooser. ORCID keeps its own independent
            // browser session, and Access has no config to override that, so this
            // only ever misleadingly implied a capability we don't have.
            this._root.appendChild(frag);
            return;
        }
        const frag = this._tmpl('hero-loggedin');
        frag.querySelector('.greeting').textContent = `Hi ${_displayName()}`;
        frag.querySelector('.logout').addEventListener('click', () => this._logout());
        this._root.appendChild(frag);
        this._root.appendChild(this._renderLinkedAccounts());
    }

    // Small "linked accounts" section (plans/analytics-passkeys-user-content.md
    // section (b)) — lets an account started with one login method pick up
    // the other, rather than being permanently stuck with whichever it
    // started with. Only shown in the hero view (a dedicated account view),
    // not the compact navbar one — there's no room there and it's not a
    // frequent action.
    _renderLinkedAccounts() {
        const box = this._tmpl('linked-accounts').firstElementChild;
        const orcidId = getOrcidId();
        const orcidLine = box.querySelector('.orcid-line');
        if (orcidId) {
            const linked = this._tmpl('orcid-linked');
            linked.querySelector('.orcid-id').textContent = orcidId;
            linked.querySelector('.unlink').addEventListener('click', event => {
                event.preventDefault();
                this._unlinkOrcid();
            });
            orcidLine.appendChild(linked);
        } else {
            const unlinked = this._tmpl('orcid-unlinked');
            unlinked.querySelector('.link').addEventListener('click', event => {
                event.preventDefault();
                this._linkOrcid();
            });
            orcidLine.appendChild(unlinked);
        }

        box.querySelector('.add-passkey').addEventListener('click', event => {
            event.preventDefault();
            this._addPasskey();
        });

        // Visibility into what's actually registered — there's no reliable
        // way to ask WebAuthn itself "does this device already have a
        // passkey for this site" before offering to register one (it's
        // deliberately not exposed to JS, for privacy — see
        // ccg-shared-backend's handleListPasskeys comment), so this list is
        // the practical alternative: see what you've got before adding
        // another, and remove a lost/retired device's directly (passkeys
        // have no protocol-level expiry; removal is the real mechanism).
        // Fetched async and filled in after `box` is already returned/
        // appended — the `passkeyList` reference stays valid regardless of
        // insertion order.
        const passkeyList = box.querySelector('.passkey-list');
        listPasskeys().then(passkeys => {
            passkeyList.innerHTML = '';
            if (passkeys.length === 0) {
                passkeyList.appendChild(this._tmpl('passkey-empty'));
                return;
            }
            passkeys.forEach(pk => {
                const li = this._tmpl('passkey-item').firstElementChild;
                li.querySelector('.label').textContent = `Passkey added ${new Date(pk.createdAt).toLocaleDateString()} `;
                li.querySelector('.remove').addEventListener('click', event => {
                    event.preventDefault();
                    this._removePasskey(pk.credentialId);
                });
                passkeyList.appendChild(li);
            });
        }).catch(err => console.error('ccg-userstatus listPasskeys failed', err));

        return box;
    }

    _checkUser() {
        _setChecking(true);
        // Independent of login status (getFlags() itself handles the
        // anonymous case), so it's kicked off alongside the login check
        // rather than chained after it — no need to wait on one to resolve
        // the other.
        getFlags().then(_applyFlags);
        return getLoginStatus().then(status => {
            if (!status) {
                _setUser('anonymous');
                return status;
            }
            // getUserId() is null for a logged-in passkey-only account with
            // no ORCID linked yet (section (b)) — fall back to a generic
            // label rather than literally displaying "null".
            return getPrefs().then(prefs => _setUser(getUserId() || 'your account', prefs?.color));
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
            .then(() => getFlags().then(_applyFlags))
            .catch(err => console.error('ccg-userstatus logout failed', err));
    }

    // Renamed from the old _login() — ORCID is now the secondary login path
    // (section (b)); _loginWithPasskey() below is primary.
    _loginWithOrcid() {
        tryLoggingIn()
            .then(() => this._checkUser())
            .catch(err => console.error('ccg-userstatus ORCID login failed', err));
    }

    _loginWithPasskey() {
        loginWithPasskey()
            .then(() => this._checkUser())
            .catch(err => console.error('ccg-userstatus passkey login failed', err));
    }

    // Works whether or not the caller is already logged in — an anonymous
    // caller gets a brand-new passkey-first account; an already-logged-in
    // caller gets this passkey added to their existing account (see
    // ccg-shared-backend's webauthn.mjs, which decides which from the
    // session, not this call).
    _addPasskey() {
        registerPasskey()
            .then(() => this._checkUser())
            .catch(err => console.error('ccg-userstatus passkey registration failed', err));
    }

    _linkOrcid() {
        linkOrcid()
            .then(() => this._checkUser())
            .catch(err => console.error('ccg-userstatus ORCID linking failed', err));
    }

    // unlinkOrcid() resolves (never rejects) with { ok, message } — a
    // refused unlink (the account's only login method) is an expected
    // outcome the user needs to actually see, not a console-only error.
    _unlinkOrcid() {
        unlinkOrcid()
            .then(result => {
                if (!result.ok) {
                    alert(result.message || 'Could not unlink ORCID.');
                    return;
                }
                this._checkUser();
            })
            .catch(err => console.error('ccg-userstatus ORCID unlinking failed', err));
    }

    // Same { ok, message } shape as _unlinkOrcid above, for the same reason
    // — a refused removal (the account's last login method) needs to
    // actually reach the user, not just the console.
    _removePasskey(credentialId) {
        removePasskey(credentialId)
            .then(result => {
                if (!result.ok) {
                    alert(result.message || 'Could not remove passkey.');
                    return;
                }
                this._checkUser();
            })
            .catch(err => console.error('ccg-userstatus passkey removal failed', err));
    }

}

customElements.define('ccg-userstatus', CCGUserStatus);
