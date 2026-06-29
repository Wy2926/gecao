# 开发架构设计（Technical Architecture）· 明朝抗倭

> 本文是「开做前」的具体开发架构设计，承接 `00-decisions-log.md`（技术栈与玩法决策）
> 与 `08-mvp.md`（MVP 范围）。目标：把已定稿的玩法/数值设计落成**可实现、可扩展、数据驱动**
> 的工程架构，作为编码阶段的总蓝图。
>
> 技术栈（已定）：**TypeScript + Phaser 3 + Vite**；2D 俯视角；浏览器可玩；先占位美术。
>
> 设计三原则：
> 1. **数据驱动**：技能/词条/增益/敌人/关卡全部读表（TS 配置对象），表结构 1:1 对应 03~07 文档。
> 2. **事件解耦**：联动（命中→异常、死亡→涟漪、暴击→增益）通过**战斗事件总线**实现，新增联动卡不改核心战斗代码。
> 3. **性能优先**：海量敌人/弹幕用**对象池 + 空间网格 + 定步长逻辑**，渲染与逻辑分离。

---

## 一、工程结构与工具链

### 1.1 构建与依赖
| 项 | 选择 | 说明 |
|---|---|---|
| 包管理 | `pnpm`（或 npm） | 锁定版本，CI 可缓存 |
| 构建/Dev Server | **Vite** | 秒级热更新，`vite build` 出静态产物，可直接部署 |
| 语言 | **TypeScript**（`strict: true`） | 全量类型，杜绝 `any` |
| 引擎 | **Phaser 3**（Arcade Physics） | 仅用作**渲染 + 输入 + 场景 + 资源加载**层；逻辑由 ECS 驱动，Phaser 不持有游戏状态 |
| 实体架构 | **数据导向 ECS**（`miniplex` 为主，热点数据可下沉 `bitECS`/TypedArray） | 见第二节之二；新行为=加 Component+System，与卡引擎数据驱动理念一致 |
| 单测 | **Vitest** | 纯逻辑（伤害公式/Stat 管线/状态机/ECS System）单测，不依赖渲染 |
| 代码规范 | **ESLint + Prettier** | 提交前 `lint`；配 pre-commit 钩子（husky + lint-staged） |
| 部署（MVP，已定） | **静态站点**（devinapps / GitHub Pages），每次 push 出可试玩链接 | `vite build` 产 `dist/` 直接托管；便于随时浏览器试玩反馈手感 |
| 桌面发行（路线，可Steam） | **Tauri**（首选，体积小）/ Electron（备选）包装同一 web 构建 | 见第十五节；同一代码库上 Steam PC |

