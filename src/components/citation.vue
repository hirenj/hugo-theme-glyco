<template>
<div style="display: contents;">
  <template v-if="loading"><a :href="'https://doi.org/'+doi">{{doi}}</a></template>
  <template v-else>
    <div style="display: contents;" v-if="citation !== ''"><a target="_blank" :href="'https://doi.org/'+citation.DOI">{{citation.author[0].family || citation.author[0].name }} <em>et al.</em> {{citation['container-title-short']}} {{citation.issued['date-parts'][0][0]}}</a></div>
    <div v-else>Reference not available</div>
  </template>
</div>
</template>

<script>

const CITATION_CACHE = new WeakMap();

var get_citation = (doi) => {
  if (CITATION_CACHE[doi]) {
    return CITATION_CACHE[doi];
  }

  const crossref_uri = `https://api.crossref.org/works/${doi}`;

  const doi_uri = `https://doi.org/${doi}`;
  CITATION_CACHE[doi] = fetch(doi_uri, { headers: { Accept: 'application/vnd.citationstyles.csl+json'}}).then( resp => resp.json() );

  return CITATION_CACHE[doi];
};

export default {
  name: 'Citation',
  props: {
    doi: String
  },
  data () {
    return {
      citation: '',
      loading: false
    }
  },
  created: function() {
    this.populateData();
  },
  computed: {
  },
  watch: {
    doi: function() {
      this.populateData();
    }
  },
  methods: {
    populateData: function() {
      if (this.doi) {
        this.loading = true;
        get_citation(this.doi).then( cite => {
          this.citation = cite;
          this.loading = false;
        });
      }
    }
  }
}
</script>