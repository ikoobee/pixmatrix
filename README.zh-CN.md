# pixmatrix

[English](README.md) | **简体中文**

> 中文版与英文版（事实源）保持同步，对应英文版 v1.0.0（2026-09-15）。

八个聚焦的图片小工具共享一个静态站——九宫格切图、图片压缩、格式转换、尺寸适配、EXIF 查看、长图拼接、截图美化、批量重命名。全部 100% 浏览器本地处理，零上传、零账号、零限制。

[![CI](https://github.com/ikoobee/pixmatrix/actions/workflows/ci.yml/badge.svg)](https://github.com/ikoobee/pixmatrix/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](CHANGELOG.md)

![pixmatrix](assets/og-cover.png)

## 八个工具

| 工具 | 路径 | 做什么 |
|---|---|---|
| **九宫格切图** | [/grid/](grid/) | cover 居中裁方、可选水印、3×3 切块（1080/750/600 档）、朋友圈式预览、ZIP 按序号命名 |
| **图片压缩** | [/compress/](compress/) | 质量（50–95）+ 最长边双杠杆；PNG 格式策略（照片类转 JPEG 铺白底 / 真无损只缩边）；实时压缩率表格含「变大预警」 |
| **格式转换** | [/convert/](convert/) | JPG / PNG / WebP 互转，质量可调；透明转 JPG 自动铺白；批量 20 张；AVIF/HEIC 明示不支持（浏览器编码能力边界） |
| **尺寸适配** | [/resize/](resize/) | 精确像素输出 + 三种适配（cover 裁切 / contain 留白 / blur 模糊背景）；预设 + 自定义 W×H；多规格预览 + ZIP |
| **EXIF 查看** | [/exif/](exif/) | 轻量 TIFF 解析（IFD0+SubIFD：相机/光圈/快门/ISO/GPS 检出）；字节级输出两种副本（仅去 GPS / 清全部 EXIF），零画质损失 |
| **长图拼接** | [/stitch/](stitch/) | 纵向/横向拼接，间距/边距/圆角/对齐可调；32M 像素面积上限适配长图 |
| **截图美化** | [/beautify/](beautify/) | 4 种渐变预设 + 圆角/阴影/留白/macOS 窗口栏 |
| **批量重命名** | [/rename/](rename/) | 模板重命名 + 新旧对照；FSA 直写 `renamed/` 子目录（原文件零改动），ZIP 降级 |

工具共享：三通道上传（点击/拖拽/粘贴）、全站工具导航、每工具独立 SEO 落地页。

## 为什么这样设计

- **零构建、核心零依赖**——原生 ES Module；唯一运行时库是 JSZip，点 ZIP 那一刻才从 CDN 懒加载（带降级）。任意静态托管即部署。
- **关键路径字节级**——EXIF 抹除与重命名绝不重编码（零画质损失）；压缩与转换暴露诚实的杠杆而非黑盒。
- **共享引擎、有测试**——水印/适配引擎与 EXIF 模块与兄弟项目共享，回归测试覆盖（`tools/test-engine-math.mjs`、`tools/test-exif.mjs`）。
- **无限制**——无账号、无配额、无埋点；一切都在你的机器上。

## 快速开始

```bash
git clone https://github.com/ikoobee/pixmatrix.git
cd pixmatrix
npx --yes serve .          # 任意静态文件服务器均可
# 打开 http://localhost:3000 —— 或直接访问 /grid/、/compress/ 等
```

运行回归测试（Node 18+）：

```bash
npm test
```

## UI 语言

界面为中文-only（设计决策）：本站瞄准中文长尾搜索意图，翻译版无搜索价值——英文版需要的是重写工具页而非翻译字符串。代码、注释、commit 与 README 双语均为英文优先。如果你需要英文界面，欢迎[开 issue](https://github.com/ikoobee/pixmatrix/issues)说明场景——有需求时我们会做正式重写，而不是机械翻译。

## 自部署

把各 HTML 页面、`robots.txt`、`sitemap.xml` 中的 `your-domain.example` 替换为你的域名，整个目录丢到任意静态托管即可。统计埋点默认关闭（`js/analytics.js` 中 `provider: 'none'`）。ZIP 功能在点击时从公共 CDN 加载 JSZip——如在意可自托管该文件并更新各模块的 `ZIP_CDN` 常量。

## 参与贡献

欢迎 issue 与 PR——见 [CONTRIBUTING.md](CONTRIBUTING.md)。贡献即视为按本项目 MIT 许可证同等授权（inbound = outbound）。

## 许可证

[MIT](LICENSE) © Ethan (ikoobee)
