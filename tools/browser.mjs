// 给 tools/ 下的检查脚本共用：启动本机已有的 Chromium（不下载浏览器）。
// CHROME=<可执行文件路径> 可以指定浏览器；否则依次找 Playwright 缓存和系统里的 Chrome/Chromium。
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  if (existsSync(cache)) {
    const builds = readdirSync(cache)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const b of builds) {
      const p = join(cache, b, 'chrome-linux64', 'chrome');
      if (existsSync(p)) return p;
    }
  }
  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']) {
    if (existsSync(p)) return p;
  }
  throw new Error('找不到 Chromium。请用 CHROME=<路径> 指定一个 Chrome/Chromium 可执行文件。');
}

/** @param {{ headless?: boolean }} [opts] */
export async function launch(opts = {}) {
  return chromium.launch({
    executablePath: findChrome(),
    headless: opts.headless ?? true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
}
