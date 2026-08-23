[CmdletBinding()]
param(
    [switch]$Apply
)

$ErrorActionPreference = "Stop"
$rulesDirectory = $PSScriptRoot
$ruleFiles = @(
    "custom-firewall.ruleset.json",
    "rate-limits.ruleset.json",
    "managed-waf.ruleset.json"
)

function Get-DesiredRuleset([string]$fileName) {
    $path = Join-Path $rulesDirectory $fileName
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing ruleset file: $path"
    }
    return Get-Content -Raw -LiteralPath $path | ConvertFrom-Json
}

function Get-StatusCode($errorRecord) {
    try {
        return [int]$errorRecord.Exception.Response.StatusCode
    } catch {
        return 0
    }
}

$desiredRulesets = $ruleFiles | ForEach-Object { Get-DesiredRuleset $_ }

if (-not $Apply) {
    Write-Host "Dry run only. No Cloudflare configuration was changed."
    foreach ($ruleset in $desiredRulesets) {
        Write-Host ("- {0}: {1} rule(s), phase {2}" -f $ruleset.name, $ruleset.rules.Count, $ruleset.phase)
    }
    Write-Host "Run this script with -Apply after reviewing the rules and setting CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN."
    exit 0
}

$zoneId = $env:CLOUDFLARE_ZONE_ID
$apiToken = $env:CLOUDFLARE_API_TOKEN
if ([string]::IsNullOrWhiteSpace($zoneId) -or [string]::IsNullOrWhiteSpace($apiToken)) {
    throw "CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN are required when -Apply is used."
}

$apiBase = "https://api.cloudflare.com/client/v4/zones/$zoneId/rulesets"
$headers = @{
    Authorization = "Bearer $apiToken"
    "Content-Type" = "application/json"
}

foreach ($desired in $desiredRulesets) {
    $entrypointUrl = "$apiBase/phases/$($desired.phase)/entrypoint"
    $existing = $null

    try {
        $existingResponse = Invoke-RestMethod -Method Get -Uri $entrypointUrl -Headers $headers
        if (-not $existingResponse.success) {
            throw "Cloudflare did not return a successful response for phase $($desired.phase)."
        }
        $existing = $existingResponse.result
    } catch {
        if ((Get-StatusCode $_) -ne 404) { throw }
    }

    if ($existing) {
        $desiredIds = @(
            $desired.rules |
                ForEach-Object { $_.action_parameters.id } |
                Where-Object { $_ }
        )
        $preservedRules = @(
            $existing.rules | Where-Object {
                $description = [string]$_.description
                $ruleId = $_.action_parameters.id
                -not $description.StartsWith("[Syn4pseOps]") -and
                    (-not $ruleId -or $desiredIds -notcontains $ruleId)
            }
        )
        $desired.rules = @($preservedRules) + @($desired.rules)
        $payload = $desired | ConvertTo-Json -Depth 20
        $response = Invoke-RestMethod -Method Put -Uri "$apiBase/$($existing.id)" -Headers $headers -Body $payload
    } else {
        $payload = $desired | ConvertTo-Json -Depth 20
        $response = Invoke-RestMethod -Method Post -Uri $apiBase -Headers $headers -Body $payload
    }

    if (-not $response.success) {
        throw "Failed to apply Cloudflare ruleset for phase $($desired.phase)."
    }
    Write-Host ("Applied {0} ({1})" -f $desired.name, $response.result.id)
}
