# Build the Windows wallpaper, install it for the current user, and start it now and at login.
#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

function Test-WebView2 {
	$ids = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
	$keys = @(
		"HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$ids",
		"HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$ids",
		"HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$ids"
	)
	foreach ($key in $keys) {
		if (Get-ItemProperty -Path $key -Name pv -ErrorAction SilentlyContinue) { return $true }
	}
	return $false
}

if ($env:OS -ne 'Windows_NT') {
	Write-Error 'Build this on Windows. The Mac app is wallpaper/install.sh.'
}

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
	Write-Error 'dotnet is missing. Install the .NET 8 SDK: https://dotnet.microsoft.com/download/dotnet/8.0'
}

if (-not (Test-WebView2)) {
	Write-Error 'WebView2 is missing. Windows 11 usually has it. On Windows 10 install https://go.microsoft.com/fwlink/p/?LinkId=2124703 and run this again.'
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$project = Split-Path -Parent $here
$dest = Join-Path $env:LOCALAPPDATA 'Cove'
$publish = Join-Path $env:TEMP ("cove-publish-" + [guid]::NewGuid().ToString('N'))

Write-Host 'Building Cove for Windows...'
dotnet publish (Join-Path $here 'Cove.csproj') -c Release -r win-x64 --self-contained true -o $publish
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$scene = Join-Path $publish 'scene'
New-Item -ItemType Directory -Force -Path (Join-Path $scene 'scenes') | Out-Null
Copy-Item -LiteralPath (Join-Path $project 'vendor') -Destination (Join-Path $scene 'vendor') -Recurse
Get-ChildItem -LiteralPath (Join-Path $project 'scenes') -Directory | ForEach-Object {
	$copied = Join-Path (Join-Path $scene 'scenes') $_.Name
	Copy-Item -LiteralPath $_.FullName -Destination $copied -Recurse
	$tests = Join-Path $copied 'tests'
	if (Test-Path -LiteralPath $tests) { Remove-Item -LiteralPath $tests -Recurse -Force }
}
Get-ChildItem -LiteralPath $publish -Recurse -Force -Filter '.DS_Store' | Remove-Item -Force

Get-Process -Name 'Cove' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 600

$previous = Join-Path $env:LOCALAPPDATA 'Cove.previous'
if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous -Recurse -Force }
if (Test-Path -LiteralPath $dest) {
	Rename-Item -LiteralPath $dest -NewName 'Cove.previous'
}
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Path (Join-Path $publish '*') -Destination $dest -Recurse -Force
Remove-Item -LiteralPath $publish -Recurse -Force
if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous -Recurse -Force -ErrorAction SilentlyContinue }

$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if (-not (Test-Path -LiteralPath $run)) { New-Item -Path $run -Force | Out-Null }
Set-ItemProperty -Path $run -Name 'Cove' -Value "`"$dest\Cove.exe`""

Start-Process -FilePath (Join-Path $dest 'Cove.exe')
Write-Host "Cove installed: $dest"
Write-Host 'The first frame takes a few seconds. The tray icon is Cove; right-click it to switch scenes.'
Write-Host 'A still frame of the scene becomes the desktop picture. To keep yours, set "still" to false in %APPDATA%\Cove\settings.json.'
