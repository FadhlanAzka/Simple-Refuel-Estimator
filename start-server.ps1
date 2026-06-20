$ErrorActionPreference = "Stop"

$pythonCommand = $null

function Test-PythonCommand {
    param([string]$Command)

    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        return $false
    }

    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    & $Command --version *> $null
    $isAvailable = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $previousPreference
    return $isAvailable
}

if (Test-PythonCommand "python") {
    $pythonCommand = "python"
} elseif (Test-PythonCommand "py") {
    $pythonCommand = "py"
}

if (-not $pythonCommand) {
    Write-Host "Python is not installed or is not available in PATH." -ForegroundColor Red
    Write-Host "Install Python, reopen VS Code, then run this task again." -ForegroundColor Yellow
    Write-Host "Download: https://www.python.org/downloads/"
    exit 1
}

Set-Location -LiteralPath $PSScriptRoot

$tripsFile = Join-Path $PSScriptRoot "trips.json"
if (-not (Test-Path -LiteralPath $tripsFile -PathType Leaf)) {
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tripsFile, "[]`r`n", $utf8WithoutBom)
    Write-Host "Created an empty trips.json file." -ForegroundColor Cyan
}

Write-Host "Starting Simple Refuel Estimator at http://localhost:8000" -ForegroundColor Green
Write-Host "Press Ctrl+C in this terminal to stop the server."

& $pythonCommand -m http.server 8000
