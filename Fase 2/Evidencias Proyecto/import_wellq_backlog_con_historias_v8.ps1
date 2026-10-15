<#
.SYNOPSIS
  Importador optimizado v8 del Product Backlog de WellQ APP Examenes Medicos.

.DESCRIPTION
  - Crea/reutiliza GitHub Issues desde wellq_backlog_con_historias.csv.
  - Usa REST para Issues/labels/assignees (no consume GraphQL del Project).
  - Usa GraphQL solo para GitHub Projects v2.
  - Usa 1 mutacion GraphQL para agregar cada Issue al Project (solo si falta).
  - Actualiza Project fields con gh project item-edit usando IDs directos (sin busquedas por nombre).
  - Reutiliza Issues e items existentes; puede reejecutarse sin duplicar por ID PB/ST.
  - Incluye modo de prueba con -MaxItems para validar pocos items antes de cargar los 123.

.REQUISITOS
  gh auth login
  gh auth refresh -s project

.EJEMPLO DE PRUEBA
  .\import_wellq_backlog_con_historias_v8.ps1 `
    -AndresGitHub "aguarumo" `
    -AstridGitHub "astridcoy" `
    -GenesisGitHub "genecortezz" `
    -Sprint1Start "2026-09-13" `
    -MaxItems 5

.EJEMPLO COMPLETO
  .\import_wellq_backlog_con_historias_v8.ps1 `
    -AndresGitHub "aguarumo" `
    -AstridGitHub "astridcoy" `
    -GenesisGitHub "genecortezz" `
    -Sprint1Start "2026-09-13"
#>

[CmdletBinding()]
param(
    [string]$CsvPath = ".\wellq_backlog_con_historias.csv",
    [string]$Owner = "ch-georgi",
    [string]$Repo = "capstone_005V",
    [string]$ProjectOwnerLogin = "ch-georgi",
    [int]$ProjectNumber = 1,
    [string]$ProjectTitle = "CAPSTONE_005V - WellQ - Grupo 4",
    [string]$ChristopherGitHub = "ch-georgi",
    [string]$AndresGitHub = "",
    [string]$AstridGitHub = "",
    [string]$GenesisGitHub = "",
    [Nullable[datetime]]$Sprint1Start = $null,
    [switch]$UpdateExistingBody,
    [switch]$SkipStretch,
    [string]$StartAt = "",
    [int]$MaxItems = 0,
    [int]$ThrottleMs = 500,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$RepoFull = "$Owner/$Repo"
$script:ProjectId = $null
$script:FieldMap = @{}
$script:ProjectItemByIssueNodeId = @{}
$script:ProjectIssueNumbers = @{}

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Invoke-GhRaw {
    param(
        [Parameter(Mandatory=$true)][string[]]$Arguments,
        [switch]$IgnoreFailure
    )

    if ($DryRun) {
        Write-Host ("[DRY-RUN] gh " + ($Arguments -join " ")) -ForegroundColor DarkGray
        return ""
    }

    $output = & gh @Arguments 2>&1
    $code = $LASTEXITCODE
    $text = ($output -join "`n")

    if ($code -eq 0) { return $text }
    if ($IgnoreFailure) { return $text }

    throw "gh $($Arguments -join ' ') fallo (exit $code):`n$text"
}

function Invoke-GraphQL {
    param(
        [Parameter(Mandatory=$true)][string]$Query,
        [hashtable]$Variables = @{}
    )

    if ($DryRun) {
        Write-Host "[DRY-RUN] GraphQL mutation/query omitida" -ForegroundColor DarkGray
        return $null
    }

    $args = @('api','graphql','-f',"query=$Query")
    foreach ($key in $Variables.Keys) {
        $args += @('-F',"$key=$($Variables[$key])")
    }

    $raw = Invoke-GhRaw -Arguments $args
    return ($raw | ConvertFrom-Json)
}

function Get-GraphQLRate {
    if ($DryRun) { return $null }
    $query = 'query { rateLimit { limit remaining used resetAt cost } }'
    try {
        return (Invoke-GraphQL -Query $query).data.rateLimit
    } catch {
        Write-Warning "No se pudo consultar rateLimit GraphQL: $($_.Exception.Message)"
        return $null
    }
}

