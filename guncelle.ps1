# Uygulamada değişiklik yapıldıktan sonra yeni sürümü GitHub'a gönderir.
# Çalıştırma:  powershell -ExecutionPolicy Bypass -File guncelle.ps1
$ErrorActionPreference = 'Stop'
$env:Path = "C:\Program Files\Git\cmd;C:\Program Files\GitHub CLI;" + $env:Path
$kok = Split-Path $PSScriptRoot -Parent
& "$kok\kaynak\derle.ps1"                                   # kaynaktan github-yukle klasörünü yeniden üret
Get-ChildItem $PSScriptRoot -File | Where-Object { $_.Name -notin 'README.md','.nojekyll','yayinla.ps1','guncelle.ps1','yayinla.cmd','guncelle.cmd' } | Remove-Item
Copy-Item "$kok\github-yukle\*" $PSScriptRoot -Force
Set-Location $PSScriptRoot
git add -A
if (git status --porcelain) {
  git commit -q -m ("Güncelleme " + (Get-Date -Format 'yyyy-MM-dd HH:mm'))
  git push
  Write-Host "Yeni sürüm gönderildi. Uygulama internete bağlanınca kendisi güncellenir."
} else { Write-Host "Değişiklik yok." }
