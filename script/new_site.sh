#!/bin/bash

hugo new site . --force
mv hugo.toml config.toml
echo 'theme = "hugo-theme-glyco"' >> config.toml
echo 'publishDir = "docs"' >> config.toml
echo 'disableRSS = true' >> config.toml
echo 'disableSitemap = true' >> config.toml
echo 'disableKinds = ["RSS","sitemap","taxonomy","taxonomyTerm"]' >> config.toml

git submodule add git@github.com:hirenj/hugo-theme-glyco themes/hugo-theme-glyco
git add config.toml
git commit -m 'Initial site'
echo 'site.glycomics.ku.dk' > CNAME
git checkout --orphan www-prod
git rm -rf .
mkdir docs
touch docs/.nojekyll
git add docs
git commit -m 'Initial site content'
git push origin www-prod
git checkout main
cp -r themes/hugo-theme-glyco/workflows/.github .
git add .github
git commit -m 'Add in workflow'
echo -e "docs\n.env.*" > .gitignore
git add .gitignore
git commit -m 'Add in ignore file'