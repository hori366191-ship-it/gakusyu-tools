# 学習ツール git バックアップスクリプト
# 使い方: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup.ps1
$ErrorActionPreference = 'Stop'

$repoDir = 'E:\dev\学習ツール'
$backupDir = 'E:\hori-shotaDrive\開発\学習ツール'
$keepCount = 30

Set-Location -LiteralPath $repoDir

$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$bundleName = "backup-$stamp.bundle"

& git bundle create $bundleName --all
if ($LASTEXITCODE -ne 0) {
    throw "git bundle に失敗しました (exit=$LASTEXITCODE)"
}

Move-Item -LiteralPath $bundleName -Destination $backupDir -Force

Get-ChildItem -LiteralPath $backupDir -Filter 'backup-*.bundle' |
    Sort-Object Name -Descending |
    Select-Object -Skip $keepCount |
    Remove-Item -Force

Write-Host "backup OK: $backupDir\$bundleName"
