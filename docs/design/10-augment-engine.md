# 联动 / 增益 / 绝技引擎（Augment Engine）· 明朝抗倭

> 本文是 `09-architecture.md` 的深化，专门解决最关键的扩展性问题：
> **如何让「几十~上百张联动 / 绝技 / 增益 / 词条 / 流派核心」靠声明式数据扩展，而几乎不改核心代码。**
>
> 设计契约（必须满足）：
> - **新增一张卡 = 只写一条数据**（在 `config/` 增一个声明对象）；**不改**战斗/结算/状态机内核。
> - 仅当出现**前所未见的"基础动作 / 触发时机 / 判定条件"原语**时，才新增一个原语实现（预计原语总数 ~20，是有限封闭集合）。
> - 每张卡可**独立单测**：给定事件上下文 → 断言产生的效果/修饰符。
> - 支持目前设计文档（03 / 04 / 06）出现的**全部联动模式**（见第七节逐类映射，证明覆盖）。

---

## 一、为什么不能用「一张卡一段 if」

03 + 06 已有约 40 联动 + 50 增益，后续还要扩到上百张。若每张卡在战斗代码里写 `if (cardX) {...}`，会导致：核心战斗与卡牌强耦合、改一张牵动全身、无法单测、加卡必改内核。

观察这些卡的共性，它们都可归约为同一套结构：

> **「在某个【时机】，当满足某些【条件】时，以某概率执行一组【效果】」**
> **以及/或者「持续地按某【条件】给属性表挂一组【修饰符】」**

因此把「时机/条件/效果/修饰符」抽象为**四类有限原语 + 注册表**，卡牌退化为这些原语的**声明式组合（数据）**。这就是 ECS/规则引擎里的"数据驱动行为"思路。

---

## 二、四类原语（封闭集合 + 注册表）

```
事件总线 GameEventBus ──► [Trigger 触发器] ──when──► [Condition 条件] ──do──► [Effect 效果]
                                                                              │
StatSheet 属性表 ◄──────────────────── [Modifier 修饰符]（持久/临时/条件门控/动态）
```

### 2.1 GameEvent（携带丰富上下文）
事件是引擎的"信息总线"，上下文要足够全，条件/效果才能就地判断与作用：
```ts
type GameEventType =
  | 'onHit' | 'onCrit' | 'onDealDamage' | 'onProjectileHit'
  | 'onKill' | 'onApplyStatus' | 'onStatusBurst'
  | 'onAbilityCast' | 'onTakeDamage' | 'onTimer' | 'onPickup' | 'onLevelUp';

interface GameEventCtx {
  type: GameEventType;
  source: Entity;            // 通常是玩家/召唤物
  target?: Entity;           // 受击/死亡目标
  ability?: AbilityRuntime;  // 来源绝技/武器（含 tags、属性）
  tags: ReadonlySet<Tag>;    // 本次伤害/技能携带的类别标签
  damage?: DamageInfo;       // 数值、属性、是否暴击、是否独立事件
  statusType?: StatusType;   // onApplyStatus/onStatusBurst 用
  isCrit?: boolean;
  rng: Rng;                  // 可注入种子，便于复现与测试
  chainDepth: number;        // 连锁深度（递归防护用）
  world: WorldQuery;         // 只读战场查询（附近敌数/最密点等）
}
```

### 2.2 Condition（条件谓词，可组合）
注册表里是一组纯函数 `(ctx) => boolean`，并提供 `all / any / not` 组合子：
```
hasTags(['周期'])              targetHasStatus('焚烧')        statusIs('雷殛')
isCrit                         targetBelowHpPct(0.3)          distinctStatusCountAtLeast(3)
chance(p)                      selfBelowHpPct(0.3)            comboCountAtLeast(n)
isEliteOrBoss                  movingNow / stationaryFor(s)   nearbyEnemiesAtLeast(n)
```
> 组合示例：`all([ hasTags(['近战']), chance(0.3) ])`。

