# Hıfz Defteri'ni GitHub'a ilk kez yükler ve GitHub Pages'i açar.
# Çalıştırma:  .\yayinla   (ya da: powershell -ExecutionPolicy Bypass -File yayinla.ps1)
# Not: gh ve git uyarılarını stderr'e yazar; Windows PowerShell 5.1 bunları hata sanmasın diye
# $ErrorActionPreference "Continue" bırakılır ve her adımın sonucu $LASTEXITCODE ile kontrol edilir.
$ErrorActionPreference = 'Continue'
$env:Path = "C:\Program Files\Git\cmd;C:\Program Files\GitHub CLI;" + $env:Path
Set-Location $PSScriptRoot
function Dur($m) { Write-Host ""; Write-Host "HATA: $m" -ForegroundColor Red; exit 1 }

$kullanici = gh api user --jq .login 2>$null
if (-not $kullanici) { Dur "GitHub girişi bulunamadı. Önce: gh auth login" }
Write-Host "GitHub hesabı: $kullanici"
gh auth setup-git 2>$null

# 1) Herkese açık depo (ücretsiz GitHub Pages için açık olmalı; kullanıcı verisi depoda yok)
cmd /c "gh repo view $kullanici/hifz-defteri >nul 2>nul"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Depo oluşturuluyor ve dosyalar yükleniyor..."
  gh repo create hifz-defteri --public `
    --description "Osmanlı usulüyle Kur'an ezber planı (çevrimdışı çalışan PWA). Veriler yalnızca cihazda saklanır." `
    --homepage "https://$kullanici.github.io/hifz-defteri/" --source . --remote origin --push
  if ($LASTEXITCODE -ne 0) { Dur "Depo oluşturulamadı." }
} else {
  Write-Host "Depo zaten var, dosyalar gönderiliyor..."
  $uzak = git remote 2>$null
  if (-not $uzak) { git remote add origin "https://github.com/$kullanici/hifz-defteri.git" }
  git push -u origin main
  if ($LASTEXITCODE -ne 0) { Dur "Dosyalar gönderilemedi." }
}

# 2) GitHub Pages'i aç (main dalı, kök klasör)
cmd /c "gh api repos/$kullanici/hifz-defteri/pages >nul 2>nul"
if ($LASTEXITCODE -ne 0) {
  Write-Host "GitHub Pages açılıyor..."
  '{"source":{"branch":"main","path":"/"}}' | gh api -X POST "repos/$kullanici/hifz-defteri/pages" --input - | Out-Null
  if ($LASTEXITCODE -ne 0) { Dur "GitHub Pages açılamadı. github.com'da depo > Settings > Pages'ten elle açılabilir." }
}
Write-Host ""
Write-Host "Tamam. 1-2 dakika içinde uygulama şu adreste açılır:" -ForegroundColor Green
Write-Host "  https://$kullanici.github.io/hifz-defteri/"
