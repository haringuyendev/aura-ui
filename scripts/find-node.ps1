# Print the path of a Node.js >= 20 binary on Windows, even when it isn't on PATH. Exit 1 when there is none.
# Used by the aura-ui:setup skill when Claude Code runs commands in PowerShell (no Git Bash).
$candidates = @()
$cmd = Get-Command node -ErrorAction SilentlyContinue
if ($cmd) { $candidates += $cmd.Source }
$candidates += "$env:ProgramFiles\nodejs\node.exe", "$env:LOCALAPPDATA\Volta\bin\node.exe", "$env:NVM_SYMLINK\node.exe", "$env:USERPROFILE\scoop\apps\nodejs\current\node.exe"
if ($env:NVM_HOME) { $candidates += Get-ChildItem "$env:NVM_HOME\v*\node.exe" -ErrorAction SilentlyContinue | ForEach-Object FullName }
$best = $null; $bestMajor = 0
foreach ($c in $candidates) {
  if (-not $c -or -not (Test-Path $c)) { continue }
  $major = [int](& $c -p 'process.versions.node.split(".")[0]' 2>$null)
  if ($major -gt $bestMajor) { $best = $c; $bestMajor = $major }
}
if ($bestMajor -ge 20) { $best; exit 0 }
if ($best) { [Console]::Error.WriteLine("too old: $best (v$bestMajor, need >= 20)") }
exit 1
