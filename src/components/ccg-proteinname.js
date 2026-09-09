// Displays a gene/protein symbol + name, resolved via mygene.js. Accepts
// either a numeric Entrez gene id or a protein-ish identifier (UniProt
// accession, Ensembl id, etc.) in the same `identifier` attribute — the
// lookup function used is chosen by shape, not by a second attribute, since
// callers already know which kind of id they have and shouldn't need to
// declare it twice.
import { lookup_gene, cached_lookup_protein } from '../js/mygene.js';

const TOPLEVEL_LINEAGES = [
    'Homo Sapiens', 'Primates', 'Mammalia', 'Vertebrata', 'Insecta',
    'Protostomia', 'Porifera', 'Metazoa', 'Choanoflagellata', 'Fungi', 'Eukaryota'
];

function normalizeGeneResult(result) {
    return { genename: result.symbol, description: result.desc, species: null, lineage: [] };
}

function normalizeProteinResult(result) {
    const lineage = [].concat(result.lineage || []).concat(result.species || [])
        .reverse().filter(entry => TOPLEVEL_LINEAGES.indexOf(entry) >= 0);
    return { genename: result.symbol, description: result.protein, species: result.species, lineage };
}

const tmpl = document.createElement('template');
tmpl.innerHTML = `
<style>
    :host { display: inline-block; font-size: 10pt; font-family: 'Helvetica','Verdana',sans-serif; width: 100%; }
    .protein_info_block { display: flex; flex-direction: row; align-items: center; gap: 0.25em; height: 100%; }
    .symbol { font-weight: bolder; width: 15%; overflow-x: auto; display: inline-block; }
    .protein_name { flex-grow: 1; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }
    .taxinfo { font-size: 0.75em; display: flex; flex-direction: column; width: 8em; }
    .taxinfo > span:first-child { font-weight: bolder; }
    .taxinfo > * { text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }
</style>
<span class="protein_info_block" hidden>
    <span class="symbol"></span>
    <span class="protein_name"></span>
    <span class="taxinfo">
        <span class="species"></span>
        <span class="lineage"></span>
    </span>
</span>`;

class CCGProteinName extends HTMLElement {
    static get observedAttributes() { return ['identifier']; }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.appendChild(tmpl.content.cloneNode(true));
        this._block = this.shadowRoot.querySelector('.protein_info_block');
        this._symbol = this.shadowRoot.querySelector('.symbol');
        this._name = this.shadowRoot.querySelector('.protein_name');
        this._species = this.shadowRoot.querySelector('.species');
        this._lineage = this.shadowRoot.querySelector('.lineage');
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'identifier' && newValue) this._load(newValue);
    }

    get identifier() { return this.getAttribute('identifier'); }
    set identifier(v) { this.setAttribute('identifier', v); }

    _load(identifier) {
        const lookup = /^\d+$/.test(identifier)
            ? lookup_gene(identifier).then(normalizeGeneResult)
            : cached_lookup_protein(identifier).then(normalizeProteinResult);

        lookup.then(info => {
            if (this.identifier !== identifier) return; // stale response, attribute changed since
            this._render(info);
            this.dispatchEvent(new CustomEvent('data-loaded', { bubbles: true, detail: info }));
        }).catch(err => console.error('ccg-proteinname lookup failed', err));
    }

    _render(info) {
        this._block.hidden = false;
        this._symbol.textContent = info.genename || '';
        this._symbol.hidden = !info.genename;
        this._name.textContent = info.description || '';
        this._species.textContent = (info.species && info.species[0]) || '';
        this._species.hidden = !this._species.textContent;
        this._lineage.textContent = info.lineage[0] || '';
        this._lineage.hidden = !this._lineage.textContent;
    }
}

customElements.define('ccg-proteinname', CCGProteinName);
