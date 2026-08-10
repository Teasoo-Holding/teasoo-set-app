<#
Creates GitHub epic issues + story sub-issues from github-issues.json.

Issue creation and sub-issue linking both go through `gh api ... --input <jsonfile>`
rather than passing title/body as command-line arguments. This avoids Windows
native-process argument quoting breaking on titles that contain embedded quotes
or parentheses (e.g. Tenant Admin impersonation ("view as")), and avoids gh api's
-f/--raw-field always sending values as strings (which the sub_issues endpoint
rejects for sub_issue_id, which must be a JSON integer).

Prerequisites:
  1. Install GitHub CLI: https://cli.github.com
  2. Authenticate:  gh auth login
  3. Confirm access to the repo: gh repo view Teasoo-Holding/teasoo-set-app

Usage:
  # Preview only - prints what would be created, creates nothing
  .\Create-GithubIssues.ps1

  # Actually create labels + epics + story sub-issues on GitHub
  .\Create-GithubIssues.ps1 -Execute

  # Limit to one epic (e.g. just EP-1) - useful for a staged rollout
  .\Create-GithubIssues.ps1 -Execute -EpicId EP-1

Re-running is safe: issues already created (tracked in created-mapping.json)
are skipped for creation, but sub-issue linking is re-attempted every run
(idempotent - GitHub no-ops or errors harmlessly if the link already exists),
so a partially-failed run can just be re-run to finish linking.
#>
param(
    [string]$Repo = "Teasoo-Holding/teasoo-set-app",
    [string]$DataFile = "$PSScriptRoot\github-issues.json",
    [string]$MappingFile = "$PSScriptRoot\created-mapping.json",
    [switch]$Execute,
    [string]$EpicId
)

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "GitHub CLI (gh) not found. Install from https://cli.github.com, run 'gh auth login', then re-run this script."
    exit 1
}

$data = Get-Content $DataFile -Raw | ConvertFrom-Json

$mapping = @{}
if (Test-Path $MappingFile) {
    $existing = Get-Content $MappingFile -Raw | ConvertFrom-Json
    foreach ($prop in $existing.PSObject.Properties) {
        $mapping[$prop.Name] = @{
            number = [int]$prop.Value.number
            dbId   = [int64]$prop.Value.dbId
            url    = $prop.Value.url
        }
    }
}

function Save-Mapping {
    $mapping | ConvertTo-Json -Depth 5 | Out-File -FilePath $MappingFile -Encoding utf8
}

# PowerShell 5.1's Set-Content -Encoding utf8 prepends a BOM, which `gh api --input`
# rejects with "Problems parsing JSON". Write UTF-8 without a BOM instead.
function Write-JsonNoBom {
    param([string]$Path, [string]$Content)
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function New-GithubIssue {
    param([string]$Title, [string]$Body, [string[]]$Labels)

    $payload = @{ title = $Title; body = $Body; labels = $Labels } | ConvertTo-Json -Depth 5
    $tmpFile = New-TemporaryFile
    Write-JsonNoBom -Path $tmpFile -Content $payload

    $result = gh api "repos/$Repo/issues" -X POST --input $tmpFile | ConvertFrom-Json
    Remove-Item $tmpFile -Force
    return $result
}

function Add-GithubSubIssue {
    param([int]$ParentNumber, [int64]$SubIssueDbId)

    $payload = @{ sub_issue_id = $SubIssueDbId } | ConvertTo-Json
    $tmpFile = New-TemporaryFile
    Write-JsonNoBom -Path $tmpFile -Content $payload

    gh api "repos/$Repo/issues/$ParentNumber/sub_issues" -X POST --input $tmpFile 2>&1 | Out-Null
    $ok = $?
    Remove-Item $tmpFile -Force
    return $ok
}

if ($Execute) {
    Write-Host "=== Creating labels on $Repo ===" -ForegroundColor Cyan
    foreach ($label in $data.labels) {
        gh label create $label.name --repo $Repo --color $label.color --force | Out-Null
    }
} else {
    Write-Host "[DRY RUN] Would create $($data.labels.Count) labels on $Repo" -ForegroundColor Yellow
}

$epicsToProcess = $data.epics
if ($EpicId) {
    $epicsToProcess = $data.epics | Where-Object { $_.id -eq $EpicId }
    if (-not $epicsToProcess) {
        Write-Error "No epic found with id '$EpicId'."
        exit 1
    }
}

foreach ($epic in $epicsToProcess) {
    $epicLabels = $epic.labels

    if ($mapping.ContainsKey($epic.id)) {
        $epicNumber = $mapping[$epic.id].number
        $epicDbId = $mapping[$epic.id].dbId
        Write-Host "SKIP  $($epic.id) already created -> #$epicNumber"
    }
    elseif ($Execute) {
        $created = New-GithubIssue -Title $epic.title -Body $epic.body -Labels $epicLabels
        $epicNumber = $created.number
        $epicDbId = $created.id

        $mapping[$epic.id] = @{ number = $epicNumber; dbId = $epicDbId; url = $created.html_url }
        Save-Mapping
        Write-Host "EPIC  $($epic.id) -> #$epicNumber ($($created.html_url))" -ForegroundColor Green
    }
    else {
        Write-Host "[DRY RUN] EPIC: $($epic.title)  [labels: $($epicLabels -join ',')]" -ForegroundColor Yellow
        $epicNumber = $null
        $epicDbId = $null
    }

    foreach ($story in $epic.stories) {
        $storyLabels = $story.labels

        if ($mapping.ContainsKey($story.id)) {
            $storyNumber = $mapping[$story.id].number
            $storyDbId = $mapping[$story.id].dbId
            Write-Host "  SKIP  $($story.id) already created -> #$storyNumber"
        }
        elseif ($Execute) {
            $created = New-GithubIssue -Title $story.title -Body $story.body -Labels $storyLabels
            $storyNumber = $created.number
            $storyDbId = $created.id

            $mapping[$story.id] = @{ number = $storyNumber; dbId = $storyDbId; url = $created.html_url }
            Save-Mapping
            Write-Host "  STORY $($story.id) -> #$storyNumber" -ForegroundColor Green
        }
        else {
            Write-Host "  [DRY RUN] STORY: $($story.title)  [labels: $($storyLabels -join ',')]" -ForegroundColor Yellow
            $storyNumber = $null
            $storyDbId = $null
        }

        if ($Execute -and $epicDbId -and $storyDbId) {
            $linked = Add-GithubSubIssue -ParentNumber $epicNumber -SubIssueDbId $storyDbId
            if ($linked) {
                Write-Host "        linked under epic #$epicNumber" -ForegroundColor DarkGreen
            } else {
                Write-Host "        link to epic #$epicNumber failed or already exists (see above)" -ForegroundColor DarkYellow
            }
        }
    }
}

if ($Execute) {
    Write-Host "`nDone. Mapping saved to $MappingFile" -ForegroundColor Cyan
} else {
    Write-Host "`nDry run complete. No issues were created. Re-run with -Execute once ready." -ForegroundColor Cyan
}
