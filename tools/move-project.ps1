$ErrorActionPreference = 'Stop'
$projectParent = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$projectRoot = Join-Path $projectParent 'Qosyl'
function Move-Checked([string]$sourceRelative, [string]$targetRelative) {
    $source = [IO.Path]::GetFullPath((Join-Path $projectParent $sourceRelative))
    $target = [IO.Path]::GetFullPath((Join-Path $projectParent $targetRelative))
    foreach ($path in @($source, $target)) {
        if (-not $path.StartsWith($projectParent + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Outside workspace: $path" }
    }
    if (-not (Test-Path -LiteralPath $source)) { throw "Missing source: $sourceRelative" }
    if (Test-Path -LiteralPath $target) { throw "Destination exists: $targetRelative" }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    # Atomic directory rename preserves junctions; recursive Move-Item can traverse them.
    if ((Get-Item -LiteralPath $source -Force).PSIsContainer) {
        [IO.Directory]::Move($source, $target)
    } else {
        [IO.File]::Move($source, $target)
    }
}
Move-Checked 'Qosyl/README.md' 'Qosyl/99_Archive/2026-10-25-reorganization/audit-package-README.md'
Move-Checked 'Qosyl/.gitignore' 'Qosyl/99_Archive/2026-10-25-reorganization/audit-package.gitignore'
Move-Checked 'Qosyl/01_sources/attachments' 'Qosyl/02_Research/Inputs'
Move-Checked 'Qosyl/02_evidence' 'Qosyl/02_Research/Analysis'
Move-Checked 'Qosyl/05_delivery' 'Qosyl/01_Project_Overview/Roadmap'
Move-Checked 'Qosyl/04_audit' 'Qosyl/11_Reports/Audit_Reports/initial-audit'
Move-Checked 'Qosyl/03_product/vision.md' 'Qosyl/01_Project_Overview/vision.md'
Move-Checked 'Qosyl/03_product/requirements.md' 'Qosyl/03_Product_Requirements/requirements.md'
Move-Checked 'Qosyl/03_product/aggregator.md' 'Qosyl/05_Modules/Opportunity_Content_Aggregator/specification.md'
Move-Checked 'research' 'Qosyl/02_Research/Corpus'
Move-Checked 'docs' 'Qosyl/docs'
Move-Checked 'README.md' 'Qosyl/docs/development-guide.md'
$remaining = Get-ChildItem -LiteralPath $projectParent -Force | Where-Object { $_.Name -notin @('Qosyl', 'опросник.pdf', '.git') }
foreach ($entry in $remaining) { Move-Checked $entry.Name ('Qosyl/' + $entry.Name) }
Move-Checked '.git' 'Qosyl/.git'
Write-Output 'Relocation complete. Duplicate files retained until reference repair and hash verification.'
