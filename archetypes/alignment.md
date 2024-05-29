---
title: "{{ replace .Name "-" " " | title }}"
date: {{ .Date }}
layout: "jspage"
draft: false
---

{{% alignment "alignments/somealignment.aln" %}}

<!--
Into src/pages/path_underneath_content_pagename.js
import { retrieveDataOnAlignmentLoad } from '../../themes/hugo-theme-glyco/src/js/basic_alignment.js'

retrieveDataOnAlignmentLoad().then( () => {
  // Do stuff once alignments are loaded
})
-->