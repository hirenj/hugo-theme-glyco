
const basic_query_exact_url = (val,species=9606) => `https://mygene.info/v3/query?species=${species}&entrezonly=1&fields=symbol,entrezgene,name,uniprot,accession.protein&q=symbol:${val}`;

const basic_query_url = (val,species=9606) => `https://mygene.info/v3/query?species=${species}&entrezonly=1&fields=symbol,entrezgene,name,uniprot,accession.protein&q="${val}*"`;

const alias_query_url = (val,species=9606) => `https://mygene.info/v3/query?species=${species}&entrezonly=1&fields=symbol,entrezgene,name,alias,uniprot,accession.protein&q=alias:${val}*`;

const genomic_region_query_url = (chromosome,start,end) => `https://mygene.info/v3/query?q=chr${chromosome}%3A${start}-${end}&entrezonly=1&size=30&fields=symbol,entrezgene,name`;

const lookup_url = (val) => `https://mygene.info/v3/gene/${val}?fields=name,symbol`;

const ebi_proteins_api_url = (val) => `https://www.ebi.ac.uk/proteins/api/proteins/${val}`;

const get_uniprot_entry_url = (val) => `https://rest.uniprot.org/uniprotkb/${val}`;


const fetch_json = (url) => fetch(url, { headers: { 'Accept' : 'application/json' } }).then(manageErrors).then( r => r.json() );

const perform_search = (query,species) => {

  let queries = [basic_query_exact_url,basic_query_url,alias_query_url];

  if (query.indexOf(' ') >= 0) {
    queries = [ basic_query_url ];
  }

  let promises = queries.map( func => fetch_json(func(query,species)) );

  return Promise.all( promises ).then( results => {
    let hits = [].concat.apply([], results.map( r => r.hits ));
    let ids = hits.map( hit => hit['_id'] );
    return hits.filter( (hit,idx) => ids.indexOf(ids[idx]) === idx ).filter( hit => hit );
  });
};

const manageErrors = function(response) {
    if(!response.ok){
          const responseError = {
               statusText: response.statusText,
               status: response.status
          };
          throw(responseError);
    }
    return response;
};

const perform_lookup = (id) => fetch_json(lookup_url(id));

const perform_protein_lookup = (id) => fetch_json(ebi_proteins_api_url(id));

const perform_uniprot_lookup = (id) => fetch_json(get_uniprot_entry_url(id));

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




const ENSEMBL_ID = Symbol('Ensembl_id');
const REFSEQ_ID = Symbol('Refseq_id');
const UNIPROT_ID = Symbol('Uniprot_id');
const UNIPROT_NAME_ID = Symbol('Uniprot_name');

// REGEXES come from registry.identifiers.org
// UniProt name was written manually

const REGEXES = new Map();

REGEXES.set(ENSEMBL_ID,/^((ENS[A-Z]{1,5}\d{11}(\.\d+)?))$/);
REGEXES.set(REFSEQ_ID,/^(((WP|AC|AP|NC|NG|NM|NP|NR|NT|NW|XM|XP|XR|YP|ZP)_\d+)|(NZ\_[A-Z]{2,4}\d+))(\.\d+)?$/);
REGEXES.set(UNIPROT_ID,/^([A-N,R-Z][0-9]([A-Z][A-Z, 0-9][A-Z, 0-9][0-9]){1,2})|([O,P,Q][0-9][A-Z, 0-9][A-Z, 0-9][A-Z, 0-9][0-9])(\.\d+)?$/);
REGEXES.set(UNIPROT_NAME_ID,/^(\w{1,5})_(\w{1,5})$/);


const PROTEIN_LOOKUP_CACHE = new Map();

const lookup_protein = async (identifier) => {
  let gene_val = r => r.gene[0]?.name?.value || r.gene[0]?.orfNames[0]?.value;
  let entrez_val = r => +r.dbReferences?.filter( entry => entry.type == "GeneID" )[0]?.id;

  let matched_ids = [];
  for (const [idtype,regex] of REGEXES.entries()) {
    if (identifier.match(regex)) {
      matched_ids.push(idtype);
    }
  }

  if (matched_ids.length !== 1) {
    console.log(matched_ids);
    throw new Error('Ambiguous ID type');
    return;
  }

  let identifier_type = matched_ids.shift();

  let lookup_identifier = null;

  switch (identifier_type) {
    case ENSEMBL_ID:
      lookup_identifier = `ensembl:${identifier.replace(/\.\d+$/,'')}`;
      break;
    case REFSEQ_ID:
      lookup_identifier = `refseq:${identifier.replace(/\.\d+$/,'')}`;
      break;
    case UNIPROT_NAME_ID:
      try {
        lookup_identifier = (await perform_uniprot_lookup(identifier)).primaryAccession;
      } catch (err) {
        if (err.status >= 400) {
          return null;
        }
        throw err;
      }
      break;
    case UNIPROT_ID:
      lookup_identifier = identifier;
      break;
  }
  let proteins_api_result;

  try {
    proteins_api_result = await perform_protein_lookup(lookup_identifier);
    if (Array.isArray(proteins_api_result)) {
      proteins_api_result = proteins_api_result.shift();
    }
  } catch(err) {
    if (err.status >= 400) {
      return null;
    }
    throw err;
  }

  if ( ! proteins_api_result ) {
    PROTEIN_LOOKUP_CACHE.set(identifier,{
      identifier: identifier,
      error: 'No result'
    });
    return PROTEIN_LOOKUP_CACHE.get(identifier); 
  }

  let protein_info = 
    { 
      identifier: identifier,
      uniprotkb: proteins_api_result.accession,
      desc: proteins_api_result.name,
      protein: proteins_api_result.protein.recommendedName?.fullName.value || proteins_api_result.protein.submittedName[0]?.fullName.value,
      symbol: proteins_api_result.gene ? gene_val(proteins_api_result) : null,
      species: [ ...proteins_api_result.organism?.names.filter( ({type,value}) => type == 'common' ).map(({value}) => value ),
                 ...proteins_api_result.organism?.names.filter( ({type,value}) => type == 'scientific' ).map(({value}) => value )
               ],
      taxonomy: proteins_api_result.organism.taxonomy,
      lineage: proteins_api_result.organism.lineage,
      entrez: entrez_val(proteins_api_result)
    } 

  return protein_info;
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

const CACHED_PROTEINS = new Map();


let cached_lookup_gene = (id) => {
  if (CACHED_GENES.has(id)) {
    return CACHED_GENES.get(id);
  }
  CACHED_GENES.set(id, lookup_gene(id));
  return CACHED_GENES.get(id);
};

let cached_lookup_protein = (id) => {
  if (CACHED_PROTEINS.has(id)) {
    return CACHED_PROTEINS.get(id);
  }
  let result = lookup_protein(id);
  CACHED_PROTEINS.set(id, result);

  if (result.uniprotkb) {
    CACHED_PROTEINS.set(result.uniprotkb,protein_info);
  }

  return result;
};

export { search, lookup_gene, lookup_protein, cached_lookup_gene, cached_lookup_protein, search_region };