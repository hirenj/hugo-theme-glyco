import { tryLoggingIn, tryLoggingInRedirect, getLoginStatus, performLogout, ensureApiLogin, getUserId, getUserName,
         getLastUserName, clearLastUser }
    from '../js/auth/azuread.js';

import { glycoStyles } from 'ccg-shared-elements/styles';

let _user = 'anonymous';
let _checking = true;
const _instances = new Set();

function _setUser(user) {
    _user = user;
    if (user !== 'anonymous') {
        document.documentElement.style.setProperty('--base-hue', 170);
    } else {
        document.documentElement.style.removeProperty('--base-hue');
    }
    for (const el of _instances) el._update();
}

function _setChecking(checking) {
    _checking = checking;
    for (const el of _instances) el._update();
}

function _displayName() {
    let given = null, family = null;
    try {
        [given, family] = getUserName();
    } catch (e) { /* no profile stored yet */ }
    const first = (given || _user).split(' ')[0];
    return family ? `${first} ${family}` : first;
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
            label.addEventListener('click', () => this._loginAuto());
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
            go.addEventListener('click', () => this._loginAuto());
            box.appendChild(go);
            if (lastUser) {
                const another = document.createElement('button');
                another.className = 'glyco';
                another.textContent = 'Log in as another user »';
                another.addEventListener('click', () => this._loginAsAnother());
                box.appendChild(another);
            }
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

    // A remembered lastUserName means we'd send a real @ku.dk address as
    // login_hint, which triggers Azure AD's Home Realm Discovery redirect —
    // an extra hop the popup+WinChan flow can't survive. Use a full-page
    // redirect for that case; a fresh login (no hint) works fine via popup.
    _loginAuto() {
        if (getLastUserName()) {
            this._loginRedirect();
        } else {
            this._login();
        }
    }

    _loginAsAnother() {
        clearLastUser();
        this._login();
    }

    _loginRedirect() {
        tryLoggingInRedirect()
            .catch(err => console.error('ccg-userstatus login (redirect) failed', err));
    }
}

customElements.define('ccg-userstatus', CCGUserStatus);
