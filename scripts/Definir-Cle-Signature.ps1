# Enregistre ta clé privée de signature (SIGNING_KEY) dans les secrets Cloudflare du site.
# La clé est lue dans addon-private.key et envoyée directement à Cloudflare : elle n'est ni affichée ni copiée ailleurs.
#
# Usage : powershell -ExecutionPolicy Bypass -File .\scripts\Definir-Cle-Signature.ps1
#         (option -Cle pour un autre fichier, -Projet pour un autre projet Cloudflare Pages)
param(
    [string]$Cle = (Join-Path $env:USERPROFILE 'TrackChest-cles\addon-private.key'),
    [string]$Projet = 'trackchest-addons'
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Cle)) { throw "Clé privée introuvable : $Cle" }
$contenu = (Get-Content -LiteralPath $Cle -Raw).Trim()
if ($contenu.Length -lt 100) { throw 'Ce fichier ne ressemble pas à une clé privée (trop court).' }

Write-Output "Envoi de la clé vers le projet Cloudflare '$Projet'…"
$contenu | & npx.cmd --yes wrangler pages secret put SIGNING_KEY --project-name $Projet
if ($LASTEXITCODE -ne 0) { throw "L'envoi a échoué (code $LASTEXITCODE)." }

$ErrorActionPreference = 'Continue'
$liste = (& npx.cmd --yes wrangler pages secret list --project-name $Projet 2>&1 | Out-String)
if ($liste -match 'SIGNING_KEY') { Write-Output 'OK : SIGNING_KEY est enregistré.' }
else { throw 'SIGNING_KEY n''apparaît pas dans la liste des secrets.' }
