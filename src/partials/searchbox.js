import VueComponentElement from '../js/vue-component.js';

import SearchComponent from '../components/search.vue';

const style_el = document.head.lastChild;

style_el.parentNode.removeChild(style_el);

const css_base_url = document.head.querySelector('[rel="css_base_url"]').href;

const COMPONENTS = {
  searchbox: SearchComponent
};

const tmpl = document.createElement('template');

tmpl.innerHTML = `
<style>
  @import url("${base_url_css}/glycosuite.css")
</style>
`;

class SearchBox extends VueComponentElement {
  get components() {
    return COMPONENTS;
  }

  inputSlotChanged(ev) {
    let inner_html = this.innerHTML;
    if ( inner_html.indexOf('searchbox') < 0) {
      this.innerHTML = `<searchbox v-bind:species="${this.getAttribute('species') || 9606}">${this.innerHTML}</searchbox>`;
      return;
    }
    super.inputSlotChanged(ev);
  }

  connectedCallback() {
    super.connectedCallback();

    this.shadowRoot.appendChild(style_el);

    this.style.display = 'block';
    this.shadowRoot.appendChild(tmpl.content.cloneNode(true));

  }
}

customElements.define('x-searchbox',SearchBox);
