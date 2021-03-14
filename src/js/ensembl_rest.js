
const SPECIES = 'human';

import { search_region } from './mygene';

const ensembl_snp_url = val => `https://rest.ensembl.org/variation/${SPECIES}/${val}?phenotypes=1`

const fetch_json = (url) => fetch(url,{ headers: { 'Content-Type': 'application/json'}}).then( r => r.json() );

const CACHED_SNPS = new Map();

let cached_search_snp = (rsid,margin) => {
  let id = `${rsid}#${margin}`;
  if (CACHED_SNPS.has(id)) {
    return CACHED_SNPS.get(id);
  }
  CACHED_SNPS.set(id, retrieve_snp_data(rsid,margin));
  return CACHED_SNPS.get(id);
};

let cached_lookup_snp = (id) => {
  if (CACHED_SNPS.has(id)) {
    return CACHED_SNPS.get(id);
  }
  CACHED_SNPS.set(id, lookup_snp_data(id));
  return CACHED_SNPS.get(id);
};

const lookup_snp_data = (rsid) => {
  return fetch_json(ensembl_snp_url(rsid));
}

const retrieve_snp_data = (rsid,margin) => {
  return cached_lookup_snp(rsid).then( ({mappings,phenotypes}) => {
    if ( ! mappings ) {
      return [];
    }
    let usable_mappings = mappings.filter( ({assembly_name}) => assembly_name == 'GRCh38');
    if (usable_mappings.length < 1) {
      return;
    }
    let {seq_region_name,start,end} = usable_mappings[0];
    return search_region(seq_region_name,start,end,margin).then( hits => {
      hits.forEach( hit => hit.search_snp = rsid );
      return hits;
    });
  });
}

const search_snp = (rsid,margin=500000) => {
  return cached_search_snp(rsid,margin);
}

const lookup_snp = (rsid) => {
  return cached_lookup_snp(rsid);
}
export { search_snp, lookup_snp };