function Assert-GraphQLCapacity {
    param([int]$MinimumRemaining = 300)
    $rate = Get-GraphQLRate
    if ($null -eq $rate) { return }

    Write-Host "GraphQL: remaining=$($rate.remaining)/$($rate.limit), used=$($rate.used), resetAt=$($rate.resetAt)" -ForegroundColor DarkGray
    if ([int]$rate.remaining -lt $MinimumRemaining) {
        throw "Quedan solo $($rate.remaining) puntos GraphQL. Se detiene preventivamente. Reejecuta despues de $($rate.resetAt); el script reutilizara lo ya creado."
    }
}

function Normalize-PersonName {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
    $normalized = $Value.Normalize([Text.NormalizationForm]::FormD)
    $chars = foreach ($c in $normalized.ToCharArray()) {
        $cat = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($c)
        if ($cat -ne [Globalization.UnicodeCategory]::NonSpacingMark) { $c }
    }
    $plain = (-join $chars).Normalize([Text.NormalizationForm]::FormC).ToLowerInvariant()
    return (($plain -replace '[^a-z0-9 ]',' ') -replace '\s+',' ').Trim()
}

function Resolve-Assignees {
    param([string]$Names)
    if ([string]::IsNullOrWhiteSpace($Names)) { return @() }

    $map = @{}
    $map[(Normalize-PersonName 'Christopher Georgi')] = $ChristopherGitHub
    $map[(Normalize-PersonName 'Andres Guarumo')] = $AndresGitHub
    $map[(Normalize-PersonName 'Astrid Coy')] = $AstridGitHub
    $map[(Normalize-PersonName 'Genesis Cortez')] = $GenesisGitHub

    $result = @()
    foreach ($name in ($Names -split ';')) {
        $n = $name.Trim()
        if ([string]::IsNullOrWhiteSpace($n)) { continue }
        $key = Normalize-PersonName $n
        if ($map.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace([string]$map[$key])) {
            $result += [string]$map[$key]
        } else {
            Write-Warning "No hay username GitHub configurado para '$n'."
        }
    }
    return @($result | Select-Object -Unique)
}

function New-IssueBody {
    param($Row)

    $criteriaLines = @()
    if (-not [string]::IsNullOrWhiteSpace($Row.AcceptanceCriteria)) {
        foreach ($criterion in ($Row.AcceptanceCriteria -split '\s\|\s')) {
            if (-not [string]::IsNullOrWhiteSpace($criterion)) {
                $criteriaLines += "- [ ] $($criterion.Trim())"
            }
        }
    }

    $criteriaText = if ($criteriaLines.Count -gt 0) { $criteriaLines -join "`n" } else { "- [ ] Criterios definidos y validados por el equipo" }
    $spText = if ([string]::IsNullOrWhiteSpace($Row.StoryPoints)) { "Recurrente / sin estimacion puntual" } else { $Row.StoryPoints }
    $sprintText = if ([string]::IsNullOrWhiteSpace($Row.Sprint)) { "Transversal / recurrente" } else { $Row.Sprint }

    return @"
## Historia de usuario

$($Row.UserStory)

## Descripcion

$($Row.Description)

## Criterios de aceptacion

$criteriaText

## Planificacion

- **ID:** $($Row.Id)
- **Epic:** $($Row.Epic)
- **Prioridad:** $($Row.Priority)
- **Sprint:** $sprintText
- **Story Points:** $spText
- **Area:** $($Row.Area)

## Definition of Done

- [ ] Implementacion completada
- [ ] Criterios de aceptacion cumplidos
- [ ] Lint y typecheck exitosos cuando corresponda
- [ ] Pruebas agregadas o actualizadas cuando corresponda
- [ ] Pull Request revisado
- [ ] CI exitoso
- [ ] Documentacion actualizada si la tarea modifica API, arquitectura o comportamiento visible
"@
}

