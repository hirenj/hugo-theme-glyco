<template>
<form part="form" class="search" novalidate="novalidate" :data-loading="loading ? '' : false" v-focusfirst v-on:reset="search=''; $event.target.querySelector('#search').focus(); " @submit.prevent>
  <header><input v-model="search" id="search" :autofocus="isroot" required type="search" placeholder="Gene or UniProt" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" v-on:keydown="jumptoresults"/><button type="reset" v-on:click="search_results = false" /></header>
  <ul class="dropdown-menu">
    <template v-if="options.length < 1 && search_results && !search_dirty && search.length > 0">
      <div class="noresults">No results</div>
    </template>
    <li v-for="(option,itemidx) in options" v-on:click="focusItem($event, itemidx)" >
        <input type="radio" value="" name="search" :id="`search${itemidx}`" v-on:keydown="radiokey" v-on:change="fixTabOrders" v-on:focus="scrollIfNeeded" /><div class="d-center"><label :for="`search${itemidx}`">{{option.symbol}} <span class="alias">{{ option.matching_aliases }}</span></label>
          <slot v-bind:option="option">
<a v-if="option.geneid" part="button" class="glyco" :href="'/glymap/geneid/'+option.geneid+(option.search_snp?'?snp='+option.search_snp:'')">Gene</a>
        <a v-if="option.prot" part="button" class="glyco quickaction" :href="'/glycodomain/'+option.prot">Protein</a>
          </slot>
        </div>
    </li>
  </ul>
</form>
</template>

<script>

import { search as searchgene, lookup_protein as protein } from '../js/mygene';
import { search_snp as searchsnp } from '../js/ensembl_rest';
import Vue from 'vue';

let do_search = function(search,species=9606) {
  this.loading = true;
  this.search_error = false;
  this.search_results = false;
  if (search.match(/[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}/)) {
    protein(search).then( names => {
      this.options = [ { geneid: 1, symbol: names.symbol, prot: search  }];
      this.loading = false;
      this.search_results = true;
    }).catch( error => {
      this.search_error = true;
      this.loading = false;
    });
    return;
  }
  if (search.match(/^rs[\d]+$/)) {
    searchsnp(search).then( res => {
      this.options = res;
      this.loading = false;
      this.search_results = true;
    }).catch( error => {
      this.search_error = true;
      this.loading = false;
    });
    return;
  }
  if ( ! this.search_dirty ) {
    searchgene(search,species).then( res => {
      this.options = res;
      this.loading = false;
      this.search_results = true;
    }).catch( error => {
      this.search_error = true;
      this.loading = false;
    });
  }
};

let scroll = (element, container) => {
  if ((element.offsetTop + 28) < container.scrollTop ) {
    container.scrollTop = 0;
  }
  if ((element.offsetTop + 28) < (container.offsetHeight + container.scrollTop) ) {
    return;
  }
  container.scrollTop = element.offsetTop;
  return;
  if (element.offsetTop < container.scrollTop) {
    container.scrollTop = element.offsetTop;
  } else {
    const offsetBottom = element.offsetTop + element.offsetHeight;
    const scrollBottom = container.scrollTop + container.offsetHeight;
    if (offsetBottom > scrollBottom) {
      container.scrollTop = container.offsetHeight; //offsetBottom - 
    }
  }
};

let search_debounce = null;

export default {
  name: 'Menu',
  props: {
    species: Number
  },
  directives: {
    focusfirst: {
      // directive definition
      componentUpdated: function (el) {
        if ( el.__vue__.search_dirty ) {
          return;
        }
        let first = el.querySelector('input[type=radio]');
        if ( ! first ) {
          return;
        }
        if (first.getAttribute('id') === 'search0') {
          first.checked = true;
        }
      }
    }
  },
  data () {
    return {
      search: null,
      loading: false,
      search_dirty: false,
      search_error: false,
      search_results: false,
      options: []
    }
  },
  watch: {
    search: function(value) {
      clearTimeout(search_debounce);
      this.search_dirty = true;
      let waiting = 1000;
      if (value === '') {
        waiting = 0;
      }
      search_debounce = setTimeout(() => {
        value = value.trim();
        if (value === '') {
          this.options = [];
          return;
        }
        this.search_dirty = false;
        this.performSearch(value.trim());
      },waiting);
    }
  },
  computed: {
    isroot: function() {
      return false;
      //return this.$route.path === '/';
    }
  },
  methods: {
    jumptoresults: function(ev) {
      let first_result = this.$el.querySelector('[id="search0"]');
      if (ev.keyCode === 40 && first_result) {
        first_result.focus();
        first_result.checked = true;
      }
      if (ev.keyCode === 13 && first_result) {
        first_result.checked = true;        
        first_result.nextElementSibling.querySelector('a.quickaction').click();
        ev.preventDefault();
      }
    },
    radiokey: function(ev) {
      if (ev.keyCode === 13) {
        ev.target.nextElementSibling.querySelector('a.quickaction').click();
      }
    },
    fixTabOrders: function(ev) {
      for (const el of this.$el.querySelectorAll('.dropdown-menu input[type=radio]:not(:checked) + .d-center > a')) {
        el.setAttribute('tabindex','-1');
      }
      for (const el of this.$el.querySelectorAll('.dropdown-menu input[type=radio]:checked + .d-center > a')) {
        el.setAttribute('tabindex','0');
      }
    },
    focusItem: function(ev,itemidx) {
      this.$el.querySelector(`#search${itemidx}`).checked = true;
      this.$el.querySelector('.dropdown-menu input[type=radio]:checked').focus();
    },
    scrollIfNeeded: function(ev) {
      scroll(ev.target.parentNode,this.$el);
      this.fixTabOrders();
    },
    performSearch: function(text) {
      if (this.species) {
        do_search.call(this,text,this.species);
      } else {
        do_search.call(this,text);
      }
    }
  }
}
</script>

