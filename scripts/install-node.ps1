# Install Node.js LTS for aura-ui on Windows without admin rights: the official zip from nodejs.org (SHA-256 checked
# against nodejs.org's SHASUMS256.txt) into %LOCALAPPDATA%\aura-ui\node, and that folder at the front of the *user* PATH
# (no admin). Claude Desktop reads PATH when it starts: quit and reopen it afterwards.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File install-node.ps1 [-Dir <folder>] [-NoProfile]
param([string]$Dir = "$env:LOCALAPPDATA\aura-ui\node", [switch]$NoProfile)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # Invoke-WebRequest is very slow with the progress bar on Windows PowerShell 5.1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
$ver = (Invoke-RestMethod 'https://nodejs.org/dist/index.json' | Where-Object { $_.lts } | Select-Object -First 1).version
if ($ver -notmatch '^v\d') { throw 'Could not read the Node.js release list from nodejs.org' }
$name = "node-$ver-win-$arch"; $file = "$name.zip"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("aura-node-" + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
try {
  [Console]::Error.WriteLine("Downloading Node.js $ver (win-$arch) from nodejs.org...")
  Invoke-WebRequest "https://nodejs.org/dist/$ver/$file" -OutFile (Join-Path $tmp $file) -UseBasicParsing
  $sums = (Invoke-WebRequest "https://nodejs.org/dist/$ver/SHASUMS256.txt" -UseBasicParsing).Content
  if ($sums -is [byte[]]) { $sums = [Text.Encoding]::ASCII.GetString($sums) }
  $expected = (($sums -split "`n") | Where-Object { $_ -match "  $([regex]::Escape($file))\s*$" } | Select-Object -First 1) -replace '\s.*$', ''
  $actual = (Get-FileHash (Join-Path $tmp $file) -Algorithm SHA256).Hash.ToLower()
  if (-not $expected -or $expected.Trim().ToLower() -ne $actual) { throw "Checksum mismatch for ${file}: not installing" }
  Expand-Archive (Join-Path $tmp $file) -DestinationPath $tmp
  New-Item -ItemType Directory -Force $Dir | Out-Null
  $dest = Join-Path $Dir $ver
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  Move-Item (Join-Path $tmp $name) $dest
} finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }

& (Join-Path $dest 'node.exe') -v | Out-Null
if (-not $NoProfile) {
  # user PATH (HKCU\Environment): this Node first, older aura-ui Nodes dropped
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $parts = @(($userPath -split ';') | Where-Object { $_ -and $_ -notlike "$Dir\*" })
  [Environment]::SetEnvironmentVariable('Path', ((@($dest) + $parts) -join ';'), 'User')
  [Console]::Error.WriteLine("Added $dest to the user PATH (quit and reopen Claude Desktop / open a new terminal)")
}
Join-Path $dest 'node.exe'
