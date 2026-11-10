# 夜班维修铺 · Hardware Quest

用解密闯关的方式学硬件。你是维修铺的夜班学徒，每晚修一件东西：网站负责讲故事、给实验文件、核对答案、记进度；仿真在外部网站做——CircuitJS 跑模拟电路，Wokwi 跑单片机。

TypeScript + Vite 的纯静态站点，运行时依赖只有 `marked`（渲染关卡正文）和 `lz-string`（生成 CircuitJS 链接），不用框架。

## 运行

```bash
npm install
npm run dev        # 本地开发
npm run check      # 类型检查 + 单元测试 + 构建（提交前必须过）
```

`npm run build` 的产物在 `dist/`，是纯静态文件，放到任何静态托管（包括子路径）都能用。

仓库里带了发布到 GitHub Pages 的流程（[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)：类型检查、单元测试、构建，通过后发布），目前只能手动触发，因为仓库是私有的；公开之后按该文件开头的说明打开自动发布。

## 怎么玩

- 从第一关开始，线性解锁：一关「已过」或「看过答案」后，下一关开放。
- 每关：读故事和任务，点实验台的按钮去 CircuitJS / Wokwi 做实验，把读到的答案填回来。
- 卡住了就揭开提示，一次一条；提示全部揭开后可以「看答案」，这一关记为「看过答案」并放行下一关，之后自己答对会升级为「已过」。
- 过关后得到复盘和知识卡，收进「图鉴」。
- 进度只存在本机浏览器的 localStorage 里；首页底部可以重置。

## 加一关

关卡是数据，加一关只需要在 `levels/` 下加一个文件夹，不用改代码。格式见 [`docs/LEVEL-FORMAT.md`](docs/LEVEL-FORMAT.md)，可以从 `levels/_template/` 复制。`npm test` 会校验所有关卡，并指出是哪一关的哪个字段不对；页面上格式有误的关卡会在顶部的错误条里列出，其余关卡照常可玩。

## 检查关卡

| 命令 | 做什么 | 联网 |
|---|---|---|
| `npm test` | 校验所有关卡的格式 | 不用 |
| `node tools/check-falstad.mjs [关卡文件夹…]` | 在真实的 CircuitJS 里确认：参考解读得到答案，起始电路读不到 | 要 |
| `node tools/check-wokwi.mjs [关卡文件夹…]` | 在真实的 Wokwi 里确认：参考解吐出答案，起始工程不吐 | 要 |

后两个脚本用本机已有的 Chromium（`CHROME=<路径>` 可指定）打开仿真网站，像玩家一样操作。只在改了关卡之后手动跑，一次一个，不放进自动流程。`solution/check.json` 的写法在各脚本开头的注释里。

Wokwi 的条款只允许个人、非商业使用，并禁止用程序批量抓取内容。这个项目只是链接过去，检查脚本也只做低频的自测；如果以后要把它做成收费产品，需要先联系 Wokwi。

## 结构

```
src/
  level-format.ts  解析并校验关卡（level.json + level.md + 文件列表）
  answer.ts        答案归一化与比较（文本 / 数值）
  progress.ts      解锁规则与统计
  storage.ts       localStorage 读写（全部容错，带版本前缀）
  lab.ts           CircuitJS / Wokwi 链接
  content.ts       用 import.meta.glob 加载 levels/
  strings.ts       界面文案（简体中文）
  main.ts          界面与路由（location.hash）
  styles.css
tests/             Vitest 单测；fixtures/ 是校验用的样例关卡
levels/            关卡数据
docs/              关卡格式文档
tools/             检查关卡用的脚本（会联网，手动运行）
```

## 关卡清单和路线图

| 关 | 名字 | 学什么 | 仿真器 |
|---|---|---|---|
| 1 | 不亮的台灯 | 闭合回路、电压、电流 | CircuitJS |
| 2 | 烧过一次的指示灯 | 欧姆定律、限流电阻 | CircuitJS |
| 3 | 给传感器降压 | 串联分压 | CircuitJS |
| 4 | 小手推大门 | 三极管当开关 | CircuitJS |
| 5 | 会眨眼的暗号 | GPIO 数字输出、LED 极性 | Wokwi |
| 6 | 八盏灯的电报 | 位、字节、二进制、ASCII | Wokwi |
| 7 | 自己乱响的门铃 | 悬空输入、上拉电阻 | Wokwi |
| 8 | 按一下，数了五下 | 机械抖动、软件消抖 | Wokwi |
| 9 | 旋钮保险箱 | ADC 模数转换 | Wokwi |
| 10 | 调光台灯 | PWM 与占空比 | Wokwi |
| 11 | 两根线上的三位住户 | I2C 总线与地址 | Wokwi |
| 12 | 师傅的保险箱 | 综合：上拉、消抖、ADC | Wokwi |

第一章（1–4）是电路基础，第二章（5–12）是单片机入门，用的开发板是 Arduino Uno。

还没做、打算往后加的方向（都只需要加关卡文件夹）：

- 电容与 RC 延时、数字逻辑门（CircuitJS）
- 中断与定时器、74HC595 移位寄存器、数码管
- 串口（UART）收发、SPI 总线
- 传感器与执行器：温湿度、超声波测距、舵机、彩灯
- 换到 ESP32：Wi-Fi、MicroPython
- 从仿真到实物：买什么、怎么接、怎么用万用表

## 已知限制

- Wokwi 不能用链接预载工程，所以单片机关卡要玩家把两个文件复制进空白工程。在 Wokwi 上把某一关发布成公开工程后，把链接填进该关 `level.json` 的 `lab.url`，界面就会多出「一键打开」。
- Wokwi 和 CircuitJS 是别人的网站：它们改版或打不开时，对应的关卡就做不了实验。

- 进度不跨设备同步，清除浏览器数据会丢失。
- 答案只在浏览器里核对，会出现在页面脚本中；这是学习用的游戏，不防作弊。
- 实验在外部网站完成，网站无法知道玩家是否真的做了实验。
- 数值答案只取输入开头的数字，不做单位换算（填 `0.0097 A` 与 `9.7 mA` 会被当成不同的数）。

## 延伸

玩完想继续的话：

- [Nandgame](https://nandgame.com/)：从与非门一步步搭出一台计算机，网页上就能玩。
- [Ben Eater](https://eater.net/)：在面包板上搭 8 位计算机的视频系列。
- [CircuitVerse](https://circuitverse.org/)：网页版数字逻辑仿真器。
- [Wokwi 文档](https://docs.wokwi.com/)：各种零件的引脚和用法。
