import { tryLoggingIn, getLoginStatus, performLogout, ensureApiLogin, getUserId }
    from '../js/auth/azuread.js';

let _user = 'anonymous';
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

const tmpl = document.createElement('template');
tmpl.innerHTML = `
<style>
    :host { display: contents; }
    .username { margin-right: 0.5em; }
    button.glyco { cursor: pointer; }
</style>
<span class="root"></span>`;

class CCGUserStatus extends HTMLElement {

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.appendChild(tmpl.content.cloneNode(true));
        this._root = this.shadowRoot.querySelector('.root');
    }

    connectedCallback() {
        _instances.add(this);
        getLoginStatus().then(status => _setUser(status ? getUserId() : 'anonymous'));
        this._update();
    }

    disconnectedCallback() {
        _instances.delete(this);
    }

    _update() {
        this._root.innerHTML = '';
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

    _checkUser() {
        return getLoginStatus().then(status => {
            _setUser(status ? getUserId() : 'anonymous');
            return status;
        });
    }

    _logout() {
        performLogout()
            .then(() => ensureApiLogin())
            .then(() => _setUser('anonymous'));
    }

    _login() {
        tryLoggingIn().then(() => this._checkUser());
    }
}

customElements.define('ccg-userstatus', CCGUserStatus);
