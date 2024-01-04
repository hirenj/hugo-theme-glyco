---
title: "{{ replace .Name "-" " " | title }}"
date: {{ .Date }}
layout: "jspage"
draft: false
---

{{% glycodomain %}}

<!--
Into src/pages/path_underneath_content_pagename.js
import { retrieveDataOnPageLoad } from '../../themes/hugo-theme-glyco/src/js/basic_viewer.js'

retrieveDataOnPageLoad( () => {
  const urlParams = new URLSearchParams(window.location.search);
  let uniprot = urlParams.get('uniprot') || 'P09258';
  return uniprot;
})
-->