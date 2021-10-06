import VueComponentElement from './vue-component';

const COMPONENTS = {
};

export default function wrapVue(vueComponent,name=vueComponent.name?.toLowerCase()) {


  if (COMPONENTS[name]) {
    return;
  }

  COMPONENTS[name] = vueComponent;

  const props = Object.keys(vueComponent.props || {});

  const passed_props = props.map( prop => `:${prop}="${prop}"`);

  class WrappedVue extends VueComponentElement {

    constructor() {
      super()
      this.setAttribute('props',props.join(' '));
    }

    static get observedAttributes() {
      return props;
    }

    /* Props are pulled in from the data in the root vue element,
       so we should reflect the attributes for the custom element
       in the data for the root.
     */

    async attributeChangedCallback(name) {
      if ( ! this.data ) {
        this.addEventListener('ready', () => {
          this.vueroot.$data[name] = this.getAttribute(name);
        });
      } else {
        this.vueroot.$data[name] = this.getAttribute(name);        
      }
    }

    /* We are wrapping a single component here, so we skip over the VueRoot
       that we have defined, and go straight for the wrapped component
     */
    get component() {
      return this.vueroot?.$children[0];
    }

    async updateData(key,value) {
      this.data[key] = value;
      await this.component.$nextTick();
    }

    get components() {
      return COMPONENTS;
    }

    connectedCallback() {
      super.connectedCallback();
      this.innerHTML = `<${name} ${passed_props}></${name}><div slot="output"></div>`;
      this.style.display = 'contents';
    }
  }

  customElements.define(`x-${name}`,WrappedVue);
}