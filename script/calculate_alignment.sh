#!/bin/bash


function get_sequence {
  wanted_id="$1"
  curl "https://rest.uniprot.org/uniprotkb/search?query=$wanted_id&fields=accession,sequence" | jq --raw-output '.results | .[] | [.primaryAccession, .sequence.value ] | @tsv'
}

sequences_file=$(mktemp)

for seqid in "$@"; do
	get_sequence "$seqid"
done > $sequences_file

sequences=$(cut -f2 "$sequences_file" | tr '\n' ',' | sed -e 's/,$//')

if [[ -f ".env.dev" ]]; then
	. .env.dev
fi

if [[ -f ".env.prod" ]]; then
	. .env.prod
fi

auth_token=$(curl -H "x-api-key: $CLIENT_ID" "$ROOT_API/api/login" | jq --raw-output '.id_token')

raw_alignment=$(mktemp)

curl -H "x-api-key: $CLIENT_ID" \
  -H "Authorization: Bearer $auth_token" \
  -d "sequences=$sequences" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  "$ROOT_API/api/tools/clustal" | \
  jq '.data.ids = []' > "$raw_alignment"

ids=$(cut -f1 "$sequences_file" | tr '\n' ' ')

work_json=$(mktemp)

for seqid in $ids; do
	jq ".data.ids += [\"$seqid\"]" $raw_alignment > $work_json && cp $work_json $raw_alignment
done

cat $raw_alignment