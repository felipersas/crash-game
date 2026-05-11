local utils = require("kong.plugins.oidc.utils")
local filter = require("kong.plugins.oidc.filter")

local plugin = {
  PRIORITY = 1000,
  VERSION = "1.1.0",
}

function plugin:access(config)
  -- Skip CORS preflight requests
  if ngx.req.get_method() == "OPTIONS" then
    return
  end

  local oidcConfig = utils.get_options(config, ngx)

  if not filter.shouldProcessRequest(oidcConfig) then
    ngx.log(ngx.DEBUG, "OidcHandler ignoring request, path: " .. ngx.var.request_uri)
    return
  end

  if not utils.has_bearer_access_token() then
    ngx.header["WWW-Authenticate"] = 'Bearer realm="' .. (oidcConfig.realm or "kong") .. '"'
    utils.exit(ngx.HTTP_UNAUTHORIZED, "Unauthorized", ngx.HTTP_UNAUTHORIZED)
  end

  local openidc = require("resty.openidc")
  local res, err, access_token = openidc.bearer_jwt_verify(oidcConfig)

  if err then
    ngx.log(ngx.ERR, "OIDC bearer_jwt_verify error: " .. tostring(err))
    ngx.header["WWW-Authenticate"] = 'Bearer realm="' .. (oidcConfig.realm or "kong") .. '",error="' .. tostring(err) .. '"'
    utils.exit(ngx.HTTP_UNAUTHORIZED, tostring(err), ngx.HTTP_UNAUTHORIZED)
  end

  if res then
    utils.injectUser(res)
  end
end

return plugin