<style scoped>
form {
  display: block;
  border-radius: 5px;
  min-width: 15em;
  position: relative;
  line-height: 1em;
  top: 0px;
  left: 0px;
  --result-rows: 5;
  max-height: calc( 1.5em + (var(--result-rows) * (2.2em + 20px)) );
  border: solid black 1px;
  font-family: Verdana, Helvetica, sans-serif;
  overflow-y: scroll;
  background: #fff;
}

form[data-loading] header:after {
  content: '';
  display: block;
  top: 0px;
  right: 32px;
  color: #555;
  font-size: 3px;
  margin: 100px auto;
  width: 0.9em;
  height: 0.9em;
  border-radius: 50%;
  position: relative;
  text-indent: -9999em;
  -webkit-animation: load4 1.3s infinite linear;
  animation: load4 1.3s infinite linear;
  -webkit-transform: translateZ(0);
  -ms-transform: translateZ(0);
  transform: translateZ(0);
}
@-webkit-keyframes load4 {
  0%,
  100% {
    box-shadow: 0 -3em 0 0.2em, 2em -2em 0 0em, 3em 0 0 -1em, 2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 -1em, -3em 0 0 -1em, -2em -2em 0 0;
  }
  12.5% {
    box-shadow: 0 -3em 0 0, 2em -2em 0 0.2em, 3em 0 0 0, 2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 -1em, -3em 0 0 -1em, -2em -2em 0 -1em;
  }
  25% {
    box-shadow: 0 -3em 0 -0.5em, 2em -2em 0 0, 3em 0 0 0.2em, 2em 2em 0 0, 0 3em 0 -1em, -2em 2em 0 -1em, -3em 0 0 -1em, -2em -2em 0 -1em;
  }
  37.5% {
    box-shadow: 0 -3em 0 -1em, 2em -2em 0 -1em, 3em 0em 0 0, 2em 2em 0 0.2em, 0 3em 0 0em, -2em 2em 0 -1em, -3em 0em 0 -1em, -2em -2em 0 -1em;
  }
  50% {
    box-shadow: 0 -3em 0 -1em, 2em -2em 0 -1em, 3em 0 0 -1em, 2em 2em 0 0em, 0 3em 0 0.2em, -2em 2em 0 0, -3em 0em 0 -1em, -2em -2em 0 -1em;
  }
  62.5% {
    box-shadow: 0 -3em 0 -1em, 2em -2em 0 -1em, 3em 0 0 -1em, 2em 2em 0 -1em, 0 3em 0 0, -2em 2em 0 0.2em, -3em 0 0 0, -2em -2em 0 -1em;
  }
  75% {
    box-shadow: 0em -3em 0 -1em, 2em -2em 0 -1em, 3em 0em 0 -1em, 2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 0, -3em 0em 0 0.2em, -2em -2em 0 0;
  }
  87.5% {
    box-shadow: 0em -3em 0 0, 2em -2em 0 -1em, 3em 0 0 -1em, 2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 0, -3em 0em 0 0, -2em -2em 0 0.2em;
  }
}
@keyframes load4 {
  0%,
  100% {
    box-shadow: 0 -3em 0 0.2em, 2em -2em 0 0em, 3em 0 0 -1em, 2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 -1em, -3em 0 0 -1em, -2em -2em 0 0;
  }
  12.5% {
    box-shadow: 0 -3em 0 0, 2em -2em 0 0.2em, 3em 0 0 0, 2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 -1em, -3em 0 0 -1em, -2em -2em 0 -1em;
  }
  25% {
    box-shadow: 0 -3em 0 -0.5em, 2em -2em 0 0, 3em 0 0 0.2em, 2em 2em 0 0, 0 3em 0 -1em, -2em 2em 0 -1em, -3em 0 0 -1em, -2em -2em 0 -1em;
  }
  37.5% {
    box-shadow: 0 -3em 0 -1em, 2em -2em 0 -1em, 3em 0em 0 0, 2em 2em 0 0.2em, 0 3em 0 0em, -2em 2em 0 -1em, -3em 0em 0 -1em, -2em -2em 0 -1em;
  }
  50% {
    box-shadow: 0 -3em 0 -1em, 2em -2em 0 -1em, 3em 0 0 -1em, 2em 2em 0 0em, 0 3em 0 0.2em, -2em 2em 0 0, -3em 0em 0 -1em, -2em -2em 0 -1em;
  }
  62.5% {
    box-shadow: 0 -3em 0 -1em, 2em -2em 0 -1em, 3em 0 0 -1em, 2em 2em 0 -1em, 0 3em 0 0, -2em 2em 0 0.2em, -3em 0 0 0, -2em -2em 0 -1em;
  }
  75% {
    box-shadow: 0em -3em 0 -1em, 2em -2em 0 -1em, 3em 0em 0 -1em, 2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 0, -3em 0em 0 0.2em, -2em -2em 0 0;
  }
  87.5% {
    box-shadow: 0em -3em 0 0, 2em -2em 0 -1em, 3em 0 0 -1em, 2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 0, -3em 0em 0 0, -2em -2em 0 0.2em;
  }
}

