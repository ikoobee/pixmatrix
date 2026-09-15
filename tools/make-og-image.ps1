# 生成 og:image 社交分享封面（1200x630）→ ../assets/og-cover.png
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File tools/make-og-image.ps1
# 修改文案/配色后重跑即可（配色与 assets/style.css 的 --brand 保持一致）
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot '..\assets\og-cover.png'
$w = 1200; $h = 630

$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# 背景：品牌蓝 #2563eb
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(79, 70, 229))
$g.FillRectangle($bgBrush, 0, 0, $w, $h)

function New-Point([double]$x, [double]$y) { New-Object System.Drawing.PointF($x, $y) }

# 右侧装饰：半透明白盾牌
$cx = 950.0; $cy = 315.0; $s = 190.0
$shield = New-Object System.Drawing.Drawing2D.GraphicsPath
$shield.AddPolygon(@(
  (New-Point $cx ($cy - $s)),
  (New-Point ($cx + $s * 0.78) ($cy - $s * 0.52)),
  (New-Point ($cx + $s * 0.78) ($cy + $s * 0.18)),
  (New-Point $cx ($cy + $s)),
  (New-Point ($cx - $s * 0.78) ($cy + $s * 0.18)),
  (New-Point ($cx - $s * 0.78) ($cy - $s * 0.52))
))
$shieldBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(50, 255, 255, 255))
$g.FillPath($shieldBrush, $shield)

# 盾牌内对勾（圆头粗线两段）
$penW = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(225, 255, 255, 255), 16)
$penW.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$penW.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($penW, ($cx - 55), ($cy + 5), ($cx - 10), ($cy + 55))
$g.DrawLine($penW, ($cx - 10), ($cy + 55), ($cx + 65), ($cy - 45))

# 左侧文案
$white = [System.Drawing.Brushes]::White
$fontTitle = New-Object System.Drawing.Font('Microsoft YaHei', 54, ([System.Drawing.FontStyle]::Bold))
$g.DrawString('图片工具箱', $fontTitle, $white, 84.0, 205.0)

$fontSub = New-Object System.Drawing.Font('Microsoft YaHei', 26)
$g.DrawString('邻接高频图片工具，一站搞定', $fontSub, $white, 88.0, 330.0)

$tagBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200, 255, 255, 255))
$fontTag = New-Object System.Drawing.Font('Microsoft YaHei', 18)
$g.DrawString('九宫格切图 · 图片压缩 · 本地处理 · 免费', $fontTag, $tagBrush, 90.0, 405.0)

$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "saved: $out"
