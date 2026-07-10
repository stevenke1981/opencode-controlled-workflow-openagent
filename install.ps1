param(
  [string]$ProjectPath = "."
)

$ErrorActionPreference = "Stop"
$Source = Split-Path -Parent $MyInvocation.MyCommand.Path
$Target = (Resolve-Path $ProjectPath).Path
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

function Remove-JsoncComments {
  param([Parameter(Mandatory)][string]$Text)

  $builder = [System.Text.StringBuilder]::new()
  $inString = $false
  $inLineComment = $false
  $inBlockComment = $false
  $escaped = $false

  for ($i = 0; $i -lt $Text.Length; $i++) {
    $ch = $Text[$i]
    $next = if ($i + 1 -lt $Text.Length) { $Text[$i + 1] } else { [char]0 }

    if ($inLineComment) {
      if ($ch -eq "`n") {
        $inLineComment = $false
        [void]$builder.Append($ch)
      }
      continue
    }
    if ($inBlockComment) {
      if ($ch -eq "*" -and $next -eq "/") {
        $inBlockComment = $false
        $i++
      }
      continue
    }
    if ($inString) {
      [void]$builder.Append($ch)
      if ($escaped) { $escaped = $false }
      elseif ($ch -eq "\") { $escaped = $true }
      elseif ($ch -eq '"') { $inString = $false }
      continue
    }

    if ($ch -eq '"') {
      $inString = $true
      [void]$builder.Append($ch)
    }
    elseif ($ch -eq "/" -and $next -eq "/") {
      $inLineComment = $true
      $i++
    }
    elseif ($ch -eq "/" -and $next -eq "*") {
      $inBlockComment = $true
      $i++
    }
    else {
      [void]$builder.Append($ch)
    }
  }

  $builder.ToString()
}

Write-Host "Installing OpenCode Controlled Workflow to $Target"

if ($Source -ne $Target) {
  $TargetOpenCode = Join-Path $Target ".opencode"
  if (Test-Path $TargetOpenCode) {
    $Backup = Join-Path $Target ".opencode.backup-$Timestamp"
    Write-Host "Backing up existing .opencode to $Backup"
    Copy-Item $TargetOpenCode $Backup -Recurse -Force
  }
  Copy-Item (Join-Path $Source ".opencode") $Target -Recurse -Force
  Copy-Item (Join-Path $Source "AGENTS.md") (Join-Path $Target "AGENTS.md") -Force
}
else {
  Write-Host "Source and target are the same directory; skipping file copy."
}

$TargetConfig = Join-Path $Target "opencode.jsonc"
$SourceConfig = Join-Path $Source "opencode.jsonc"

if (Test-Path $TargetConfig) {
  $ConfigBackup = "$TargetConfig.backup-$Timestamp"
  Copy-Item $TargetConfig $ConfigBackup -Force
  Write-Host "Backed up existing config to $ConfigBackup"

  try {
    $raw = Get-Content $TargetConfig -Raw
    $tgt = (Remove-JsoncComments -Text $raw) | ConvertFrom-Json
    $existing = @($tgt.plugin | ForEach-Object { "$_" })
    $desired = @(
      ".opencode/plugins/memory-lifecycle.plugin.ts",
      ".opencode/plugins/research-learn-loop.plugin.ts"
    )

    foreach ($plugin in $desired) {
      $name = Split-Path $plugin -Leaf
      if (-not ($existing | Where-Object { (Split-Path $_ -Leaf) -eq $name })) {
        $existing += $plugin
      }
    }

    $tgt | Add-Member -NotePropertyName plugin -NotePropertyValue $existing -Force
    $temp = "$TargetConfig.tmp-$PID"
    $tgt | ConvertTo-Json -Depth 100 | Set-Content -Path $temp -Encoding utf8
    Move-Item $temp $TargetConfig -Force
    Write-Host "Safely merged plugins into opencode.jsonc"
  }
  catch {
    Copy-Item $ConfigBackup $TargetConfig -Force
    throw "Existing opencode.jsonc could not be parsed safely. Original restored. $($_.Exception.Message)"
  }
}
else {
  Copy-Item $SourceConfig $TargetConfig -Force
}

$required = @(
  ".opencode\tools\memory.ts",
  ".opencode\lib\memory-db.ts",
  ".opencode\lib\migrate-to-sqlite.ts",
  ".opencode\plugins\memory-lifecycle.plugin.ts",
  ".opencode\plugins\research-learn-loop.plugin.ts"
)
$missing = @($required | Where-Object { -not (Test-Path (Join-Path $Target $_)) })
if ($missing.Count -gt 0) {
  throw "Missing required files: $($missing -join ', ')"
}

Write-Host "Required tools, libraries, and plugins verified."
Write-Host "Done. Try: opencode run ""/controlled-workflow review this repo"""