header {
  position: -webkit-sticky;
  position: -moz-sticky;
  position: -ms-sticky;
  position: -o-sticky;
  position: sticky;
  display: flex;
  flex-direction: row;
  align-items: center;
  top: 0px;
  width: calc(100% - 2px);
  height: calc( var(--menu-height) - 4px);
  background: #fff;
  z-index: 2;
}
input[type=search] {
  width: 100%;
  height: calc(100% - 1px);
  font-size: 1em;
  top: 1px;
  left: 0;
  padding: 0px;
  padding-left: 0.5em;
}

input[type=search]::-webkit-search-cancel-button{
  display: none;
}

button[type=reset]:before {
  content: 'X';
  border-radius: 1em;
  display: block;
  width: 1.5em;
  height: 1.25em;
  line-height: 1.25em;
  font-size: 1em;
  padding: 0px;
  margin: 0px;
  border: 0px;
  background: #ddd;
  color: #fff;
  cursor: pointer;
}

button[type=reset]:focus:before {
  background: var(--base-color-darkest);
}

button[type=reset] {
  background: transparent;
  padding: 0px;
  margin: 0px;
  border: 0px;
  outline: none;
}

input[type=search]:invalid ~ button[type=reset] {
  display: none;
}

input[type=search]:invalid ~ button[type=reset]:before {
  display: none;
}

input[type=radio] {
  left: -200vw;
  width: 0px;
  height: 0px;
  position: fixed;
}

.dropdown, .dropdown-menu {
  font-size: 0.85em;
  margin: 0px;
  width: calc(100% - 2px);
  list-style-type: none;
  padding: 0px;
  position: relative;
  bottom: 0px;
  top: 0px;
}

form::-webkit-scrollbar {
  -webkit-appearance: none;
  width: 6px;
}

form::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background-color: rgba(0,0,0,.2);
  -webkit-box-shadow: 0 0 1px rgba(255,255,255,.5);
}

header input[type=search] {
  -webkit-appearance: none;
  -moz-appearance: none;
  border-radius: 0px;
  margin-top: 0px;
  border: 0px;
}

div.noresults {
  padding: 5px;
}

@media only screen
  and (min-width: 320px)
  and (max-width: 480px)
  and (-webkit-min-device-pixel-ratio: 2) {
    header {
      width: calc(100% - 2px);
    }
    header {
      height: 1.5em;
    }
    input[type=search] {
      font-size: 16px;
      top: 0px;
    }
}

.dropdown-menu li {
  text-decoration: none;
  position: relative;
}
.dropdown-menu li a {
  text-decoration: none;
  font-size: 1em;
}

.dropdown-menu, .dropdown-menu:focus-within {
  background: #eee;
}

.dropdown-menu input[type=radio]:checked + .d-center {
  background: #eee
}

.dropdown-menu:focus-within input[type=radio]:checked + .d-center {
  background: var(--main-color);
  color: var(--foreground-color);
  font-weight: bolder;
  box-shadow: 0px 3px 9px rgba(0,0,0,.5);
  border: solid transparent 1px;
}

.dropdown-menu input[type=radio] + .d-center:hover {
  background: #eaeaee;
  box-shadow: 0px 1px 5px rgba(0,0,0,.5);
}

.dropdown-menu .d-center {
  display: flex;
  width: 100%;
  height: 100%;
  flex-flow: row nowrap;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  padding-bottom: 10px;
  height: 2.5em;
  border: solid white 1px;
}
.dropdown-menu .d-center label {
  display: inline-block;
  height: 100%;
  overflow: hidden;
  flex: 1;
  margin-left: 0.5em;
  margin-right: 1em;
  font-weight: var(--dropdown-font-weight);
}

span.alias {
  font-style: oblique;
  font-size: 0.75em;
}
</style>
