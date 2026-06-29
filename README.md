# gecao

明朝抗倭 · 类吸血鬼割草 Roguelite。

设计文档见 `docs/design/`（架构设计 `09-architecture.md`、扩展性内核 `10-augment-engine.md`、系统完备性 `11-systems-completeness.md`、素材计划 `12-assets.md`）。

## 开发（M0 脚手架）

技术栈：Vite + TypeScript(strict) + Phaser 3 + miniplex(ECS) + Vitest + ESLint/Prettier。

```bash
pnpm install      # 安装依赖（包管理器 pnpm）
pnpm dev          # 本地开发服务器
pnpm test         # 自动化逻辑测试（Vitest）
pnpm lint         # ESLint
pnpm typecheck    # tsc --noEmit
pnpm build        # 类型检查 + 生产构建
```

目录分层（依赖单向：`core → ecs/systems → scenes/game`）：

- `src/core/`——引擎无关纯逻辑（RNG、定步长、事件总线），可单测、headless。
- `src/ecs/`——miniplex 世界与组件定义。
- `src/systems/`——按帧批处理的系统流水线。
- `src/game/`——`Simulation`（headless 可跑一局）与 Phaser 配置。
- `src/scenes/`——Phaser 场景（唯一与渲染耦合处）。
- `src/content/` `src/platform/` `src/i18n/` `src/input/` `src/assets/`——B 档接口骨架（内容注册表 / 存档 / 文案 key 化 / 输入意图层 / 资源注册表）。

测试分工：自动化逻辑测试由开发方随 CI 跑；手感 / 美术 / UI 等人工验收由用户在每里程碑的在线链接上进行。
