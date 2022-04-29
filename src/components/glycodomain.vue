<template>
  <toolpage :menuitems="activemenu" page_title="GlycoDomainViewer" :key="userchangetime">
    <template slot="content_title">
      {{symbol}}
    </template>
    <template slot="content_subtitle">
      {{protein}}
    </template>
    <template slot="actions">
        <button class="glyco" v-on:click="makeExcel()">Get XLSX</button>
        <a class="glyco" target="_blank" rel="noopener" :href="`https://www.uniprot.org/uniprot/${uniprot}`">UniProt</a>
    </template>
    <template slot="body">
    <section class="viewer">
      <glycorangeslider id="slider" :viewer="viewer" :animate-change="true" />
      <x-summary-protviewer id="protview" interactive selecting>
        <x-gatortrack name="ptms" fullname="Modifications" :scale="uniprot" ></x-gatortrack>
        <x-gatortrack name="predictions" fullname="NetOGlyc4.0" :scale="uniprot" ></x-gatortrack>
        <x-gatortrack name="domains" fullname="Domains" :scale="uniprot" ></x-gatortrack>
        <x-gatortrack v-if="patterns.length > 0" name="patterns" fullname="Patterns" :scale="uniprot" ></x-gatortrack>
      </x-summary-protviewer>
      <x-trackrenderer track="domains" renderer="protview" src="/static/glycodomain.packed.renderer.js">
      </x-trackrenderer>
      <x-trackrenderer track="predictions" renderer="protview" src="/static/predictions.renderer.js">
      </x-trackrenderer>
      <x-trackrenderer track="ptms" renderer="protview" src="/static/msdata.packed.renderer.js">
      </x-trackrenderer>
      <x-trackrenderer track="patterns" renderer="protview" src="/static/patterns.packed.renderer.js">
      </x-trackrenderer>
    </section>
    <section class="tooloptions">
      <tooloption slot="options" title="Match peptide pattern" id="patterns">
        <template slot="actions">
          <button class="glyco" v-on:click="patterns.push('')">Add</button>
        </template>
        <ul class="patterns">
          <li v-for="(item,itemidx) in patterns"><input v-model="patterns[itemidx]" type="text"/><button class="glyco" v-on:click="patterns.splice(itemidx,1)">Remove</button></li>
        </ul>
      </tooloption>
    </section>
    <section class="datatable">
      <datatable ref="datatable" :table="msdata_table" :columns="msdata_columns" v-on:selected="setRange">
      </datatable>
    </section>
    </template>
  </toolpage>
</template>

<script>
import 'sviewer';
import Vue from 'vue';

import ensureuser from '../mixins/ensureuser';

import MASCP from 'mascp-jstools';

import '../summary_protviewer';


import writeExcel from '../write_excel';

import { apply_transformer, reduce_table, annotate_samples, annotate_peptides } from '../ingest_msdata';

import '../rangeslider';

import { getData, getMetadata } from '../gator';

import { lookup_protein } from '../mygene';

import { transformer as msdata } from '../msdata-transformer';

const DATA_TABLE_COLUMNS = ['sample','sample_state','peptide','site','composition','quantification','doi']; 

const DATA_TABLE_HASH_KEYS = ['composition','site','site.composition','quantification','quantification.channels','peptide.start','peptide.end','peptide','dataset'];

import GlycoDomainTable from '@/components/glycodomain/data_table';

Vue.component('datatable', GlycoDomainTable);

require('@/assets/css/datatable.css')

let retrieve_uniprot = function(uniprot) {
  return MASCP.GatorDataReader.authenticate().then(function(url_base) {
    let a_reader = new MASCP.UniprotReader();
    return new Promise((resolve,reject) => {
    a_reader.retrieve(uniprot, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.result._raw_data.data[0]);
      }
    });
    });
  });
};

let set_sequence = function(uniprot) {
  retrieve_uniprot(uniprot).then (seq => {
    let viewer = this.$el.querySelector('x-summary-protviewer');
    viewer.uniprot = uniprot;
    viewer.renderer.setSequence(seq);
  });
};

