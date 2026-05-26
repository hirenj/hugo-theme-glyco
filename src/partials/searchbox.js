import '../components/ccg-search.js';

if (!customElements.get('ccg-searchbox')) {
    class CCGSearchBox extends customElements.get('ccg-search') {}
    customElements.define('ccg-searchbox', CCGSearchBox);
}
