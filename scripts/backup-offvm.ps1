#requires -Version 7.0
[CmdletBinding()]
param(
    [switch]$SelfTest,
    [string]$SshKey = (Join-Path $env:USERPROFILE '.ssh/assetguard_oracle_deploy'),
    [string]$PgRestore = 'C:/Program Files/PostgreSQL/18/bin/pg_restore.exe'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw 'This backup uses Windows DPAPI CurrentUser and NTFS permissions.' }

$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$backupRoot = Join-Path $projectRoot '.local/offvm-backups'
$runDirectory = Join-Path $backupRoot ((Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
$maxArchiveBytes = 256MB
$principal = [Security.Principal.WindowsIdentity]::GetCurrent().User
$systemPrincipal = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$ssh = (Get-Command ssh.exe -CommandType Application).Source
$phase = 'initializing'
$plainFile = $null
$decryptedFile = $null

function Assert-LocalBackupPath([string]$Path) {
    $resolved = [IO.Path]::GetFullPath($Path)
    $prefix = [IO.Path]::GetFullPath($runDirectory) + [IO.Path]::DirectorySeparatorChar
    if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Backup path escaped the new task directory.'
    }
    $current = [IO.DirectoryInfo]::new((Split-Path -Parent $resolved))
    while ($null -ne $current -and $current.FullName.Length -ge $projectRoot.Length) {
        if ($current.Exists -and ($current.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Linked backup directories are not supported.'
        }
        if ($current.FullName -eq $projectRoot) { break }
        $current = $current.Parent
    }
    return $resolved
}

function Set-PrivateDirectory([string]$Path) {
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetOwner($principal)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($identity in @($principal, $systemPrincipal)) {
        $rule = [Security.AccessControl.FileSystemAccessRule]::new(
            $identity, [Security.AccessControl.FileSystemRights]::FullControl,
            [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',
            [Security.AccessControl.PropagationFlags]::None,
            [Security.AccessControl.AccessControlType]::Allow
        )
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
    $observed = Get-Acl -LiteralPath $Path
    $rules = @($observed.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    if (-not $observed.AreAccessRulesProtected -or $rules.Count -ne 2) {
        throw 'Private directory ACL verification failed.'
    }
    foreach ($rule in $rules) {
        if ($rule.IdentityReference.Value -notin @($principal.Value, $systemPrincipal.Value) -or
            $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) {
            throw 'Unexpected principal in private backup ACL.'
        }
    }
}

function New-HiddenProcess([string]$Executable, [string[]]$Arguments) {
    $start = [Diagnostics.ProcessStartInfo]::new($Executable)
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in $Arguments) { $start.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    if (-not $process.Start()) { throw 'Could not start backup helper.' }
    return $process
}

function Invoke-CheckedProcess([string]$Executable, [string[]]$Arguments, [byte[]]$InputBytes = @()) {
    $process = New-HiddenProcess $Executable $Arguments
    try {
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if ($InputBytes.Length) { $process.StandardInput.BaseStream.Write($InputBytes) }
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(120000)) { throw 'Backup helper timed out.' }
        $text = $stdout.GetAwaiter().GetResult()
        $null = $stderr.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) { throw 'Backup helper failed; private output withheld.' }
        if ($text.Length -gt 1MB) { throw 'Unexpectedly large backup helper response.' }
        return $text
    }
    finally {
        if (-not $process.HasExited) { $process.Kill($true); $process.WaitForExit() }
        $process.Dispose()
    }
}

function Get-BytesHash([byte[]]$Bytes) {
    return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes)).ToLowerInvariant()
}

function Test-Dpapi([byte[]]$Bytes, [string]$Destination) {
    $Destination = Assert-LocalBackupPath $Destination
    $encrypted = [Security.Cryptography.ProtectedData]::Protect($Bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [IO.File]::WriteAllBytes($Destination, $encrypted)
    $restored = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($Destination), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    if ((Get-BytesHash $restored) -ne (Get-BytesHash $Bytes)) { throw 'DPAPI round-trip hash mismatch.' }
    return ,$restored
}

try {
    $null = Assert-LocalBackupPath (Join-Path $runDirectory 'path-check')
    if (Test-Path -LiteralPath $runDirectory) { throw 'Refusing to reuse an existing backup directory.' }
    New-Item -ItemType Directory -Path $runDirectory | Out-Null
    Set-PrivateDirectory $runDirectory
    $phase = 'dpapi-self-test'
    $synthetic = [Text.Encoding]::UTF8.GetBytes('Qosyl synthetic DPAPI CurrentUser verification')
    $null = Test-Dpapi $synthetic (Join-Path $runDirectory 'self-test.dpapi')
    if ($SelfTest) {
        [ordered]@{ checkedAt = [DateTime]::UtcNow.ToString('o'); mode = 'synthetic'; dpapiScope = 'CurrentUser'; roundTripVerified = $true; privateAclVerified = $true } |
            ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runDirectory 'verification.json') -Encoding utf8NoBOM
        Write-Output "Synthetic DPAPI and private ACL check passed: $runDirectory"
        exit 0
    }

    if (-not (Test-Path -LiteralPath $SshKey -PathType Leaf) -or -not (Test-Path -LiteralPath $PgRestore -PathType Leaf)) {
        throw 'The SSH key and PostgreSQL 18 pg_restore must exist locally.'
    }
    $sshArguments = @('-i', [IO.Path]::GetFullPath($SshKey), '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', 'ubuntu@161.33.158.204')
    $phase = 'fresh-server-backup'
    $metadataScript = @'
import datetime,hashlib,json,pathlib,re,subprocess,time
start=time.time()
subprocess.run(['sudo','-n','systemctl','start','qosyl-backup.service'],check=True,capture_output=True,timeout=90)
state=subprocess.run(['systemctl','show','qosyl-backup.service','-p','Result','-p','ExecMainStatus'],check=True,capture_output=True,text=True).stdout
assert 'Result=success' in state and 'ExecMainStatus=0' in state
listing=subprocess.run(['sudo','-n','find','/var/backups/qosyl','-maxdepth','1','-type','f','-name','database-*.dump','-printf','%T@ %p\n'],check=True,capture_output=True,text=True).stdout.splitlines()
stamp,file=max((float(line.split(' ',1)[0]),line.split(' ',1)[1]) for line in listing)
assert stamp>=start-1 and re.fullmatch(r'/var/backups/qosyl/database-[0-9]{8}T[0-9]{6}Z\.dump',file)
subprocess.run(['sudo','-n','sha256sum','-c',file+'.sha256'],check=True,capture_output=True)
size=int(subprocess.run(['sudo','-n','stat','-c','%s',file],check=True,capture_output=True,text=True).stdout)
assert 0<size<=268435456
checksum=subprocess.run(['sudo','-n','sha256sum',file],check=True,capture_output=True,text=True).stdout.split()[0]
print(json.dumps({'archive':file,'bytes':size,'sha256':checksum,'createdAt':datetime.datetime.fromtimestamp(stamp,datetime.timezone.utc).isoformat()}))
'@
    $metadataJson = Invoke-CheckedProcess $ssh ($sshArguments + @('python3 -')) ([Text.Encoding]::UTF8.GetBytes($metadataScript))
    $metadata = $metadataJson | ConvertFrom-Json
    if ($metadata.archive -notmatch '^/var/backups/qosyl/database-[0-9]{8}T[0-9]{6}Z\.dump$' -or
        $metadata.sha256 -notmatch '^[0-9a-f]{64}$' -or $metadata.bytes -le 0 -or $metadata.bytes -gt $maxArchiveBytes) {
        throw 'Server backup metadata failed validation.'
    }
    $phase = 'bounded-binary-download'
    $basename = [IO.Path]::GetFileName($metadata.archive)
    $plainFile = Assert-LocalBackupPath (Join-Path $runDirectory ($basename + '.plain.partial'))
    $download = New-HiddenProcess $ssh ($sshArguments + @('sudo -n cat -- ' + $metadata.archive))
    try {
        $errorText = $download.StandardError.ReadToEndAsync()
        $download.StandardInput.Close()
        $file = [IO.File]::Open($plainFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try {
            $buffer = [byte[]]::new(65536)
            $total = 0L
            $watch = [Diagnostics.Stopwatch]::StartNew()
            while ($true) {
                $read = $download.StandardOutput.BaseStream.ReadAsync($buffer, 0, $buffer.Length)
                if (-not $read.Wait(15000) -or $watch.Elapsed.TotalSeconds -gt 120) { throw 'Binary backup download timed out.' }
                $count = $read.GetAwaiter().GetResult()
                if ($count -eq 0) { break }
                $total += $count
                if ($total -gt $maxArchiveBytes -or $total -gt $metadata.bytes) { throw 'Backup download exceeded the declared bound.' }
                $file.Write($buffer, 0, $count)
            }
        }
        finally { $file.Dispose() }
        if (-not $download.WaitForExit(10000)) { throw 'SSH download did not finish.' }
        $null = $errorText.GetAwaiter().GetResult()
        if ($download.ExitCode -ne 0 -or $total -ne $metadata.bytes) { throw 'Incomplete backup download.' }
    }
    finally {
        if (-not $download.HasExited) { $download.Kill($true); $download.WaitForExit() }
        $download.Dispose()
    }
    $phase = 'archive-and-encryption-verification'
    $bytes = [IO.File]::ReadAllBytes($plainFile)
    if ((Get-BytesHash $bytes) -ne $metadata.sha256) { throw 'Downloaded archive hash mismatch.' }
    $null = Invoke-CheckedProcess $PgRestore @('--list', $plainFile)
    $encryptedFile = Assert-LocalBackupPath (Join-Path $runDirectory ($basename + '.dpapi'))
    $restored = Test-Dpapi $bytes $encryptedFile
    # pg_restore --list may close stdin after reading its TOC, causing an expected
    # broken pipe for a complete archive. Validate the decrypted file by path.
    $decryptedFile = Assert-LocalBackupPath (Join-Path $runDirectory ($basename + '.decrypted.partial'))
    [IO.File]::WriteAllBytes($decryptedFile, $restored)
    $null = Invoke-CheckedProcess $PgRestore @('--list', $decryptedFile)
    # Delete only this run's exact plaintext after archive and decrypt verification.
    foreach ($temporaryPath in @($plainFile, $decryptedFile)) {
        $verifiedPlainPath = Assert-LocalBackupPath $temporaryPath
        if ((Get-Item -LiteralPath $verifiedPlainPath).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing to remove a linked plaintext path.' }
        Remove-Item -LiteralPath $verifiedPlainPath
    }
    $record = [ordered]@{
        checkedAt = [DateTime]::UtcNow.ToString('o'); sourceArchive = $metadata.archive; sourceCreatedAt = $metadata.createdAt
        archiveBytes = $metadata.bytes; plaintextSha256 = $metadata.sha256
        encryptedFile = [IO.Path]::GetFileName($encryptedFile); encryptedSha256 = (Get-FileHash -LiteralPath $encryptedFile -Algorithm SHA256).Hash.ToLowerInvariant()
        dpapiScope = 'CurrentUser'; privateAclVerified = $true; decryptRoundTripVerified = $true
        pgRestoreListBeforeAndAfterDecrypt = $true; plaintextRemoved = (-not (Test-Path -LiteralPath $plainFile) -and -not (Test-Path -LiteralPath $decryptedFile))
        productionRestoreExecuted = $false; recurringScheduleConfigured = $false
    }
    $record | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runDirectory 'verification.json') -Encoding utf8NoBOM
    Write-Output "Encrypted off-VM backup verified: $runDirectory"
}
catch {
    if (Test-Path -LiteralPath $runDirectory -PathType Container) {
        [ordered]@{ checkedAt = [DateTime]::UtcNow.ToString('o'); phase = $phase; failureType = $_.Exception.GetType().Name; privatePlaintextMayRemain = (($null -ne $plainFile -and (Test-Path -LiteralPath $plainFile)) -or ($null -ne $decryptedFile -and (Test-Path -LiteralPath $decryptedFile))) } |
            ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runDirectory 'failure.json') -Encoding utf8NoBOM
    }
    throw "Off-VM backup failed during $phase; private evidence is in $runDirectory. No production restore was performed."
}
