# Stop the wallpaper and remove it. The desktop falls back to whatever picture was set last.
#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

Get-Process -Name 'Cove' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 400

$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if (Get-ItemProperty -Path $run -Name 'Cove' -ErrorAction SilentlyContinue) {
	Remove-ItemProperty -Path $run -Name 'Cove'
}

$dest = Join-Path $env:LOCALAPPDATA 'Cove'
if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }

$still = Join-Path $env:APPDATA 'Cove\still'
if (Test-Path -LiteralPath $still) { Remove-Item -LiteralPath $still -Recurse -Force }

Write-Host 'Cove removed. Pick a wallpaper in Settings; the desktop picture pointed at Cove''s still frame.'
Write-Host 'The scene choice, pause and the rabbit''s memory stay in %APPDATA%\Cove\settings.json.'
