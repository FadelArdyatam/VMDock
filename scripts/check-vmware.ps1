$ErrorActionPreference = "Stop"

Write-Host "Checking VMware Workstation..." -ForegroundColor Cyan

# Check if vmrun is in PATH
$vmrunPath = "vmrun.exe"
$vmrunCheck = Get-Command $vmrunPath -ErrorAction SilentlyContinue

if (-not $vmrunCheck) {
    # Try common installation paths
    $commonPath = "C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe"
    if (Test-Path $commonPath) {
        $vmrunPath = "`"$commonPath`""
    } else {
        Write-Host "WARNING: vmrun.exe not found in PATH or standard installation directories." -ForegroundColor Yellow
        Write-Host "Please ensure VMware Workstation or VIX API is installed."
        exit 1
    }
}

try {
    # Get list of running VMs
    $runningVMsOutput = Invoke-Expression "$vmrunPath list"
    
    # First line is "Total running VMs: X"
    $vms = $runningVMsOutput | Select-Object -Skip 1

    if ($vms.Count -eq 0) {
        Write-Host "No VMs are currently running." -ForegroundColor Yellow
        exit 0
    }

    Write-Host "Found $($vms.Count) running VM(s):" -ForegroundColor Green
    
    foreach ($vm in $vms) {
        Write-Host " - $vm"
        
        # Try to get IP address
        try {
            $ip = Invoke-Expression "$vmrunPath getGuestIPAddress `"$vm`" -wait"
            if ($ip) {
                Write-Host "   IP: $ip" -ForegroundColor Cyan
            }
        } catch {
            Write-Host "   IP: Could not retrieve IP. Ensure VMware Tools is installed on the guest." -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "ERROR: Failed to execute vmrun." -ForegroundColor Red
    Write-Host $_
    exit 1
}
