import 'summary-protviewer';

import { getData, retrieveUniprot } from './gator';

async function loadData(value,alignment) {
  let ownedTracks = alignment.ownedTracks;
  let glycodomain_data = await getData('glycodomain',value);
  for (let track of alignment.parentNode.querySelectorAll(`ccg-trackrenderer[track="${value}"][src*="glycodomain"]`)) {
    if (ownedTracks.indexOf(track) >= 0) {
      track.data = glycodomain_data._raw_data.data;
    }
  }

  let dat = await getData('combined',value);

  for (let track of alignment.parentNode.querySelectorAll(`ccg-trackrenderer[track="${value}"][src*="msdata"]`)) {
    if (ownedTracks.indexOf(track) >= 0) {
      track.data = dat._raw_data.data;
    }
  }

}

async function retrieveData(alignments=document.querySelectorAll('ccg-alignment')) {
  for (let aln of alignments) {
    for (let id of aln._alignments.data.ids) {
      await loadData(id,aln);
    }
  }
};

async function retrieveDataOnAlignmentLoad() {
  let promises = [...document.querySelectorAll('ccg-alignment')].map( aln => {
    return new Promise((resolve,reject) => {
      aln.addEventListener('ready', () => resolve(aln) );
      aln.addEventListener('error', reject );
    });
  });
  let alignments = await Promise.all(promises);
  return await retrieveData(alignments);
};

export { retrieveDataOnAlignmentLoad, retrieveData }