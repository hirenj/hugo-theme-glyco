import 'summary-protviewer';

import { reserveBootstrapSlot } from './bootstrap';

import { getData, retrieveUniprot } from './gator';

async function loadDefaultData(value) {
  console.log('Default data loader',value);
  if ( document.querySelector('x-trackrenderer[track="domains"]')) {
    getData('glycodomain',value).then( dat => {
      document.querySelector('x-trackrenderer[track="domains"]').data = dat._raw_data.data;
    });
	} else {
    console.log('No renderer for Domains ([track="domains"]), skipping domains');
	}

  let dat = await getData('combined',value);

  if (document.querySelector('x-trackrenderer[src*="predictions"]')) {
    if (dat._raw_data.data['application/json+msdata-prediction']) {
      document.querySelector('x-trackrenderer[src*="predictions"]').data = dat._raw_data.data['application/json+msdata-prediction'][0];
    }
  } else {
    console.log('No renderer for predictions ([src*="predictions.renderer.js"]), skipping predictions');    
  }

  if (document.querySelector('x-trackrenderer[src*="msdata.packed"]')) {
    document.querySelector('x-trackrenderer[src*="msdata.packed"]').data = dat._raw_data.data;
  } else {
    console.log('No renderer for packed sites ([src*="msdata.packed"]), skipping sites');        
  }

  for (const trackrenderer of [...document.querySelectorAll('x-js-trackrenderer[data-src]')]) {
    let data = await fetch(trackrenderer.getAttribute('data-src')).then( r => r.json() );
    if (data[value]) {
      trackrenderer.data = data[value];
    } else {
      trackrenderer.data = null;
      console.log(`Skipping setting data for trackrenderer ${trackrenderer}, as there is no data`);
    }
  }

}

let set_sequence = function(uniprot) {
  let viewer = document.querySelector('x-summary-protviewer');
  for (let track of document.querySelectorAll('x-gatortrack')) {
    track.setAttribute('scale',uniprot);
  }
  let renderer = viewer.renderer;
  let result = new Promise( resolve => {
    let sequenceChanged = function() {
      renderer.unbind('sequenceChange',sequenceChanged);
      viewer.refreshTracks();
      viewer.fitToZoom();
      resolve();
    };
    renderer.bind('sequenceChange',sequenceChanged);
  });
  retrieveUniprot(uniprot).then (async seq => {
    let viewer = document.querySelector('x-summary-protviewer');
    viewer.uniprot = uniprot;
    console.log(uniprot);
    viewer.renderer.setSequence(seq);
  });
  return result;
};

const retrieveData =  async (uniprot) => {
  let seq = await set_sequence(uniprot);
  await loadDefaultData(uniprot);
  return uniprot;
};

const retrieveDataOnPageLoad =  async (uniprot_id) => {
  await reserveBootstrapSlot();
  let uniprot = await uniprot_id();
  return await retrieveData(uniprot);
};

export { retrieveDataOnPageLoad, retrieveData };