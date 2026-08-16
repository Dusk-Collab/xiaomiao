# 探测微信开发者工具窗口结构
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root  = [System.Windows.Automation.AutomationElement]::RootElement
$names = @('微信开发者工具','WeChat Developer Tools','微信开发者工具文档站')
$win   = $null
foreach ($n in $names) {
  $w = $root.FindFirst([System.Windows.Automation.TreeScope]::Children,
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $n)))
  if ($w) { $win = $w; break }
}
if (-not $win) { Write-Output 'NO_WINDOW'; exit 1 }

Write-Output ("TITLE: " + $win.Current.Name)
Write-Output ("PID  : " + $win.Current.ProcessId)

# 列出所有有 Name 的元素（最多 100 个）
$all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.AutomationElement]::NotCondition)
$count = 0
$out = @()
foreach ($el in $all) {
  $name = $el.Current.Name
  $ctrl = $el.Current.ControlType.ProgrammaticName
  $auto = $el.Current.AutomationId
  if ($name -or $auto) {
    $out += "$ctrl | name=$name | id=$auto"
    $count++
  }
  if ($count -ge 200) { break }
}
$out | Out-String
