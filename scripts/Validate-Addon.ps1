# Contrôles automatiques d'un dépôt d'add-ons TrackChest (mêmes règles que l'application, qui les revérifie à l'installation).
# Usage : ./scripts/Validate-Addon.ps1            (tous les add-ons du dossier addons)
#         ./scripts/Validate-Addon.ps1 -Id theme-nuit
param([string]$Id)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$allPermissions = 'stats.read', 'overlay.rows', 'overlay.theme', 'overlay.script'
$metrics = 'chests', 'opened', 'destroyed', 'sprites', 'wanted', 'cannons', 'treasures', 'matches'
$scopes = 'total', 'last', 'session'
$manifestKeys = 'schema', 'id', 'name', 'version', 'description', 'permissions', 'counters', 'theme'
$counterKeys = 'label', 'metric', 'scope', 'showLast'
$themeKeys = 'background', 'border', 'line', 'muted', 'text', 'accent', 'treasure'

function Test-Text($value, [int]$min, [int]$max) {
    if ($null -eq $value -or $value -isnot [string]) { return $false }
    if ($value.Length -lt $min -or $value.Length -gt $max) { return $false }
    return -not ($value.ToCharArray() | Where-Object { [char]::IsControl($_) })
}

function Get-Errors([string]$folder) {
    $errors = New-Object System.Collections.Generic.List[string]
    $file = Join-Path $folder 'manifest.json'
    if (-not (Test-Path -LiteralPath $file)) { $errors.Add('manifest.json absent.'); return $errors }

    # Un dossier d'add-on contient le manifeste, script.js pour un add-on à script, et un README pour les humains.
    foreach ($other in Get-ChildItem -LiteralPath $folder -Force | Where-Object { $_.Name -notin 'manifest.json', 'README.md', 'script.js' }) {
        $errors.Add("fichier interdit : $($other.Name)")
    }

    $bytes = [System.IO.File]::ReadAllBytes($file)
    if ($bytes.Length -gt 16384) { $errors.Add('manifest.json dépasse 16 Ko.') }
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $errors.Add('manifest.json ne doit pas avoir de BOM (enregistre en UTF-8 sans BOM).')
    }
    try { $m = [System.Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json }
    catch { $errors.Add("JSON invalide : $($_.Exception.Message)"); return $errors }

    foreach ($key in $m.PSObject.Properties.Name) { if ($key -cnotin $manifestKeys) { $errors.Add("clé inconnue : $key") } }
    if ($m.schema -ne 1) { $errors.Add('schema doit valoir 1.') }
    if ($m.id -isnot [string] -or $m.id -cnotmatch '^[a-z0-9]+(-[a-z0-9]+)*$' -or $m.id.Length -lt 3 -or $m.id.Length -gt 40) { $errors.Add('id invalide.') }
    elseif ($m.id -ne (Split-Path -Leaf $folder)) { $errors.Add('le nom du dossier doit être égal à id.') }
    if (-not (Test-Text $m.name 1 40)) { $errors.Add('name invalide (1 à 40 caractères).') }
    if ($m.version -isnot [string] -or $m.version -notmatch '^\d{1,4}\.\d{1,4}\.\d{1,4}$') { $errors.Add('version invalide (1.0.0).') }
    if (-not (Test-Text $m.description 0 200)) { $errors.Add('description invalide (200 caractères maximum).') }

    $permissions = @($m.permissions)
    foreach ($p in $permissions) { if ($p -cnotin $allPermissions) { $errors.Add("permission inconnue : $p") } }
    if (($permissions | Select-Object -Unique).Count -ne $permissions.Count) { $errors.Add('permission en double.') }

    $counters = @($m.counters | Where-Object { $null -ne $_ })
    if ($counters.Count -gt 8) { $errors.Add('8 compteurs au maximum.') }
    foreach ($c in $counters) {
        foreach ($key in $c.PSObject.Properties.Name) { if ($key -cnotin $counterKeys) { $errors.Add("clé de compteur inconnue : $key") } }
        if (-not (Test-Text $c.label 1 24)) { $errors.Add('label de compteur invalide (1 à 24 caractères).') }
        if ($c.metric -cnotin $metrics) { $errors.Add("metric inconnue : $($c.metric)") }
        if ($c.scope -cnotin $scopes) { $errors.Add("scope inconnu : $($c.scope)") }
        if ($null -ne $c.showLast -and $c.showLast -isnot [bool]) { $errors.Add('showLast doit être true ou false.') }
    }
    if ($counters.Count -gt 0 -and -not (($permissions -ccontains 'stats.read') -and ($permissions -ccontains 'overlay.rows'))) {
        $errors.Add('les compteurs demandent stats.read et overlay.rows.')
    }
    $script = $permissions -ccontains 'overlay.script'
    if ($counters.Count -eq 0 -and $permissions -ccontains 'overlay.rows') { $errors.Add('permission overlay.rows sans compteur.') }
    if ($counters.Count -eq 0 -and -not $script -and $permissions -ccontains 'stats.read') { $errors.Add('permission stats.read sans compteur ni script.') }

    # Script : script.js (32 Ko maximum, UTF-8 sans BOM), avec les permissions overlay.script et stats.read.
    # Sa syntaxe et sa fonction overlay() sont contrôlées par TrackChest (addon.ps1 empaqueter -Exe, ou --addon-check).
    $scriptFile = Join-Path $folder 'script.js'
    $hasFile = Test-Path -LiteralPath $scriptFile
    if ($script -and -not $hasFile) { $errors.Add('la permission overlay.script demande un fichier script.js.') }
    if ($hasFile -and -not $script) { $errors.Add('script.js demande la permission overlay.script.') }
    if ($script -and $permissions -cnotcontains 'stats.read') { $errors.Add('le script demande aussi la permission stats.read.') }
    if ($hasFile) {
        $code = [System.IO.File]::ReadAllBytes($scriptFile)
        if ($code.Length -gt 32768) { $errors.Add('script.js dépasse 32 Ko.') }
        if ($code.Length -ge 3 -and $code[0] -eq 0xEF -and $code[1] -eq 0xBB -and $code[2] -eq 0xBF) { $errors.Add('script.js ne doit pas avoir de BOM.') }
        if ([System.Text.Encoding]::UTF8.GetString($code) -notmatch '\boverlay\b') { $errors.Add('script.js doit définir une fonction overlay(view, data).') }
    }

    if ($null -ne $m.theme) {
        if ($permissions -cnotcontains 'overlay.theme') { $errors.Add('le thème demande overlay.theme.') }
        $names = @($m.theme.PSObject.Properties.Name)
        if ($names.Count -eq 0) { $errors.Add('le thème est vide.') }
        foreach ($key in $names) {
            if ($key -cnotin $themeKeys) { $errors.Add("couleur inconnue : $key") }
            elseif ($m.theme.$key -isnot [string] -or $m.theme.$key -notmatch '^#[0-9A-Fa-f]{6}$') { $errors.Add("couleur invalide pour $key (format #RRGGBB).") }
        }
    }
    elseif ($permissions -ccontains 'overlay.theme') { $errors.Add('permission overlay.theme sans thème.') }
    if ($counters.Count -eq 0 -and $null -eq $m.theme -and -not $script) { $errors.Add('ni compteur, ni thème, ni script.') }
    return $errors
}

$folders = Get-ChildItem -LiteralPath (Join-Path $root 'addons') -Directory
if ($Id) { $folders = $folders | Where-Object Name -eq $Id }
if (-not $folders) { throw 'Aucun add-on à vérifier.' }

$failed = 0
foreach ($folder in $folders) {
    $errors = Get-Errors $folder.FullName
    if ($errors.Count -eq 0) { Write-Output "OK      $($folder.Name)" }
    else { $failed++; Write-Output "ERREUR  $($folder.Name)"; $errors | ForEach-Object { Write-Output "          - $_" } }
}
if ($failed -gt 0) { exit 1 }
exit 0
