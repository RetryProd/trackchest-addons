# Prépare le dossier site/ : les pages du site (tout le contenu de site-src).
#
# Le catalogue (index.json, sa signature, les .zip) n'est PLUS un fichier : il est fabriqué et signé par le site
# (functions/index.json.js et consorts) à partir du dépôt GitHub. Le dossier site/ ne contient donc que les pages.
# Il est publié avec : npx wrangler pages deploy site (depuis la racine du dépôt), ou .\scripts\addon.ps1 publier.
#
# Option -Catalogue : construit AUSSI un catalogue statique (index.json + .zip) dans site/, pour des tests locaux
# ou une sauvegarde. À signer avec TrackChest.exe --addon-sign. Ne le publie pas : il masquerait le catalogue du site.
#
# Usage : ./scripts/Build-Index.ps1
#         ./scripts/Build-Index.ps1 -Catalogue -BaseUrl https://exemple.pages.dev
param([switch]$Catalogue, [string]$BaseUrl = '')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$site = Join-Path $root 'site'

& (Join-Path $PSScriptRoot 'Validate-Addon.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Des add-ons sont invalides : corrige-les avant de publier.' }

New-Item -ItemType Directory -Force $site | Out-Null
Get-ChildItem -LiteralPath $site -Filter '*.zip' | Remove-Item
Remove-Item -LiteralPath (Join-Path $site 'index.json'), (Join-Path $site 'index.json.sig') -ErrorAction SilentlyContinue

# Pages du site : tout le contenu de site-src (HTML, CSS, JavaScript, schéma) est copié à la racine du site.
Get-ChildItem -LiteralPath (Join-Path $root 'site-src') -File | Copy-Item -Destination $site -Force
if (-not $Catalogue) {
    Write-Output "Pages du site prêtes dans $site (le catalogue est fabriqué par le site à partir de GitHub)."
    return
}

$BaseUrl = $BaseUrl.TrimEnd('/')
if ($BaseUrl -notmatch '^https://') { throw 'Avec -Catalogue, BaseUrl doit commencer par https://' }
$registry = Get-Content -LiteralPath (Join-Path $root 'registry.json') -Raw | ConvertFrom-Json
$verified = @($registry.verified)
$revoked = [string[]]@($registry.revoked)

$entries = New-Object System.Collections.Generic.List[object]
foreach ($folder in Get-ChildItem -LiteralPath (Join-Path $root 'addons') -Directory) {
    $manifestPath = Join-Path $folder.FullName 'manifest.json'
    $m = [System.IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
    $zip = Join-Path $site "$($m.id)-$($m.version).zip"
    # manifest.json, icônes .png, plus script.js pour un add-on à script : rien d'autre.
    $files = @($manifestPath)
    $scriptPath = Join-Path $folder.FullName 'script.js'
    if (Test-Path -LiteralPath $scriptPath) { $files += $scriptPath }
    $iconPaths = Get-ChildItem -LiteralPath $folder.FullName -Filter '*.png' -File | Select-Object -ExpandProperty FullName
    if ($iconPaths) { $files += $iconPaths }
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
Write-Output "$($entries.Count) add-on(s) dans $site (catalogue statique de test). Signe-le avec TrackChest.exe --addon-sign."