### 2.3 Effect（动作，可组合成序列）
注册表里是一组 `(ctx, params) => void`，**产生新伤害的效果会再次进入结算管线**（见第四节连锁）：
```
applyStatus(type, stacks)      dealDamage(coef, element, opts)   explodeAt(pos, radius, coef)
chainLightning(jumps, coef)    splitProjectile(n)                pierce(+n) / ricochet(n)
heal(amount) / lifesteal(pct)  resetCooldown(scope)              grantModifier(spec, durationS)
addPendingBuff(spec)           consumePendingBuff()              summon(id) / deploy(id)
modifyDraft(rule)              gainEnergy / refreshTrigger
```
- 每个 Effect 都可带 `chance` 与 `icd`（内部冷却）字段，防刷屏。
- Effect 只调用**已有引擎 API**（伤害结算、状态控制器、对象池、抽卡器），不内嵌业务分支。

### 2.4 Modifier（修饰符，挂在 StatSheet）
持久型卡（词条 / 类别强化 / 构筑曲线型）通过修饰符改变 04 的乘区桶。修饰符三种取值形态：
- **静态**：`+22%`（或引用稀有度档位）。
- **条件门控**：带 `appliesWhen`，仅在结算上下文满足时计入（如「只对带`周期`标签的技能 +25%」「只对【焚烧】目标 +X%」）。
- **动态**：`value: (snap) => number`，从当前属性/战场态势推导（构筑曲线型，如「攻速每 +10%，全伤害 +4%」）。
```ts
interface ModifierSpec {
  bucket: StatBucket;            // addAttack | skillAttack | independent | elemental.fire | critRate | critDmg | formation | vulnerable | armorPen | ...
  value: number | RarityRef | ((snap: StatSnapshot, ctx?: GameEventCtx) => number);
  appliesWhen?: ConditionSpec;   // 缺省=无条件，恒计入
  source: string;               // 卡 id，便于升级/移除/满级转精通
}
```

---

## 三、卡牌声明式 Schema（这就是"加一张卡=写一条数据"）

所有卡（词条/绝技/联动/增益/流派核心）统一为一个 `CardDef`，按需填字段：
```ts
interface CardDef {
  id: string;
  name: string;                 // 题材化名称
  kind: 'trait' | 'ability' | 'augment' | 'synergy' | 'core';
  tags?: Tag[];                 // 该卡/技能的类别标签
  rarity?: RarityRef;           // 首次出现稀有度 & 五档数值引用（04）
  maxLevel?: number;            // 默认 5；满级行为见 onMaxLevel
  onMaxLevel?: 'toMastery';

  // —— 持久行为：挂修饰符（词条 / 类别强化 / 构筑曲线型）——
  modifiers?: ModifierSpec[];

  // —— 事件行为：联动 / 海克斯触发 ——
  triggers?: TriggerSpec[];

  // —— 绝技专属：自动开火配置（见第六节）——
  ability?: AbilitySpec;

  // —— 影响三选一 / 资源（集思广益 / 运筹帷幄 / 慧眼）——
  draftRules?: DraftRuleSpec[];

  // —— 流派核心：质变开关（解锁上限/改写规则）——
  coreEffects?: CoreEffectSpec[];

  // —— 出牌/进化规则（见 09 第九节、11 文档 B5）——
  requires?: string[];          // 前置：需先拥有这些卡才入池
  excludes?: string[];          // 互斥：与这些卡不同时出现
  weightWhen?: ConditionSpec;   // 构筑加权：满足时提高入池权重
  evolution?: {                 // 进化：满级 + 持有指定卡 → 质变为新卡
    requires: string[];         //   需同时拥有的被动/绝技
    atMaxLevel?: boolean;       //   通常需本卡满级
    into: string;               //   进化后的 CardDef id
  };
}

interface TriggerSpec {
  on: GameEventType;
  when?: ConditionSpec;
  chance?: number | RarityRef;
  icd?: number;                 // 内部冷却（秒），防同帧刷屏
  do: EffectSpec[];
}
```
> 引擎启动时把所有 `CardDef` 装载进注册表；运行时不存在"针对某张卡的硬编码分支"。

---

## 四、连锁、递归与性能防护（关键工程问题）

