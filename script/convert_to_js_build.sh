#!/bin/bash

SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

BUILD_SCRIPT=$(jq --raw-output '.scripts.build' "$SCRIPTPATH/../package.json" | sed -e 's/--config /--config themes\/hugo-theme-glyco\/webpack\//')
BUILD_WATCH_SCRIPT=$(jq --raw-output '.scripts["build-watch-web"]' "$SCRIPTPATH/../package.json" | sed -e 's/--config /--config themes\/hugo-theme-glyco\/webpack\//')
START_SCRIPT=$(jq --raw-output '.scripts.start' "$SCRIPTPATH/../package.json" | sed -e 's/--config /--config themes\/hugo-theme-glyco\/webpack\//')
DEPLOY_SCRIPT=$(jq --raw-output '.scripts.deploy' "$SCRIPTPATH/../package.json" | sed -e 's/--config /--config themes\/hugo-theme-glyco\/webpack\//')

if [[ ! -f package.json ]]; then
	npm init
fi

tmp=$(mktemp)

jq ".scripts.build=\"$BUILD_SCRIPT\"" package.json > $tmp && mv "$tmp" package.json
jq ".scripts[\"build-watch-web\"]=\"$BUILD_WATCH_SCRIPT\"" package.json > $tmp && mv "$tmp" package.json
jq ".scripts.start=\"$START_SCRIPT\"" package.json  > $tmp && mv "$tmp" package.json
jq ".scripts.deploy=\"$DEPLOY_SCRIPT\"" package.json > $tmp && mv "$tmp" package.json
jq ".dependencies[\"hugo-theme-glyco\"]=\"file:themes/hugo-theme-glyco\"" package.json > $tmp && mv "$tmp" package.json