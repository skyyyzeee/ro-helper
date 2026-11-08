param(
    [string]$Model = 'GigaChat-2-Max',
    [string]$Cases,
    [switch]$Compare,
    [switch]$ResetKey,
    [string]$CertificatePath = (Join-Path $PSScriptRoot '..\..\russian_trusted_root_ca.crt')
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$certificate = (Resolve-Path -LiteralPath $CertificatePath).Path
$previousKey = $env:GIGACHAT_AUTH_KEY
$previousCertificate = $env:NODE_EXTRA_CA_CERTS
if (-not $Cases) {
    $Cases = if ($Compare) { '5,9,12,31,42,59,107,111,112,137' } else { '107,137' }
}

Push-Location -LiteralPath $repo
try {
    $keyDirectory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'RO Helper'
    $keyFile = Join-Path $keyDirectory 'gigachat-exam-key.xml'
    if ($ResetKey -or -not $env:GIGACHAT_AUTH_KEY) {
        if (-not $ResetKey -and (Test-Path -LiteralPath $keyFile)) {
            try {
                $key = Import-Clixml -LiteralPath $keyFile
                if ($key -isnot [Security.SecureString] -or $key.Length -eq 0) { throw 'Invalid stored key.' }
            } catch {
                throw 'Не удалось прочитать сохранённый ключ GigaChat. Запустите скрипт с -ResetKey.'
            }
        } else {
            $key = Read-Host 'Ключ авторизации GigaChat' -AsSecureString
            if ($key.Length -eq 0) { throw 'Ключ авторизации не введён.' }
            $rawKey = [Net.NetworkCredential]::new('', $key).Password
            $normalizedKey = ($rawKey -replace '^\s*(?:basic\s+)?', '' -replace '\s', '').Replace('-', '+').Replace('_', '/').TrimEnd('=')
            try {
                $decoded = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($normalizedKey.PadRight([int](4 * [Math]::Ceiling($normalizedKey.Length / 4)), '=')))
                if ($decoded -cnotmatch '^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$') { throw 'Invalid key.' }
            } catch {
                throw 'Нужен полный «Ключ авторизации» GigaChat. Client ID и Client Secret по отдельности не подходят.'
            } finally {
                Remove-Variable rawKey, normalizedKey, decoded -ErrorAction SilentlyContinue
            }
            New-Item -ItemType Directory -Path $keyDirectory -Force | Out-Null
            # Windows DPAPI protects a SecureString exported by PowerShell.
            $key | Export-Clixml -LiteralPath $keyFile
        }
        $env:GIGACHAT_AUTH_KEY = [Net.NetworkCredential]::new('', $key).Password
        $key.Dispose()
        Remove-Variable key
    }
    $env:NODE_EXTRA_CA_CERTS = $certificate

    function Invoke-GigaChatExam {
        param([string]$ExamModel, [string]$ReportSuffix, [switch]$Structured)

        $lastReport = 'eval\results\last.json'
        $previousReport = if (Test-Path -LiteralPath $lastReport) { Get-Content -LiteralPath $lastReport -Raw }
        $examArgs = @('run', 'eval', '--', '--gigachat', '--model', $ExamModel, '--cases', $Cases)
        if ($Structured) { $examArgs += '--gigachat-schema' }
        & npm.cmd @examArgs | Out-Host
        $examExitCode = $LASTEXITCODE

        $currentReport = if (Test-Path -LiteralPath $lastReport) { Get-Content -LiteralPath $lastReport -Raw }
        if (-not $currentReport -or $currentReport -eq $previousReport) {
            throw "Экзамен $ExamModel завершился без нового отчёта (код $examExitCode)."
        }

        $modelName = $ExamModel -replace '[^a-zA-Z0-9._-]', '_'
        $reportName = "$modelName-$ReportSuffix"
        $report = Join-Path 'eval\results' "$reportName.json"
        Copy-Item -LiteralPath $lastReport -Destination $report
        Copy-Item -LiteralPath 'eval\results\misses.json' -Destination (Join-Path 'eval\results' "$reportName-misses.json")
        Write-Host ('Отчёт сохранён в ' + (Join-Path $repo $report))
        return $examExitCode
    }

    if ($Compare) {
        $first = Invoke-GigaChatExam -ExamModel 'GigaChat-2-Max' -ReportSuffix 'comparison'
        $second = Invoke-GigaChatExam -ExamModel 'GigaChat-3-Ultra' -ReportSuffix 'comparison'
    } else {
        $first = Invoke-GigaChatExam -ExamModel $Model -ReportSuffix 'default'
        $second = Invoke-GigaChatExam -ExamModel $Model -ReportSuffix 'schema' -Structured
    }
    if ($first -ne 0 -or $second -ne 0) {
        throw 'Оба отчёта сохранены. Один или оба прогона завершились с ошибками.'
    }
} finally {
    $env:GIGACHAT_AUTH_KEY = $previousKey
    $env:NODE_EXTRA_CA_CERTS = $previousCertificate
    Pop-Location
}