let load_data = async function(value) {

  getData('glycodomain',value).then( dat => {
    this.$el.querySelector('x-trackrenderer[track="domains"]').data = dat._raw_data.data;
  });

  let dat = await getData('combined',value);

  if (dat._raw_data.data['application/json+msdata-prediction']) {
    this.$el.querySelector('x-trackrenderer[track="predictions"]').data = dat._raw_data.data['application/json+msdata-prediction'][0];
  }

  this.$el.querySelector('x-trackrenderer[track="ptms"]').data = dat._raw_data.data;

  this.$refs.datatable.setRange();

  let to_transform = (dat._raw_data.data['application/json+msdata'] || []).map( block => {
    return { key: value, value: [ block ], dataset: block.dataset };
  });

  const table = 
  [ apply_transformer.bind( null, msdata ),
    reduce_table.bind( null, DATA_TABLE_HASH_KEYS ),
    annotate_samples.bind( null, dat._raw_data.data['samples']),
    annotate_peptides.bind( null, this.$el.querySelector('x-summary-protviewer').renderer.sequence)
  ].reduce( (curr,nextfunc) => nextfunc(curr), to_transform );

  this.msdata_table = table;
  this.msdata_columns = DATA_TABLE_COLUMNS;

  let total = table.length - 1;
  while (total >= 0) {
    table[total].id = total;
    this.$refs.datatable.$refs.msdataTable.openChildRows.push(total--);
  }

};

let pattern_debounce;

const wiring_map = new WeakMap();

const meta_dragging = function(evt){
  if (evt.type === 'mousemove') {
    if (evt.metaKey) {
      this.removeAttribute('selecting','');
    } else {
      this.setAttribute('selecting','');
    }
  }

  if (evt.metaKey && evt.type === 'keydown') {
    this.removeAttribute('selecting','');
  }

  if (evt.metaKey && evt.type === 'keyup') {
    this.setAttribute('selecting','');
  }
  if (evt.type === 'touchstart') {
    if (evt.touches && evt.touches[0].touchType == 'stylus') {
      this.setAttribute('selecting','');
    } else {
      this.removeAttribute('selecting','');
    }
  }
};

const reconnect_viewer = function() {
    let viewer = this.$el.querySelector('x-summary-protviewer');
    if (wiring_map.get(viewer)) {
      return;
    }
    wiring_map.set(viewer,1);
    let renderer = viewer.renderer;

    const meta_function = meta_dragging.bind(viewer);
    let capture = true;

    viewer.addEventListener('mousemove',meta_function,{capture});
    viewer.addEventListener('touchstart',meta_function,{capture});
    document.addEventListener('keydown',meta_function,{capture});
    document.addEventListener('keyup', meta_function ,{capture});

    renderer.bind('sequenceChange', () => {
      viewer.refreshTracks();
      viewer.fitToZoom();
      this.viewer = viewer;
      load_data.call(this,viewer.uniprot);
    });

    renderer.bind('selection', (sel) => {
      let [start,end] = sel.get(viewer.renderer);
      if (start !== null) {
        this.$refs.datatable.setRange([start,end]);
      } else {
        this.$refs.datatable.setRange();
      }
    });

    if (this.uniprot === this.$route.params.uniprot) {
      this.showUniprot(this.uniprot);
    } else {
      this.uniprot = this.$route.params.uniprot;
    }
};

const set_patterns = function(patterns) {
  clearTimeout(this.pattern_debounce);
  const DEBOUNCE_WAITING = 500;
  this.pattern_debounce = setTimeout(() => {
    let patterns_track = this.$el.querySelector('x-trackrenderer[track="patterns"]');
    let viewer = this.$el.querySelector('x-summary-protviewer');
    patterns_track.data = null;
    if (patterns_track && this.patterns.length > 0) {
      patterns_track.data = this.patterns;
    }
    viewer.refreshTracks();
  },DEBOUNCE_WAITING);
};

