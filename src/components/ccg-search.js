import { search as searchGene, lookup_protein } from '../js/mygene.js';
import { search_snp } from '../js/ensembl_rest.js';
import { glycoStyles } from 'ccg-shared-elements/styles';

const UNIPROT_RE = /[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}/;
const RSID_RE    = /^rs[\d]+$/;

let _debounce = null;

const tmpl = document.createElement('template');
tmpl.innerHTML = `<style>
/* Inherited text properties (text-transform, letter-spacing, etc.) cross the
   shadow boundary like any other inherited CSS property. The menubar's
   uppercase nav-label styling (section.menu > ul { text-transform: uppercase })
   would otherwise leak into result labels and any slotted link text — reset
   it here so this element renders consistently regardless of where it's used. */
:host {
    text-transform: none;
}

:host form {
    display: block;
    border-radius: 5px;
    position: relative;
    line-height: 1em;
    top: 0px;
    left: 0px;
    --result-rows: 5;
    max-height: calc( 1.5em + (var(--result-rows) * (2.2em + 20px)) );
    border: solid black 1px;
    font-family: Verdana, Helvetica, sans-serif;
    overflow-y: scroll;
    overflow-x: hidden;
    background: #fff;
}

:host([data-loading]) header:after {
    content: '';
    display: block;
    top: 0px;
    right: 32px;
    color: #555;
    font-size: 3px;
    margin: 100px auto;
    width: 0.9em;
    height: 0.9em;
    border-radius: 50%;
    position: relative;
    text-indent: -9999em;
    -webkit-animation: load4 1.3s infinite linear;
    animation: load4 1.3s infinite linear;
    -webkit-transform: translateZ(0);
    -ms-transform: translateZ(0);
    transform: translateZ(0);
}
@-webkit-keyframes load4 {
    0%,
    100% {
        box-shadow: 0 -3em 0 0.2em, 2em -2em 0 0em, 3em 0 0 -1em, 2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 -1em, -3em 0 0 -1em, -2em -2em 0 0;
    }
    12.5% {
        box-shadow: 0 -3em 0 0, 2em -2em 0 0.2em, 3em 0 0 0, 2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 -1em, -3em 0 0 -1em, -2em -2em 0 -1em;
    }
    25% {
        box-shadow: 0 -3em 0 -0.5em, 2em -2em 0 0, 3em 0 0 0.2em, 2em 2em 0 0, 0 3em 0 -1em, -2em 2em 0 -1em, -3em 0 0 -1em, -2em -2em 0 -1em;
    }
    37.5% {
        box-shadow: 0 -3em 0 -1em, 2em -2em 0 -1em, 3em 0em 0 0, 2em 2em 0 0.2em, 0 3em 0 0em, -2em 2em 0 -1em, -3em 0em 0 -1em, -2em -2em 0 -1em;
    }
    50% {
        box-shadow: 0 -3em 0 -1em, 2em -2em 0 -1em, 3em 0 0 -1em, 2em 2em 0 0em, 0 3em 0 0.2em, -2em 2em 0 0, -3em 0em 0 -1em, -2em -2em 0 -1em;
    }
    62.5% {
        box-shadow: 0 -3em 0 -1em, 2em -2em 0 -1em, 3em 0 0 -1em, 2em 2em 0 -1em, 0 3em 0 0, -2em 2em 0 0.2em, -3em 0 0 0, -2em -2em 0 -1em;
    }
    75% {
        box-shadow: 0em -3em 0 -1em, 2em -2em 0 -1em, 3em 0em 0 -1em, 2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 0, -3em 0em 0 0.2em, -2em -2em 0 0;
    }
    87.5% {
        box-shadow: 0em -3em 0 0, 2em -2em 0 -1em, 3em 0 0 -1em, 2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 0, -3em 0em 0 0, -2em -2em 0 0.2em;
    }
}
@keyframes load4 {
    0%,
    100% {
        box-shadow: 0 -3em 0 0.2em, 2em -2em 0 0em, 3em 0 0 -1em, 2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 -1em, -3em 0 0 -1em, -2em -2em 0 0;
    }
    12.5% {
        box-shadow: 0 -3em 0 0, 2em -2em 0 0.2em, 3em 0 0 0, 2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 -1em, -3em 0 0 -1em, -2em -2em 0 -1em;
    }
    25% {
        box-shadow: 0 -3em 0 -0.5em, 2em -2em 0 0, 3em 0 0 0.2em, 2em 2em 0 0, 0 3em 0 -1em, -2em 2em 0 -1em, -3em 0 0 -1em, -2em -2em 0 -1em;
    }
    37.5% {
        box-shadow: 0 -3em 0 -1em, 2em -2em 0 -1em, 3em 0em 0 0, 2em 2em 0 0.2em, 0 3em 0 0em, -2em 2em 0 -1em, -3em 0em 0 -1em, -2em -2em 0 -1em;
    }
    50% {
        box-shadow: 0 -3em 0 -1em, 2em -2em 0 -1em, 3em 0 0 -1em, 2em 2em 0 0em, 0 3em 0 0.2em, -2em 2em 0 0, -3em 0em 0 -1em, -2em -2em 0 -1em;
    }
    62.5% {
        box-shadow: 0 -3em 0 -1em, 2em -2em 0 -1em, 3em 0 0 -1em, 2em 2em 0 -1em, 0 3em 0 0, -2em 2em 0 0.2em, -3em 0 0 0, -2em -2em 0 -1em;
    }
    75% {
        box-shadow: 0em -3em 0 -1em, 2em -2em 0 -1em, 3em 0em 0 -1em, 2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 0, -3em 0em 0 0.2em, -2em -2em 0 0;
    }
    87.5% {
        box-shadow: 0em -3em 0 0, 2em -2em 0 -1em, 3em 0 0 -1em, 2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 0, -3em 0em 0 0, -2em -2em 0 0.2em;
    }
}

header {
    position: sticky;
    display: flex;
    flex-direction: row;
    align-items: center;
    top: 0px;
    width: calc(100% - 2px);
    height: calc( var(--menu-height) - 4px);
    background: #fff;
    z-index: 2;
}
input[type=search] {
    width: 100%;
    height: calc(100% - 1px);
    font-size: 1em;
    top: 1px;
    left: 0;
    padding: 0px;
    padding-left: 0.5em;
}

input[type=search]::-webkit-search-cancel-button{
    display: none;
}

button[type=reset]:before {
    content: 'X';
    border-radius: 1em;
    display: block;
    width: 1.5em;
    height: 1.25em;
    line-height: 1.25em;
    font-size: 1em;
    padding: 0px;
    margin: 0px;
    border: 0px;
    background: #ddd;
    color: #fff;
    cursor: pointer;
}

button[type=reset]:focus:before {
    background: var(--base-color-darkest);
}

button[type=reset] {
    background: transparent;
    padding: 0px;
    margin: 0px;
    border: 0px;
    outline: none;
}

input[type=search]:invalid ~ button[type=reset] {
    display: none;
}

input[type=search]:invalid ~ button[type=reset]:before {
    display: none;
}

input[type=radio] {
    left: -200vw;
    width: 0px;
    height: 0px;
    position: fixed;
}

.dropdown, .dropdown-menu {
    font-size: 0.85em;
    margin: 0px;
    width: calc(100% - 2px);
    list-style-type: none;
    padding: 0px;
    position: relative;
    bottom: 0px;
    top: 0px;
}

form::-webkit-scrollbar {
    -webkit-appearance: none;
    width: 6px;
}

form::-webkit-scrollbar-thumb {
    border-radius: 3px;
    background-color: rgba(0,0,0,.2);
    -webkit-box-shadow: 0 0 1px rgba(255,255,255,.5);
}

header input[type=search] {
    -webkit-appearance: none;
    -moz-appearance: none;
    border-radius: 0px;
    margin-top: 0px;
    border: 0px;
}

div.noresults {
    padding: 5px;
}

@media only screen
  and (min-width: 320px)
  and (max-width: 480px)
  and (-webkit-min-device-pixel-ratio: 2) {
    header {
        width: calc(100% - 2px);
    }
    header {
        height: 1.5em;
    }
    input[type=search] {
        font-size: 16px;
        top: 0px;
    }
}

.dropdown-menu li {
    text-decoration: none;
    position: relative;
}
.dropdown-menu li a {
    text-decoration: none;
    font-size: 1em;
}

.dropdown-menu, .dropdown-menu:focus-within {
    background: #eee;
}

.dropdown-menu input[type=radio]:checked + .d-center {
    background: #eee
}

.dropdown-menu:focus-within input[type=radio]:checked + .d-center {
    background: var(--main-color);
    color: var(--foreground-color);
    font-weight: bolder;
    box-shadow: 0px 3px 9px rgba(0,0,0,.5);
    border: solid transparent 1px;
}

.dropdown-menu input[type=radio] + .d-center:hover {
    background: #eaeaee;
    box-shadow: 0px 1px 5px rgba(0,0,0,.5);
}

.dropdown-menu .d-center {
    display: flex;
    width: 100%;
    height: 100%;
    flex-flow: row nowrap;
    align-items: center;
    justify-content: space-between;
    padding-top: 10px;
    padding-bottom: 10px;
    height: 2.5em;
    border: solid white 1px;
}
.dropdown-menu .d-center label {
    display: inline-block;
    height: 100%;
    overflow: hidden;
    flex: 1;
    margin-left: 0.5em;
    margin-right: 1em;
    font-weight: var(--dropdown-font-weight);
}

span.alias {
    font-style: oblique;
    font-size: 0.75em;
}
</style>
<form part="form" novalidate>
  <header>
    <input id="search" type="search" placeholder="Gene or UniProt"
           autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" required/>
    <button type="reset"></button>
  </header>
  <ul class="dropdown-menu"></ul>
</form>`;

