#Requires -RunAsAdministrator
<#
  自宅Windowsサーバー上で haru-minecraft をタスクスケジューラに登録する。
  設計(APIドキュメント参照)どおり「Nodeプロセスとして自宅Windowsサーバー上で
  タスクスケジューラ自動起動」する前提。race-controller(Go)のようにk3s/Helmへ
  コンテナとしてデプロイしない — TTS/ローカルLLMと同じマシンのGPU/リソースを
  直接共有する必要があるため、クラスタに切り離すとリソース競合の調整が難しくなる。

  使い方:
    cd apps\haru-minecraft
    npm run build
    powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1
#>

param(
  [string]$TaskName = "haru-minecraft",
  [string]$NodeExe = (Get-Command node).Source,
  [string]$WorkingDirectory = (Resolve-Path "$PSScriptRoot\..").Path,
  [string]$EntryPoint = "dist\index.js"
)

$action = New-ScheduledTaskAction `
  -Execute $NodeExe `
  -Argument $EntryPoint `
  -WorkingDirectory $WorkingDirectory

$trigger = New-ScheduledTaskTrigger -AtStartup

$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -StartWhenAvailable

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "haru-minecraft: AI VTuberハルの自動マイクラプレイ(ハル・マイクラ連携契約 v1)" `
  -Force

Write-Host "タスク '$TaskName' を登録しました。$WorkingDirectory\.env を確認してから、次を実行して起動確認してください:"
Write-Host "  Start-ScheduledTask -TaskName $TaskName"
