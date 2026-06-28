param(
  [Parameter(Mandatory=$true)][ValidateSet('success','failure','pattern','decision','research','note')] [string]$Type,
  [Parameter(Mandatory=$true)][string]$Title,
  [string]$Tags = '',
  [string]$Body = '',
  [string]$Problem = '',
  [string]$Context = '',
  [string]$Evidence = '',
  [string]$Source = ''
)

$Root = Split-Path -Parent $PSScriptRoot
$ToolPath = Join-Path $Root '.opencode\tools'

# Use node to insert into SQLite via memory-db
$jsonArgs = @{
  type = $Type
  title = $Title
  tags = $Tags
  problem = $Problem
  context = $Context
  solution = $Body
  evidence = $Evidence
  source = $Source
  status = "recorded"
} | ConvertTo-Json -Compress

$nodeCode = @"
const { getDatabase, saveDatabase, nowIso } = require('$($ToolPath.Replace('\', '\\'))\\memory-db.ts');
const crypto = require('crypto');
(async () => {
  const db = await getDatabase();
  const args = JSON.parse(process.argv[1]);
  const id = Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
  const now = nowIso();
  db.run(
    'INSERT INTO memories (id, type, title, problem, context, solution, evidence, tags, source, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [id, args.type, args.title, args.problem, args.context, args.solution, args.evidence, args.tags, args.source, args.status, now, now]
  );
  await saveDatabase();
  console.log('Added ' + args.type + ' entry: ' + id + ' - ' + args.title);
})();
"@

npx tsx -e $nodeCode -- $jsonArgs 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Fallback: appending to Markdown ledger..." -ForegroundColor Yellow
  $Memory = Join-Path $Root '.opencode/memory'
  $ledgerMap = @{ success='success-ledger.md'; failure='failure-ledger.md'; pattern='patterns.md'; decision='decision-log.md'; research='research-sources.md'; note='solution-index.md' }
  $File = Join-Path $Memory $ledgerMap[$Type]
  $Date = Get-Date -Format 'yyyy-MM-dd HH:mm'
  $Entry = "`n## $Date — $Title`n- Tags: $Tags`n$Body`n"
  Add-Content -Path $File -Value $Entry -Encoding UTF8
  Write-Host "Added $Type entry to $File"
}
