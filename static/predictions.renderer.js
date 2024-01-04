function renderData(seq,datas) {

var return_data = [];

console.log(datas);

var render_sites = function(sites) {
	var base_offset = 0;
	sites.forEach(function renderSite(site_dat) {
		var site = site_dat+"";
		site = site.replace(/[STY]/,'');
		return_data.push({ "aa" : parseInt(site), "coalesce" : { "fill" : "#ffffB3", "stroke" : "#a6a635", "stroke_width" : 0.5 },  "type" : "marker" , "options" : { "content" : '#sugar_hexnac_base', "fill" : "#ffffB3", "stroke" : "#a6a635", "stroke_width" : 2, "text_fill" : "#f00", "border" : "none", "height": 8, "offset" : -3, "bare_element" : true }});
	});
};

render_sites(datas.sites);

return return_data;
}