function Get-PlannedDate {
    param($Row, [string]$ExplicitField, [string]$WeekField, [switch]$EndOfWeek)

    $explicit = $Row.$ExplicitField
    if (-not [string]::IsNullOrWhiteSpace($explicit)) { return $explicit }
    if ($null -eq $Sprint1Start) { return "" }

    $weekRaw = $Row.$WeekField
    if ([string]::IsNullOrWhiteSpace($weekRaw)) { return "" }
    $week = 0
    if (-not [int]::TryParse($weekRaw, [ref]$week)) { return "" }

    $d = $Sprint1Start.Date.AddDays(7 * ($week - 1))
    if ($EndOfWeek) { $d = $d.AddDays(6) }
    return $d.ToString('yyyy-MM-dd')
}

function Get-Field([string]$Name) {
    if (-not $script:FieldMap.ContainsKey($Name)) {
        throw "No se encontro el field '$Name' en el Project."
    }
    return $script:FieldMap[$Name]
}

function Escape-GraphQLString([string]$Value) {
    if ($null -eq $Value) { return "" }
    return $Value.Replace('\\','\\\\').Replace('"','\\"').Replace("`r",'').Replace("`n",'\\n')
}

function Get-SingleSelectOptionId {
    param([string]$FieldName, [string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
    $field = Get-Field $FieldName
    $option = @($field.options) | Where-Object { $_.name -eq $Value } | Select-Object -First 1
    if ($null -eq $option) {
        Write-Warning "No existe la opcion '$Value' en '$FieldName'. Se omitira ese field."
        return $null
    }
    return [string]$option.id
}

function Add-IssueToProject {
    param([string]$IssueNodeId)

    if ($script:ProjectItemByIssueNodeId.ContainsKey($IssueNodeId)) {
        return [string]$script:ProjectItemByIssueNodeId[$IssueNodeId]
    }

    if ($DryRun) {
        $fake = "PVTI_DRYRUN_$IssueNodeId"
        $script:ProjectItemByIssueNodeId[$IssueNodeId] = $fake
        Write-Host "  [DRY-RUN] Agregar Issue al Project" -ForegroundColor DarkGray
        return $fake
    }

    $query = @'
mutation($projectId:ID!, $contentId:ID!) {
  addProjectV2ItemById(input:{projectId:$projectId, contentId:$contentId}) {
    item { id }
  }
}
'@
    $obj = Invoke-GraphQL -Query $query -Variables @{ projectId=$script:ProjectId; contentId=$IssueNodeId }
    $itemId = [string]$obj.data.addProjectV2ItemById.item.id
    if ([string]::IsNullOrWhiteSpace($itemId)) { throw "No se obtuvo item ID al agregar Issue al Project." }
    $script:ProjectItemByIssueNodeId[$IssueNodeId] = $itemId
    return $itemId
}

function Sync-ProjectFields {
    param($Row, [string]$ItemId)

    $singleSelects = [ordered]@{
        'Status'   = $Row.Status
        'Priority' = $Row.Priority
        'Size'     = $Row.Size
        'Epic'     = $Row.Epic
        'Sprint'   = $Row.Sprint
        'Area'     = $Row.Area
    }

    foreach ($fieldName in $singleSelects.Keys) {
        $value = [string]$singleSelects[$fieldName]
        if ([string]::IsNullOrWhiteSpace($value)) { continue }
        $optionId = Get-SingleSelectOptionId -FieldName $fieldName -Value $value
        if ([string]::IsNullOrWhiteSpace($optionId)) { continue }
        $fieldId = [string](Get-Field $fieldName).id
        if ($DryRun) {
            Write-Host "  [DRY-RUN] $fieldName = $value" -ForegroundColor DarkGray
        } else {
            Invoke-GhRaw -Arguments @('project','item-edit','--id',$ItemId,'--project-id',$script:ProjectId,'--field-id',$fieldId,'--single-select-option-id',$optionId) | Out-Null
        }
    }

    $numbers = [ordered]@{
        'Estimate'     = $Row.Estimate
        'Story Points' = $Row.StoryPoints
    }
    foreach ($fieldName in $numbers.Keys) {
        $raw = [string]$numbers[$fieldName]
        if ([string]::IsNullOrWhiteSpace($raw)) { continue }
        $num = 0.0
        if (-not [double]::TryParse($raw,[System.Globalization.NumberStyles]::Any,[System.Globalization.CultureInfo]::InvariantCulture,[ref]$num)) {
            Write-Warning "Valor numerico invalido para ${fieldName}: '$raw'."
            continue
        }
        $fieldId = [string](Get-Field $fieldName).id
        $numText = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture,'{0}', $num)
        if ($DryRun) {
            Write-Host "  [DRY-RUN] $fieldName = $numText" -ForegroundColor DarkGray
        } else {
            Invoke-GhRaw -Arguments @('project','item-edit','--id',$ItemId,'--project-id',$script:ProjectId,'--field-id',$fieldId,'--number',$numText) | Out-Null
        }
    }

    $startDate = Get-PlannedDate -Row $Row -ExplicitField 'StartDate' -WeekField 'StartWeek'
    $targetDate = Get-PlannedDate -Row $Row -ExplicitField 'TargetDate' -WeekField 'EndWeek' -EndOfWeek
    $dates = [ordered]@{
        'Start date'  = $startDate
        'Target date' = $targetDate
    }
    foreach ($fieldName in $dates.Keys) {
        $value = [string]$dates[$fieldName]
        if ([string]::IsNullOrWhiteSpace($value)) { continue }
        $fieldId = [string](Get-Field $fieldName).id
        if ($DryRun) {
            Write-Host "  [DRY-RUN] $fieldName = $value" -ForegroundColor DarkGray
        } else {
            Invoke-GhRaw -Arguments @('project','item-edit','--id',$ItemId,'--project-id',$script:ProjectId,'--field-id',$fieldId,'--date',$value) | Out-Null
        }
    }
}

# -----------------------------------------------------------------------------
# Preflight
# -----------------------------------------------------------------------------
Write-Step "Preflight"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI (gh) no esta instalado o no esta en PATH."
}
if (-not (Test-Path $CsvPath)) {
    throw "No se encontro el CSV: $CsvPath"
}

