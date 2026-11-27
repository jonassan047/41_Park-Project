$app = New-Object -ComObject PowerPoint.Application
$had = $app.Presentations.Count
$p = $app.Presentations.Open('D:\Workspace\41_Park-Project\98_Outputs\SES用クイックスタート/2026-11-27-05-PARKクイックスタート-SES.pptx', -1, 0, 0)
$p.Export("$env:TEMP\park-qs\render", 'PNG', 1600, 900)
$p.Slides.Count
$p.Close()
if ($had -eq 0) { $app.Quit() }
