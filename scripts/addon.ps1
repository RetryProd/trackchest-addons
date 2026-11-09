# La commande pour développer des add-ons TrackChest.
#
#   .\scripts\addon.ps1 nouveau mon-addon                 crée addons\mon-addon\manifest.json à remplir
#   .\scripts\addon.ps1 nouveau mon-theme -Type theme     idem, avec un modèle de thème
#   .\scripts\addon.ps1 verifier [mon-addon]              contrôle un add-on (ou tous)
#   .\scripts\addon.ps1 empaqueter mon-addon              crée dist\mon-addon-1.0.0.zip, à essayer dans TrackChest
#   .\scripts\addon.ps1 publier                           (mainteneur) construit, signe et publie le catalogue
#   .\scripts\addon.ps1 aide
#
# Pour proposer un add-on aux autres joueurs : https://trackchest-addons.pages.dev/ (bouton « Proposer sur GitHub »).
param(
    [Parameter(Position = 0)][string]$Commande = 'aide',
    [Parameter(Position = 1)][string]$Id,
    [ValidateSet('compteur', 'theme')][string]$Type = 'compteur',
    # Pour « empaqueter » et « publier » : chemin de TrackChest.exe (sinon cherché dans le PATH).
    [string]$Exe,
    # Pour « publier » : clé privée de signature, adresse du site et nom du projet Cloudflare Pages.
    [string]$Cle = (Join-Path $env:USERPROFILE 'TrackChest-cles\addon-private.key'),
    [string]$BaseUrl = 'https://trackchest-addons.pages.dev',
    [string]$Projet = 'trackchest-addons',
    [switch]$Oui
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Show-Help {
    Write-Output @'
Commandes :
  nouveau <id> [-Type compteur|theme]                      crée un add-on à partir d'un modèle
  verifier [<id>]                                            contrôle un add-on (ou tous)
  empaqueter <id> [-Exe chemin\TrackChest.exe]               crée dist\<id>-<version>.zip pour l'essayer
  publier [-Exe ...] [-Cle ...] [-Oui]                       (mainteneur) catalogue : construire, signer, publier

Pour essayer un add-on : empaqueter, puis dans TrackChest : Add-on > Ajouter un fichier...
Pour le proposer aux autres joueurs : https://trackchest-addons.pages.dev/ (bouton « Proposer sur GitHub »).
'@
}

function Assert-Id([string]$value) {
    if ($value -cnotmatch '^[a-z0-9]+(-[a-z0-9]+)*$' -or $value.Length -lt 3 -or $value.Length -gt 40) {
        throw "id invalide : '$value'. Utilise 3 à 40 caractères : minuscules, chiffres et tirets (ex. mon-addon)."
    }
}

function Find-Exe {
    if ($Exe) {
        if (-not (Test-Path -LiteralPath $Exe)) { throw "TrackChest.exe introuvable : $Exe" }
        return (Resolve-Path -LiteralPath $Exe).Path
    }
    $found = Get-Command 'TrackChest.exe' -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    return $null
}

function Invoke-Exe([string]$exePath, [string[]]$arguments) {
    # TrackChest.exe est une application Windows : on attend sa fin et on lit sa sortie.
    $out = [System.IO.Path]::GetTempFileName()
    $err = [System.IO.Path]::GetTempFileName()
    try {
        $p = Start-Process -FilePath $exePath -ArgumentList $arguments -Wait -PassThru -NoNewWindow -RedirectStandardOutput $out -RedirectStandardError $err
        $text = ([System.IO.File]::ReadAllText($out, $utf8) + [System.IO.File]::ReadAllText($err, $utf8)).Trim()
        return [pscustomobject]@{ Code = $p.ExitCode; Text = $text }
    }
    finally { Remove-Item -LiteralPath $out, $err -ErrorAction SilentlyContinue }
}

function New-Manifest([string]$id, [string]$kind) {
    $name = (Get-Culture).TextInfo.ToTitleCase(($id -replace '-', ' '))
    if ($kind -eq 'theme') {
@"
{
  "schema": 1,
  "id": "$id",
  "name": "$name",
  "version": "1.0.0",
  "description": "Décris ton thème en une phrase.",
  "permissions": ["overlay.theme"],
  "theme": {
    "background": "#0B0A1A",
    "border": "#2A2550",
    "line": "#1C1936",
    "muted": "#9A97C4",
    "text": "#F4F3FF",
    "accent": "#8B7CFF",
    "treasure": "#FFB454"
  }
}
"@
    }
    else {
@"
{
  "schema": 1,
  "id": "$id",
  "name": "$name",
  "version": "1.0.0",
  "description": "Décris ton add-on en une phrase.",
  "permissions": ["stats.read", "overlay.rows"],
  "counters": [
    { "label": "Coffres session", "metric": "chests", "scope": "session", "showLast": false }
  ]
}
"@
    }
}

switch ($Commande.ToLowerInvariant()) {
    'nouveau' {
        if (-not $Id) { throw 'Donne un identifiant : .\scripts\addon.ps1 nouveau mon-addon' }
        Assert-Id $Id
        $folder = Join-Path $root "addons\$Id"
        if (Test-Path -LiteralPath $folder) { throw "addons\$Id existe déjà." }
        New-Item -ItemType Directory -Path $folder | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $folder 'manifest.json'), (New-Manifest $Id $Type), $utf8)
        Write-Output "Créé : addons\$Id\manifest.json"
        Write-Output ''
        Write-Output '1. Ouvre ce fichier, change name, description et le contenu (référence : https://trackchest-addons.pages.dev/).'
        Write-Output "2. .\scripts\addon.ps1 verifier $Id"
        Write-Output "3. .\scripts\addon.ps1 empaqueter $Id   puis TrackChest : Add-on > Ajouter un fichier..."
        Write-Output '4. Pour le proposer aux autres joueurs : https://trackchest-addons.pages.dev/ (bouton « Proposer sur GitHub »).'
    }
    'verifier' {
        $parametres = @{}
        if ($Id) { Assert-Id $Id; $parametres['Id'] = $Id }
        & (Join-Path $PSScriptRoot 'Validate-Addon.ps1') @parametres
        exit $LASTEXITCODE
    }
    'empaqueter' {
        if (-not $Id) { throw 'Donne un identifiant : .\scripts\addon.ps1 empaqueter mon-addon' }
        Assert-Id $Id
        & (Join-Path $PSScriptRoot 'Validate-Addon.ps1') -Id $Id
        if ($LASTEXITCODE -ne 0) { throw "Corrige d'abord les erreurs de $Id." }
        $manifestPath = Join-Path $root "addons\$Id\manifest.json"
        $manifest = [System.IO.File]::ReadAllText($manifestPath, $utf8) | ConvertFrom-Json
        $dist = Join-Path $root 'dist'
        New-Item -ItemType Directory -Force $dist | Out-Null
        $zip = Join-Path $dist "$($manifest.id)-$($manifest.version).zip"
        if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip }
        Compress-Archive -LiteralPath $manifestPath -DestinationPath $zip   # exactement un fichier : manifest.json
        Write-Output "Paquet : $zip"
        $exePath = Find-Exe
        if ($exePath) {
            $check = Invoke-Exe $exePath @('--addon-check', $zip)
            Write-Output "TrackChest : $($check.Text)"
            if ($check.Code -ne 0) { exit 1 }
        }
        else { Write-Output "(TrackChest.exe introuvable : le contrôle final aura lieu à l'installation. Option -Exe pour l'indiquer.)" }
        Write-Output "Essaie-le : TrackChest > Add-on > Ajouter un fichier... > $zip"
    }
    'publier' {
        & (Join-Path $PSScriptRoot 'Validate-Addon.ps1')
        if ($LASTEXITCODE -ne 0) { throw 'Des add-ons sont invalides : corrige-les avant de publier.' }
        $exePath = Find-Exe
        if (-not $exePath) { throw 'TrackChest.exe est nécessaire pour signer : utilise -Exe chemin\TrackChest.exe' }
        if (-not (Test-Path -LiteralPath $Cle)) { throw "Clé privée introuvable : $Cle (option -Cle)." }
        if (-not $Oui) {
            $reponse = Read-Host "Publier le catalogue sur $BaseUrl (projet Cloudflare $Projet) ? (o/N)"
            if ($reponse -notmatch '^(o|oui|y|yes)$') { Write-Output 'Annulé.'; exit 0 }
        }
        & (Join-Path $PSScriptRoot 'Build-Index.ps1') -BaseUrl $BaseUrl
        $sign = Invoke-Exe $exePath @('--addon-sign', (Join-Path $root 'site\index.json'), $Cle)
        Write-Output $sign.Text
        if ($sign.Code -ne 0) { exit 1 }
        $verify = Invoke-Exe $exePath @('--addon-verify', (Join-Path $root 'site\index.json'), ($Cle -replace 'addon-private\.key$', 'addon-public.key'))
        Write-Output $verify.Text
        if ($verify.Code -ne 0) { exit 1 }
        Push-Location $root
        try { npx --yes wrangler pages deploy site --project-name $Projet --branch production }
        finally { Pop-Location }
    }
    default { Show-Help }
}
