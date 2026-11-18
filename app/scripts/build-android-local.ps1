# ローカルPCでAndroid版(APK)をビルドするスクリプト
#
# 使い方(PowerShellで app フォルダから):
#   powershell -ExecutionPolicy Bypass -File scripts\build-android-local.ps1          # 通常ビルド
#   powershell -ExecutionPolicy Bypass -File scripts\build-android-local.ps1 -Clean   # android フォルダを作り直してビルド
#
# 補足:
# - このフォルダのパスに日本語が含まれていると、Androidのビルド道具(NDK/CMake)が失敗するため、
#   英数字だけのフォルダ(%USERPROFILE%\tadaimap-build)へコピーしてからビルドする。
# - できあがるAPKは「デバッグ用の鍵」で署名される。EASでビルドしたAPKとは署名が違うため、
#   端末に入っているEAS版の上から上書きインストールはできない(一度アンインストールが必要)。
# - 前提: Java 17 と Android SDK が下記の場所にあること(初回セットアップ済み)。

param([switch]$Clean, [switch]$AllAbis)
$ErrorActionPreference = "Stop"

$appDir = Split-Path $PSScriptRoot -Parent
$buildDir = Join-Path $env:USERPROFILE "tadaimap-build"
$outDir = Join-Path $appDir "build-output"

$env:JAVA_HOME = Get-ChildItem "$env:LOCALAPPDATA\AndroidBuildTools" -Directory -Filter "jdk-17*" |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $env:JAVA_HOME) { throw "Java 17 が見つかりません($env:LOCALAPPDATA\AndroidBuildTools\jdk-17*)" }
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
# 一時フォルダのパスが長いとJavaの内部通信が作れずに失敗するため、短い一時フォルダを使わせる
$jtmp = Join-Path $env:USERPROFILE ".jtmp"
New-Item -ItemType Directory -Force $jtmp | Out-Null
$env:JAVA_TOOL_OPTIONS = "-Djdk.net.unixdomain.tmpdir=$jtmp"
$env:NODE_ENV = "production"

Write-Host "== 1/3 ビルド用フォルダへコピー: $buildDir"
# 除外はアプリ直下のフォルダだけに限定する(名前だけで指定すると、部品の中の同名フォルダまで除外されてしまう)
robocopy $appDir $buildDir /MIR /XD "$appDir\android" "$appDir\.expo" "$appDir\build-output" "$buildDir\android" /NFL /NDL /NJH /NJS /NP /MT:16 | Out-Null
if ($LASTEXITCODE -ge 8) { throw "コピーに失敗しました(robocopy終了コード $LASTEXITCODE)" }

Set-Location $buildDir
if ($Clean -or -not (Test-Path "android")) {
  Write-Host "== 2/3 Android用のプロジェクトを生成(expo prebuild)"
  npx expo prebuild --platform android --clean --no-install
  if ($LASTEXITCODE -ne 0) { throw "expo prebuild に失敗しました" }
} else {
  Write-Host "== 2/3 既存の android フォルダを使用(作り直す場合は -Clean)"
}

# --- 高速化と設定の反映(毎回、冪等に行う) ---
# android フォルダは再利用するため、app.config.js のバージョン変更は自動では反映されない。
# そこで app.config.js の値を build.gradle へ直接書き込む(prebuildのやり直しより数分速い)。
$cfg = node -e "const c=require('./app.config.js').expo;console.log(c.version+'|'+c.android.versionCode)"
if ($LASTEXITCODE -ne 0 -or -not $cfg) { throw "app.config.js からバージョンを読めませんでした" }
$ver, $code = $cfg.Trim().Split("|")
$gradleFile = Join-Path $buildDir "android\app\build.gradle"
$g = Get-Content $gradleFile -Raw
$g = $g -replace 'versionCode \d+', "versionCode $code" -replace 'versionName "[^"]*"', "versionName `"$ver`""
# Windows PowerShell 5.1 の -Encoding utf8 は先頭にBOMを付け、Gradleが読めなくなるため、BOM無しで保存する
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($gradleFile, $g, $utf8NoBom)
Write-Host "バージョン: $ver (versionCode $code)"

# Gradleの設定を強化: メモリ増量・ビルドキャッシュ有効・PNG圧縮の省略(リリース用の最適化だが時間がかかる)
$propsFile = Join-Path $buildDir "android\gradle.properties"
$p = Get-Content $propsFile -Raw
$p = $p -replace '(?m)^org\.gradle\.jvmargs=.*$', 'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m'
$p = $p -replace '(?m)^android\.enablePngCrunchInReleaseBuilds=.*$', 'android.enablePngCrunchInReleaseBuilds=false'
if ($p -notmatch '(?m)^org\.gradle\.caching=') { $p = $p.TrimEnd() + "`r`norg.gradle.caching=true`r`n" }
[System.IO.File]::WriteAllText($propsFile, $p, $utf8NoBom)

Write-Host "== 3/3 APKをビルド(gradlew assembleRelease)"
Set-Location (Join-Path $buildDir "android")
# C++部品は実機用のCPU(arm64-v8a)向けだけにコンパイルする(4種類すべてだと約4倍の時間がかかるため)。
# エミュレーターで動かす場合は -AllAbis を付けて実行する。
# --no-daemon: Gradleを常駐させない(常駐すると、ログをファイルに書き出している場合に終了の合図が返らなくなるため)
# -x lintVitalRelease: リリース前の簡易チェック(lint)を省く。--build-cache: 変更のない工程を再利用する。
if ($AllAbis) {
  .\gradlew.bat assembleRelease --no-daemon --build-cache -x lintVitalRelease
} else {
  .\gradlew.bat assembleRelease --no-daemon --build-cache -x lintVitalRelease "-PreactNativeArchitectures=arm64-v8a"
}
if ($LASTEXITCODE -ne 0) { throw "Gradleビルドに失敗しました" }

# ファイルが増えないよう、バージョンは名前に付けず毎回同じ名前で上書きする
New-Item -ItemType Directory -Force $outDir | Out-Null
$apk = Join-Path $outDir "tadaimap.apk"
Copy-Item "app\build\outputs\apk\release\app-release.apk" $apk -Force
Write-Host "完了: $apk"

# Google Drive(パソコン版)のマイドライブへ、常に同じファイル名で上書き保存する
# (スマホからすぐ入れられるように。ファイルが増えないよう、バージョンは名前に付けない)
$driveDir = "G:\マイドライブ"
$driveApk = Join-Path $driveDir "tadaimap.apk"
if (Test-Path $driveDir) {
  Copy-Item $apk $driveApk -Force
  if ((Get-FileHash $apk).Hash -ne (Get-FileHash $driveApk).Hash) { throw "Google Driveへのコピー内容が一致しません" }
  Write-Host "Google Driveへ上書き保存: $driveApk"
} else {
  Write-Warning "Google Drive($driveDir)が見つからないため、Driveへの保存をスキップしました(Google Driveパソコン版にログインしているか確認してください)"
}
