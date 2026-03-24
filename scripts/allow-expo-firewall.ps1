# Run this script as Administrator to allow Expo/Metro through Windows Firewall.
# This fixes needing --tunnel when your phone can't connect over LAN.
#
# Right-click PowerShell -> "Run as Administrator", then:
#   cd "C:\Personal CS Work\Projects\RimRun"
#   .\scripts\allow-expo-firewall.ps1

$ports = @(
  @{ Port = 8081; Name = "Expo Metro Bundler" }
  @{ Port = 19000; Name = "Expo DevTools" }
  @{ Port = 19001; Name = "Expo DevTools 2" }
  @{ Port = 19002; Name = "Expo DevTools 3" }
)

foreach ($rule in $ports) {
  $existing = netsh advfirewall firewall show rule name=$($rule.Name) 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Rule '$($rule.Name)' already exists. Skipping." -ForegroundColor Yellow
    continue
  }
  netsh advfirewall firewall add rule name=$($rule.Name) dir=in action=allow protocol=TCP localport=$($rule.Port)
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Added rule for port $($rule.Port) ($($rule.Name))" -ForegroundColor Green
  } else {
    Write-Host "Failed to add $($rule.Name). Run as Administrator." -ForegroundColor Red
    exit 1
  }
}

Write-Host "`nDone. Try 'npx expo start' (without --tunnel) and connect from your phone on the same WiFi." -ForegroundColor Cyan
