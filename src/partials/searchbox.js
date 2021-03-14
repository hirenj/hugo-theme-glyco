import VueComponentElement from '../js/vue-component.js';

import SearchComponent from '../components/search.vue';

const style_el = document.head.lastChild;

style_el.parentNode.removeChild(style_el);

const COMPONENTS = {
  searchbox: SearchComponent
};

const tmpl = document.createElement('template');

tmpl.innerHTML = `
<style>
  @import url("/css/glycosuite.css")
</style>
`;

class SearchBox extends VueComponentElement {
  get components() {
    return COMPONENTS;
  }
  connectedCallback() {
    super.connectedCallback();

    this.shadowRoot.appendChild(style_el);

    this.style.display = 'block';
    this.shadowRoot.appendChild(tmpl.content.cloneNode(true));

  }
}

customElements.define('x-searchbox',SearchBox);
