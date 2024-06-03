import VueComponentElement from '../js/vue-component.js';

import SearchComponent from '../components/search.vue';

const style_els = [...document.head.querySelectorAll('style')];

const style_el = style_els.slice(-1)[0];

const css_base_url = document.head.querySelector('[rel="css_base_url"]') ? document.head.querySelector('[rel="css_base_url"]').href : '/static';

const COMPONENTS = {
  searchbox: SearchComponent
};

const tmpl = document.createElement('template');

tmpl.innerHTML = `
<style>
  @import url("${css_base_url}/glycosuite.css")
</style>
`;

class SearchBox extends VueComponentElement {
  get components() {
    return COMPONENTS;
  }

  set value(val) {
    this.component.$children[0].search = val;
  }

  inputSlotChanged(ev) {
    let inner_html = this.innerHTML;
    if ( inner_html.indexOf('searchbox') < 0) {
      this.innerHTML = `<searchbox v-bind:species="${this.getAttribute('species') || 9606}">${this.innerHTML}</searchbox>`;
      if (ev) {
        super.inputSlotChanged(ev);
      }
      return;
    }
    if (ev) {
      super.inputSlotChanged(ev);
    }
  }

  connectedCallback() {
    super.connectedCallback();

    this.shadowRoot.appendChild(style_el.cloneNode(true));

    this.style.display = 'block';
    this.shadowRoot.appendChild(tmpl.content.cloneNode(true));
    this.inputSlotChanged();
  }
}

customElements.define('x-searchbox',SearchBox);
