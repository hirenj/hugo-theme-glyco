function renderData(seq,peptides) {
peptides = peptides['application/json+msdata'] || [];

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

var guess_composition = function(composition) {
	if (Array.isArray(composition)) {
		composition = composition[0];
	}
	var comp_string = composition.replace(/\d+x/g,'').toLowerCase();
	let sugar;
	if (comp_string == 'hexhexnac') {
		sugar = '#sugarrendered_gal(b1-3)galnac';
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

	if ( ! peptide.sites || peptide.sites.length == 0) {
		let { sugar, count } = guess_composition(peptide.composition);
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


	var has_site = false;
	(peptide.sites || []).forEach(function renderSite(site_block) {
		var site = site_block[0];
		has_site = true;
		var composition = site_block[1].replace(/1x/g,'');

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
			let lookup = composition_to_lookup(site_block[1]);
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
