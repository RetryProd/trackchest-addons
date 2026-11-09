# Construit le dossier site/ : un .zip par add-on + index.json (le catalogue). Il reste à le SIGNER :
#   TrackChest.exe --addon-sign site\index.json addon-private.key
# Publie ensuite tout le dossier site/ (GitHub Pages ou Cloudflare Pages, gratuits).
#
# Usage : ./scripts/Build-Index.ps1 -BaseUrl https://mon-catalogue.pages.dev
# Les pages (catalogue, créer, poster), leurs fichiers communs et la fonction functions/api/proposer.js
# (envoi d'un add-on sans compte) sont publiés avec : npx wrangler pages deploy site (depuis la racine du dépôt).
param([Parameter(Mandatory)][string]$BaseUrl)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$site = Join-Path $root 'site'
$BaseUrl = $BaseUrl.TrimEnd('/')
if ($BaseUrl -notmatch '^https://') { throw 'BaseUrl doit commencer par https://' }

& (Join-Path $PSScriptRoot 'Validate-Addon.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Des add-ons sont invalides : corrige-les avant de publier.' }

$registry = Get-Content -LiteralPath (Join-Path $root 'registry.json') -Raw | ConvertFrom-Json
$verified = @($registry.verified)
$revoked = [string[]]@($registry.revoked)

New-Item -ItemType Directory -Force $site | Out-Null
Get-ChildItem -LiteralPath $site -Filter '*.zip' | Remove-Item
Remove-Item -LiteralPath (Join-Path $site 'index.json'), (Join-Path $site 'index.json.sig') -ErrorAction SilentlyContinue

# Pages du site : tout le contenu de site-src (HTML, CSS, JavaScript, schéma) est copié à la racine du site.
Get-ChildItem -LiteralPath (Join-Path $root 'site-src') -File | Copy-Item -Destination $site -Force

$entries = New-Object System.Collections.Generic.List[object]
foreach ($folder in Get-ChildItem -LiteralPath (Join-Path $root 'addons') -Directory) {
    $manifestPath = Join-Path $folder.FullName 'manifest.json'
    $m = [System.IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
    $zip = Join-Path $site "$($m.id)-$($m.version).zip"
    # manifest.json, plus script.js pour un add-on à script : rien d'autre.
    $files = @($manifestPath)
    $scriptPath = Join-Path $folder.FullName 'script.js'
    if (Test-Path -LiteralPath $scriptPath) { $files += $scriptPath }
    Compress-Archive -LiteralPath $files -DestinationPath $zip
    $info = Get-Item -LiteralPath $zip
    $entries.Add([ordered]@{
        id          = [string]$m.id
        name        = [string]$m.name
        version     = [string]$m.version
        description = [string]$m.description
        permissions = [string[]]@($m.permissions)
        tier        = $(if ($verified -contains $m.id) { 'verified' } else { 'community' })
        url         = "$BaseUrl/$($info.Name)"
        sha256      = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
        size        = [int]$info.Length
    })
}

$index = [ordered]@{
    version    = 1
    updatedUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    addons     = $entries.ToArray()
    revoked    = $revoked
}
$json = ConvertTo-Json -InputObject $index -Depth 6
[System.IO.File]::WriteAllText((Join-Path $site 'index.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "$($entries.Count) add-on(s) dans $site. Signe maintenant site\index.json avec TrackChest.exe --addon-sign."