Invoke-GhRaw -Arguments @('auth','status') | Out-Null

Write-Host "Repositorio:    $RepoFull"
Write-Host "Project owner: $ProjectOwnerLogin"
Write-Host "Project:       #$ProjectNumber - $ProjectTitle"
Write-Host "CSV:           $CsvPath"
if ($null -ne $Sprint1Start) {
    Write-Host "Inicio S1:     $($Sprint1Start.ToString('yyyy-MM-dd'))"
}
if ($MaxItems -gt 0) {
    Write-Host "Modo prueba:   MaxItems=$MaxItems" -ForegroundColor Yellow
}

Assert-GraphQLCapacity -MinimumRemaining 300

# -----------------------------------------------------------------------------
# Cargar Project y fields en UNA consulta
# -----------------------------------------------------------------------------
Write-Step "Cargando Project y fields"

if ($DryRun) {
    $script:ProjectId = 'PVT_DRYRUN'
    $script:FieldMap = @{}
} else {
    $query = @'
query($login:String!, $number:Int!) {
  user(login:$login) {
    projectV2(number:$number) {
      id
      title
      fields(first:100) {
        nodes {
          ... on ProjectV2Field { id name dataType }
          ... on ProjectV2SingleSelectField { id name dataType options { id name } }
          ... on ProjectV2IterationField { id name dataType }
        }
      }
    }
  }
}
'@
    $obj = Invoke-GraphQL -Query $query -Variables @{ login=$ProjectOwnerLogin; number=$ProjectNumber }
    $project = $obj.data.user.projectV2
    if ($null -eq $project) { throw "No se encontro Project #$ProjectNumber para '$ProjectOwnerLogin'." }
    if (-not [string]::IsNullOrWhiteSpace($ProjectTitle) -and $project.title -ne $ProjectTitle) {
        throw "El Project #$ProjectNumber existe, pero su titulo es '$($project.title)' y no '$ProjectTitle'."
    }
    $script:ProjectId = [string]$project.id
    foreach ($f in @($project.fields.nodes)) {
        if ($null -ne $f -and -not [string]::IsNullOrWhiteSpace([string]$f.name)) {
            $script:FieldMap[[string]$f.name] = $f
        }
    }

    $required = @('Status','Priority','Size','Estimate','Start date','Target date','Epic','Sprint','Story Points','Area')
    foreach ($name in $required) {
        if (-not $script:FieldMap.ContainsKey($name)) { throw "Falta el field '$name' en el Project." }
    }
    Write-Host "Project encontrado: $($project.title) ($script:ProjectId)"
    Write-Host "Fields cacheados: $($script:FieldMap.Count)"
}

