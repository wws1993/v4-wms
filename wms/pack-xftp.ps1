# 生成可直接 XFTP 覆盖的 dist + api（不含 data、node_modules）
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$out = Join-Path $root "xftp-upload"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $out "dist") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $out "api") | Out-Null

Copy-Item -Path (Join-Path $root "dist\*") -Destination (Join-Path $out "dist") -Recurse -Force
Copy-Item -Path (Join-Path $root "nginx.conf") -Destination (Join-Path $out "nginx.conf") -Force

$apiSrc = Join-Path $root "api"
@(
  "server.py",
  "server.js",
  "start.sh",
  "wms-anno-api.service",
  "package.json",
  "Dockerfile"
) | ForEach-Object {
  $f = Join-Path $apiSrc $_
  if (Test-Path $f) { Copy-Item $f -Destination (Join-Path $out "api") -Force }
}

Write-Host "已生成: $out"
Write-Host "XFTP: 把 xftp-upload/dist 覆盖到服务器 ~/wms/dist"
Write-Host "      把 xftp-upload/api 覆盖到服务器 ~/wms/api"
Write-Host "      把 xftp-upload/nginx.conf 覆盖到服务器 ~/wms/nginx.conf（改过反代时）"
Write-Host "不要上传 xftp-upload 以外的 data 目录。"
