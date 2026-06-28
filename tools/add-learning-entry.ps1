param(
  [Parameter(Mandatory=$true)][ValidateSet('success','failure','pattern','decision')] [string]$Type,
  [Parameter(Mandatory=$true)][string]$Title,
  [string]$Tags = '',
  [string]$Body = ''
)

$Root = Split-Path -Parent $PSScriptRoot
$Memory = Join-Path $Root '.opencode/memory'
New-Item -ItemType Directory -Force -Path $Memory | Out-Null
$Date = Get-Date -Format 'yyyy-MM-dd HH:mm'

switch ($Type) {
  'success' { $File = Join-Path $Memory 'success-ledger.md' }
  'failure' { $File = Join-Path $Memory 'failure-ledger.md' }
  'pattern' { $File = Join-Path $Memory 'patterns.md' }
  'decision' { $File = Join-Path $Memory 'decision-log.md' }
}

$Entry = @"

## $Date — $Title
- Tags: $Tags
$Body
"@

Add-Content -Path $File -Value $Entry -Encoding UTF8
Write-Host "Added $Type entry to $File"