# -----------------------------------------------------------------------------
# Indexar items existentes del Project (paginado)
# -----------------------------------------------------------------------------
Write-Step "Indexando items existentes del Project"
if (-not $DryRun) {
    $cursor = $null
    do {
        if ($null -eq $cursor) {
            $q = @'
query($projectId:ID!) {
  node(id:$projectId) {
    ... on ProjectV2 {
      items(first:100) {
        nodes {
          id
          content {
            ... on Issue { id number }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}
'@
            $o = Invoke-GraphQL -Query $q -Variables @{ projectId=$script:ProjectId }
        } else {
            $q = @'
query($projectId:ID!, $cursor:String!) {
  node(id:$projectId) {
    ... on ProjectV2 {
      items(first:100, after:$cursor) {
        nodes {
          id
          content {
            ... on Issue { id number }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}
'@
            $o = Invoke-GraphQL -Query $q -Variables @{ projectId=$script:ProjectId; cursor=$cursor }
        }
        $conn = $o.data.node.items
        foreach ($item in @($conn.nodes)) {
            if ($null -ne $item.content -and -not [string]::IsNullOrWhiteSpace([string]$item.content.id)) {
                $script:ProjectItemByIssueNodeId[[string]$item.content.id] = [string]$item.id
                if ($null -ne $item.content.number) {
                    $script:ProjectIssueNumbers[[string]$item.content.number] = $true
                }
            }
        }
        $cursor = if ($conn.pageInfo.hasNextPage) { [string]$conn.pageInfo.endCursor } else { $null }
    } while ($null -ne $cursor)
    Write-Host "Items Issue ya presentes en Project: $($script:ProjectItemByIssueNodeId.Count)"
}

# -----------------------------------------------------------------------------
# Leer y filtrar CSV
# -----------------------------------------------------------------------------
Write-Step "Leyendo backlog"
$rows = @(Import-Csv -Path $CsvPath -Encoding UTF8)
if ($SkipStretch) { $rows = @($rows | Where-Object { -not $_.Id.StartsWith('ST-') }) }

if (-not [string]::IsNullOrWhiteSpace($StartAt)) {
    $startFound = $false
    $filtered = @()
    foreach ($r in $rows) {
        if ($r.Id -eq $StartAt) { $startFound = $true }
        if ($startFound) { $filtered += $r }
    }
    if (-not $startFound) { throw "No se encontro StartAt='$StartAt' en el CSV." }
    $rows = $filtered
}

if ($MaxItems -gt 0 -and $rows.Count -gt $MaxItems) {
    $rows = @($rows | Select-Object -First $MaxItems)
}
Write-Host "Items a procesar: $($rows.Count)"

# -----------------------------------------------------------------------------
# Labels del repositorio por REST
# -----------------------------------------------------------------------------
Write-Step "Preparando labels"
$allLabels = @()
foreach ($row in $rows) {
    if (-not [string]::IsNullOrWhiteSpace($row.Labels)) {
        $allLabels += ($row.Labels -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    }
}
$allLabels = @($allLabels | Select-Object -Unique)

if (-not $DryRun) {
    # IMPORTANTE: en `gh api`, usar -f sin forzar GET cambia el metodo a POST.
    # Para listar labels usamos un GET explicito con query string, evitando "Invalid request".
    $existingLabelRaw = Invoke-GhRaw -Arguments @('api','-X','GET',"repos/$RepoFull/labels?per_page=100")
    $existingLabelObjects = @($existingLabelRaw | ConvertFrom-Json)
    $existingLabels = @($existingLabelObjects | ForEach-Object { $_.name })
    Write-Host "Labels existentes en repositorio: $($existingLabels.Count)" -ForegroundColor DarkGray
    foreach ($label in $allLabels) {
        if ($existingLabels -notcontains $label) {
            $color = if ($label.StartsWith('type:')) { '1D76DB' } else { 'D4C5F9' }
            $payload = @{ name=$label; color=$color; description='Creado para el Product Backlog WellQ' } | ConvertTo-Json -Compress
            $null = $payload | & gh api -X POST "repos/$RepoFull/labels" --input - 2>&1
            if ($LASTEXITCODE -eq 0) { Write-Host "Creado label: $label" }
        }
    }
}

# -----------------------------------------------------------------------------
# Indexar Issues existentes por REST (sin GraphQL)
# -----------------------------------------------------------------------------
Write-Step "Indexando Issues existentes"
$existingById = @{}
$duplicatesById = @{}
if (-not $DryRun) {
    # REST + jq devuelve una linea TSV por Issue y evita diferencias de ConvertFrom-Json
    # entre Windows PowerShell 5.1 y PowerShell 7.
    $lines = & gh api --paginate -X GET "repos/$RepoFull/issues?state=all&per_page=100" --jq '.[] | select(.pull_request == null) | [.number, .node_id, .html_url, .title] | @tsv' 2>&1
    if ($LASTEXITCODE -ne 0) { throw "No se pudieron indexar las Issues existentes: $($lines -join '`n')" }

    foreach ($line in @($lines)) {
        if ([string]::IsNullOrWhiteSpace([string]$line)) { continue }
        $parts = ([string]$line) -split "`t", 4
        if ($parts.Count -lt 4) { continue }
        $number = [int]$parts[0]
        $nodeId = [string]$parts[1]
        $url = [string]$parts[2]
        $titleText = [string]$parts[3]
        if ($titleText -notmatch '^\[((?:PB|ST)-\d{3})\]') { continue }
        $backlogId = $Matches[1]
        $obj = [pscustomobject]@{ number=$number; node_id=$nodeId; html_url=$url; title=$titleText }

        if (-not $existingById.ContainsKey($backlogId)) {
            $existingById[$backlogId] = $obj
        } else {
            if (-not $duplicatesById.ContainsKey($backlogId)) { $duplicatesById[$backlogId] = @($existingById[$backlogId]) }
            $duplicatesById[$backlogId] += $obj
            # Prioriza la Issue que ya esta dentro del Project; si ninguna lo esta,
            # conserva la de menor numero.
            $current = $existingById[$backlogId]
            $currentInProject = $script:ProjectItemByIssueNodeId.ContainsKey([string]$current.node_id)
            $candidateInProject = $script:ProjectItemByIssueNodeId.ContainsKey($nodeId)
            if (($candidateInProject -and -not $currentInProject) -or ((-not $currentInProject -and -not $candidateInProject) -and $number -lt [int]$current.number)) {
                $existingById[$backlogId] = $obj
            }
        }
    }
}
Write-Host "Issues PB/ST existentes: $($existingById.Count)"
if ($duplicatesById.Count -gt 0) {
    Write-Warning "Se detectaron IDs duplicados creados por intentos anteriores: $((@($duplicatesById.Keys) | Sort-Object) -join ', '). El importador reutilizara una sola Issue por ID y no creara mas duplicados."
}

# -----------------------------------------------------------------------------
# Importar
# -----------------------------------------------------------------------------
Write-Step "Importando backlog"
$created = 0
$reused = 0
$failed = 0
$processed = 0

foreach ($row in $rows) {
    $processed++
    $id = $row.Id.Trim()
    $title = "[$id] $($row.Title.Trim())"
    $body = New-IssueBody -Row $row
    $assignees = @(Resolve-Assignees -Names $row.Assignees)
    $labels = @()
    if (-not [string]::IsNullOrWhiteSpace($row.Labels)) {
        $labels = @($row.Labels -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    }

    Write-Host "[$processed/$($rows.Count)] $title" -ForegroundColor White

    try {
        $issue = $null

        if (-not $DryRun -and $existingById.ContainsKey($id)) {
            $issue = $existingById[$id]
            $reused++
            Write-Host "  Reutilizando Issue #$($issue.number)" -ForegroundColor DarkYellow

            # Sincroniza metadata de las Issues creadas/reutilizadas usando REST.
            $patch = @{
                title = $title
                labels = $labels
                assignees = $assignees
            }
            if ($UpdateExistingBody) { $patch.body = $body }
            $json = $patch | ConvertTo-Json -Depth 5 -Compress
            $raw = $json | & gh api -X PATCH "repos/$RepoFull/issues/$($issue.number)" --input - 2>&1
            if ($LASTEXITCODE -ne 0) { throw "Fallo actualizando Issue #$($issue.number): $($raw -join '`n')" }
            $issue = $raw | ConvertFrom-Json
        }
        elseif ($DryRun) {
            Write-Host "  [DRY-RUN] Crear Issue REST" -ForegroundColor DarkGray
            $issue = [pscustomobject]@{ number=0; html_url="https://github.com/$RepoFull/issues/DRYRUN-$id"; node_id="I_DRYRUN_$id" }
        }
        else {
            $payload = @{
                title = $title
                body = $body
                labels = $labels
                assignees = $assignees
            } | ConvertTo-Json -Depth 5 -Compress

            $raw = $payload | & gh api -X POST "repos/$RepoFull/issues" --input - 2>&1
            if ($LASTEXITCODE -ne 0) { throw "Fallo creando Issue: $($raw -join '`n')" }
            $issue = $raw | ConvertFrom-Json
            $existingById[$id] = $issue
            $created++
            Write-Host "  Creada Issue #$($issue.number)" -ForegroundColor Green
        }

        $issueNodeId = [string]$issue.node_id
        if ([string]::IsNullOrWhiteSpace($issueNodeId)) { throw "La Issue $id no tiene node_id." }

        $itemId = Add-IssueToProject -IssueNodeId $issueNodeId
        Sync-ProjectFields -Row $row -ItemId $itemId

        if (($processed % 20) -eq 0 -and -not $DryRun) {
            Assert-GraphQLCapacity -MinimumRemaining 300
        }

        if ($ThrottleMs -gt 0 -and -not $DryRun) {
            Start-Sleep -Milliseconds $ThrottleMs
        }
    }
    catch {
        $failed++
        Write-Warning "Fallo ${id}: $($_.Exception.Message)"

        if ($_.Exception.Message -match '(?i)rate limit') {
            Write-Warning "Se detecto rate limit. Se detiene para evitar una cascada de errores. Reejecuta cuando GraphQL se reinicie; no se duplicaran Issues por ID."
            break
        }
    }
}

Write-Step "Resumen"
Write-Host "Creadas:      $created" -ForegroundColor Green
Write-Host "Reutilizadas: $reused" -ForegroundColor Yellow
Write-Host "Fallidas:     $failed" -ForegroundColor $(if ($failed -eq 0) { 'Green' } else { 'Red' })
Write-Host "Procesadas:   $processed"
Write-Host "Solicitadas:  $($rows.Count)"

if (-not $DryRun) {
    $rate = Get-GraphQLRate
    if ($null -ne $rate) {
        Write-Host "GraphQL final: remaining=$($rate.remaining)/$($rate.limit), used=$($rate.used), resetAt=$($rate.resetAt)" -ForegroundColor DarkGray
    }
}

if ($failed -gt 0) {
    Write-Warning "Hubo items con errores. Corrige el problema y vuelve a ejecutar; Issues e items existentes se reutilizan."
}

Write-Host "`nImportacion finalizada." -ForegroundColor Cyan
