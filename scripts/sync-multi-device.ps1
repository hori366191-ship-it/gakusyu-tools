# Drive sync for multi-device - sync clasp/opencode/roadmap (post-commit, manual)
$ErrorActionPreference = 'Continue'
$repoDir = 'E:\dev\学習ツール'
$multiDir = 'E:\hori-shotaDrive\開発\学習ツール\複数端末間での作業継続のために'
function Write-Info($msg) { Write-Host "[sync-multi-device] $msg" }
function Write-Warn($msg) { Write-Warning "[sync-multi-device] $msg" }
if (-not (Test-Path -LiteralPath $multiDir)) {
  Write-Warn "Drive folder not found: $multiDir - skip"
  exit 0
}
try {
  $claspFiles = Get-ChildItem -LiteralPath $repoDir -Recurse -Force -Filter ".clasp.json" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notlike "*\.git\*" }
  foreach ($src in $claspFiles) {
    $rel = $src.FullName.Substring($repoDir.Length).TrimStart('\','/')
    $dst = Join-Path $multiDir "clasp.json\$rel"
    $dstDir = Split-Path -Parent $dst
    if (-not (Test-Path -LiteralPath $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
    Copy-Item -LiteralPath $src.FullName -Destination $dst -Force
  }
  Write-Info "clasp.json synced ($($claspFiles.Count) files)"
} catch { Write-Warn "clasp.json sync failed: $_" }
try {
  $map = @{}
  $claspFiles | ForEach-Object {
    try {
      $json = Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
      $sid = $json.scriptId
      if ($sid -and $sid -notlike "YOUR_*") {
        $rel = $_.FullName.Substring($repoDir.Length).TrimStart('\','/')
        $key = "UNKNOWN"
        if ($rel -like "*\app1\*") { $key = "YOUR_SCRIPT_ID_app1" }
        elseif ($rel -like "*\app2\*") { $key = "YOUR_SCRIPT_ID_app2" }
        elseif ($rel -like "*\app3\*") { $key = "YOUR_SCRIPT_ID_app3" }
        elseif ($rel -like "*\app4\*") { $key = "YOUR_SCRIPT_ID_app4" }
        elseif ($rel -like "*\app5\*") { $key = "YOUR_SCRIPT_ID_app5" }
        elseif ($rel -like "*\app6\*") { $key = "YOUR_SCRIPT_ID_app6" }
        elseif ($rel -like "*\app7\*") { $key = "YOUR_SCRIPT_ID_app7" }
        elseif ($rel -like "*\app8\*") { $key = "YOUR_SCRIPT_ID_app8" }
        elseif ($rel -like "*\app9\*") { $key = "YOUR_SCRIPT_ID_app9" }
        elseif ($rel -like "*\pdfdrop\*") { $key = "YOUR_SCRIPT_ID_pdfdrop" }
        elseif ($rel -like "*\portal\*") { $key = "YOUR_SCRIPT_ID_portal" }
        elseif ($rel -like "*site-pdfdrop*") { $key = "YOUR_SCRIPT_ID_site-pdfdrop" }
        elseif ($rel -like "*site-app2-backend*") { $key = "YOUR_SCRIPT_ID_site-app2-backend" }
        $map[$key] = $sid
      }
    } catch {}
  }
  if ($map.Count -gt 0) {
    $scriptIdsPath = Join-Path $multiDir "scriptIds.json"
    ($map | ConvertTo-Json -Depth 3) | Set-Content -LiteralPath $scriptIdsPath -Encoding utf8
    Write-Info "scriptIds.json generated ($($map.Count) entries)"
  }
  $driveIdsPath = Join-Path $multiDir "driveIds.json"
  if (-not (Test-Path -LiteralPath $driveIdsPath)) {
    @{ DRIVE_FOLDER_ID = "YOUR_DRIVE_FOLDER_ID"; DICTIONARY_ID = "YOUR_DICTIONARY_ID"; MAP_ID = "YOUR_MAP_ID"; NOTE = "Set real IDs in Script Properties" } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $driveIdsPath -Encoding utf8
    Write-Info "driveIds.json template generated"
  } else {
    Write-Info "driveIds.json exists, skip"
  }
} catch { Write-Warn "scriptIds/driveIds failed: $_" }
try {
  $opencodeSrc = "$env:USERPROFILE\.config\opencode\opencode.jsonc"
  $opencodeDstDir = Join-Path $multiDir "opencode"
  $opencodeDst = Join-Path $opencodeDstDir "opencode.jsonc"
  if (Test-Path -LiteralPath $opencodeSrc) {
    if (-not (Test-Path -LiteralPath $opencodeDstDir)) { New-Item -ItemType Directory -Path $opencodeDstDir -Force | Out-Null }
    Copy-Item -LiteralPath $opencodeSrc -Destination $opencodeDst -Force
    Write-Info "opencode.jsonc synced"
  }
  $uiSrc = "$env:USERPROFILE\.config\opencode\instructions\ui-confirm.md"
  $uiDstDir = Join-Path $opencodeDstDir "instructions"
  $uiDst = Join-Path $uiDstDir "ui-confirm.md"
  if (Test-Path -LiteralPath $uiSrc) {
    if (-not (Test-Path -LiteralPath $uiDstDir)) { New-Item -ItemType Directory -Path $uiDstDir -Force | Out-Null }
    Copy-Item -LiteralPath $uiSrc -Destination $uiDst -Force
    Write-Info "ui-confirm.md synced"
  }
} catch { Write-Warn "opencode sync failed: $_" }
try {
  $roadmapSrc = Join-Path $repoDir "ロードマップ_機密情報.md"
  $roadmapDst = Join-Path $multiDir "ロードマップ_機密情報.md"
  if (Test-Path -LiteralPath $roadmapSrc) {
    Copy-Item -LiteralPath $roadmapSrc -Destination $roadmapDst -Force
    Write-Info "roadmap synced"
  }
} catch { Write-Warn "roadmap sync failed: $_" }
Write-Info "sync done"