### 1.2 目录结构
```
gecao/
├─ docs/design/                 # 设计文档（现有）
├─ index.html                   # Vite 入口
├─ vite.config.ts
├─ tsconfig.json
├─ public/assets/               # 占位美术/音效（运行时按 key 加载）
└─ src/
   ├─ main.ts                   # 创建 Phaser.Game，注册场景
   ├─ config/                   # === 数据驱动层（读表）===
   │   ├─ abilities.ts          #   绝技定义 + Lv1~5 曲线（对应 03/05）
   │   ├─ augments.ts           #   增益/联动卡（对应 03 C节 / 06）
   │   ├─ traits.ts             #   词条 + 五档数值（对应 04 二节）
   │   ├─ statusEffects.ts      #   异常状态基准（对应 04 五节）
   │   ├─ rarity.ts             #   稀有度权重/幸运曲线（对应 04）
   │   ├─ enemies.ts            #   倭寇三层体系（职业/官位/家族）
   │   ├─ levels.ts             #   关卡刷怪时间轴 + 资源点
   │   ├─ classes.ts            #   职业（起手武器/专属主动/被动倾向）
   │   ├─ metaLoadout.ts        #   主动技/觉醒清单（对应 07）
   │   └─ tags.ts               #   技能类别标签枚举（周期/范围/弹幕/光环/召唤/部署/异常/近战/远程/火雷毒）
   ├─ core/                     # === 与引擎无关的纯逻辑（可单测，不依赖 Phaser/ECS）===
   │   ├─ stats/                #   StatSheet + 乘区管线（对应 04 一节）
   │   ├─ combat/               #   damage.ts 伤害结算、crit、armor
   │   ├─ status/               #   StatusController 异常叠层/爆发
   │   ├─ rng/                  #   可注入种子的随机源（便于测试/复现）
   │   ├─ draft/                #   三选一抽卡（权重/重抽/保底）
   │   └─ events/               #   GameEventBus（类型安全事件 + 事件队列）
   ├─ ecs/                      # === ECS 内核 ===
   │   ├─ world.ts              #   miniplex World 实例 + 原型(archetype)查询缓存
   │   ├─ components.ts         #   组件定义（纯数据：见第二节之二）
   │   ├─ queries.ts            #   预声明查询（如 movable / damageable / withAbilities）
   │   └─ prefabs.ts            #   实体装配工厂：spawnPlayer/spawnEnemy/spawnProjectile…
   ├─ systems/                  # === ECS 系统（每帧定步长 run(world,dt)）===
   │   ├─ InputSystem.ts        #   读输入 → 写 Intent 组件
   │   ├─ MovementSystem.ts     #   位置/速度积分
   │   ├─ EnemyAISystem.ts      #   敌人/召唤索敌移动
   │   ├─ AbilitySystem.ts      #   绝技自动触发调度 + 索敌
   │   ├─ SpawnDirector.ts      #   时间轴刷怪 + 增援潮 + boss
   │   ├─ CollisionSystem.ts    #   空间网格碰撞查询 → 命中事件
   │   ├─ DamageSystem.ts       #   消费命中事件→core/combat 结算→派发战斗事件
   │   ├─ StatusSystem.ts       #   异常 tick + 爆发
   │   ├─ AugmentSystem.ts      #   监听战斗事件，执行卡引擎触发/效果（见10）
   │   ├─ PickupSystem.ts       #   拾取/吸附/经验升级
   │   ├─ XpLevelSystem.ts      #   军功→升级→触发三选一
   │   ├─ LifetimeSystem.ts     #   计时/耐久销毁（弹幕/召唤/部署）
   │   ├─ RenderSyncSystem.ts   #   把 Transform/Sprite 组件同步到 Phaser GameObject
   │   └─ PresentationSystem.ts #   订阅战斗事件播放各绝技动画/特效/音效（见第二节之三）
   ├─ scenes/                   # === Phaser 场景（流程）===
   │   ├─ BootScene.ts
   │   ├─ PreloadScene.ts
   │   ├─ MenuScene.ts
   │   ├─ BarracksScene.ts      #   卫所：meta 装配/解锁（局外）
   │   ├─ GameScene.ts          #   局内主战斗
   │   ├─ LevelUpScene.ts       #   三选一卡牌（覆盖在 GameScene 上，暂停逻辑）
   │   ├─ HudScene.ts           #   常驻 HUD（血/护甲/计时/CD/槽位）
   │   └─ ResultScene.ts        #   结算 + meta 货币产出
   ├─ content/                  # === 内容注册表（内置 + MOD）===
   │   ├─ registry.ts           #   ContentRegistry：合并内置 TS 内容 + 外部 MOD
   │   ├─ schema.ts             #   zod schema（CardDef/敌人/关卡），校验外部数据
   │   └─ modLoader.ts          #   加载/校验/命名空间/启用开关（web上传 / 桌面目录 / Workshop）
   ├─ platform/                 # === 平台抽象（web / 桌面）===
   │   ├─ storage.ts            #   StoragePort：web=localStorage/IndexedDB，桌面=文件
   │   └─ platform.ts           #   运行环境探测 + Steamworks(桌面,可选)接口
   ├─ meta/                     # === 局外存档/养成 ===
   │   ├─ SaveStore.ts          #   经 StoragePort 持久化（版本化 schema + 迁移）
   │   └─ Progression.ts        #   解锁/属性树/装配方案（阵谱）
   ├─ ui/                       # 复用 UI 组件（卡牌/血条/图标，占位）
   └─ types/                    # 全局类型定义
```

> **关键分层（三层依赖单向向下）**：
> 1. `core/`：不 import Phaser、不 import ECS——纯数学/状态/事件，单测主体，数值正确性保证。
> 2. `ecs/` + `systems/`：依赖 `core/` 与 `miniplex`，**不直接 import Phaser**（仅 `RenderSyncSystem` 经接口桥接到渲染），便于无渲染 headless 跑逻辑/单测。
> 3. `scenes/` + `ui/`：依赖 Phaser，负责渲染/输入/资源/流程，**不写游戏规则**。

