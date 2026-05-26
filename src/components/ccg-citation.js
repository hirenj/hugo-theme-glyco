const CITATION_CACHE = new Map();

class Lock {
    constructor() {
        this.finished = new Promise(resolve => { this.done = resolve; });
    }
}

let _lock;

export const get_citation = async (doi) => {
    if (CITATION_CACHE.has(doi)) return CITATION_CACHE.get(doi);
    if (_lock) {
        await _lock.finished;
        return new Promise(resolve => setTimeout(() => resolve(get_citation(doi))));
    }
    _lock = new Lock();
    const url = `https://api.crossref.org/works/${doi}?mailto=joshi@sund.ku.dk`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    try {
        const data = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
            .then(r => r.json())
            .then(j => j.message);
        clearTimeout(timeout);
        CITATION_CACHE.set(doi, data);
    } catch {
        _lock.done();
        _lock = null;
        return new Promise(resolve =>
            setTimeout(() => resolve(get_citation(doi)), 500 + Math.floor(Math.random() * 500))
        );
    }
    _lock.done();
    _lock = null;
    return CITATION_CACHE.get(doi);
};

const tmpl = document.createElement('template');
tmpl.innerHTML = `
<style>
    :host { display: inline; }
    a { color: inherit; }
</style>
<span class="loading" hidden>Loading…</span>
<a class="ref" target="_blank" hidden></a>
<span class="unavailable" hidden>Reference not available</span>`;

class CCGCitation extends HTMLElement {
    static get observedAttributes() { return ['doi']; }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.appendChild(tmpl.content.cloneNode(true));
        this._loading     = this.shadowRoot.querySelector('.loading');
        this._link        = this.shadowRoot.querySelector('a.ref');
        this._unavailable = this.shadowRoot.querySelector('.unavailable');
    }

    connectedCallback() {
        if (this.hasAttribute('doi')) this._populate(this.getAttribute('doi'));
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (newVal !== oldVal) this._populate(newVal);
    }

    _populate(doi) {
        if (!doi) return;
        this._loading.hidden = false;
        this._link.hidden = true;
        this._unavailable.hidden = true;
        get_citation(doi).then(cite => {
            this._loading.hidden = true;
            if (cite) {
                this._link.href = `https://doi.org/${cite.DOI}`;
                this._link.textContent = '';
                const author = cite.author[0].family || cite.author[0].name;
                this._link.append(author, ' ');
                const em = document.createElement('em');
                em.textContent = 'et al';
                this._link.appendChild(em);
                this._link.append(' ');
                const journal = document.createElement('span');
                journal.innerHTML = cite['short-container-title'][0];
                this._link.appendChild(journal);
                this._link.append(` ${cite.issued['date-parts'][0][0]}`);
                this._link.hidden = false;
            } else {
                this._unavailable.hidden = false;
            }
        });
    }
}

customElements.define('ccg-citation', CCGCitation);
