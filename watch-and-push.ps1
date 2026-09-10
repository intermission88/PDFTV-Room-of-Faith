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

        # Hanya file yang memang bagian dari website yang di-stage (bukan "git add -A"),
        # supaya file asing/rahasia tidak pernah ikut ter-push.
        $allow = @('index.html', 'README.md', 'AGENTS.md', 'watch-and-push.ps1', 'js', 'assets')
        foreach ($item in $allow) {
            if (Test-Path (Join-Path $folderPath $item)) { & $gitPath add -- $item }
        }
        # Script SQL (kecuali *.local.sql yang di-gitignore)
        Get-ChildItem -Path $folderPath -Filter '*.sql' -File -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_.Name -notlike '*.local.sql') { & $gitPath add -- $_.Name }
        }

        $status = & $gitPath status --porcelain
        if ($status) {
            # Pemindai rahasia: hanya memeriksa baris yang DITAMBAHKAN.
            # Pola dipecah agar file ini tidak mendeteksi dirinya sendiri.
            $added = & $gitPath diff --cached | Where-Object { $_ -match '^\+' -and $_ -notmatch '^\+\+\+' }
            $patterns = @(
                ('sb_' + 'secret_'),
                ('eyJhbGci' + 'Oi'),
                ('"role"' + ':"' + 'service' + '_role"'),
                ('set_credential' + '\(\s*''[^'']*''\s*,\s*''[^''<]')
            )
            $hits = @()
            foreach ($p in $patterns) {
                foreach ($line in $added) {
                    if ($line -match $p) { $hits += $p }
                }
            }

            if ($hits.Count -gt 0) {
                & $gitPath reset | Out-Null
                Write-Host "DIBATALKAN: terdeteksi pola rahasia pada file yang di-stage." -ForegroundColor Red
                Write-Host "Periksa dulu sebelum push (git diff --cached)." -ForegroundColor Red
                return
            }

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
