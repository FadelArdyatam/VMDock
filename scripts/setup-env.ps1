param(
    [Parameter(Mandatory=$true)][string]$VMip,
    [Parameter(Mandatory=$true)][string]$DockerPort,
    [Parameter(Mandatory=$false)][string]$ProjectPath,
    [Parameter(Mandatory=$false)][string]$VMMount
)

$ErrorActionPreference = "Stop"
$DockerHost = "tcp://${VMip}:${DockerPort}"

Write-Host "Setting up VMDock Environment..." -ForegroundColor Cyan

# 2. Set DOCKER_HOST as system environment variable for current user
Write-Host "Setting DOCKER_HOST environment variable..."
setx DOCKER_HOST $DockerHost > $null

# 3. Add to PowerShell profile
$ProfilePath = $PROFILE.CurrentUserAllHosts
if (-not (Test-Path -Path $ProfilePath)) {
    New-Item -ItemType File -Path $ProfilePath -Force > $null
}

$ProfileContent = Get-Content -Path $ProfilePath -ErrorAction SilentlyContinue
$EnvLine = "`$env:DOCKER_HOST = `"$DockerHost`""

if ($ProfileContent -notcontains $EnvLine) {
    Write-Host "Adding DOCKER_HOST to PowerShell profile ($ProfilePath)..."
    Add-Content -Path $ProfilePath -Value "`n# VMDock config`n$EnvLine"
}

# Apply env variable to current session for testing
$env:DOCKER_HOST = $DockerHost

# 4. Verify Docker CLI
Write-Host "Verifying Docker connection..."
try {
    # Check if docker is installed
    $dockerCheck = Get-Command "docker" -ErrorAction SilentlyContinue
    if (-not $dockerCheck) {
        Write-Host "WARNING: Docker CLI not found on Windows." -ForegroundColor Yellow
        Write-Host "Please install docker CLI (e.g., via winget install Docker.DockerCli) to use docker commands."
        exit
    }

    $dockerOutput = docker ps 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "SUCCESS: Docker CLI connected to VM successfully!" -ForegroundColor Green
    } else {
        Write-Host "ERROR: Failed to connect to Docker engine at $DockerHost" -ForegroundColor Red
        Write-Host "Error details: $dockerOutput" -ForegroundColor Red
        exit
    }
} catch {
    Write-Host "ERROR: Exception occurred while verifying docker: $_" -ForegroundColor Red
}

# 5. Instructions
Write-Host "`nSetup complete! Here's how to test it:" -ForegroundColor Cyan
Write-Host "1. Restart your terminal to ensure environment variables are loaded."
Write-Host "2. Run: docker ps"
Write-Host "3. Run: docker run hello-world"