class CCGSearch extends HTMLElement {
    static get observedAttributes() { return ['species']; }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.appendChild(tmpl.content.cloneNode(true));
        this.shadowRoot.adoptedStyleSheets = [glycoStyles];

        this._input  = this.shadowRoot.querySelector('#search');
        this._list   = this.shadowRoot.querySelector('.dropdown-menu');
        this._reset  = this.shadowRoot.querySelector('button[type=reset]');

        this._options        = [];
        this._searchDirty    = false;
        this._speciesOverride = null;

        this._input.addEventListener('input', () => this._onInput());
        this._input.addEventListener('keydown', ev => this._onKeydown(ev));
        // Only re-render on focus/blur when there are no options — that's
        // the sole case this affects (showing/hiding "No results"). Doing
        // this unconditionally would also fire on blur when the user tabs
        // from the input into a result radio (still within this shadow
        // root), rebuilding the list mid-navigation and losing focus.
        this._input.addEventListener('focus', () => { if (this._options.length === 0) this._render(); });
        this._input.addEventListener('blur', () => { if (this._options.length === 0) this._render(); });
        this._reset.addEventListener('click', () => {
            this._options = [];
            this._render();
            this._input.focus();
        });
    }

    connectedCallback() {
        this.shadowRoot.querySelector('form').addEventListener('submit', e => e.preventDefault());
    }

    attributeChangedCallback() {
        this._options = [];
        this._render();
    }

    get species() { return parseInt(this.getAttribute('species') || '9606', 10); }
    set species(v) { this.setAttribute('species', v); }

    get value() { return this._input.value; }
    set value(v) { this._input.value = v; this._onInput(); }

    _onInput() {
        clearTimeout(_debounce);
        const text = this._input.value;
        this._searchDirty = true;
        const delay = text === '' ? 0 : 1000;
        _debounce = setTimeout(() => {
            const trimmed = text.trim();
            if (trimmed === '') { this._options = []; this._render(); return; }
            this._searchDirty = false;
            this._performSearch(trimmed);
        }, delay);
    }

    _onKeydown(ev) {
        const first = this.shadowRoot.querySelector('#search0');
        if (ev.key === 'ArrowDown' && first) {
            first.focus();
            first.checked = true;
            ev.preventDefault();
        }
        if (ev.key === 'Enter' && this._options.length > 0) {
            this._selectOption(this._options[0]);
            ev.preventDefault();
        }
    }

    _performSearch(text) {
        if (text.length < 2) return;
        if (/^t(a(x(:(\d+))?)?)?$/.test(text)) {
            const m = text.match(/^tax:(\d+)$/);
            if (m) this._speciesOverride = parseInt(m[1]);
            return;
        }
        const species = this._speciesOverride ?? this.species;
        this.toggleAttribute('data-loading', true);
        let search;
        if (UNIPROT_RE.test(text)) {
            search = lookup_protein(text).then(names => [{ geneid: 1, symbol: names.symbol, prot: text }]);
        } else if (RSID_RE.test(text)) {
            search = search_snp(text);
        } else if (!this._searchDirty) {
            search = searchGene(text, species);
        } else {
            this.toggleAttribute('data-loading', false);
            return;
        }
        search
            .then(res => { this._options = res; this._render(); })
            .catch(() => { this._options = []; this._render(); })
            .finally(() => this.toggleAttribute('data-loading', false));
    }

    _render() {
        this._list.innerHTML = '';
        const focused = this.shadowRoot.activeElement === this._input;
        if (this._options.length === 0 && !this._searchDirty && this._input.value.length > 0 && focused) {
            const div = document.createElement('div');
            div.className = 'noresults';
            div.textContent = 'No results';
            this._list.appendChild(div);
            return;
        }
        const resultTmpl = this.querySelector(':scope > template');
        this._options.forEach((option, i) => {
            const li    = document.createElement('li');
            const radio = document.createElement('input');
            radio.type  = 'radio';
            radio.name  = 'search';
            radio.id    = `search${i}`;
            const center = document.createElement('div');
            center.className = 'd-center';
            const label = document.createElement('label');
            label.htmlFor = `search${i}`;
            label.textContent = option.symbol;
            if (option.matching_aliases) {
                const alias = document.createElement('span');
                alias.className = 'alias';
                alias.textContent = option.matching_aliases;
                label.appendChild(alias);
            }
            center.appendChild(label);
            if (resultTmpl) {
                center.appendChild(this._hydrateResultTemplate(resultTmpl, option));
            }
            li.appendChild(radio);
            li.appendChild(center);
            li.addEventListener('click', ev => {
                if (ev.target.closest('a[href]')) return;
                radio.checked = true;
                this._selectOption(option);
            });
            radio.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') this._selectOption(option);
            });
            radio.addEventListener('focus', () => this._scrollIfNeeded(radio));
            this._list.appendChild(li);
        });
        this._autofocusFirst();
    }

    _hydrateResultTemplate(tmplEl, option) {
        const frag = document.importNode(tmplEl.content, true);
        for (const el of [...frag.querySelectorAll('[data-prop]')]) {
            if (!option[el.getAttribute('data-prop')]) { el.remove(); continue; }
        }
        for (const el of frag.querySelectorAll('[data-href]')) {
            el.setAttribute('href', el.getAttribute('data-href').replace(
                /\{(\w+)\}/g, (_, p) => option[p] != null ? option[p] : ''
            ));
        }
        return frag;
    }

    _selectOption(option) {
        this.dispatchEvent(new CustomEvent('result-select', {
            bubbles: true,
            detail: { option }
        }));
    }

    _autofocusFirst() {
        if (this._searchDirty) return;
        const first = this.shadowRoot.querySelector('#search0');
        if (first) first.checked = true;
    }

    _scrollIfNeeded(radio) {
        const form = this.shadowRoot.querySelector('form');
        const li = radio.closest('li');
        if (!li) return;
        if ((li.offsetTop + 28) < form.scrollTop) {
            form.scrollTop = 0;
            return;
        }
        if ((li.offsetTop + 28) >= (form.offsetHeight + form.scrollTop)) {
            form.scrollTop = li.offsetTop;
        }
    }
}

customElements.define('ccg-search', CCGSearch);
