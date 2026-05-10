#!/usr/bin/env sh
# Kong-Keycloak JWT Sync (Bash version)
# Updates ONLY the JWT consumer keys in kong.yml, preserving all other config

set -e

# Configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-http://keycloak:8080}"
REALM="${KEYCLOAK_REALM:-crash-game}"
KONG_CONFIG_PATH="${KONG_CONFIG_PATH:-/kong/kong.yml}"
SYNC_INTERVAL="${SYNC_INTERVAL:-0}"

log() { printf '[Kong-Keycloak] %s\n' "$*" >&2; }

get_keycloak_jwks() {
    url="${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/certs"

    attempt=0
    max_retries=30
    while [ "$attempt" -lt "$max_retries" ]; do
        response_file=/tmp/jwks_response.json
        curl -sSf --max-time 5 "$url" -o "$response_file" 2>&1
        curl_exit=$?

        if [ "$curl_exit" -eq 0 ] && [ -s "$response_file" ]; then
            cat "$response_file"
            rm -f "$response_file"
            return 0
        fi

        rm -f "$response_file"
        attempt=$((attempt + 1))
        if [ "$attempt" -lt "$max_retries" ]; then
            log "Keycloak not ready (attempt ${attempt}/${max_retries})"
            sleep 2
        fi
    done
    log "Error: Failed to connect to Keycloak after ${max_retries} attempts"
    exit 1
}

find_rs256_key() {
    jwks_data="$1"

    echo "$jwks_data" > /tmp/jwks_debug.json

    kid=$(jq -r '.keys[] | select(.alg == "RS256" and .use == "sig") | .kid' < /tmp/jwks_debug.json 2>/dev/null | head -1)
    x5c=$(jq -r '.keys[] | select(.alg == "RS256" and .use == "sig") | .x5c[0]' < /tmp/jwks_debug.json 2>/dev/null | head -1)

    if [ -z "$kid" ] || [ "$x5c" = "null" ]; then
        kid=$(jq -r '.keys[] | select(.kty == "RSA" and .x5c != null) | .kid' < /tmp/jwks_debug.json 2>/dev/null | head -1)
        x5c=$(jq -r '.keys[] | select(.kty == "RSA" and .x5c != null) | .x5c[0]' < /tmp/jwks_debug.json 2>/dev/null | head -1)
    fi

    rm -f /tmp/jwks_debug.json

    if [ -z "$kid" ] || [ "$x5c" = "null" ] || [ -z "$x5c" ]; then
        log "Error: No RSA key found in JWKS"
        exit 1
    fi

    printf '%s|%s' "$kid" "$x5c"
}

extract_rsa_public_key() {
    x5c="$1"
    cert_pem="-----BEGIN CERTIFICATE-----
${x5c}
-----END CERTIFICATE-----"

    printf '%s' "$cert_pem" | openssl x509 -pubkey -noout 2>/dev/null
}

update_kong_config() {
    kid="$1"
    public_key="$2"

    # Indentar todas as linhas da pubkey
    pubkey_indented=$(printf '%s' "$public_key" | sed 's/^/          /')

    # Criar novo consumers YAML
    cat > /tmp/new_consumers.yaml << EOF
consumers:
  - username: keycloak-crash-game
    jwt_secrets:
      - key: ${kid}
        algorithm: RS256
        rsa_public_key: |-
${pubkey_indented}
  - username: skip-auth
    jwt_secrets:
      - key: m-U9iZ4MfvXDo3DZwPwCRuNRygY8sdyOOf1zRje_TwU
        algorithm: RS256
        rsa_public_key: |-
          -----BEGIN PUBLIC KEY-----
          MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4aQfhMoZR8/fC5pyI0lO
          lEsLjZGHW6+qExaAvcdTiJaUVc+QcoRJESex1VhW/YReEW61WWMe2gNHH+nSDFBN
          ablxfKIl3OiDGo/Iqsh7d5NOX4IV0RrEZZyUhvyH16eJTZhI4ho4vNbKHQJKm5Lh
          TgL6gLUYfwq1/n6Zql6WzV3UnwDzXp7QTEQWCEdoakJOfqvMEWmCY0WT+Zm9zub9
          BtF/I1oDEKxiWX/h6thRtLRX+gb4hItU75fMSvf6HpzZnF2hlrc7fKsGcBSkiVSv
          YQwfl7/CwI4huDfk7DYBSqOwsj70lCySNR8dAQ+FXYZLMJ7kMdiRdSlbZcQSO9TH
          gQIDAQAB
          -----END PUBLIC KEY-----
EOF

    # Remover seção consumers antiga e adicionar a nova
    awk '
    BEGIN { in_consumers = 0; skip = 0 }
    /^consumers:/ { in_consumers = 1; skip = 1; next }
    in_consumers && /^  [a-z]/ && !/^  - username/ { skip = 0; in_consumers = 0 }
    !skip { print }
    ' "${KONG_CONFIG_PATH}" > "${KONG_CONFIG_PATH}.tmp"

    # Adicionar nova seção consumers
    cat /tmp/new_consumers.yaml >> "${KONG_CONFIG_PATH}.tmp"

    mv "${KONG_CONFIG_PATH}.tmp" "$KONG_CONFIG_PATH"
    rm -f /tmp/new_consumers.yaml

    log "Updated ${KONG_CONFIG_PATH} with kid: ${kid}"
}

sync_once() {
    log "Starting sync..."

    jwks_data=$(get_keycloak_jwks)
    key_info=$(find_rs256_key "$jwks_data")
    kid=$(printf '%s' "$key_info" | cut -d'|' -f1)
    x5c=$(printf '%s' "$key_info" | cut -d'|' -f2)

    log "Found RSA key with kid: ${kid}"

    public_key=$(extract_rsa_public_key "$x5c")
    update_kong_config "$kid" "$public_key"

    log "Sync completed successfully"
}

# Main
log "Kong-Keycloak JWT Sync Service"
log "Sync interval: ${SYNC_INTERVAL}s"

sync_once

if [ "$SYNC_INTERVAL" -gt 0 ]; then
    log "Entering resync loop (every ${SYNC_INTERVAL}s)"
    while true; do
        sleep "$SYNC_INTERVAL"
        sync_once || log "Resync failed (will retry)"
    done
else
    log "One-time sync completed, exiting"
fi
