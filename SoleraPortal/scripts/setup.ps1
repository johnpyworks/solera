# Kit Setup Script
# Use setup.bat for a shorter command (no need to type ExecutionPolicy manually)
#
# Options:
#   -Name "MyProject"   Rename kit/ to this name and tag all config/memory files
#   -Agent auto         Which AI agent to configure: Claude, Codex, Both, or auto (default)
#   -NewRepo            Skip the memory initializer (use for brand-new projects with no code yet)
#   -Force              Overwrite .claude\settings.json even if it already exists

param(
    [string]$Name = "",
    [string]$Agent = "auto",
    [switch]$NewRepo,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$claudeDir = Join-Path $root ".claude"

Write-Host ""
Write-Host "=== Kit Setup ===" -ForegroundColor Cyan
Write-Host "Project root: $root"
Write-Host ""

# Determine current and target kit folder name
$currentKitName = "kit"
$targetKitName  = if ($Name -ne "") { $Name } else { "kit" }

# Find the actual kit folder (handles re-runs after rename)
if (Test-Path (Join-Path $root $targetKitName)) {
    $currentKitName = $targetKitName
} elseif (Test-Path (Join-Path $root "kit")) {
    $currentKitName = "kit"
} else {
    Write-Host "  ERROR: Could not find kit/ folder. Run from the project root." -ForegroundColor Red
    exit 1
}
$kitPath = Join-Path $root $currentKitName

# Auto-detect agent from instruction files at root
if ($Agent -eq "auto") {
    $hasClaudeMd = Test-Path (Join-Path $root "CLAUDE.md")
    $hasAgentsMd = Test-Path (Join-Path $root "AGENTS.md")
    if ($hasClaudeMd -and $hasAgentsMd) { $Agent = "Both"   }
    elseif ($hasClaudeMd)               { $Agent = "Claude" }
    elseif ($hasAgentsMd)               { $Agent = "Codex"  }
    else                                { $Agent = "Claude" }
    Write-Host "  Agent detected: $Agent" -ForegroundColor Cyan
} else {
    Write-Host "  Agent (specified): $Agent" -ForegroundColor Cyan
}

# Step 1: Claude setup (.claude/ hooks + permissions)
if ($Agent -eq "Claude" -or $Agent -eq "Both") {

    if (-not (Test-Path $claudeDir)) {
        New-Item -ItemType Directory -Path $claudeDir | Out-Null
        Write-Host "  Created .claude/" -ForegroundColor Green
    }

    $settingsPath = Join-Path $claudeDir "settings.json"
    $hooksJson = "{
  `"hooks`": {
    `"SessionStart`": [
      {
        `"matcher`": `"`",
        `"hooks`": [
          { `"type`": `"command`", `"command`": `"python $targetKitName/hooks/session-start.py`", `"timeout`": 15 }
        ]
      }
    ],
    `"Stop`": [
      {
        `"matcher`": `"`",
        `"hooks`": [
          { `"type`": `"command`", `"command`": `"python $targetKitName/hooks/session-end.py`", `"timeout`": 15 }
        ]
      }
    ],
    `"PreCompact`": [
      {
        `"matcher`": `"`",
        `"hooks`": [
          { `"type`": `"command`", `"command`": `"python $targetKitName/hooks/pre-compact.py`", `"timeout`": 15 }
        ]
      }
    ]
  }
}"

    if ((Test-Path $settingsPath) -and -not $Force) {
        Write-Host "  .claude/settings.json already exists - skipping (use -Force to overwrite)" -ForegroundColor Yellow
    } else {
        Set-Content -Path $settingsPath -Value $hooksJson -Encoding utf8
        Write-Host "  Wrote .claude/settings.json (Claude hooks -> $targetKitName/)" -ForegroundColor Green
    }

    $localSettingsPath = Join-Path $claudeDir "settings.local.json"
    $permissionsJson = "{
  `"permissions`": {
    `"allow`": [
      `"Bash(python $targetKitName/scripts/initialize_memory.py --write)`",
      `"Bash(python $targetKitName/hooks/session-end.py)`",
      `"Bash(python $targetKitName/hooks/session-start.py)`",
      `"Bash(python $targetKitName/hooks/pre-compact.py)`",
      `"Bash(python $targetKitName/scripts/capture_session.py*)`",
      `"Bash(python $targetKitName/scripts/lint_memory.py*)`"
    ]
  }
}"

    if (Test-Path $localSettingsPath) {
        $existing = Get-Content $localSettingsPath -Raw
        if ($existing -notmatch "session-start") {
            Write-Host "  WARNING: .claude/settings.local.json exists but is missing kit permissions." -ForegroundColor Yellow
            Write-Host "           Delete it and re-run, or add kit permission entries manually." -ForegroundColor Yellow
        } else {
            Write-Host "  .claude/settings.local.json already has kit permissions - skipping" -ForegroundColor Yellow
        }
    } else {
        Set-Content -Path $localSettingsPath -Value $permissionsJson -Encoding utf8
        Write-Host "  Wrote .claude/settings.local.json (permissions)" -ForegroundColor Green
    }
}

# Step 2: Codex note (no hook config needed - AGENTS.md is the contract)
if ($Agent -eq "Codex" -or $Agent -eq "Both") {
    if (Test-Path (Join-Path $root "AGENTS.md")) {
        Write-Host "  Codex: AGENTS.md found - no additional hook config required" -ForegroundColor Green
    } else {
        Write-Host "  WARNING: AGENTS.md not found. Copy it to the project root for Codex." -ForegroundColor Yellow
    }
}

# Step 3: Rename kit/ folder if -Name provided and different from current name
if ($Name -ne "" -and $Name -ne $currentKitName) {
    Write-Host ""
    Write-Host "  Renaming $currentKitName/ to $Name/..." -ForegroundColor Cyan
    Rename-Item -Path $kitPath -NewName $Name
    $kitPath = Join-Path $root $Name
    Write-Host "  Renamed $currentKitName/ to $Name/" -ForegroundColor Green

    # Update CLAUDE.md references
    $claudeMdPath = Join-Path $root "CLAUDE.md"
    if (Test-Path $claudeMdPath) {
        $content = Get-Content $claudeMdPath -Raw
        $content = $content -replace "(?<![a-zA-Z0-9_-])kit/", "$Name/"
        $content = $content -replace "(?<![a-zA-Z0-9_-])kit\\", "$Name\"
        Set-Content -Path $claudeMdPath -Value $content.TrimEnd() -Encoding utf8
        Write-Host "  Updated CLAUDE.md references to $Name/" -ForegroundColor Green
    }

    # Update AGENT.md references
    $agentMdPath = Join-Path $root "AGENT.md"
    if (Test-Path $agentMdPath) {
        $content = Get-Content $agentMdPath -Raw
        $content = $content -replace "(?<![a-zA-Z0-9_-])kit/", "$Name/"
        $content = $content -replace "(?<![a-zA-Z0-9_-])kit\\", "$Name\"
        Set-Content -Path $agentMdPath -Value $content.TrimEnd() -Encoding utf8
        Write-Host "  Updated AGENT.md references to $Name/" -ForegroundColor Green
    }

    # Update AGENTS.md references (Codex)
    $agentsMdPath = Join-Path $root "AGENTS.md"
    if (Test-Path $agentsMdPath) {
        $content = Get-Content $agentsMdPath -Raw
        $content = $content -replace "(?<![a-zA-Z0-9_-])kit/", "$Name/"
        $content = $content -replace "(?<![a-zA-Z0-9_-])kit\\", "$Name\"
        Set-Content -Path $agentsMdPath -Value $content.TrimEnd() -Encoding utf8
        Write-Host "  Updated AGENTS.md references to $Name/" -ForegroundColor Green
    }

    Write-Host "  Config and instruction files updated." -ForegroundColor Green
}

# Step 4: Initialize memory baseline
Write-Host ""
$initScript = Join-Path $kitPath "scripts\initialize_memory.py"
if ($NewRepo) {
    Write-Host "  Skipping memory initializer (-NewRepo flag set)" -ForegroundColor Yellow
    Write-Host "  Fill in $Name\memory\state.md with your project objective before starting work."
} else {
    Write-Host "  Running memory initializer..." -ForegroundColor Cyan
    python $initScript --write
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Memory initializer failed. Check Python is available." -ForegroundColor Red
        exit 1
    } else {
        Write-Host "  Memory baseline written." -ForegroundColor Green
    }
}

# Step 5: Write project name into memory files
if ($Name -ne "") {
    Write-Host ""
    Write-Host "  Tagging project as: $Name" -ForegroundColor Cyan

    # .project-name marker file
    Set-Content -Path (Join-Path $kitPath ".project-name") -Value $Name -Encoding utf8
    Write-Host "  Wrote $Name/.project-name" -ForegroundColor Green

    # kit/README.md
    $readmePath = Join-Path $kitPath "README.md"
    $readmeContent = "# Kit: $Name`n`nMemory and session continuity kit for the **$Name** project.`nSee ``memory/state.md`` for current project state.`n"
    Set-Content -Path $readmePath -Value $readmeContent -Encoding utf8
    Write-Host "  Updated $Name/README.md" -ForegroundColor Green

    # state.md heading
    $statePath = Join-Path $kitPath "memory\state.md"
    if (Test-Path $statePath) {
        $stateContent = Get-Content $statePath -Raw
        $stateContent = $stateContent -replace "^# .*Project State", "# $Name - Project State"
        Set-Content -Path $statePath -Value $stateContent.TrimEnd() -Encoding utf8
        Write-Host "  Updated $Name/memory/state.md heading" -ForegroundColor Green
    }
}

# Done
Write-Host ""
Write-Host "=== Setup complete ===" -ForegroundColor Cyan
Write-Host ""
if ($Name -ne "") { Write-Host "  Project : $Name" }
Write-Host "  Agent   : $Agent"
Write-Host "  Kit dir : $targetKitName/"
Write-Host ""
if ($NewRepo) {
    Write-Host "  Next: edit $targetKitName\memory\state.md with your project objective."
} else {
    Write-Host "  Next: review $targetKitName\memory\state.md and refine it to match real project goals."
}
Write-Host "  Then open Claude Code - memory context injects automatically at each session start."
Write-Host ""