---

## 二、运行时架构（场景流 + 游戏循环）

### 2.1 场景流转
```
Boot → Preload → Menu ──► Barracks(卫所:装配/解锁) ──► GameScene(局内)
                                                          │  ├─ HudScene (并行常驻)
                                                          │  └─ LevelUpScene (升级时弹出, 暂停局内)
                                                          ▼
                                                       ResultScene → (回 Menu/Barracks)
```
- `LevelUpScene` 与 `HudScene` 用 Phaser 的**并行场景**（`scene.launch`），升级时 `GameScene.scene.pause()` 暂停战斗逻辑，三选一选完 resume。
- `BarracksScene` 读写 `meta/`，把装配结果（职业、2 主动、1 觉醒、属性树）打包为 `RunConfig` 传入 `GameScene`。

### 2.2 游戏循环（定步长 fixed timestep）
割草对帧率与可复现性敏感，采用**逻辑定步长 + 渲染插值**：
- 逻辑以固定 `dt`（如 1/60s）累加器步进，保证不同帧率下数值一致、便于单测与回放。
- 每个逻辑步按固定顺序依次 `run(world, dt)` 驱动 ECS 系统（顺序很重要）：
  1. `InputSystem`（读输入 → 写 Intent 组件）
  2. `SpawnDirector`（按时间轴生成敌人）
  3. `EnemyAISystem` + `MovementSystem`（索敌/位速积分：玩家/敌人/弹幕/召唤）
  4. `AbilitySystem`（到 CD 自动开火 + 索敌）
  5. `CollisionSystem`（网格查询 → 命中事件入队）
  6. `DamageSystem`（消费命中事件 → `core/combat` 结算 → 派发 onHit/onKill/onCrit）
  7. `AugmentSystem`（消费战斗事件队列，执行卡引擎触发/效果；chainDepth/预算截断）
  8. `StatusSystem`（异常 tick / 爆发）
  9. `PickupSystem` + `XpLevelSystem`
  10. `LifetimeSystem` + 清理（死亡/过期实体从 World 移除，回收对应 Phaser GameObject 入池）
- 最后 `RenderSyncSystem` 把 Transform/Sprite 组件写到 Phaser GameObject；**渲染只读状态，不改状态**（两帧间可插值平滑）。
- 逻辑不依赖 Phaser，可 **headless 跑一局**（只跳过 RenderSync）用于集成测试与数值回归。

---

## 二之二、实体架构（数据导向 ECS）

> 按已定决策，实体层用**数据导向 ECS**：Entity 只是 id，行为/状态拆成**纯数据组件**，逻辑放进**系统**批处理。新增一种实体/行为 = 组合已有组件 + 加（或复用）系统，不写新的实体类层级。

### 库选型
- **主库：`miniplex`**（archetypal、对象式组件、TS 友好）。理由：我们的组件含**富对象**（`StatSheet` 乘区表、`StatusController`、绝技运行态），miniplex 直接以对象存组件、查询符合人体工学、与 `core/` 富逻辑无缝衔接；几千实体性能足够。
- **热点下沉（可选优化）**：若性能分析显示移动/碰撞是瓶颈，把 `Transform/Velocity` 等**高频数值组件**改用 `bitECS`/TypedArray 的 SoA 存储，仅这部分走数据数组，**架构不变**（系统接口不动）。先用 miniplex 起步，按 profiling 再下沉。

### 组件清单（纯数据，节选）
| 组件 | 字段 | 挂在谁 |
|---|---|---|
| `Transform` | x,y,rotation | 所有可见实体 |
| `Velocity` | vx,vy,speed | 可移动 |
| `Sprite` | textureKey, gameObjectRef | 需渲染（桥接 Phaser）|
| `Health` | hp,maxHp,armor | 可受伤 |
| `Faction` | player/enemy/summon/neutral | 索敌/碰撞过滤 |
| `Stats` | StatSheet 实例 | 玩家/召唤（携乘区桶）|
| `StatusBag` | StatusController 实例 | 可被异常的敌人 |
| `Abilities` | 已装配绝技运行态(独立 CD/等级) | 玩家 |
| `Augments` | 已获联动/增益声明的运行句柄 | 玩家 |
| `AIChase` | target, behavior | 敌人/召唤 |
| `Projectile` | coef,element,pierce,bounce,homing | 弹幕 |
| `Lifetime` | remainS 或 durability | 弹幕/召唤/部署 |
| `Deployable` | placeRule,radius | 部署物 |
| `Pickup` | kind(exp/银两/粮草),value | 掉落物 |
| `Tags` | Set<Tag> | 携标签的伤害源（供 06 类别增益）|

