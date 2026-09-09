$folderPath = $PSScriptRoot
$gitPath = "C:\Program Files\Git\cmd\git.exe"

Write-Host "Monitoring $folderPath for changes... Press Ctrl+C to stop."

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $folderPath
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

# Ignore .git folder changes to prevent loops
$action = {
    $path = $Event.SourceEventArgs.FullPath
    if ($path -notmatch '\\\.git\\') {
        Write-Host "Detected change in: $path"
        Start-Sleep -Seconds 2 # debounce
        
        Set-Location $folderPath
        & $gitPath add -A
        $status = & $gitPath status --porcelain
        if ($status) {
            $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            & $gitPath commit -m "Auto-update: $timestamp"
            & $gitPath push origin main
            Write-Host "Changes pushed to GitHub at $timestamp" -ForegroundColor Green
        }
    }
}

Register-ObjectEvent $watcher "Changed" -Action $action
Register-ObjectEvent $watcher "Created" -Action $action
Register-ObjectEvent $watcher "Deleted" -Action $action
Register-ObjectEvent $watcher "Renamed" -Action $action

while ($true) {
    Start-Sleep 1
}
