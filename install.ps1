param(
  [string]$ProjectPath = "."
)

$ErrorActionPreference = "Stop"
$Source = Split-Path -Parent $MyInvocation.MyCommand.Path
$Target = Resolve-Path $ProjectPath
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "Installing OpenCode Controlled Workflow to $Target"

# Step 1: Backup + copy .opencode/
$TargetOpenCode = Join-Path $Target ".opencode"
if (Test-Path $TargetOpenCode) {
  $Backup = Join-Path $Target ".opencode.backup-$Timestamp"
  Write-Host "Backing up existing .opencode to $Backup"
  Copy-Item $TargetOpenCode $Backup -Recurse -Force
}
Copy-Item (Join-Path $Source ".opencode") $Target -Recurse -Force
Copy-Item (Join-Path $Source "AGENTS.md") (Join-Path $Target "AGENTS.md") -Force

# Step 2: Merge opencode.jsonc — preserve custom config, inject plugins
$TargetConfig = Join-Path $Target "opencode.jsonc"
$SourceConfig = Join-Path $Source "opencode.jsonc"

if (Test-Path $TargetConfig) {
  # Read target, strip jsonc comments, parse as JSON
  $raw = Get-Content $TargetConfig -Raw
  $stripped = $raw -replace '(?m)^\s*//.*$', '' -replace '(?s)/\*.*?\*/', ''
  try {
    $tgt = $stripped | ConvertFrom-Json
  } catch {
    Write-Host "Warning: Cannot parse existing opencode.jsonc, overwriting with source."
    Copy-Item $SourceConfig $TargetConfig -Force
    $tgt = $null
  }
  if ($tgt) {
    # Ensure plugin array exists
    if (-not $tgt.plugin) { $tgt.plugin = @() }
    $existing = @($tgt.plugin | ForEach-Object { "$_" })
    $desired = @(
      ".opencode/plugins/memory-lifecycle.plugin.ts",
      ".opencode/plugins/research-learn-loop.plugin.ts"
    )
    $added = 0
    foreach ($p in $desired) {
      $found = $false
      foreach ($e in $existing) {
        if ($e -replace '^.*[/\\]', '' -eq ($p -replace '^.*[/\\]', '')) {
          $found = $true
          break
        }
      }
      if (-not $found) {
        $existing += $p
        $added++
      }
    }
    $tgt.plugin = $existing
    # Write back as pretty JSON
    $json = $tgt | ConvertTo-Json -Depth 10
    Set-Content -Path $TargetConfig -Value $json -NoNewline
    Write-Host "Merged plugins ($added new) into opencode.jsonc"
  }
} else {
  Copy-Item $SourceConfig $TargetConfig -Force
}

# Step 3: Verify essential files
$ToolsDir = Join-Path $Target ".opencode\tools"
$ToolFiles = @("memory.ts")
$PluginDeps = @("memory-db.ts")
$Missing = @()
foreach ($f in $ToolFiles) {
  if (-not (Test-Path (Join-Path $ToolsDir $f))) { $Missing += "TOOL:$f" }
}
foreach ($f in $PluginDeps) {
  if (-not (Test-Path (Join-Path $ToolsDir $f))) { $Missing += "PLUGIN-DEP:$f" }
}
if ($Missing.Count -gt 0) {
  Write-Host "WARNING: Missing files: $($Missing -join ', ')"
} else {
  Write-Host "✓ Tool: memory.ts (self-contained, SQLite/JSON fallback)"
  Write-Host "✓ Plugin dep: memory-db.ts (shared module for memory-lifecycle.plugin.ts)"
}

Write-Host ""
Write-Host "✓ Plugins auto-enabled:"
Write-Host "  - .opencode/plugins/memory-lifecycle.plugin.ts"
Write-Host "  - .opencode/plugins/research-learn-loop.plugin.ts"
Write-Host "  Remove entries from opencode.jsonc plugin array to disable."
Write-Host ""
Write-Host "Done. Try: opencode run ""/controlled-workflow review this repo"""
