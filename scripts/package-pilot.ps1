$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$packageRoot = Join-Path $projectRoot ('.local/pilot-package/' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$stageRoot = Join-Path $packageRoot 'source'
New-Item -ItemType Directory -Path $stageRoot | Out-Null

# Explicit source roots keep local databases, credentials, backups and research out of the package.
$rootFiles = @(
    'Dockerfile', '.dockerignore', 'package.json', 'package-lock.json',
    'prisma.config.ts', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs',
    'eslint.config.mjs', 'vitest.config.mts', 'playwright.config.ts', 'README.md',
    '.env.example', '.gitignore', '.gitattributes', '.prettierrc.json', '.prettierignore',
    'docker-compose.yml', 'START_DEMO.cmd'
)
$sourceRoots = @('src', 'prisma', 'scripts', 'deploy/oracle', 'tests', 'docs')
$sourceFiles = @($rootFiles | ForEach-Object { Get-Item -LiteralPath (Join-Path $projectRoot $_) })
foreach ($sourceRoot in $sourceRoots) {
    $sourceFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot $sourceRoot) -File -Recurse -Force
}

$copiedFiles = 0
foreach ($sourceFile in $sourceFiles) {
    if (($sourceFile.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing linked source file: $($sourceFile.Name)"
    }
    if ($sourceFile.Name -like '.env*' -and $sourceFile.Name -notin @('.env.example', '.env.production.example')) {
        continue
    }
    if ($sourceFile.Extension -in @('.pem', '.key', '.sqlite3', '.db', '.log', '.tar', '.gz')) {
        throw "Unexpected private or generated file in source roots: $($sourceFile.Name)"
    }
    $relativePath = $sourceFile.FullName.Substring($projectRoot.Length + 1)
    $targetPath = Join-Path $stageRoot $relativePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $targetPath) -Force | Out-Null
    Copy-Item -LiteralPath $sourceFile.FullName -Destination $targetPath
    $copiedFiles++
}

$archivePath = Join-Path $packageRoot 'student-marketplace-source.tar.gz'
& tar -czf $archivePath -C $stageRoot .
if ($LASTEXITCODE -ne 0) { throw 'Source archive creation failed.' }
$entries = @(& tar -tzf $archivePath)
if ($LASTEXITCODE -ne 0) { throw 'Source archive verification failed.' }
$forbiddenEntry = $entries | Where-Object {
    $_ -match '(^|/)(\.local|\.git|node_modules|research)(/|$)' -or
    ($_ -match '(^|/)\.env[^/]*$' -and $_ -notmatch '/\.env\.(example|production\.example)$')
}
if ($forbiddenEntry) { throw 'Source archive contains a forbidden path. Do not upload it.' }

$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  student-marketplace-source.tar.gz" | Set-Content -LiteralPath ($archivePath + '.sha256') -Encoding ascii
$entries | Set-Content -LiteralPath (Join-Path $packageRoot 'archive-entries.txt') -Encoding utf8
Write-Output "Source package: $archivePath"
Write-Output "SHA256: $hash"
Write-Output "Files: $copiedFiles; archive entries: $($entries.Count)"
