<template>
<div>
  <template v-if="loading"><div>Loading{{doi}}</div></template>
  <template v-else>
    <div v-if="citation !== ''"><a target="_blank" :href="'https://doi.org/'+citation.DOI">{{citation.author[0].family || citation.author[0].name }} <em>et al</em> <span v-html="citation['short-container-title'][0]"/> {{citation.issued['date-parts'][0][0]}}</a></div>
    <div v-else>Reference not available</div>
  </template>
</div>
</template>

<script>

const CITATION_CACHE = new WeakMap();

class Lock {
  constructor() {
    this.finished = new Promise(resolve => {
      this.done = resolve;
    })
  }
}

let lock;

var get_citation = async (doi) => {
  if (CITATION_CACHE[doi]) {
    return CITATION_CACHE[doi];
  }
  if (lock) {
    await lock.finished;
    return await new Promise( resolve => setTimeout( () => resolve(get_citation(doi) ) ) );
  }
  lock = new Lock(); 

  const crossref_uri = `https://api.crossref.org/works/${doi}?mailto=joshi@sund.ku.dk`;

  const controller = new AbortController()

  // 5 second timeout:

  const timeoutId = setTimeout(() => controller.abort(), 1000)

  const doi_uri = `https://doi.org/${doi}?mailto=joshi@sund.ku.dk`;
  try {
  CITATION_CACHE[doi] = await fetch(crossref_uri, { signal: controller.signal, headers: { Accept: 'application/json' }}).then( resp => resp.json() ).then( json => json.message );
  } catch (err) {
    lock.done();
    lock = null;
    return await new Promise( resolve => setTimeout( () => resolve(get_citation(doi) ) ), 500+Math.floor(Math.random() * 500) );
  }
  lock.done();

  lock = null;

  return CITATION_CACHE[doi];
};

export { get_citation }

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