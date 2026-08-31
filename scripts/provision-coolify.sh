#!/usr/bin/env bash
set -euo pipefail

# Provision the demo-safe Slopstream backend topology through a Coolify host.
# Usage: scripts/provision-coolify.sh [ssh-host]
# The script creates a short-lived Coolify token on the host and revokes it
# after all application resources have reached a healthy state.

host="${1:-nuncio-vultr}"

ssh -o BatchMode=yes -o ConnectTimeout=15 "$host" 'bash -s' <<'REMOTE_SCRIPT'
set -euo pipefail

base_url="http://127.0.0.1:8000/api/v1"
# Unique per run so concurrent provisioning cannot revoke another run's
# temporary credential during its API calls.
token_name="slopstream-provisioner-$(date +%s)-$$-$(openssl rand -hex 4)"

cleanup() {
  docker exec coolify php artisan tinker --execute="\App\Models\PersonalAccessToken::query()->where(\"name\", \"${token_name}\")->delete();" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
token="$(docker exec coolify php artisan tinker --execute="session([\"currentTeam\" => \App\Models\Team::find(0)]); echo \App\Models\User::find(0)->createToken(\"${token_name}\", [\"read\", \"write\", \"deploy\"])->plainTextToken;")"

api_get() {
  curl --fail-with-body --silent --show-error \
    -H "Authorization: Bearer ${token}" \
    "$1"
}

api_mutate() {
  local method="$1"
  local url="$2"
  local payload="$3"
  local response_file
  local status

  response_file="$(mktemp)"
  status="$(curl --silent --show-error -o "${response_file}" -w '%{http_code}' \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -X "${method}" --data "${payload}" "${url}")"
  if [[ ! "${status}" =~ ^2 ]]; then
    cat "${response_file}" >&2
    rm -f "${response_file}"
    return 1
  fi
  cat "${response_file}"
  rm -f "${response_file}"
}

api_post() {
  api_mutate POST "$1" "$2"
}

api_patch() {
  api_mutate PATCH "$1" "$2"
}

server_uuid="$(api_get "${base_url}/servers" | jq -r '.[0].uuid')"
projects="$(api_get "${base_url}/projects")"
project_uuid="$(jq -r '[.[] | select(.name == "slopstream") | .uuid] | first // empty' <<<"${projects}")"

if [[ -z "${project_uuid}" ]]; then
  project_uuid="$(api_post "${base_url}/projects" "$(jq -nc '{name: "slopstream", description: "Slopstream demo stream services"}')" | jq -r '.uuid')"
fi

destinations="$(api_get "${base_url}/servers/${server_uuid}/destinations")"
destination_uuid="$(jq -r '[.[] | select(.network == "slopstream") | .uuid] | first // empty' <<<"${destinations}")"

if [[ -z "${destination_uuid}" ]]; then
  destination_uuid="$(api_post "${base_url}/servers/${server_uuid}/destinations" "$(jq -nc '{name: "Slopstream private network", network: "slopstream", type: "standalone"}')" | jq -r '.uuid')"
fi

apps="$(api_get "${base_url}/applications")"
find_app() {
  jq -r --arg name "$1" '[.[] | select(.name == $name) | .uuid] | first // empty' <<<"${apps}"
}

create_app() {
  local name="$1"
  local dockerfile="$2"
  local port="$3"
  local alias="$4"
  local port_mapping="$5"
  local memory_limit="$6"
  local uuid

  uuid="$(find_app "${name}")"
  if [[ -n "${uuid}" ]]; then
    printf '%s' "${uuid}"
    return
  fi

  local payload
  payload="$(jq -nc \
    --arg project_uuid "${project_uuid}" \
    --arg server_uuid "${server_uuid}" \
    --arg destination_uuid "${destination_uuid}" \
    --arg name "${name}" \
    --arg dockerfile "${dockerfile}" \
    --arg port "${port}" \
    --arg alias "${alias}" \
    --arg port_mapping "${port_mapping}" \
    --arg memory_limit "${memory_limit}" '
      {
        project_uuid: $project_uuid,
        server_uuid: $server_uuid,
        environment_name: "production",
        destination_uuid: $destination_uuid,
        name: $name,
        git_repository: "sneldao/slopstream",
        git_branch: "main",
        build_pack: "dockerfile",
        dockerfile_location: $dockerfile,
        ports_exposes: $port,
        custom_network_aliases: $alias,
        health_check_enabled: true,
        health_check_path: "/health",
        health_check_port: $port,
        health_check_method: "GET",
        health_check_return_code: 200,
        health_check_scheme: "http",
        health_check_interval: 15,
        health_check_timeout: 10,
        health_check_retries: 5,
        health_check_start_period: 30,
        limits_memory: $memory_limit,
        limits_cpus: "0.75",
        is_force_https_enabled: false,
        is_auto_deploy_enabled: false,
        instant_deploy: false,
        is_git_shallow_clone_enabled: true
      }
      + if $port_mapping == "" then {} else {ports_mappings: $port_mapping} end
    ')"

  api_post "${base_url}/applications/public" "${payload}" | jq -r '.uuid'
}

# Coolify returns an existing UUID from create_app() without applying the
# creation payload. Reconcile mutable deployment settings on every run so a
# script upgrade cannot leave an old Dockerfile, health check, or limit live.
reconcile_app() {
  local uuid="$1"
  local dockerfile="$2"
  local port="$3"
  local alias="$4"
  local port_mapping="$5"
  local memory_limit="$6"
  local payload

  payload="$(jq -nc \
    --arg dockerfile "${dockerfile}" \
    --arg port "${port}" \
    --arg alias "${alias}" \
    --arg port_mapping "${port_mapping}" \
    --arg memory_limit "${memory_limit}" '
      {
        git_repository: "sneldao/slopstream",
        git_branch: "main",
        build_pack: "dockerfile",
        dockerfile_location: $dockerfile,
        ports_exposes: $port,
        custom_network_aliases: $alias,
        health_check_enabled: true,
        health_check_path: "/health",
        health_check_port: $port,
        health_check_method: "GET",
        health_check_return_code: 200,
        health_check_scheme: "http",
        health_check_interval: 15,
        health_check_timeout: 10,
        health_check_retries: 5,
        health_check_start_period: 30,
        limits_memory: $memory_limit,
        limits_cpus: "0.75",
        is_force_https_enabled: false,
        is_auto_deploy_enabled: false,
        instant_deploy: false,
        is_git_shallow_clone_enabled: true
      }
      + if $port_mapping == "" then {} else {ports_mappings: $port_mapping} end
    ')"
  api_patch "${base_url}/applications/${uuid}" "${payload}" >/dev/null
}

api_uuid="$(create_app "slopstream-api" "/Dockerfile.api" "4000" "api" "" "384m")"
verifier_uuid="$(create_app "slopstream-verifier" "/Dockerfile.verifier" "4100" "verifier" "" "384m")"
generator_uuid="$(create_app "slopstream-generator" "/Dockerfile.generator" "4300" "generator" "4304:4300" "384m")"
orchestrator_uuid="$(create_app "slopstream-orchestrator" "/Dockerfile.orchestrator" "4200" "orchestrator" "4204:4200" "256m")"

reconcile_app "${api_uuid}" "/Dockerfile.api" "4000" "api" "" "384m"
reconcile_app "${verifier_uuid}" "/Dockerfile.verifier" "4100" "verifier" "" "384m"
reconcile_app "${generator_uuid}" "/Dockerfile.generator" "4300" "generator" "4304:4300" "384m"
reconcile_app "${orchestrator_uuid}" "/Dockerfile.orchestrator" "4200" "orchestrator" "4204:4200" "256m"

verifier_token="$(openssl rand -hex 32)"
orchestrator_token="$(openssl rand -hex 32)"
generator_token="$(openssl rand -hex 32)"
brand_creator_token="$(openssl rand -hex 32)"

bulk_envs() {
  local runtime_only_payload
  runtime_only_payload="$(jq '.data |= map(. + {is_runtime: true, is_buildtime: false})' <<<"$2")"
  api_patch "${base_url}/applications/$1/envs/bulk" "${runtime_only_payload}" >/dev/null
}

bulk_envs "${api_uuid}" "$(jq -nc \
  --arg verifier_token "${verifier_token}" \
  --arg orchestrator_token "${orchestrator_token}" \
  --arg brand_creator_token "${brand_creator_token}" '
  {data: [
    {key: "NODE_ENV", value: "development"},
    {key: "PORT", value: "4000"},
    {key: "SEED_DEMO", value: "1"},
    {key: "PUBLISH_LIFECYCLE_EVENTS", value: "0"},
    {key: "PROOF_VERIFIER_MODE", value: "remote"},
    {key: "PROOF_VERIFIER_URL", value: "http://verifier:4100/v1/attention-proofs/verify"},
    {key: "PROOF_VERIFIER_TOKEN", value: $verifier_token, is_shown_once: true},
    {key: "ORCHESTRATOR_API_TOKEN", value: $orchestrator_token, is_shown_once: true},
    {key: "BRAND_CREATOR_TOKEN", value: $brand_creator_token, is_shown_once: true}
  ]}
')"

bulk_envs "${verifier_uuid}" "$(jq -nc --arg verifier_token "${verifier_token}" '
  {data: [
    {key: "NODE_ENV", value: "production"},
    {key: "PORT", value: "4100"},
    {key: "VERIFIER_MODE", value: "stub"},
    {key: "VERIFIER_API_TOKEN", value: $verifier_token, is_shown_once: true}
  ]}
')"

bulk_envs "${generator_uuid}" "$(jq -nc --arg generator_token "${generator_token}" '
  {data: [
    {key: "NODE_ENV", value: "production"},
    {key: "PORT", value: "4300"},
    {key: "GENERATOR_MODE", value: "stub"},
    {key: "GENERATOR_API_TOKEN", value: $generator_token, is_shown_once: true},
    {key: "ASSET_BASE_URL", value: "http://144.202.117.160:4304"}
  ]}
')"

bulk_envs "${orchestrator_uuid}" "$(jq -nc \
  --arg orchestrator_token "${orchestrator_token}" \
  --arg generator_token "${generator_token}" '
  {data: [
    {key: "NODE_ENV", value: "production"},
    {key: "PORT", value: "4200"},
    {key: "API_BASE_URL", value: "http://api:4000"},
    {key: "GENERATOR_BASE_URL", value: "http://generator:4300"},
    {key: "ORCHESTRATOR_API_TOKEN", value: $orchestrator_token, is_shown_once: true},
    {key: "GENERATOR_API_TOKEN", value: $generator_token, is_shown_once: true}
  ]}
')"

storages="$(api_get "${base_url}/applications/${generator_uuid}/storages")"
if ! jq -e '[.. | objects | select(.mount_path? == "/app/apps/generator/assets")] | length > 0' <<<"${storages}" >/dev/null; then
  api_post "${base_url}/applications/${generator_uuid}/storages" \
    "$(jq -nc '{type: "persistent", name: "assets", mount_path: "/app/apps/generator/assets"}')" >/dev/null
fi

deploy_and_wait() {
  local uuid="$1"
  local name="$2"
  local deployment_status
  local application_status

  api_post "${base_url}/applications/${uuid}/start" '{}' >/dev/null
  for _ in $(seq 1 120); do
    deployment_status="$(api_get "${base_url}/deployments/applications/${uuid}" | jq -r '.deployments | sort_by(.created_at) | last | .status // "unknown"')"
    application_status="$(api_get "${base_url}/applications/${uuid}" | jq -r '.status // "unknown"')"
    printf '%s: deployment=%s application=%s\n' "${name}" "${deployment_status}" "${application_status}"
    case "${deployment_status}" in
      finished)
        case "${application_status}" in
          running:healthy|running)
            return
            ;;
        esac
        ;;
      failed|cancelled)
        printf '%s deployment failed: %s\n' "${name}" "${deployment_status}" >&2
        return 1
        ;;
    esac
    sleep 10
  done

  printf '%s did not complete before the deployment timeout\n' "${name}" >&2
  return 1
}

# Keep builds/deployments serial to avoid contention with the existing VPS workloads.
deploy_and_wait "${verifier_uuid}" "verifier"
deploy_and_wait "${generator_uuid}" "generator"
deploy_and_wait "${api_uuid}" "api"
deploy_and_wait "${orchestrator_uuid}" "orchestrator"

jq -nc \
  --arg project_uuid "${project_uuid}" \
  --arg destination_uuid "${destination_uuid}" \
  --arg api_uuid "${api_uuid}" \
  --arg verifier_uuid "${verifier_uuid}" \
  --arg generator_uuid "${generator_uuid}" \
  --arg orchestrator_uuid "${orchestrator_uuid}" \
  '{project_uuid: $project_uuid, destination_uuid: $destination_uuid, applications: {api: $api_uuid, verifier: $verifier_uuid, generator: $generator_uuid, orchestrator: $orchestrator_uuid}, public_endpoints: {gateway: "http://144.202.117.160:4204", assets: "http://144.202.117.160:4304"}}'
REMOTE_SCRIPT
