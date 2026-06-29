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
| 引擎 | **Phaser 3**（Arcade Physics） | 2D 渲染 + 输入 + 场景 + 轻量物理；割草不需要刚体，用 Arcade 足够 |
| 单测 | **Vitest** | 纯逻辑（伤害公式/Stat 管线/状态机）单测，不依赖渲染 |
| 代码规范 | **ESLint + Prettier** | 提交前 `lint`；配 pre-commit 钩子（husky + lint-staged） |
| 部署 | 静态站点（devinapps/Netlify/GitHub Pages） | `dist/` 直接托管 |

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
   ├─ core/                     # === 与引擎无关的纯逻辑（可单测）===
   │   ├─ stats/                #   StatSheet + 乘区管线（对应 04 一节）
   │   ├─ combat/               #   damage.ts 伤害结算、crit、armor
   │   ├─ status/               #   StatusController 异常叠层/爆发
   │   ├─ rng/                  #   可注入种子的随机源（便于测试/复现）
   │   ├─ draft/                #   三选一抽卡（权重/重抽/保底）
   │   └─ events/               #   GameEventBus（类型安全事件）
   ├─ entities/                 # === Phaser 实体（GameObject 封装）===
   │   ├─ Player.ts
   │   ├─ Enemy.ts
   │   ├─ Projectile.ts
   │   ├─ Summon.ts             #   召唤物（随行 AI）
   │   ├─ Deployable.ts         #   部署物（箭塔/地雷/拒马）
   │   └─ Pickup.ts             #   经验球/银两/粮草
   ├─ systems/                  # === 局内系统（每帧/定步长 update）===
   │   ├─ AbilitySystem.ts      #   绝技自动触发调度 + 索敌
   │   ├─ SpawnDirector.ts      #   时间轴刷怪 + 增援潮 + boss
   │   ├─ CollisionSystem.ts    #   空间网格碰撞查询
   │   ├─ StatusSystem.ts       #   异常 tick + 爆发
   │   ├─ ModifierSystem.ts     #   词条/增益挂载到 StatSheet/事件
   │   ├─ PickupSystem.ts       #   拾取/吸附/经验升级
   │   └─ XpLevelSystem.ts      #   军功→升级→触发三选一
   ├─ scenes/                   # === Phaser 场景（流程）===
   │   ├─ BootScene.ts
   │   ├─ PreloadScene.ts
   │   ├─ MenuScene.ts
   │   ├─ BarracksScene.ts      #   卫所：meta 装配/解锁（局外）
   │   ├─ GameScene.ts          #   局内主战斗
   │   ├─ LevelUpScene.ts       #   三选一卡牌（覆盖在 GameScene 上，暂停逻辑）
   │   ├─ HudScene.ts           #   常驻 HUD（血/护甲/计时/CD/槽位）
   │   └─ ResultScene.ts        #   结算 + meta 货币产出
   ├─ meta/                     # === 局外存档/养成 ===
   │   ├─ SaveStore.ts          #   localStorage 持久化（版本化 schema）
   │   └─ Progression.ts        #   解锁/属性树/装配方案（阵谱）
   ├─ ui/                       # 复用 UI 组件（卡牌/血条/图标，占位）
   └─ types/                    # 全局类型定义
```

> **关键分层**：`core/` 完全不 import Phaser，只做数学/状态/事件——这是单测的主体，也是数值正确性的保证。`entities/`、`systems/`、`scenes/` 才依赖 Phaser。

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
- 每个逻辑步依次驱动系统（顺序很重要）：
  1. `InputSystem`（读输入 → 玩家意图）
  2. `SpawnDirector`（按时间轴生成敌人）
  3. 移动（玩家/敌人 AI/弹幕/召唤）
  4. `AbilitySystem`（到 CD 自动开火 + 索敌）
  5. `CollisionSystem`（网格查询 → 命中事件）
  6. `combat.resolveDamage`（结算 → 派发 onHit/onKill/onCrit）
  7. `StatusSystem`（异常 tick / 爆发）
  8. `PickupSystem` + `XpLevelSystem`
  9. 清理（死亡回收对象池、过期实体）
- 渲染（Phaser 自有 render）只读状态，不改状态。

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
| **M0 脚手架** | Vite+TS+Phaser 跑通空场景、ESLint/Vitest/CI、目录分层 | 工程可启动 |
| **M1 移动与自动攻击** | 刀牌手 WASD 移动、戚家刀自动横扫、对象池、空间网格碰撞 | 「自动割怪」 |
| **M2 数值内核** | StatSheet 乘区 + 伤害结算 + 暴击/护甲 + 单测 | 公式正确 |
| **M3 经验与三选一** | 经验球/升级/LevelUpScene/词条生效 | 「升级三选一即时生效」 |
| **M4 绝技系统** | AbilitySystem + 10 个绝技（覆盖全类型） | 绝技自动触发 |
| **M5 异常+联动** | StatusController（6 异常）+ 事件总线 + 10 联动 | 「可见的异常联动连锁」 |
| **M6 刷怪与 Boss** | SpawnDirector 时间轴 + mini-boss + 关末 Boss + 江南水乡图 | 打过 Boss |
| **M7 主动/觉醒 + meta** | 局外装配、藤牌格挡·反击、破阵斩、结算产 meta 货币 | 「主动技+觉醒可释放」「结算产出」 |
| **M8 打磨** | HUD/UI 占位、武器进化 1 个（戚家刀法·破阵）、鸳鸯阵 2 位 buff、性能调优 | 手感跑通、达 60fps |

---

## 十四、架构决策（我的推荐 + 理由）与需你拍板项

> 为减少来回，下列**默认按推荐执行**；你只需对有疑问的项纠偏。每条都附理由与"灵活性影响"。

### 我推荐的默认决策（如无异议即采用）
| 决策 | 推荐 | 理由 / 对扩展性的影响 |
|---|---|---|
| 实体组织 | **轻量组件式**（实体持有 StatSheet/StatusController/AI 组件），不引入重型 ECS 库 | 贴合 Phaser、复杂度可控；扩展性主要由"声明式卡引擎"承担，不依赖 ECS |
| 卡/数值表载体 | **TS 配置对象**（强类型、可引用枚举/标签/原语） | 加卡即写带类型校验的数据；比 JSON 更安全、可被编译器约束，契合"加卡=写数据" |
| 卡引擎 | **触发/条件/效果/修饰符 四原语 + 注册表**（10 文档） | 这是满足"几十~上百联动可扩展"的核心；已验证全覆盖现有卡 |
| 事件分发 | **队列 + chainDepth 上限 + 每帧预算** | 支撑连锁联动且不栈溢出/不刷爆性能 |
| 包管理器 | **pnpm** | 快、省盘、lockfile 严格；无强偏好可换 npm |
| 游戏循环 | **定步长逻辑 + 渲染插值** | 数值可复现、可单测、便于回放 |

### 需要你拍板的项（影响范围较大）
1. **是否同意上表的"卡引擎四原语"方案**作为扩展性内核？（这是本次最关键的设计，决定后续上百张卡的工作量。）
2. **现在是否进入 M0 脚手架编码**（仍是工程初始化，不写玩法逻辑），还是先把 09/10 架构评审定稿再开工？
3. **是否需要我在 MVP 阶段配置在线静态部署**（GitHub Pages / devinapps），便于你随时在浏览器试玩与反馈手感？
4. 是否有**未来扩展方向**现在就要预留接口的（如：联机/多人、关卡编辑器、MOD/外部数据热加载、移动端触控）——告诉我，我会在原语集合与数据 schema 上预留。
