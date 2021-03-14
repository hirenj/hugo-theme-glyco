
const basic_query_exact_url = (val,species=9606) => `https://mygene.info/v3/query?species=${species}&entrezonly=1&fields=symbol,entrezgene,name,uniprot,accession.protein&q=symbol:${val}`;

const basic_query_url = (val,species=9606) => `https://mygene.info/v3/query?species=${species}&entrezonly=1&fields=symbol,entrezgene,name,uniprot,accession.protein&q="${val}*"`;

const alias_query_url = (val,species=9606) => `https://mygene.info/v3/query?species=${species}&entrezonly=1&fields=symbol,entrezgene,name,alias,uniprot,accession.protein&q=alias:${val}*`;

const genomic_region_query_url = (chromosome,start,end) => `https://mygene.info/v3/query?q=chr${chromosome}%3A${start}-${end}&entrezonly=1&size=30&fields=symbol,entrezgene,name`;

const lookup_url = (val) => `https://mygene.info/v3/gene/${val}?fields=name,symbol`;

const lookup_uniprot_url = (val) => `https://www.ebi.ac.uk/proteins/api/proteins/${val}`;

const fetch_json = (url) => fetch(url).then( r => r.json() );

const perform_search = (query,species=9606) => {
  return Promise.all( [ fetch_json(basic_query_exact_url(query,species)), fetch_json(basic_query_url(query,species)), fetch_json(alias_query_url(query,species)) ] ).then( results => {
    let hits = [].concat.apply([], results.map( r => r.hits ));
    let ids = hits.map( hit => hit['_id'] );
    return hits.filter( (hit,idx) => ids.indexOf(ids[idx]) === idx ).filter( hit => hit );
  });
};

const perform_lookup = (id) => fetch_json(lookup_url(id));

const perform_protein_lookup = (id) => fetch_json(lookup_uniprot_url(id));

const SYMB_MATCH = Symbol('exact');
const ALIAS_MATCH = Symbol('exact_alias');

const PARTIAL_MATCH = Symbol('partial');
const PARTIAL_ALIAS_MATCH = Symbol('partial_alias');

const SWISSPROT_MATCH = Symbol('swissprot');

const exact_symbol_match = (query,hit) => {
  if (! hit.symbol) {
    return;
  }
  if (hit.symbol.toUpperCase() === query.toUpperCase()) {
    hit[SYMB_MATCH] = true;
  }
};

const exact_symbol_match_alias = (query,hit) => {
  if ( ! hit.alias ) {
    return;
  }
  if ( ! Array.isArray(hit.alias)) {
    hit.alias = [ hit.alias ];
  }
  let uc_alias = hit.alias.map( a => a.toUpperCase() );

  if (uc_alias.indexOf(query.toUpperCase()) >= 0) {
    hit[ALIAS_MATCH] = true;
    hit.matching_aliases = hit.alias[ uc_alias.indexOf(query.toUpperCase()) ];
  }
};

const partial_symbol_match_start = (query,hit) => {
  if ( ! hit.symbol ) {
    return;
  }
  let uc_query = query.toUpperCase();
  let symbs = [hit.symbol].filter( al => al.toUpperCase().indexOf(uc_query) == 0 );
  if (symbs.length > 0) {
    hit[PARTIAL_MATCH] = true;
  }
};

const partial_alias_match_start = (query,hit) => {
  if ( ! hit.alias ) {
    return;
  }
  if ( ! Array.isArray(hit.alias)) {
    hit.alias = [ hit.alias ];
  }
  let uc_query = query.toUpperCase();
  let aliases = hit.alias.filter( al => al.toUpperCase().indexOf(uc_query) == 0 );
  if (aliases.length > 0) {
    hit[PARTIAL_ALIAS_MATCH] = true;
    if ( ! hit.matching_aliases ) {
      hit.matching_aliases = aliases.join(',');      
    }
  }
};

const has_swissprot = (query,hit) => {
  if (hit.uniprot && hit.uniprot['Swiss-Prot']) {
    hit[SWISSPROT_MATCH] = true;
    hit.prot = hit.uniprot['Swiss-Prot'];
  }
};

const multi_funcs = (...functions) => {
  return (query,hit) => {
    for (let func of functions) {
      func(query,hit);
    }
  };
}

const guess_best_results = (query,hits) => {
  hits.forEach( multi_funcs( exact_symbol_match,
                             exact_symbol_match_alias,
                             partial_alias_match_start,
                             partial_symbol_match_start,
                             has_swissprot
                                ).bind(null,query));
  let results = [];
  results = results.concat( hits.filter( h => h[SYMB_MATCH]))
         .concat( hits.filter( h => h[PARTIAL_MATCH]))
         .concat( hits.filter( h => h[ALIAS_MATCH]))
         .concat( hits.filter( h => h[PARTIAL_ALIAS_MATCH]))
         .concat( hits.filter( h => h[SWISSPROT_MATCH]));

  results = results.filter( (o,i,a) => a.indexOf(o) === i );
  results.forEach( r => {
    r.alias = (r.alias || []).join(',');
    r.geneid = parseInt(r.entrezgene);
  });
  return results;
};

const lookup_gene = (geneid) => {
  return perform_lookup(geneid).then( r => { return { desc: r.name, symbol: r.symbol } } );
};

const lookup_protein = (uniprot) => {
  return perform_protein_lookup(uniprot).then( r => { return { desc: r.name, protein: r.protein.recommendedName.fullName.value, symbol: (r.gene[0] || { name: '' }).name.value  } } );
};

const search = (query,species=9606) => {
  return perform_search(query,species).then( guess_best_results.bind(null,query) );
};

const search_region = (chromosome,start,end,margin=0) => {
  return Promise.all(
    [ fetch_json(genomic_region_query_url(chromosome,start-margin,end)),
      fetch_json(genomic_region_query_url(chromosome,start,end+margin))
    ] ).then( (results) => {
      let hits = [].concat.apply([], results.map( r => r.hits ));
      let ids = hits.map( hit => hit['_id'] );
      return hits.filter( (hit,idx) => ids.indexOf(ids[idx]) === idx ).filter( hit => hit );
    }).then (results => {
      results.forEach( r => {
        r.alias = (r.alias || []).join(',');
        r.geneid = parseInt(r.entrezgene);
      });
      return results;
    });
}

const CACHED_GENES = new Map();

let cached_lookup_gene = (id) => {
  if (CACHED_GENES.has(id)) {
    return CACHED_GENES.get(id);
  }
  CACHED_GENES.set(id, lookup_gene(id));
  return CACHED_GENES.get(id);
};

export { search, lookup_gene, lookup_protein, cached_lookup_gene, search_region };