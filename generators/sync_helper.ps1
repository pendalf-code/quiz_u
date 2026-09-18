function Update-PackData {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$PacksToUpdate
    )

    $projectRoot = Split-Path -Parent $PSScriptRoot
    $packsDataPath = Join-Path $projectRoot "js\packs_data.js"
    $jsonBaseDir = Join-Path $projectRoot "паки вопросов"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)

    $rawPacks = [System.IO.File]::ReadAllText($packsDataPath, [System.Text.Encoding]::UTF8)
    $jsonStart = $rawPacks.IndexOf('[')
    $jsonEnd = $rawPacks.LastIndexOf(']')
    $jsonText = $rawPacks.Substring($jsonStart, $jsonEnd - $jsonStart + 1)
    $packs = ConvertFrom-Json $jsonText

    $updatedCount = 0

    foreach ($p in $packs) {
        if ($PacksToUpdate.ContainsKey($p.id)) {
            $updateInfo = $PacksToUpdate[$p.id]
            
            if ($updateInfo.rounds) {
                $p.rounds = $updateInfo.rounds
                $p.roundsCount = $updateInfo.rounds.Count
                
                # Extract theme names
                $tNames = @()
                foreach ($r in $updateInfo.rounds) {
                    foreach ($th in $r.themes) {
                        if ($th.name -ne 'Финальный вопрос') {
                            $tNames += $th.name
                        }
                    }
                }
                $p.themeNames = $tNames
                $p.themesList = $tNames
            }
            if ($updateInfo.ContainsKey('hasFinal')) {
                $p.hasFinal = $updateInfo.hasFinal
            }
            
            # Save individual JSON file
            $folder = Join-Path $jsonBaseDir $p.categoryFolder
            if (Test-Path $folder) {
                $files = Get-ChildItem -Path $folder -Filter "*.json"
                $targetFile = $null
                foreach ($f in $files) {
                    $cleanTitle = ($p.title -replace '[^\p{L}\p{Nd}]', '')
                    $cleanName = ($f.BaseName -replace '[^\p{L}\p{Nd}]', '')
                    if ($cleanName.Contains($cleanTitle) -or $cleanTitle.Contains($cleanName)) {
                        $targetFile = $f
                        break
                    }
                }
                if ($targetFile) {
                    $jsonContent = $p.rounds | ConvertTo-Json -Depth 10
                    [System.IO.File]::WriteAllText($targetFile.FullName, $jsonContent, $utf8NoBom)
                }
            }
            $updatedCount++
        }
    }

    $newPacksData = "window.AVAILABLE_PACKS = " + ($packs | ConvertTo-Json -Depth 10) + ";"
    [System.IO.File]::WriteAllText($packsDataPath, $newPacksData, $utf8NoBom)
    Write-Output "Successfully updated $updatedCount packs in packs_data.js and JSON files."
}
