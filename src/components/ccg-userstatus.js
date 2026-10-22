import { tryLoggingIn, getLoginStatus, performLogout, ensureApiLogin, getUserId, getUserName,
         getFullName, getLastUserName }
    from '../js/auth/cloudflare.js';

import { glycoStyles } from 'ccg-shared-elements/styles';

let _user = 'anonymous';
let _checking = true;
const _instances = new Set();

function _setUser(user) {
    _user = user;
    if (user !== 'anonymous') {
        document.documentElement.style.setProperty('--base-hue', 170);
        document.body.setAttribute('data-authenticated', '');
    } else {
        document.documentElement.style.removeProperty('--base-hue');
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
    .username { margin-right: 0.5em; }
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
            const label = document.createElement('label');
            const name = document.createElement('span');
            name.className = 'username';
            name.textContent = _user;
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
            _setUser(status ? getUserId() : 'anonymous');
            return status;
        }).finally(() => _setChecking(false));
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
