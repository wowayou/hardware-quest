# hardware-quest（夜班维修铺）

用解密闯关学硬件的静态网站。网站只是外壳：讲故事、给实验文件、核对答案、记进度。仿真在外部网站做（Wokwi 跑单片机，CircuitJS 跑模拟电路）。

- 关卡是数据：`levels/<NN-slug>/`，格式见 `docs/LEVEL-FORMAT.md`。加关卡不改代码。
- `src/` 里纯逻辑（解析、校验、答案比较、进度）不碰 DOM，都有单测；界面在 `src/main.ts`。
- `npm run check` = 类型检查 + 单测 + 构建，提交前必须过。
- `tools/check-falstad.mjs`、`tools/check-wokwi.mjs` 会打开真实的仿真网站，只在改了关卡后手动跑，不要放进 CI，不要并发跑。
- 界面文案只有简体中文，集中在 `src/strings.ts`。
- 保持简单：不加后端、不加账号、不自己写电路仿真器。运行时依赖只有 `marked`（渲染关卡正文）和 `lz-string`（生成 CircuitJS 链接）。
