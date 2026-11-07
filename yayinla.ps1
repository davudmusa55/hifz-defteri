# Hıfz Defteri'ni GitHub'a ilk kez yükler ve GitHub Pages'i açar.
# Çalıştırma:  powershell -ExecutionPolicy Bypass -File yayinla.ps1
$ErrorActionPreference = 'Stop'
$env:Path = "C:\Program Files\Git\cmd;C:\Program Files\GitHub CLI;" + $env:Path
Set-Location $PSScriptRoot
$kullanici = gh api user --jq .login
Write-Host "GitHub hesabı: $kullanici"

gh auth setup-git

# 1) Herkese açık depo oluştur ve dosyaları yükle (ücretsiz GitHub Pages için depo açık olmalı; kullanıcı verisi depoda yok)
gh repo view "$kullanici/hifz-defteri" *> $null
if ($LASTEXITCODE -ne 0) {
  gh repo create hifz-defteri --public `
    --description "Osmanlı usulüyle Kur'an ezber planı (çevrimdışı çalışan PWA). Veriler yalnızca cihazda saklanır." `
    --homepage "https://$kullanici.github.io/hifz-defteri/" --source . --remote origin --push
} else {
  if (-not (git remote)) { git remote add origin "https://github.com/$kullanici/hifz-defteri.git" }
  git push -u origin main
}

# 2) GitHub Pages'i aç (main dalı, kök klasör)
gh api "repos/$kullanici/hifz-defteri/pages" *> $null
if ($LASTEXITCODE -ne 0) {
  '{"source":{"branch":"main","path":"/"}}' | gh api -X POST "repos/$kullanici/hifz-defteri/pages" --input - | Out-Null
}
Write-Host ""
Write-Host "Tamam. 1-2 dakika içinde uygulama şu adreste açılır:"
Write-Host "  https://$kullanici.github.io/hifz-defteri/"
