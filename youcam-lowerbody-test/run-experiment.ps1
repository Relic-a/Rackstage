param(
    [string]$Root = "C:\Users\ezana\Documents\bpsupreme\RackStage\youcam-lowerbody-test"
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if ([string]::IsNullOrWhiteSpace($env:YOUCAM_API_KEY)) { throw 'YOUCAM_API_KEY is required in the process environment.' }

$base = 'https://yce-api-01.makeupar.com/s2s/v2.0'
$responseDir = Join-Path $Root 'responses'
$outputDir = Join-Path $Root 'outputs'
$headers = @{ Authorization = "Bearer $env:YOUCAM_API_KEY"; 'Content-Type' = 'application/json' }

function Save-Json($Path, $Value) {
    $Value | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $Path -Encoding utf8
}

function Call-YouCam($Method, $Uri, $Body, $SavePath) {
    try {
        if ($null -eq $Body) {
            $result = Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers
        } else {
            $result = Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -Body ($Body | ConvertTo-Json -Depth 10)
        }
        Save-Json $SavePath $result
        return $result
    } catch {
        $errorBody = $_.ErrorDetails.Message
        try { $parsed = $errorBody | ConvertFrom-Json } catch { $parsed = [pscustomobject]@{ message = $errorBody; exception = $_.Exception.Message } }
        Save-Json $SavePath $parsed
        throw
    }
}

function Upload-Image($InputPath, $Label) {
    $item = Get-Item -LiteralPath $InputPath
    $contentType = if ($item.Extension -ieq '.png') { 'image/png' } else { 'image/jpeg' }
    $payload = @{ files = @(@{ content_type = $contentType; file_name = $item.Name; file_size = $item.Length }) }
    Save-Json (Join-Path $responseDir "$Label-upload-request.redacted.json") $payload
    $created = Call-YouCam 'POST' "$base/file/cloth-v3" $payload (Join-Path $responseDir "$Label-upload-create-response.json")
    $record = $created.data.files | Select-Object -First 1
    if ($null -eq $record) { throw "No upload file record returned for $Label." }
    $request = $record.requests | Select-Object -First 1
    if ($null -eq $request -or [string]::IsNullOrWhiteSpace($request.url)) { throw "No presigned upload request returned for $Label." }
    $contentTypeHeader = if ($request.headers.'Content-Type') { [string]$request.headers.'Content-Type' } else { $contentType }
    & curl.exe --silent --show-error --fail --request PUT --header "Content-Type: $contentTypeHeader" --upload-file $InputPath $request.url
    if ($LASTEXITCODE -ne 0) { throw "Presigned upload failed for $Label (curl exit $LASTEXITCODE)." }
    Save-Json (Join-Path $responseDir "$Label-upload-transfer.json") @{ status = 'uploaded'; file_id = $record.file_id; file_name = $item.Name }
    return $record.file_id
}

$person = Join-Path $Root 'inputs\person_youcam_sample.png'
$trousers = Join-Path $Root 'inputs\trousers_met_cc0.jpg'
$personId = Upload-Image $person 'person'
$trousersId = Upload-Image $trousers 'trousers'

$taskPayload = @{ src_file_id = $personId; ref_file_id = $trousersId; garment_category = 'lower_body' }
Save-Json (Join-Path $responseDir 'attempt-01-task-request.redacted.json') $taskPayload
$taskCreate = Call-YouCam 'POST' "$base/task/cloth-v3" $taskPayload (Join-Path $responseDir 'attempt-01-task-create-response.json')
$taskId = $taskCreate.data.task_id
if ([string]::IsNullOrWhiteSpace($taskId)) { throw 'Task creation returned no task_id.' }

$history = @()
for ($i = 1; $i -le 24; $i++) {
    Start-Sleep -Seconds 5
    $status = Call-YouCam 'GET' "$base/task/cloth-v3/$taskId" $null (Join-Path $responseDir ("attempt-01-status-{0:D2}.json" -f $i))
    $history += $status
    $state = $status.data.task_status
    if ($state -eq 'success') {
        $url = $status.data.results.url
        if (-not [string]::IsNullOrWhiteSpace($url)) {
            Invoke-WebRequest -Uri $url -OutFile (Join-Path $outputDir 'attempt-01-result.png')
        }
        break
    }
    if ($state -in @('failed','error')) { break }
}
Save-Json (Join-Path $responseDir 'attempt-01-status-history.json') $history
