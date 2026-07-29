[CmdletBinding()]
param(
  [string]$EnvFile = '.env',
  [string]$OutputPath = 'procureos-deployment.zip',
  [switch]$AllowDemoMode
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = if ([System.IO.Path]::IsPathRooted($EnvFile)) { $EnvFile } else { Join-Path $repoRoot $EnvFile }
$outputFullPath = if ([System.IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path $repoRoot $OutputPath }

if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
  throw "Không tìm thấy file cấu hình: $envPath. Hãy sao chép deployment-ai.env.template thành .env và điền key trên máy của bạn."
}

# A deployment ZIP replaces the Demo System workspace. Accidentally including
# DEMO_MODE=1 makes the app deliberately serve in-memory fixtures and hides
# the managed MySQL data. Require an explicit override for a disposable demo.
$demoSetting = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^\s*DEMO_MODE\s*=\s*1\s*(#.*)?$' } | Select-Object -First 1
if ($demoSetting -and -not $AllowDemoMode) {
  throw "DEMO_MODE=1 would hide production MySQL data after deployment. Set DEMO_MODE=0, or pass -AllowDemoMode only for a disposable demo project."
}

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("procureos-deployment-" + [Guid]::NewGuid().ToString('N'))
$excludedNames = @('.git', 'node_modules', '.agents', '.codex', 'procureos-deployment.zip')

try {
  New-Item -ItemType Directory -Path $stage | Out-Null
  $outputLeaf = Split-Path -Leaf $outputFullPath

  Get-ChildItem -LiteralPath $repoRoot -Force | ForEach-Object {
    if ($_.Name -eq '.env' -or $_.Name -eq $outputLeaf -or $excludedNames -contains $_.Name) {
      return
    }
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $stage $_.Name) -Recurse -Force
  }

  # Dependencies are restored by `npm install` in the deployment runner. Remove
  # nested dependency folders copied with subprojects such as admin/.
  Get-ChildItem -LiteralPath $stage -Directory -Recurse -Force |
    Where-Object { $_.Name -eq 'node_modules' } |
    Remove-Item -Recurse -Force

  # The generated bundle must contain the deployable source plus this local-only
  # server configuration at its root. It is never written back into the repository.
  Copy-Item -LiteralPath $envPath -Destination (Join-Path $stage '.env') -Force

  if (Test-Path -LiteralPath $outputFullPath) {
    Remove-Item -LiteralPath $outputFullPath -Force
  }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $outputFullPath -CompressionLevel Optimal
  Write-Host "Đã tạo $outputFullPath. Upload ZIP này một lần; không upload ZIP chỉ có .env."
}
finally {
  if (Test-Path -LiteralPath $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
  }
}
