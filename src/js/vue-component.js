/* globals document,HTMLElement,customElements,window,ShadyCSS */
'use strict';

import Vue from 'vue';

let VUE_ROOT;

const adoptRoot = (root) => {
  VUE_ROOT = root;
};

export { adoptRoot };

const COMPONENTS = {
};

const tmpl = document.createElement('template');

tmpl.innerHTML = `
<style>
  :host {
    display: contents;
  }
  :host > div#output {
    display: contents;
  }

  @media only screen
    and (min-device-width: 320px)
    and (max-device-width: 480px)
    and (-webkit-min-device-pixel-ratio: 2) {

  }
</style>
<div style="display: none;">
<slot></slot>
</div>
<slot name="output"></slot>
<div part="root" class="output">
</div>
`;

function WrapHTML() { return Reflect.construct(HTMLElement, [], Object.getPrototypeOf(this).constructor); }
Object.setPrototypeOf(WrapHTML.prototype, HTMLElement.prototype);
Object.setPrototypeOf(WrapHTML, HTMLElement);

if (window.ShadyCSS) {
  ShadyCSS.prepareTemplate(tmpl, 'x-vue');
}

class VueComponentElement extends WrapHTML {

  constructor() {
    super();
  }

  get components() {
    return COMPONENTS;
  }

  get data() {
    return this.component?.$data;
  }

  get update() {
    return new Promise( resolve => {
      this.component.$nextTick(resolve);
    });
  }

  /* The top-level component for a VueComponent is the
   * root vue element, that contains the template. Data
   * that is set upon the component is set upon the root
   * template
   */
  get component() {
    return this.vueroot;
  }

  setupRoot() {
    return this.attachShadow({mode:'open'});
  }

  get rootel() {
    return this.shadowRoot;
  }

  inputSlotChanged(ev) {
    if ( this.vueroot ) {
      return;
    }
    const parent = this.shadowRoot.querySelector('div.output');

    let style_elements = ev.target.assignedNodes().filter( el => el instanceof HTMLStyleElement );
    let other_elements = ev.target.assignedNodes().filter( el => style_elements.indexOf(el) < 0 );
    this.template_text = other_elements.map( el => el instanceof HTMLElement ? el.outerHTML : el.textContent ).join('\n');
    parent.innerHTML = this.template_text;
    for (let style of style_elements) {
      this.shadowRoot.appendChild(style);
    }
    let default_data = {};
    for (let key of (this.getAttribute('props') || '').split(' ')) {
      default_data[key] = null;
    }

    let router;

    if (VUE_ROOT) {
      router = VUE_ROOT.$router;
    }

    this.vueroot = new Vue({
        el: parent,
        data: default_data,
        router,
        components: this.components,
    });
    if ( ! this.querySelector('*[slot]')) {
      let evObj = new Event('ready', {bubbles: false, cancelable: false});
      this.dispatchEvent(evObj);
    }
  }

  connectedCallback() {
    if (window.ShadyCSS) {
      ShadyCSS.styleElement(this);
    }
    this.attachShadow({mode:'open', delegatesFocus: true}).appendChild(tmpl.content.cloneNode(true));
    const parent = this.shadowRoot.querySelector('div.output');
    this.shadowRoot.querySelector('slot[name="output"]').addEventListener('slotchange', (ev) => {
      if (this.output_el) {
        return;
      }

      let new_output_parent = ev.target.assignedNodes()[0];
      let new_output = document.createElement('div');
      new_output_parent.appendChild(new_output);
      new_output.style.display = 'contents';
      this.output_el = new_output;
      this.output_el.style.display = 'contents';

      this.shadowRoot.querySelector('div.output').innerHTML = '';

      new_output.innerHTML = this.template_text;

      let default_data = {};
      if (! this.vueroot) {
        for (let key of (this.getAttribute('props') || '').split(' ')) {
          default_data[key] = null;
        }
      } else {
        default_data = this.vueroot.$data;
      }
      this.vueroot = new Vue({
          el: new_output,
          data: default_data,
          components: this.components,
      });
      let evObj = new Event('ready', {bubbles: false, cancelable: false});
      this.dispatchEvent(evObj);
    });
    const slot = this.shadowRoot.querySelector('slot');
    slot.addEventListener('slotchange', (ev) => {
      this.inputSlotChanged.call(this,ev);
    });
  }

}

customElements.define('x-vue',VueComponentElement);

export default VueComponentElement;
