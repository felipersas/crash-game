#!/usr/bin/env sh
# Kong-Keycloak JWT Sync (Bash version)
# Sincroniza automaticamente as chaves públicas do Keycloak para o Kong JWT plugin.

set -e

# Configurações
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

    # Salvar em temp
    echo "$jwks_data" > /tmp/jwks_debug.json

    # Tentar RS256/sig, senão qualquer RSA com x5c
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

    # Indentar todas as linhas da pubkey (incluindo BEGIN/END)
    pubkey_indented=$(printf '%s' "$public_key" | sed 's/^/          /')

    cat > "${KONG_CONFIG_PATH}.tmp" << EOF
_format_version: "3.0"

services:
  - name: games-service
    url: http://games:4001
    routes:
      - name: games-health
        paths: [/games/health]
        strip_path: false
      - name: games-rounds-current
        paths: [/games/rounds/current]
        strip_path: false
      - name: games-rounds-history
        paths: [/games/rounds/history]
        strip_path: false
      - name: games-rounds-verify
        paths: [/games/rounds]
        strip_path: false
      - name: games-bets-me
        paths: [/games/bets/me]
        strip_path: false
        plugins:
          - name: jwt
            config:
              key_claim_name: kid
      - name: games-bet
        paths: [/games/bet]
        strip_path: false
        plugins:
          - name: jwt
            config:
              key_claim_name: kid
      - name: games-bet-cashout
        paths: [/games/bet/cashout]
        strip_path: false
        plugins:
          - name: jwt
            config:
              key_claim_name: kid

  - name: wallets-service
    url: http://wallets:4002
    routes:
      - name: wallets-health
        paths: [/wallets/health]
        strip_path: false
      - name: wallets-me
        paths: [/wallets/me]
        strip_path: false
        plugins:
          - name: jwt
            config:
              key_claim_name: kid
      - name: wallets-create
        paths: [/wallets]
        strip_path: false
        methods: [POST]
        plugins:
          - name: jwt
            config:
              key_claim_name: kid

consumers:
  - username: keycloak-crash-game
    jwt_secrets:
      - consumer: keycloak-crash-game
        key: ${kid}
        algorithm: RS256
        rsa_public_key: |-
${pubkey_indented}
EOF

    mv "${KONG_CONFIG_PATH}.tmp" "$KONG_CONFIG_PATH"
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
