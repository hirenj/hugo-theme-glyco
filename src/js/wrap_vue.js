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

    async attributeChangedCallback(name) {
      if ( ! this.data ) {
        this.addEventListener('ready', () => {
          this.data[name] = this.getAttribute(name);
        });
      } else {
        this.data[name] = this.getAttribute(name);        
      }
    }

    async updateData(key,value) {
      for (let child of this.component.$children) {
        child.$data[key] = value;
      }
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