联动会产生连锁（尸爆→再杀→再尸爆、分裂→再命中→再分裂、爆发→连带爆发）。处理不当会栈溢出或刷爆性能。约束：
- **事件用队列分发，不用递归调用栈**：Effect 产生的新伤害/新事件入队，在本逻辑步内按队列处理，便于截断与预算。
- **`chainDepth` 上限**（默认 3~4）：每经一次"伤害派生伤害"depth+1，超限不再派生。
- **ICD（内部冷却）**：概率触发型（天降流星/连锁闪电）每个 source 维护 ICD（0.3~0.5s），防一帧多触发。
- **每帧事件预算**：单逻辑步处理的派生事件数设上限，超出留到下一步，保证帧时间可控。
- 触发器按 `on` 类型建索引（`Map<GameEventType, TriggerSpec[]>`），派发 O(命中该事件的触发器数)，不是全卡扫描。

---

## 五、StatSheet 与修饰符聚合（落实 04 乘区）

- 每个乘区桶维护「无条件合计（缓存）」+「条件/动态修饰符列表（按 ctx 即时评估）」。
- 结算 `getDamageMultiplier(ctx)`：取各桶 = 缓存合计 + Σ(满足 `appliesWhen` 的条件修饰符) + Σ(动态修饰符(snap,ctx))，再按 04 公式相乘、减护甲。
- 软/硬上限按 04 夹取（攻速 +200%、CD 70%、暴击率 100%）；预留"软上限拐点后递减"开关。
- 升级/满级转精通：按 `source` 整体替换该卡的修饰符集合，缓存增量更新。

---

## 六、绝技也走同一套（自动开火 = 配置 + 复用 Effect）

绝技无需另起炉灶，`AbilitySpec` 复用 Effect 原语：
```ts
interface AbilitySpec {
  trigger: { kind: 'cooldown'; baseCd: number } | { kind: 'energy'; charge: number }; // 普通绝技/觉醒
  targeting: 'nearest' | 'densest' | 'screen' | 'aroundSelf' | 'enemyPath';
  levelCurve: AbilityLevel[];   // 直接对应 05 的 Lv1~5 表（CD/数量/伤害系数/异常层数/强化点）
  onFire: EffectSpec[];         // 复用 spawnProjectile / explodeAt / summon / deploy / aura ...
  tags: Tag[];                  // 供 06 类别增益挂钩
}
```
- `AbilitySystem` 到 CD/能量满 → 按 `targeting` 选目标 → 执行 `onFire`（同样进结算管线，能被联动捕获）。
- 升级 = `level++` 读 `levelCurve[level]` 刷新参数；满 Lv5 → 转精通词条。
- 召唤/部署是 `summon/deploy` 效果产出的实体，其攻击同样发事件，受联动（如「借刀杀人：召唤命中也挂你的异常」）影响。

---

## 七、覆盖性验证：把现有卡逐类映射为声明（节选，证明无需新代码）

