function renderData(seq,peptides) {
peptides = peptides['application/json+msdata'] || [];

// msdata v1 sites are [position, composition] tuples; v2 sites are
// {position, observed, inferred} objects (observed/inferred are the
// composition-or-Unimod-name actually seen, and the glycan classes
// concluded from it — see ccg-data-schemas/msdata.schema.json). Detected
// per-item via Array.isArray so both versions render through the same
// script while data-builds migrates.
var DEAMIDATED = ['Deamidated','Deamidated:18O(1)'];

var intervals = [];

let glyphs_at_site = {};

var return_data = {};
var peptide_lines = [];
var ambiguous_shapes = [];

let transform_into_stack = function(site_block,base_offset) {
	site_block.options.content = [site_block.options.content];
	site_block.options.alt_content = '#ui_revealmore';
	site_block.is_stack = true;
	site_block.options.height = 10;
	site_block.options.offset = base_offset-10;
	site_block.options.fill = '#000';
	return site_block;
};

let push_stack = function(stack,site_block) {
	stack.options.content.push(site_block.options.content);
}

peptides.forEach(function(glycopep,i) {
	if ( ! return_data[glycopep.acc] ) {
		return_data[glycopep.acc] = [];
		peptide_lines[glycopep.acc] = [];
		ambiguous_shapes[glycopep.acc] = [];
	}
	if ( ! glycopep.peptide_start ) {
		intervals.push({ "index" : i, "start" : true,  "pep" : i });
		intervals.push({ "index" : i, "start" : false , "pep" : i });
		return;
	}
	var start;
	var end;
	start = glycopep.peptide_start;
	if (glycopep.peptide_end) {
		end = glycopep.peptide_end;
	} else if (glycopep.sequence) {
		end = start + glycopep.sequence.length - 1;
	} else {
		console.log("Missing data to get peptide end position, using start");
		end = start;
	}
	glycopep.start = start;
	glycopep.end = end;
	intervals.push({ "index" : start, "start" : true,  "pep" : i });
	intervals.push({ "index" : end, "start" : false , "pep" : i });
});

intervals.sort(function(a,b) {
	if (a.index < b.index ) {
		return -1;
	}
	if (a.index > b.index ) {
		return 1;
	}
	if (a.index == b.index) {
		return a.start ? -1 : 1;
	}
});

// GAG-linker classes (see ccg-data-schemas/glycan-classes.json GAG/CS/HS):
// a glycosaminoglycan attached via the Xyl-Gal-Gal-GlcA linker tetrasaccharide,
// differing only in their cap residue (GalNAc for CS, GlcNAc for HS, left
// generic for a bare/unclassified GAG linker) — composition shorthand alone
// can't tell those caps apart (all collapse to the same HexNAc count), so
// pick the structure from the glycan class id in `inferred` when we have one.
var GAG_LINKER_STRUCTURES = {
	CS: 'galnac(b1-4)glca(b1-3)gal(b1-3)gal(b1-4)xyl',
	HS: 'glcnac(b1-4)glca(b1-3)gal(b1-3)gal(b1-4)xyl',
	GAG: 'hexnac(b1-4)glca(b1-3)gal(b1-3)gal(b1-4)xyl'
};

// KS is unrelated to the GAG linker above: a sulfated Gal/GlcNAc repeat that
// can decorate many different backbones (N-glycans, O-mannose, ...), not a
// cap variant of one specific linker. No shared composition signature either
// — it's only ever identifiable via the site's `inferred` glycan class id.
var KS_STRUCTURE = '{hso3(u1-6)glcnac(b1-3)[hso3(u1-6)]gal(b1-4)@y3a}nany';

var is_gag_linker = function(lookup) {
	return (lookup['HexA'] || 0) >= 1 && (lookup['Pent'] || 0) >= 1;
};

// Checked in a fixed order so a site classed into more than one of these
// (shouldn't normally happen) still picks one structure deterministically.
var glycan_class_structure = function(inferred) {
	inferred = inferred || [];
	if (inferred.indexOf('KS') >= 0) return KS_STRUCTURE;
	for (var i = 0; i < ['CS','HS','GAG'].length; i++) {
		var id = ['CS','HS','GAG'][i];
		if (inferred.indexOf(id) >= 0) return GAG_LINKER_STRUCTURES[id];
	}
	return null;
};

var guess_composition = function(composition,inferred) {
	if (Array.isArray(composition)) {
		composition = composition[0] || '';
	}
	var comp_string = composition.replace(/\d+x/g,'').toLowerCase();
	let sugar;
	let class_structure = glycan_class_structure(inferred);
	if (class_structure) {
		sugar = '#sugarrendered_' + class_structure;
	} else if (is_gag_linker(composition_to_lookup(composition))) {
		sugar = '#sugarrendered_' + GAG_LINKER_STRUCTURES.GAG;
	}
	if (comp_string == 'hexhexnac') {
		// comp_string has already had its counts stripped, so a small
		// "1x Hex + 1x HexNAc" core and a much bigger "6x Hex + 2x HexNAc"
		// structure both land here identically. Look at the real counts
		// before picking an icon, same idea as the per-site heuristic in
		// renderSite() below, so a big structure isn't shown as if it were
		// a single HexHexNAc.
		let lookup = composition_to_lookup(composition);
		let hex = lookup['Hex'] || 0;
		let hexnac = lookup['HexNAc'] || 0;
		if (hex <= 1 && hexnac <= 1) {
			sugar = '#sugarrendered_gal(b1-3)galnac';
		} else if (hexnac >= 2 && hex > hexnac) {
			sugar = '#sugarrendered_man(a1-2)man(a1-3)[man(a1-3)[man(a1-6)]man(a1-6)]man(b1-4)glcnac(b1-4)glcnac';
		} else {
			sugar = '#sugarrendered_glcnac(b1-2)man(a1-3)[man(a1-6)]man(b1-4)glcnac(b1-4)glcnac';
		}
	}
	if (comp_string == 'hexnac') {
		sugar = '#sugar_hexnac';
	}
	if (comp_string == 'hex') {
		sugar = '#sugar_hex';
	}
	if (comp_string == 'phospho') {
		sugar = '#sugar_phospho';
	}
	return { sugar , count : parseInt(composition.replace(/^(\d+)x.*/,"$1")) };
};

var composition_to_lookup = function(composition) {
	let lookup = {};
	if (/[()[\]{}]/.test(composition)) {
		// This is an IUPAC condensed glycan string (e.g. 'Gal(b1-4)Xyl'), not
		// a composition shorthand like '2xHex1xHexNAc' - there's nothing to
		// count, so fall back to the root sugar residue at the reducing end.
		let root = composition.match(/([A-Za-z][A-Za-z0-9]*)$/);
		if (root) {
			lookup[root[1]] = 1;
		}
		return lookup;
	}
	if (! composition.match(/\d+x/)) {
		composition = `1x${composition}`;
	}
	for (let item of composition.match(/(\d+x[A-Za-z]+)/g)) {
		let [count,res,_] = item.split(/x(.*)/);
		lookup[res] = +count;
	}
	return lookup;
}

var seen_sites = {};

var render_peptide = function(peptide) {
	var depth = 0;
	var base_offset = 8+12+4*(-2+depth);

	var pep_line = { "aa": peptide.start, "type" : "box" , "width" : (peptide.end - peptide.start), "options" : { "offset" : base_offset, "height_scale" : 0.1, "fill" : "#999", "merge" : false  }}

	peptide_lines[peptide.acc].push(pep_line);

	if ( (! peptide.sites) && (! peptide.composition) && (! peptide.ambiguous_sites) ) {
		return;
	}

	if ( ( ! peptide.sites || peptide.sites.length == 0 ) && peptide.composition) {
		let { sugar, count } = guess_composition(peptide.composition);
		// (whole-peptide composition entries have no `inferred` glycan class
		// list to disambiguate CS from the generic GAG rendering)
		var peptide_key = peptide.start + '-' + peptide.end + sugar;
		if ( seen_sites[ peptide_key ] ) {
			return;
		}
		seen_sites[ peptide_key ] = true;
		if ( ! sugar ) {
			sugar = peptide.composition[0];
		}
		if ( isNaN( Math.floor(0.5*peptide.start + 0.5*peptide.end) )) {
			return;
		}
		ambiguous_shapes[peptide.acc].push({ "aa" : Math.floor(0.5*peptide.start + 0.5*peptide.end), "type" : "marker" , "options" : { "content" : sugar, "start" : peptide.start, "end" : peptide.end, "count" : count, "stretch": true, "height" : 10, "width": 3, "fill" : "none", "text_fill" : "#555", "border" : "#ddd", "no_tracer" : true, "bare_element" : false, "zoom_level" : "text", "offset" : base_offset + 2.5 }});
	}

	// v2-only: a site localized to a residue range rather than one exact
	// position (ambiguousSite in msdata.schema.json). Same marker shape as
	// the whole-peptide composition guess above, just anchored to the
	// site's own [first, last] instead of the whole peptide.
	(peptide.ambiguous_sites || []).forEach(function renderAmbiguousSite(asite) {
		var first = asite.first, last = asite.last;
		if (first == null || last == null) return;
		var mid = Math.floor(0.5*first + 0.5*last);
		if (isNaN(mid)) return;

		if (asite.observed && DEAMIDATED.indexOf(asite.observed) < 0) {
			let { sugar, count } = guess_composition(asite.observed,asite.inferred);
			if (! sugar) sugar = asite.observed;
			var amb_key = 'amb:' + first + '-' + last + sugar;
			if (seen_sites[amb_key]) return;
			seen_sites[amb_key] = true;
			ambiguous_shapes[peptide.acc].push({ "aa" : mid, "type" : "marker" , "options" : { "content" : sugar, "start" : first, "end" : last, "count" : count, "stretch": true, "height" : 10, "width": 3, "fill" : "none", "text_fill" : "#555", "border" : "#ddd", "no_tracer" : true, "bare_element" : false, "zoom_level" : "text", "offset" : base_offset + 2.5 }});
		} else {
			var label = asite.observed || ((asite.inferred && asite.inferred.length) ? asite.inferred.join(',') : '?');
			var label_key = 'amb:' + first + '-' + last + '|' + label;
			if (seen_sites[label_key]) return;
			seen_sites[label_key] = true;
			// Deamidation (a mass shift, not a sugar) only ever needs a short
			// label — shown much smaller than a curated/inferred-only label
			// so it doesn't dominate the track the way a full-size word does.
			var is_deamidated = DEAMIDATED.indexOf(asite.observed) >= 0;
			ambiguous_shapes[peptide.acc].push({ "aa" : mid, "type" : "text", "options" : { "offset" : base_offset + 2.5, "height" : is_deamidated ? 4 : 8, "content" : label, "fill" : "#555", "stroke_width" : 0 } });
		}
	});

	var has_site = false;
	(peptide.sites || []).forEach(function renderSite(site_block) {
		var fields = Array.isArray(site_block)
			? { position: site_block[0], observed: site_block[1], inferred: null }
			: { position: site_block.position, observed: site_block.observed, inferred: site_block.inferred };
		var site = fields.position;
		if (! site) return;
		has_site = true;

		if ( (! fields.observed) || DEAMIDATED.indexOf(fields.observed) >= 0 ) {
			// Nothing composition-shaped was observed at this exact position
			// (curated/inferred-only site, or a PNGase F deamidation mass
			// shift) — nothing to pick a sugar icon from, so label it with
			// whatever we do have instead of guessing a shape.
			var label = fields.observed || ((fields.inferred && fields.inferred.length) ? fields.inferred.join(',') : '?');
			var label_key = site + '|' + label;
			if (seen_sites[label_key]) return;
			seen_sites[label_key] = true;
			// Deamidation (a mass shift, not a sugar) only ever needs a short
			// label — shown much smaller than a curated/inferred-only label
			// so it doesn't dominate the track the way a full-size word does.
			var is_deamidated = DEAMIDATED.indexOf(fields.observed) >= 0;
			return_data[peptide.acc].push({ "aa" : site, "type" : "text", "options" : { "offset" : base_offset - 9, "height" : is_deamidated ? 4 : 8, "content" : label, "fill" : "#555", "stroke_width" : 0 } });
			return;
		}

		var composition = fields.observed.replace(/1x/g,'');

		let is_sugar = true;
		let identified = false;

		if (composition === "HexNAc") {
			composition = 'galnac';
			identified = true;
		}

		if (composition === "GalNAc") {
			composition = 'galnac';
			identified = true;
		}

		if (composition == 'GlcNAc') {
			composition = 'glcnac';
			identified = true;
		}
		if (composition === "HexHexNAc") {
			composition = 'gal(b1-3)galnac';
			identified = true;
		}
		if (composition == 'HexHex') {
			composition = 'man(a1-2)man';
			identified = true;
		}
		if (composition === 'Hex') {
			composition = 'man';
			identified = true;
		}

		if (composition === 'Phospho') {
			is_sugar = false;
			composition = 'phospho';
			identified = true;
		}

		if (composition.toLowerCase() == 'glcnac(b1-4)glcnac') {
			composition = 'man(a1-3)[man(a1-6)]man(b1-4)glcnac(b1-4)glcnac';
			identified = true;
		}

		if ( ! identified ) {
			let class_structure = glycan_class_structure(fields.inferred);
			if (class_structure) {
				composition = class_structure;
				identified = true;
			} else if (is_gag_linker(composition_to_lookup(fields.observed))) {
				composition = GAG_LINKER_STRUCTURES.GAG;
				identified = true;
			}
		}

		if ( ! identified ) {
			let lookup = composition_to_lookup(fields.observed);
			if (seq.charAt(site - 1) == 'N') {
				if (((lookup['Hex'] - lookup['HexNAc']) > 1) && lookup['HexNAc'] >= 2) {
					composition = 'man(a1-2)man(a1-3)[man(a1-3)[man(a1-6)]man(a1-6)]man(b1-4)glcnac(b1-4)glcnac'
					identified = true;
				}
				if (((lookup['HexNAc'] >= lookup['Hex']) || (lookup['NeuAc'] + lookup['NeuGc']) > 0) && lookup['HexNAc'] >= 2) {
					composition = 'glcnac(b1-2)man(a1-3)[man(a1-6)]man(b1-4)glcnac(b1-4)glcnac';
					identified = true;
				}
			} else if (['S','T','Y'].indexOf(seq.charAt(site - 1)) >= 0) {
				if (lookup['HexNAc'] >= 3) {
					composition = 'glcnac(b1-3)[galnac(b1-6)]GalNAc';
					identified = true;
				}
				if (lookup['HexNAc'] == 1 && lookup['Hex'] > 0) {
					composition = 'gal(b1-3)galnac';
					identified = true;
				}
				if (lookup['HexNAc'] == 2) {
					composition = 'gal(b1-3)[glcnac(b1-6)]galnac';
					identified = true;
				}				
			}
		}

		composition = composition.toLowerCase();

		if ( seen_sites[site+composition]  ) {
			return;
		} else {
			seen_sites[site+composition] = true;
		}

		let rendered_block = { "aa" : site, "type" : "marker" , "options" : { "content" :  (is_sugar ? '#sugarrendered_' : '#sugar_') +composition , "fill" : "none", "text_fill" : "#f00", "border" : "none", "height": 8, "offset" : base_offset - 2.5, "bare_element" : true }};


		if (! is_sugar) {
			rendered_block.options.offset = base_offset - 2.5;
			rendered_block.options.height = 8;
		} else {
			rendered_block.options.offset = base_offset - 9;
			rendered_block.options.height = 16;
		}

		if (glyphs_at_site[site]) {
			let current_glyph = glyphs_at_site[site];
			if (!current_glyph.is_stack) {
				let stack_el = transform_into_stack(current_glyph,base_offset);
				let target_idx = return_data[peptide.acc].indexOf(current_glyph);
				current_glyph = glyphs_at_site[site] = stack_el;
			}
			push_stack(current_glyph,rendered_block);
		} else {
			return_data[peptide.acc].push(rendered_block);
			glyphs_at_site[site] = rendered_block;
		}
	});
};

var current = [];

intervals.forEach(function(interval) {
	if (interval.start) {
		render_peptide(peptides[interval.pep]);
		current.push(interval.pep);
	} else {
		var idx = current.indexOf(interval.pep);
		current.splice(idx,1,null);
		while (current[current.length - 1] === null) {
			current.splice(current.length - 1,1);
		}
	}
});


Object.keys(return_data).forEach( function(acc) {
	return_data[acc] = peptide_lines[acc].concat(ambiguous_shapes[acc]).concat(return_data[acc]);
});

return return_data;
}
