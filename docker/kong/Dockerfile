FROM kong:3.9.1

USER root
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
RUN luarocks install kong-oidc

# Patch kong-oidc for Kong 3.x compatibility (base_plugin removed in 3.x)
COPY patches/handler.lua /usr/local/share/lua/5.1/kong/plugins/oidc/handler.lua
COPY patches/schema.lua /usr/local/share/lua/5.1/kong/plugins/oidc/schema.lua

USER kong
