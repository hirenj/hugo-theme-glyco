#!/bin/sh


GH=$(which gh)

for env in .env*; do
	env_type=${env#*.env.}
	env_name="ENV_${env_type}"
	base64 -i $env | gh secret set "$env_name"
done