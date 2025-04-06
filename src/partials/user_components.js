import VueComponentElement from '../js/vue-component.js';

import UserStatusComponent from '../components/userstatus.vue';

const COMPONENTS = {
  userstatus: UserStatusComponent
};

class UserStatus extends VueComponentElement {

  constructor() {
    super()
  }

  get components() {
    return COMPONENTS;
  }
  connectedCallback() {
    super.connectedCallback();
    this.innerHTML = '<userstatus></userstatus><div slot="output"></div>'
    this.style.display = 'contents';
  }
}

customElements.define('ccg-userstatus',UserStatus);