#!/bin/bash


function get_sequence {
  wanted_id="$1"
  temp_seq=$(mktemp)
  curl --silent --output $temp_seq "https://rest.uniprot.org/uniprotkb/search?query=$wanted_id&fields=accession,sequence"
  is_inactive=$(jq --raw-output '.results | .[] | .entryType == "Inactive"' < $temp_seq)
  if [[ ! "$is_inactive" == "true" ]]; then
    jq --raw-output '.results | .[] | [.primaryAccession, .sequence.value ] | @tsv' < $temp_seq
  else
    >&2 echo "Error $wanted_id"
    return 1
  fi
}

sequences_file=$(mktemp)

seq_errors=0

for seqid in "$@"; do
	get_sequence "$seqid"
  if [[ $? -gt 0 ]]; then
    seq_errors=1
  fi
done > $sequences_file


if [[ $seq_errors -gt 0 ]]; then
  >&2 echo "Skipping alignment due to errors"
  exit 1
fi

sequences=$(cut -f2 "$sequences_file" | tr '\n' ',' | sed -e 's/,$//')

if [[ -f ".env.dev" ]]; then
	. .env.dev
fi

if [[ -f ".env.prod" ]]; then
	. .env.prod
fi

auth_token=$(curl --silent -H "x-api-key: $CLIENT_ID" "$ROOT_API/api/login" | jq --raw-output '.id_token')

raw_alignment=$(mktemp)

curl -H "x-api-key: $CLIENT_ID" \
  --silent \
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