| 卡（来源） | 声明（伪代码） | 用到的原语 |
|---|---|---|
| 见血封喉(03) | `triggers:[{on:'onHit', when:hasTags(['近战']), chance:rarity, do:[applyStatus('创伤',1)]}]` | onHit / hasTags / applyStatus |
| 火药浸刃(03) | `{on:'onHit', chance:rarity, do:[applyStatus('焚烧',1)]}` | 同上 |
| 火中带刃(06) | `{on:'onApplyStatus', when:statusIs('焚烧'), do:[applyStatus('创伤',1)]}` | onApplyStatus / statusIs |
| 导电体(03) | `{on:'onKill', when:targetHasStatus('雷殛'), do:[chainLightning(4,coef)]}` | onKill / chainLightning |
| 箭无虚发(03) | `{on:'onProjectileHit', chance:rarity, do:[splitProjectile(2)]}` | splitProjectile |
| 首级传功(03) | `{on:'onKill', chance:rarity, do:[explodeAt(target,r,coef)]}` | explodeAt |
| 一击必杀(03) | `modifiers:[{bucket:critDmg, value:rarity, appliesWhen:targetBelowHpPct(0.x)}]` | 条件门控修饰符 |
| 以战养战(04) | `{on:'onDealDamage', do:[lifesteal(pct)]}` | lifesteal |
| 不屈军魂(06) | `{on:'onTakeDamage', when:lethal, icd:perLevel, do:[preventDeath, heal]}` | onTakeDamage / preventDeath |
| 天降神火(06,海克斯) | `{on:'onDealDamage', chance:0.15, icd:0.4, do:[dealDamage@target(1.5,'fire'), applyStatus('焚烧',1)]}` | 概率+ICD+派生伤害 |
| 军器精造(06,类别) | `modifiers:[{bucket:categoryMult, value:+0.25, appliesWhen:hasTags(['周期'])}]` | 标签门控修饰符 |
| 百炼(06,异常类别) | `modifiers:[{bucket:statusDmg/statusDur, value:+0.25/+0.3, appliesWhen:hasTags(['异常'])}]` | 同上 |
| 状态共鸣(03) | `modifiers:[{bucket:vulnerable, value:rarity, appliesWhen:distinctStatusCountAtLeast(3)}]` | 条件门控 |
| 疾风骤雨(06,曲线) | `modifiers:[{bucket:independent, value:(snap)=>Math.floor(snap.atkSpdPct/10)*0.04}]` | 动态修饰符 |
| 游击/镇守(06) | `modifiers:[{bucket:independent, value:+0.2, appliesWhen:movingNow}]` / `stationaryFor(1)` | 条件门控 |
| 同仇敌忾(03) | `modifiers:[{bucket:independent, value:(snap,ctx)=>k*ctx.world.nearbyEnemies()}]` | 动态(战场查询) |
| 蓄势待发(06,蓄力) | `triggers:[{on:'onTimer', every:6, do:[addPendingBuff({nextHit:+1.2})]}]` + 命中时 `consumePendingBuff` | onTimer / pendingBuff |
| 借势(06) | `{on:'onHit', when:hasTags(['周期']), chance:0.1, do:[resetCooldown('randomAbility')]}` | resetCooldown |
| 集思广益(06) | `draftRules:[{kind:'choiceCount', value:4}]` | 抽卡规则 |
| 运筹帷幄(06) | `draftRules:[{kind:'rerollPerLevel', value:+1}]` | 抽卡规则 |
| 燎原(流派核心,03) | `coreEffects:[{kind:'liftStatusCap', status:'焚烧', to:Infinity},{kind:'onDeathChain','焚烧'}]` | 核心质变开关 |

> 结论：**现有全部联动/增益/词条/流派核心**都能用 ~20 个原语的组合声明出来；后续上百张卡绝大多数是**纯数据**。只有遇到真正新机制（如全新触发时机）才补一个原语，且补完即被未来同类复用。

---

## 八、扩展工作流（加一张新卡时怎么做）

1. 在 `config/augments.ts`（或对应表）写一个 `CardDef` 声明对象。
2. 若用到的 Trigger/Condition/Effect/Modifier 原语已存在 → **零核心代码改动**，完工。
3. 若需要前所未见的原语 → 在对应注册表加 1 个纯函数 + 1 个单测，然后在卡里引用。
4. 为该卡加一条表驱动单测（给定 ctx → 断言效果/修饰符）。
5. 配稀有度五档数值（引用 04 表），无需改结算。

---

## 九、测试策略

- **原语级**：每个 Condition/Effect/Modifier 纯函数单测（含 RNG 种子注入、ICD、连锁深度）。
- **卡级**：表驱动——`[卡, 构造ctx, 期望产出]`，覆盖现有全部卡。
- **连锁级**：构造"尸爆→连环"场景，断言 `chainDepth` 截断与每帧事件预算生效。
- **回归**：新增卡只需加数据 + 一行测试用例，不动既有用例。

---

## 十、与 09 的关系
- 本文细化 09 第四节（事件总线）、第六节（标签）、第三节（StatSheet）。
- 09 仍是总览与分层/里程碑；本文是"扩展性内核"的权威设计。
- **伤害归因**：`DamageInfo` 增 `attribution{ sourceCardId, sourceAbilityId }`，`DamageSystem` 按来源累加进本局 `RunStats`，供结算面板与数值平衡（见 11 文档 B4）。
- **系统完备性**（手感/UI/音频/输入/i18n/难度等）见 `11-systems-completeness.md`。
- **与 ECS 的衔接（09 第二节之二）**：上文 `Entity` 即 miniplex 实体；效果作用于"实体+组件"——`applyStatus` 写目标 `StatusBag` 组件、`grantModifier` 改 `Stats` 组件、`spawnProjectile/summon/deploy` 通过 `prefabs` 装配新实体、`modifyDraft` 作用于抽卡器。卡引擎的执行载体是 ECS 的 `AugmentSystem`，它消费 `core/events` 的战斗事件队列。
