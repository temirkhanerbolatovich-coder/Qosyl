$ErrorActionPreference = 'Stop'
$projectParent = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$report = Join-Path $projectParent 'Qosyl/11_Reports/Audit_Reports'
$approved = Get-Content -LiteralPath (Join-Path $report 'approved-duplicate-deletions.json') -Raw | ConvertFrom-Json
$completed = [System.Collections.Generic.List[object]]::new()
try {
    foreach ($entry in $approved) {
        $source = [IO.Path]::GetFullPath((Join-Path $projectParent $entry.old))
        $copyRoot = Join-Path $projectParent 'Qosyl/01_sources/research/'
        $oldPdf = Join-Path $projectParent 'опросник.pdf'
        if (-not ($source.StartsWith($copyRoot, [StringComparison]::OrdinalIgnoreCase) -or $source -eq $oldPdf)) { throw "Outside approved duplicate locations: $source" }
        if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Hash changed: $source" }
        Remove-Item -LiteralPath $source -Force
        $completed.Add($entry)
    }
} finally {
    ConvertTo-Json -InputObject @($completed) -Depth 5 | Set-Content -LiteralPath (Join-Path $report 'deletion-log.json') -Encoding utf8
}
# Prune only empty directories in the retired document containers; never follow junctions.
foreach ($relative in @('Qosyl/01_sources', 'Qosyl/03_product')) {
    $retired = [IO.Path]::GetFullPath((Join-Path $projectParent $relative))
    if (-not $retired.StartsWith((Join-Path $projectParent 'Qosyl/'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid retired path' }
    if (Test-Path -LiteralPath $retired) {
        Get-ChildItem -LiteralPath $retired -Directory -Recurse -Force | Sort-Object FullName -Descending | ForEach-Object {
            if (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -and @(Get-ChildItem -LiteralPath $_.FullName -Force).Count -eq 0) { Remove-Item -LiteralPath $_.FullName -Force }
        }
        if (@(Get-ChildItem -LiteralPath $retired -Force).Count -eq 0) { Remove-Item -LiteralPath $retired -Force }
    }
}
Write-Output "Deleted verified duplicate files: $($completed.Count)"
