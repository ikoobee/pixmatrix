/*
 * WARNING: this codemod rewrites tool-nav HTML WITHOUT data-i18n attributes.
 * Pages are i18n-annotated now — re-running this script would strip the
 * nav translations. Update the templates below to carry data-i18n keys
 * (navBrand / navToolXxx / navDescXxx / navAllTools ...) before reuse.
 */
/**
 * 导航重构脚本（v0.3.2 美化版）：把全部页面的 tool-nav 替换为
 * "渐变品牌徽章 + 当前工具药丸 + 『全部工具』渐变按钮 + 博客" 单行结构，
 * 下拉为带标题栏与功能描述的双列卡片菜单。
 * 用法：node tools/renovate-nav.mjs（幂等，可重复运行）
 */
import fs from 'node:fs';

const TOOLS = [
  ['grid', '🧩', '九宫格切图', '一张图变朋友圈九图'],
  ['compress', '🗜️', '图片压缩', '批量瘦身不损画质'],
  ['convert', '🔄', '格式转换', 'JPG / PNG / WebP 互转'],
  ['resize', '📐', '尺寸适配', '一键出社媒规格'],
  ['exif', '🔍', 'EXIF 查看', '查参数 · 删 GPS'],
  ['stitch', '🧵', '长图拼接', '多张图拼成一张'],
  ['beautify', '🖼️', '截图美化', '圆角渐变分享图'],
  ['rename', '🏷️', '批量重命名', '模板改名零损伤'],
];

const PAGES = [
  { f: 'index.html', prefix: '', active: null, current: null },
  ...TOOLS.map(([key, ico, name]) => ({ f: `${key}/index.html`, prefix: '../', active: key, current: name })),
  { f: 'blog/zh/index.html', prefix: '../../', active: null, current: null },
  ...['nine-grid-guide', 'image-compress-guide', 'image-format-guide', 'social-size-guide',
    'photo-gps-privacy', 'stitch-guide', 'screenshot-beautify-guide', 'batch-rename-guide']
    .map(a => ({ f: `blog/zh/${a}.html`, prefix: '../../', active: null, current: null })),
];

function buildNav({ prefix, active, current }) {
  const brandHref = prefix || '/';
  // 按钮即位置指示：工具页显示当前工具名，首页/博客显示"全部工具"
  const btnLabel = current || '全部工具';
  const links = TOOLS.map(([key, ico, name, desc]) =>
    `          <a href="${prefix}${key}/"${active === key ? ' class="active"' : ''}>
            <span class="tn-ico">${ico}</span>
            <span class="tn-txt"><span class="tn-name">${name}</span><span class="tn-desc">${desc}</span></span>
          </a>`)
    .join('\n');
  return `<nav class="tool-nav">
  <div class="container">
    <a class="tn-brand" href="${brandHref}"><span class="tn-logo">🧰</span>图片工具箱</a>
    <div class="tn-menu">
      <button class="tn-more" type="button">${btnLabel} <span class="tn-caret">▾</span></button>
      <div class="tn-dropdown">
        <div class="tn-dd-head">全部工具<span>8 个免费工具 · 本地处理</span></div>
        <div class="tn-dd-grid">
${links}
        </div>
      </div>
    </div>
    <a class="tn-blog" href="${prefix}blog/zh/">博客</a>
  </div>
</nav>`;
}

let n = 0;
for (const page of PAGES) {
  const html = fs.readFileSync(page.f, 'utf8');
  const next = html.replace(/<nav class="tool-nav">[\s\S]*?<\/nav>/, buildNav(page));
  if (next !== html) {
    fs.writeFileSync(page.f, next);
    n++;
  }
}
console.log(`nav rewritten: ${n}/${PAGES.length}`);