### 系统与查询
- 每个系统声明它消费的**查询（archetype）**，如 `MovementSystem` 处理 `{Transform,Velocity}`、`StatusSystem` 处理 `{StatusBag,Health}`。
- 查询结果由 miniplex 增量维护（实体增删组件即更新归属），系统遍历缓存友好。
- 系统**无状态、可单测**：输入 world+dt，断言组件变化（headless，无需 Phaser）。

### 与 core / 卡引擎 / Phaser 的边界
- **core/**：`StatSheet`/`StatusController`/`combat` 是与 ECS 无关的纯对象，被组件**持有**（组合而非继承），保证数值逻辑可独立单测。
- **卡引擎（10）**：联动/绝技效果作用于"实体+组件"——`applyStatus` 写目标 `StatusBag`、`grantModifier` 改 `Stats`、`spawnProjectile` 用 `prefabs` 装配新实体；`AugmentSystem` 是其执行系统。
- **Phaser**：仅 `Sprite.gameObjectRef` + `RenderSyncSystem` 一处桥接；销毁实体时回收 GameObject 入对象池。

### 为何满足"灵活通用、适配未来扩展"
- 新敌人/新弹幕/新部署物 = 新的组件组合（prefab），无需新类层级。
- 新机制 = 加一个系统或复用卡引擎原语，与"加卡=写数据"统一。
- 未来联机/回放：world 状态是纯数据，序列化/快照/确定性步进天然友好。

---

## 二之三、表现层（美术 / 动画 / 特效）——逻辑与表现彻底解耦

> 美术是核心一环，且每个绝技动画各不相同——这通过「**逻辑只说发生了什么，表现层负责怎么演**」实现。ECS/core 只产出事件与状态，**表现层订阅事件播放各自的动画/特效/音效**；逻辑不知道任何视觉细节，所以 headless 测试不受影响、美术可独立迭代替换。

### 每个技能带独立「表现声明」（数据驱动，动画各不相同）
绝技/效果除逻辑外再挂一份 `PresentationSpec`（与 `onFire` 逻辑并列、互不耦合）：
```ts
interface PresentationSpec {
  castAnim?: AnimKey;        // 角色释放动作（每个绝技不同）
  vfx?: VfxKey[];            // 释放/飞行/命中特效（序列帧或粒子）
  projectileAnim?: AnimKey;  // 投射物自身动画
  hitVfx?: VfxKey;           // 命中特效
  sfx?: SfxKey[];            // 音效
  screenShake?: ShakeSpec;   // 屏震/顿帧（打击感）
  trail?: TrailKey;          // 拖尾
}
```
- 因为每个绝技引用**自己的 `castAnim`/`vfx`/`hitVfx`**，所以「戚家刀横扫」「火油弹爆炸」「连锁雷」可以是**完全不同的动画与特效**。
- 加新绝技 = 配 `onFire`（逻辑）+ 配 `presentation`（美术 key）；换美术 = 只改资源与 key 映射，不动逻辑。

### 运作方式
- **AssetRegistry**：`AnimKey/VfxKey/SfxKey` → 图集(atlas)/序列帧(spritesheet)/粒子配置/音频；启动时在 Phaser Animation Manager 预注册每个绝技的帧动画。
- **PresentationSystem（view 层）**：消费战斗事件队列（`onAbilityCast/onProjectileHit/onStatusBurst/onKill…`），在对应实体的 `Sprite` 上播放 `animKey`、用对象池生成特效实体、播放音效、触发屏震。
- **分层动画**：角色基础动作（idle/run/受击/死亡）+ 绝技专属释放动画 + 投射物动画 + 异常状态视觉（焚烧/中毒/雷殛各有覆盖特效）互相独立叠加。
- **性能**：特效走对象池 + 同屏上限；海量敌人/远处做降级（合并/降频/省略次要特效），不影响逻辑帧。

### MVP 与 MOD
- **MVP**：先用占位美术（简单序列帧/纯色）把「key 体系 + PresentationSystem」管线跑通；后续真美术替换是**零逻辑改动**，只换资源。
- **MOD**：MOD 可随包附带自己的美术/音频资源并在声明里引用其 key → **MOD 绝技也能有自定义动画与特效**（注意打包体积与资源加载校验）。

---

## 三、属性与乘区管线（StatSheet）

落实 `04` 文档的乘区公式，做成**可叠加、可查询、来源可追溯**的属性表。

### 3.1 StatSheet 结构
- 维护「基础值」+ 「按乘区分桶的修饰符列表」。乘区分桶：
  - `addAttack`（攻击力% 加法区）、`skillAttack`（黄字）、`independent`（白字）、
    `elemental.{fire|thunder|poison}`、`critRate`、`critDmg`、`formation`（阵法增伤）、`vulnerable`（易伤/标靶）等。
- 提供 `getDamageMultiplier(context)`：按 04 的公式把各桶相乘，返回最终系数。
```
finalDamage = weaponBase
  × (1 + Σ addAttack)
  × (1 + Σ skillAttack)
  × (1 + Σ independent)
  × (1 + Σ elemental[属性])
  × critMultiplier
  × formationMultiplier
  × vulnerableMultiplier
  − effectiveArmor(穿甲/破甲后)
```
- 修饰符携带 `source`（来自哪张卡/词条/增益），便于 UI 展示与移除（满级转精通等）。
- 软上限：对设了上限的桶（攻速 +200%、CD 70% 硬上限、暴击率 100%）做夹取；可选「软上限拐点后收益递减」（04 待定项，预留开关）。

### 3.2 谁写 StatSheet
- 词条（traits）：直接增删修饰符。
- 增益类别强化（06 A 节，如「军器精造：周期类 +25%」）：注册为**带标签条件的修饰符**——只在结算「带该标签的技能」时计入（见第六节标签系统）。

---

## 四、战斗事件总线（联动的地基）

联动卡（03 C / 06）的本质是「在某事件发生时执行一段效果」。用**类型安全事件总线**解耦：

### 4.1 事件类型（核心）
| 事件 | 触发时机 | 典型联动 |
|---|---|---|
| `onHit` | 任意命中结算后 | 见血封喉(施加创伤)、火药浸刃(焚烧) |
| `onCrit` | 命中且暴击 | 重击破甲、势如破竹(重置CD)、惊雷引 |
| `onKill` | 敌人死亡 | 首级传功(尸爆)、军功振奋(回血/减CD)、导电体(雷殛死亡放电) |
| `onApplyStatus` | 施加异常 | 火中带刃(焚烧→创伤)、诸毒攻心 |
| `onStatusBurst` | 异常叠满爆发 | 连锁反应、总崩 |
| `onAbilityCast` | 绝技/主动开火 | 借势、一鼓作气 |
| `onTakeDamage` | 玩家受击 | 以战养战(吸血)、不屈军魂 |
| `onProjectileHit` | 弹幕命中 | 箭无虚发(分裂)、暗器纷飞 |

### 4.2 机制（声明式，详见 10-augment-engine.md）
- 卡牌不写"一张卡一段 if"，而是声明 **触发(Trigger)/条件(Condition)/效果(Effect)/修饰符(Modifier)** 四类**有限原语**的组合。新增一张卡=只写一条数据；只有出现全新原语时才加 1 个纯函数实现。
- 触发型联动（天降流星/连锁闪电）配 **内部冷却（ICD 0.3~0.5s）** 防刷屏。
- 效果若产生新伤害（尸爆/连锁/分裂），作为**独立伤害事件**经**事件队列**重新进入结算管线 → 自然连锁，用 `chainDepth` 上限 + 每帧事件预算防无限递归与刷爆性能。
- 触发器按事件类型建索引（`Map<GameEventType, TriggerSpec[]>`），派发只遍历相关触发器。
- **全部现有 40+ 联动 / 50 增益 / 词条 / 流派核心已逐类映射验证可声明实现**（见 10 文档第七节覆盖性表）。

---

## 五、异常状态系统（StatusController）

对应 `04` 五节 + `03` 〇节，每个敌人挂一个 `StatusController`：
- 每种状态维护 `{ stacks, duration, lastTick }`；按基准表（创伤 0.15×/4s/5层、焚烧 0.20×/3s/8层…）tick 持续伤害（独立结算，不吃攻速，吃催命/火候/属性精研）。
- 叠满触发**爆发**（血涌/爆燃/蚀骨/落雷/冻结），爆发派发 `onStatusBurst` 事件。
- 状态伤害的属性归类（火/雷/毒）参与对应 `elemental` 乘区与流派核心（燎原/惊雷/五毒真经）。
- MVP 先实现 6 种：创伤/焚烧/瘴毒/雷殛/震慑/破甲（08 文档）。

---

## 六、标签系统（增益按类别挂钩的关键）

`06` 增益大量「按技能类别加成」。每个绝技/武器在 `config` 里声明 `tags: Tag[]`（`周期|范围|弹幕|光环|召唤|部署|异常|近战|远程|火|雷|毒`）。
- 伤害结算时把「来源技能的 tags」带入 `DamageContext`。
- 类别型增益的修饰符带 `appliesToTags`，结算时按 context.tags 命中才计入。
- 召唤/部署上限、`军备承载上限`（03）做成全局计数器，受 meta/词条调节。

---

## 七、绝技与召唤/部署调度（AbilitySystem）

落实 `03 B / 05`：**所有绝技自动触发**。
- 每个已装配绝技维护独立 CD 计时器，到点自动开火；目标由**索敌策略**决定（最近/最密敌群/全屏/路径来向），策略按绝技类型配置。
- 三大执行原型，覆盖 08 的 10 种类型：
  - **发射型**（天降/弹幕/链式/投掷）：从对象池取 `Projectile`，按参数（数量/伤害系数/穿透/弹跳/追踪）初始化。
  - **持续区域型**（光环/领域/毒区/轨道）：生成跟随玩家或落地的 AoE 实体，按 tick 命中。
  - **单位型**（召唤/部署）：实例化 `Summon`（随行 AI 自动索敌移动攻击，计时存在）或 `Deployable`（自动放置规则：进攻型→敌群、防御型→玩家周围、陷阱型→来向；用时长/耐久销毁）。
- 升级：同名绝技再次出现 → `level++`，读 `05` 对应 Lv 表刷新参数；满 Lv5 → 转「精通」词条（小幅全局加成）。
- 觉醒技用「计时充能 + 击杀加速」积能量，手动键释放；同一时刻只生效 1 个，其余进共享短 CD。

---

## 八、刷怪与关卡（SpawnDirector）

对应 `00`（敌人三层体系/时间轴）+ `08`（江南水乡轻量版）：
- `levels.ts` 定义**时间轴事件**：`{ atSec, kind: spawnWave|reinforcement|miniBoss|boss|event, payload }`。
- 密度/新兵种随时间推进；每 ~5 分钟一次增援潮；中期 mini-boss + 关末家族 Boss（MVP 简化）。
- 敌人数据 = 职业(行为 AI) × 官位(精英词缀+光环) × 家族(Boss 机制)，组合式装配。
- 轻度属性克制（火器克披甲/近战克散兵）做成伤害结算时的克制系数表。

---

## 九、三选一抽卡（Draft）

对应 `03` 出牌规则 + `04` 稀有度：
- 卡池 = 词条 + 绝技 + 增益/联动 + 流派核心，按稀有度权重（白50/绿28/蓝14/紫6/金2，受幸运/兵书残卷修正）抽取。
- 出牌规则：尽量混合不同标签（避免三词条）；已满级降权；流派核心全程至多 1 张；偶发「金色抉择」。
- 提供免费**重抽**（次数受操典/运筹帷幄影响）；`集思广益` 可临时变四选一。
- 纯逻辑放 `core/draft/`，可单测「权重分布/保底/去重」。

---

## 十、局外养成与存档（meta）

对应 `07` + `00` 核心循环：
- `SaveStore`：`localStorage`，**版本化 schema**（`version` 字段 + 迁移函数），存：解锁的职业/武器/地图、白银属性树、兵书残卷、装配「阵谱」、熟练度。
- `BarracksScene` 消费存档，产出 `RunConfig`（职业 + 2 主动 + 1 觉醒 + 永久属性加成）注入 `GameScene`。
- 死亡惩罚：局内清空，只结算 meta 货币（军功/白银）回写存档。

---

## 十一、性能与对象池

割草核心挑战是「成百上千敌人 + 弹幕」：
- **对象池**：Enemy/Projectile/Pickup/伤害飘字全部池化，死亡回收复用，零运行时 GC 抖动。
- **空间网格（uniform grid）**：碰撞查询不做 O(n²)，按格子分桶；查询半径只遍历邻近格。
- **批量渲染**：占位美术用 spritesheet + Phaser 纹理图集；同类实体共享纹理。
- **逻辑/渲染分离**：定步长逻辑 + 渲染只读，掉帧时逻辑不失真。
- 预算目标（MVP）：屏内 ~300 敌人 + ~500 弹幕维持 60fps（中端机）。

---

## 十二、测试与质量

- **单测（Vitest，重点）**：伤害乘区公式、暴击/护甲、StatSheet 叠加与上限、异常叠层/爆发、抽卡权重分布、RNG 种子可复现、联动事件触发链。
- **冒烟/集成**：用无渲染的 headless 逻辑跑「打一局」脚本，断言能升级、能触发至少 1 条异常联动连锁（对应 08 验收）。
- **手动验收（浏览器）**：跑通 08 的验收清单（自动割草→升级→联动连锁→主动/觉醒→mini-boss/Boss→结算）。
- CI：`lint` + `typecheck` + `vitest`；pre-commit 跑 lint-staged。

---

## 十三、迭代里程碑（对齐 MVP 验收）

> 每个里程碑结束都应可运行、可验证一小块手感。

| 里程碑 | 交付 | 对应验收 |
|---|---|---|
| **M0 脚手架** | Vite+TS+Phaser+miniplex 跑通空场景、ESLint/Vitest/CI、目录分层、**配静态部署流水线（每次 push 出可试玩链接）** | 工程可启动 + 在线可访问 |
| **M1 移动与自动攻击** | 刀牌手 WASD 移动、戚家刀自动横扫、对象池、空间网格碰撞 | 「自动割怪」 |
| **M2 数值内核** | StatSheet 乘区 + 伤害结算 + 暴击/护甲 + 单测 | 公式正确 |
| **M3 经验与三选一** | 经验球/升级/LevelUpScene/词条生效 | 「升级三选一即时生效」 |
| **M4 绝技系统** | AbilitySystem + 10 个绝技（覆盖全类型） | 绝技自动触发 |
| **M5 异常+联动** | StatusController（6 异常）+ 事件总线 + 10 联动 | 「可见的异常联动连锁」 |
| **M6 刷怪与 Boss** | SpawnDirector 时间轴 + mini-boss + 关末 Boss + 江南水乡图 | 打过 Boss |
| **M7 主动/觉醒 + meta** | 局外装配、藤牌格挡·反击、破阵斩、结算产 meta 货币 | 「主动技+觉醒可释放」「结算产出」 |
| **M8 打磨** | HUD/UI 占位、武器进化 1 个（戚家刀法·破阵）、鸳鸯阵 2 位 buff、性能调优 | 手感跑通、达 60fps |
| **（MVP 后）MOD/桌面** | 开放 ContentRegistry 外部 MOD 载入、Tauri 桌面包装、（评估）Steamworks 接入 | 见第十五节 |

---

## 十四、架构决策（我的推荐 + 理由）与需你拍板项

> 为减少来回，下列**默认按推荐执行**；你只需对有疑问的项纠偏。每条都附理由与"灵活性影响"。

### 我推荐的默认决策（如无异议即采用）
| 决策 | 推荐 | 理由 / 对扩展性的影响 |
|---|---|---|
| 实体组织 | **数据导向 ECS（miniplex 为主）**〔已定〕 | 用户决策；Entity=id + 纯数据组件 + 系统批处理，扩展性/性能上限高，与卡引擎数据驱动统一（详见第二节之二）。热点数据可按需下沉 bitECS/TypedArray |
| 内置内容载体 | **TS 配置对象**（强类型、可引用枚举/标签/原语） | 加卡即写带类型校验的数据；比 JSON 安全、可被编译器约束 |
| MOD 内容载体（已定） | **外部 JSON → 运行时校验入 ContentRegistry**（zod schema + 原语注册表校验） | 见第十五节；MOD = 纯数据（只组合已注册原语）→ 安全可沙箱 |
| 卡引擎 | **触发/条件/效果/修饰符 四原语 + 注册表**（10 文档） | 这是满足"几十~上百联动可扩展"的核心；已验证全覆盖现有卡 |
| 事件分发 | **队列 + chainDepth 上限 + 每帧预算** | 支撑连锁联动且不栈溢出/不刷爆性能 |
| 包管理器 | **pnpm** | 快、省盘、lockfile 严格；无强偏好可换 npm |
| 游戏循环 | **定步长逻辑 + 渲染插值** | 数值可复现、可单测、便于回放 |

### 已定决策（用户拍板，全部锁定）
- ✅ **卡引擎四原语**作为扩展性内核。
- ✅ **实体组织 = 数据导向 ECS，主库 miniplex**（热点可下沉 bitECS/TypedArray），见第二节之二。
- ✅ **MVP 配在线静态部署**（每次 push 出可试玩链接）。
- ✅ **预留 MOD 支持**（外部数据载入，见第十五节）；**目标平台含 Steam PC**（Tauri 桌面包装路线）。
- ✅ **本阶段先评审/定稿 09+10，暂不写代码**。

> 决策已闭环，无待定项。评审通过即可进入 M0。

---

## 十五、MOD 支持与桌面发行（Steam PC）路线

> 这两项现在不实现，但**架构上提前预留**，避免日后大改。核心思想：游戏一切内容都从一个 **ContentRegistry** 取数；内置内容用 TS 写、MOD 用外部 JSON 喂入同一注册表；平台差异（存档/文件/Steam）统一收敛到 `platform/` 抽象层。

### 15.1 MOD = 纯数据，复用四原语（安全可沙箱）
- 因为卡/绝技/增益已是「触发/条件/效果/修饰符」原语的**数据组合**（见 10 文档），MOD 作者**只需写 JSON 声明**、组合已注册原语，**无需也不能注入任意代码** → 天然安全，无脚本沙箱风险。
- 同理可 MOD 化的内容：卡牌（增益/联动/绝技）、词条、敌人、关卡时间轴、本地化文本；**不可** MOD 的是原语函数本身（新机制需官方加原语）。
- 加载流程：`modLoader` 读取来源（web=用户上传/拖入；桌面=`mods/` 目录或 Steam Workshop 目录）→ **zod schema 校验**结构 → 校验每个 `Trigger/Condition/Effect/Modifier.kind` 都在**原语注册表**内（未知则带行号报错拒绝）→ 通过后并入 ContentRegistry。
- **命名空间**：MOD 内容 id 强制前缀 `modId:`，避免与内置/其他 MOD 冲突；支持「启用/禁用」「加载顺序/覆盖」与「仅内置（纯净局）」开关。
- **版本兼容**：schema 带 `schemaVersion`；引擎对旧版做迁移或明确拒绝；存档记录启用的 MOD 列表，缺失时给出提示而非崩溃。

### 15.2 与「内置用 TS」并不矛盾
- 内置内容仍用 TS（编译期类型安全、最佳作者体验）；构建时/启动时把内置内容**归一化**进 ContentRegistry。
- 引擎只认 ContentRegistry，不关心来源 → 内置与 MOD 走同一条数据通路，保证「MOD 能做的内置也能做」。

### 15.3 桌面发行（Steam PC）
- **包装**：用 **Tauri**（系统 WebView，安装包小、内存省）包装同一 web 构建为首选；若 Steamworks 集成更顺手则退回 **Electron**（`steamworks.js` 生态成熟）。二者都**复用全部游戏代码**，仅替换 `platform/` 实现。
- **存档**：`StoragePort` 抽象——web 用 `localStorage`/`IndexedDB`，桌面写应用数据目录文件（并可接 Steam Cloud）。游戏逻辑只依赖接口，不直接碰 `localStorage`。
- **Steam 能力（评估接入）**：创意工坊（分发 MOD）、成就、云存档；都通过 `platform/platform.ts` 的可选接口暴露，web 端为空实现。
- **输入/显示**：预留手柄输入映射与全屏/分辨率缩放（Phaser Scale Manager）；UI 文本走 i18n key（便于 Steam 全球化与题材化命名）。

> 落地顺序：先完成 MVP（含在线试玩），MOD 外部载入与 Tauri 打包作为 **MVP 后**里程碑（见第十三节末行），但接口（ContentRegistry / StoragePort / platform）在 M0 即按上述形状预留。
