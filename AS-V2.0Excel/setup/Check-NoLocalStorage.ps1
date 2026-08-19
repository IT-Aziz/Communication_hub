<#
.SYNOPSIS
    Fails if anything in the project has started storing data on the user's device.

.DESCRIPTION
    SharePoint is the only place this application keeps anything. Nothing persistent is written
    to the machine the browser runs on - no files, no browser storage, no local backup, no
    downloaded copy of a SharePoint file.

    That property is easy to state and easy to lose: one convenience cache added months from now
    ("just remember the last category the user opened") quietly creates a second source of truth,
    and the bug it eventually causes - one user seeing stale data nobody else sees - is
    miserable to track down. So it's checked mechanically rather than trusted.

    Run this after any change to assets\. It exits 1 if it finds anything, so it also works as a
    build gate if this ever goes into a pipeline.

.EXAMPLE
    ./Check-NoLocalStorage.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

# Each rule: the pattern to look for, and why it's disallowed. Word boundaries keep these from
# matching an innocent substring inside a longer identifier.
$rules = @(
    @{ Pattern = '\blocalStorage\b';           Reason = "persists across sessions on the device" }
    @{ Pattern = '\bsessionStorage\b';         Reason = "persists application data outside SharePoint" }
    @{ Pattern = '\bindexedDB\b';              Reason = "an on-device database" }
    @{ Pattern = '\bopenDatabase\b';           Reason = "legacy on-device database" }
    @{ Pattern = '\bcaches\s*\.';              Reason = "CacheStorage as a data source" }
    @{ Pattern = '\bdocument\.cookie\b';       Reason = "stores data on the device" }
    @{ Pattern = '\bshowSaveFilePicker\b';     Reason = "writes a file to the device" }
    @{ Pattern = '\bshowDirectoryPicker\b';    Reason = "writes files to the device" }
    @{ Pattern = '\bcreateWritable\b';         Reason = "writes a file to the device" }
    @{ Pattern = '\bcreateObjectURL\b';        Reason = "usually paired with a download" }
    @{ Pattern = '\bmsSaveBlob\b';             Reason = "writes a file to the device" }
    @{ Pattern = 'download\s*=';               Reason = "an anchor that saves a file to the device" }
    @{ Pattern = '\bserviceWorker\b';          Reason = "offline caching would become a second source of truth" }
)

# Only the shipped application is checked. setup\ is admin tooling that runs on an admin's own
# machine on purpose - and this file necessarily contains every banned word in the list.
$files = Get-ChildItem -Path $projectRoot -Recurse -File -Include *.js, *.html, *.css |
    Where-Object { $_.FullName -notlike "*\setup\*" }

Write-Host "Scanning $($files.Count) application files for on-device storage…`n" -ForegroundColor Cyan

$findings = @()
foreach ($file in $files) {
    $lines = Get-Content $file.FullName
    for ($i = 0; $i -lt $lines.Count; $i++) {
        foreach ($rule in $rules) {
            if ($lines[$i] -match $rule.Pattern) {
                $findings += [pscustomobject]@{
                    File   = $file.FullName.Substring($projectRoot.Length + 1)
                    Line   = $i + 1
                    Match  = $Matches[0]
                    Reason = $rule.Reason
                    Text   = $lines[$i].Trim()
                }
            }
        }
    }
}

if ($findings.Count -eq 0) {
    Write-Host "PASS - no on-device storage anywhere in the application." -ForegroundColor Green
    Write-Host "SharePoint remains the only place data is kept." -ForegroundColor Green
    exit 0
}

Write-Host "FAIL - found $($findings.Count) place(s) storing data on the device:`n" -ForegroundColor Red
foreach ($f in $findings) {
    Write-Host "  $($f.File):$($f.Line)" -ForegroundColor Yellow
    Write-Host "    $($f.Match) - $($f.Reason)" -ForegroundColor Red
    Write-Host "    $($f.Text)" -ForegroundColor DarkGray
}
Write-Host "`nMove whatever this is into SharePoint, or hold it in a plain variable if it only" -ForegroundColor Yellow
Write-Host "needs to live as long as the page does." -ForegroundColor Yellow
exit 1
