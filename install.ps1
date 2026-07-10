[CmdletBinding(SupportsShouldProcess)]
param(
  [ValidateSet("Project", "Global")]
  [string]$Scope = "Project",
  [string]$ProjectPath = ".",
  [string]$OpenCodeConfigPath = (Join-Path $HOME ".config\opencode")
)

$ErrorActionPreference = "Stop"
$Source = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceOpenCode = Join-Path $Source ".opencode"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

if (-not (Test-Path -LiteralPath $SourceOpenCode -PathType Container)) {
  throw "Package source is missing: $SourceOpenCode"
}

if ($Scope -eq "Global") {
  $TargetRoot = [System.IO.Path]::GetFullPath($OpenCodeConfigPath)
  $TargetOpenCode = $TargetRoot
}
else {
  $TargetRoot = (Resolve-Path -LiteralPath $ProjectPath).Path
  $TargetOpenCode = Join-Path $TargetRoot ".opencode"
}

$BackupRoot = Join-Path $TargetRoot ".controlled-workflow-backups\$Timestamp"
$RuntimePatterns = @(
  '^memory/memory\.db(?:-shm|-wal)?$',
  '^memory/memory-fallback\.json$',
  '^memory/\.runtime/',
  '^memory/tool-audit\.md$',
  '^memory\.db(?:-shm|-wal)?$',
  '^tantivy/',
  '^vectors\.usearch$',
  '^status-footer/state\.json$',
  '^evolution/(?:backups|reviews|archive)/',
  '^evolution/(?:state|usage)\.json$'
)

function Test-RuntimeArtifact {
  param([Parameter(Mandatory)][string]$RelativePath)
  $normalized = $RelativePath.Replace('\', '/')
  return @($RuntimePatterns | Where-Object { $normalized -match $_ }).Count -gt 0
}

function Test-PackageAsset {
  param([Parameter(Mandatory)][string]$RelativePath)
  $normalized = $RelativePath.Replace('\', '/')
  return $normalized -match '^(?:agent|command|commands|hooks|lib|plugins|skills|tools|memory)/'
}

function Backup-And-CopyFile {
  param(
    [Parameter(Mandatory)][string]$SourceFile,
    [Parameter(Mandatory)][string]$DestinationFile,
    [Parameter(Mandatory)][string]$BackupRelative
  )

  if (Test-Path -LiteralPath $DestinationFile -PathType Leaf) {
    $backup = Join-Path $BackupRoot $BackupRelative
    if ($PSCmdlet.ShouldProcess($backup, "Back up existing file")) {
      New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force | Out-Null
      Copy-Item -LiteralPath $DestinationFile -Destination $backup -Force
    }
  }

  if ($PSCmdlet.ShouldProcess($DestinationFile, "Install controlled-workflow asset")) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $DestinationFile) -Force | Out-Null
    Copy-Item -LiteralPath $SourceFile -Destination $DestinationFile -Force
  }
}

Write-Host "Installing OpenCode Controlled Workflow ($Scope scope) to $TargetRoot"

$sourceResolved = [System.IO.Path]::GetFullPath($SourceOpenCode).TrimEnd('\')
$targetResolved = [System.IO.Path]::GetFullPath($TargetOpenCode).TrimEnd('\')
if ($sourceResolved -ne $targetResolved) {
  Get-ChildItem -LiteralPath $SourceOpenCode -Recurse -File | ForEach-Object {
    # Windows PowerShell 5.1 targets .NET Framework, which does not provide
    # System.IO.Path.GetRelativePath. Every enumerated file is already a child
    # of $SourceOpenCode, so a prefix trim is deterministic and traversal-safe.
    $relative = $_.FullName.Substring($SourceOpenCode.Length).TrimStart('\', '/')
    if ((Test-PackageAsset -RelativePath $relative) -and -not (Test-RuntimeArtifact -RelativePath $relative)) {
      Backup-And-CopyFile `
        -SourceFile $_.FullName `
        -DestinationFile (Join-Path $TargetOpenCode $relative) `
        -BackupRelative (Join-Path "opencode" $relative)
    }
  }
}
else {
  Write-Host "Source and target OpenCode directories are identical; package copy skipped."
}

if ($Scope -eq "Project") {
  $targetAgents = Join-Path $TargetRoot "AGENTS.md"
  if ([System.IO.Path]::GetFullPath($Source) -ne [System.IO.Path]::GetFullPath($TargetRoot)) {
    Backup-And-CopyFile -SourceFile (Join-Path $Source "AGENTS.md") -DestinationFile $targetAgents -BackupRelative "AGENTS.md"
  }

  $targetConfig = Join-Path $TargetRoot "opencode.jsonc"
  if (-not (Test-Path -LiteralPath $targetConfig)) {
    if ($PSCmdlet.ShouldProcess($targetConfig, "Install project OpenCode config")) {
      Copy-Item -LiteralPath (Join-Path $Source "opencode.jsonc") -Destination $targetConfig
    }
  }
  else {
    Write-Host "Preserved existing opencode.jsonc; local plugins are auto-discovered."
  }
}
else {
  Write-Host "Preserved global AGENTS.md and opencode.jsonc; installed additive auto-discovered assets only."
}

if ($WhatIfPreference) {
  Write-Host "Dry-run complete; no files changed."
  return
}

$required = @(
  "tools\memory.ts",
  "tools\evolution.ts",
  "lib\evolution-core.ts",
  "plugins\memory-lifecycle.plugin.ts",
  "plugins\research-learn-loop.plugin.ts",
  "plugins\hermes-self-evolution.plugin.ts",
  "agent\hermes-reviewer.md",
  "skills\self-improvement\SKILL.md",
  "command\learn.md"
)
$missing = @($required | Where-Object { -not (Test-Path -LiteralPath (Join-Path $TargetOpenCode $_) -PathType Leaf) })
if ($missing.Count -gt 0) {
  throw "Installation incomplete; missing: $($missing -join ', ')"
}

Write-Host "Installed and verified required tools, skills, agents, plugins, hooks, and commands."
if (Test-Path -LiteralPath $BackupRoot) {
  Write-Host "Backups: $BackupRoot"
}
Write-Host "Restart OpenCode, then run: opencode debug skill"