export default {
  name: 'GlycodomainViewer',
  mixins: [ensureuser],
  mounted() {
    reconnect_viewer.call(this);
  },
  watch: {
    '$route': function(to,from){
      console.log('Setting route');
      this.uniprot = to.params.uniprot;
    },
    uniprot: function(value) {
      this.msdata_table = [];
      clearTimeout(this.uniprottimeout);
      this.uniprottimeout = setTimeout( () => {
        this.showUniprot(value);
      },10);
    },
    userchangetime: function() {
      this.uniprot = null;
    },
    selecting: function(value) {
      toggle_select.call(this,value);
    },
    patterns: function() {
      set_patterns.call(this,this.patterns);
    }
  },
  updated: function () {
    reconnect_viewer.call(this);
  },
  methods: {
    async showUniprot(uniprot) {
      await set_sequence.call(this,uniprot);
      await lookup_protein(uniprot).then( names => {
        this.symbol = names.symbol;
        this.protein = names.protein;
      });
    },
    makeExcel() {
      writeExcel(this.msdata_table,'Peptides',`${this.symbol}_${this.uniprot}_proteomics.xlsx`);
    },
    setRange([start,end]) {
      let viewer = this.$el.querySelector('x-summary-protviewer');
      if (start === end) {
        start = start - 10;
        end = end + 10;
      }
      viewer.renderer.showResidues(start,end,true);
    }
  },
  data () {
    return {
      uniprot: 'Q14118',
      symbol: '',
      user: '',
      protein: '',
      patterns: [],
      msdata_table: [],
      msdata_columns: ['peptide','composition'],
      viewer: null,
      selecting: false
    }
  }
}
</script>

<style scoped>
h1 .subtitle {
  font-size: 0.5em;
  font-weight: lighter;
  font-style: oblique;
}
section.datatable {
  overflow: auto;
  display: flex;
  align-items: center;
  flex-direction: column;
}

section.tooloptions {
  margin-left: 5%;
  margin-right: 5%;
}

.body {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  overflow-x: hidden;
}

section.content {
  display: flex;
  flex-direction: column;
  flex: 1;
}

section.viewer {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;

  /* NOSELECT */
  -webkit-touch-callout: none; /* iOS Safari */
    -webkit-user-select: none; /* Safari */
     -khtml-user-select: none; /* Konqueror HTML */
       -moz-user-select: none; /* Old versions of Firefox */
        -ms-user-select: none; /* Internet Explorer/Edge */
            user-select: none; /* Non-prefixed version, currently */  

}

x-summary-protviewer {
  width: 80%;
  --selection-color: var(--base-color-darkest);
  --button-default-background-color: var(--main-color);
}

section.content header {
  width: 100%;
  display: flex;
  align-items: center;
  margin-bottom: 1em;
}

.gene_background {
  font-weight: lighter;
  color: #999;
}

#slider {
  width: 80%;
  --labelwidth: 3em;
}

#patterns {
  width: 30vw;
  min-width: 15em;
}

ul.patterns {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  margin: 0px;
  margin-bottom: 0.25em;
  padding-inline-start: 0px;
  justify-content: center;
}

ul.patterns li {
  list-style: none;
  display: flex;
  align-items: center;
  flex-direction: row;
  border: solid transparent 0.25em;
}
ul.patterns li input {
  border: 0px;
  padding: 4px;
  margin-right: -1em;
}

ul.patterns li:nth-child(3n-2) input {
  background: rgba(255,0,0,0.3);
}

ul.patterns li:nth-child(3n-1) input {
  background: rgba(0,255,0,0.3);
}

ul.patterns li:nth-child(3n-3) input {
  background: rgba(0,0,255,0.3);
}

section.actions {
  flex: 1;
  margin-left: 5px;
  display: grid;
  grid-row-gap: 5px;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
}
section.actions * {
  align-self: start;
  justify-self: start;
  max-height: 2em;
}

@media only screen
  and (min-width: 320px)
  and (max-width: 480px)
  and (-webkit-min-device-pixel-ratio: 2) {

  #patterns {
    width: 90%;
  }

}
</style>