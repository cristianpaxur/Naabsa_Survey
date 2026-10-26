param(
  [Parameter(Mandatory = $true)][string]$InputDocx,
  [Parameter(Mandatory = $true)][string]$OutputPdf,
  [Parameter(Mandatory = $true)][string]$PageMap
)
$ErrorActionPreference = 'Stop'
$sourcePath = (Resolve-Path -LiteralPath $InputDocx).Path
$pdfPath = [IO.Path]::GetFullPath($OutputPdf)
$mapPath = [IO.Path]::GetFullPath($PageMap)
$beforeWordIds = @(Get-Process -Name WINWORD -ErrorAction SilentlyContinue | ForEach-Object Id)
$wordInstance = $null
$wordDocument = $null
$owned = $false
try {
  $wordInstance = New-Object -ComObject Word.Application
  $newWordIds = @(Get-Process -Name WINWORD -ErrorAction SilentlyContinue | ForEach-Object Id | Where-Object { $_ -notin $beforeWordIds })
  if ($newWordIds.Count -ne 1 -or $wordInstance.Documents.Count -ne 0 -or $wordInstance.ProtectedViewWindows.Count -ne 0) {
    throw 'Dedicated Word ownership could not be established.'
  }
  $owned = $true
  $wordInstance.Visible = $false
  $wordInstance.DisplayAlerts = 0
  $wordInstance.AutomationSecurity = 3
  $wordDocument = $wordInstance.Documents.Open($sourcePath, $false, $true, $false)
  $wordDocument.Repaginate()
  $pages = @{}
  foreach ($bqsBookmark in $wordDocument.Bookmarks) {
    if ($bqsBookmark.Name.StartsWith('bqs_')) {
      $pages[$bqsBookmark.Name] = $bqsBookmark.Range.Information(3)
    }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($bqsBookmark)
  }
  $pages | ConvertTo-Json | Set-Content -LiteralPath $mapPath -Encoding utf8
  $wordDocument.ExportAsFixedFormat($pdfPath, 17)
  if (-not (Test-Path -LiteralPath $pdfPath)) { throw 'Word did not create PDF.' }
  [pscustomobject]@{ Engine='Microsoft Word COM'; Version=$wordInstance.Version; Build=$wordInstance.Build; Pages=$wordDocument.ComputeStatistics(2); Pdf=$pdfPath; ReadOnly=$wordDocument.ReadOnly } | ConvertTo-Json
} finally {
  if ($owned -and $wordDocument) {
    $bqsSave = 0
    $wordDocument.Close([ref]$bqsSave)
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wordDocument)
  }
  if ($owned -and $wordInstance) { $bqsQuitSave = 0; $wordInstance.Quit([ref]$bqsQuitSave) }
  if ($wordInstance) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wordInstance) }
}
