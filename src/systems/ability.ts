import type { System, SimContext } from './types';
import type { Entity, AbilityState } from '@/ecs/components';
import { BALANCE } from '@/game/balance';
import { applyStatus, type StatusKind } from '@/game/status';

/** 爆炸命中施加的状态（焚烧/霜寒…）。 */
interface BlastStatus {
  kind: StatusKind;
  stacks: number;
  duration: number;
}

const FIRE_COLOR = 0xff7a33;
const FROST_COLOR = 0x5ad0ff;

/**
 * 绝技系统（M3，09 §绝技自动调度）：施法者按内部冷却自动释放绝技。
 * 词条加成（伤害/范围/冷却）在此统一作用于所有绝技，与卡牌解耦。
 * 已实装：火油弹（朝最近敌人范围爆炸）、神火天降（向随机敌人周期天降数发）、玄冰咒（以己为心爆发减速）。
 */
export const AbilitySystem: System = {
  name: 'AbilitySystem',
  update(ctx: SimContext, dt: number): void {
    if (ctx.state.gameOver) return;
    const mult = {
      dmg: 1 + ctx.stats.get('damagePct'),
      area: 1 + ctx.stats.get('areaPct'),
      cdr: 1 + ctx.stats.get('cdrPct'),
    };

    for (const caster of ctx.queries.casters) {
      const origin = caster.transform!.position;
      for (const ab of caster.caster!.abilities) {
        ab.timer -= dt;
        if (ab.timer > 0) continue;
        if (ab.id === 'fireBomb') fireBomb(ctx, ab, origin, mult);
        else if (ab.id === 'skyfire') skyfire(ctx, ab, origin, mult);
        else if (ab.id === 'frostNova') frostNova(ctx, ab, origin, mult);
      }
    }
  },
};

interface Mult {
  dmg: number;
  area: number;
  cdr: number;
}

/**
 * 在 (x,y) 引爆一个半径 radius 的范围爆发：范围内敌人受伤 + 施加状态，并写入表现缓冲。
 * 状态（焚烧/霜寒…）与颜色由调用方声明，效果与具体绝技解耦。
 */
function explode(
  ctx: SimContext,
  x: number,
  y: number,
  radius: number,
  damage: number,
  status: BlastStatus,
  color: number,
): void {
  const r2 = radius * radius;
  for (const e of ctx.queries.enemies.entities) {
    const dx = e.transform!.position.x - x;
    const dy = e.transform!.position.y - y;
    if (dx * dx + dy * dy > r2) continue;
    e.health!.current -= damage;
    if (e.hitFlash) e.hitFlash.timer = e.hitFlash.duration;
    if (!e.status) ctx.world.addComponent(e, 'status', {});
    applyStatus(e.status!, status.kind, status.stacks, status.duration);
    ctx.state.hits.push({ x: e.transform!.position.x, y: e.transform!.position.y, crit: false });
  }
  ctx.state.blasts.push({ x, y, radius, color });
}

/** 选取距 origin 最近、且在 maxRange 内的敌人。 */
function nearestEnemy(ctx: SimContext, origin: { x: number; y: number }, maxRange: number) {
  let best: Entity | undefined;
  let bestD2 = maxRange * maxRange;
  for (const e of ctx.queries.enemies.entities) {
    const dx = e.transform!.position.x - origin.x;
    const dy = e.transform!.position.y - origin.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = e;
    }
  }
  return best;
}

function fireBomb(ctx: SimContext, ab: AbilityState, origin: { x: number; y: number }, m: Mult) {
  const cfg = BALANCE.abilities.fireBomb;
  const target = nearestEnemy(ctx, origin, cfg.targetRange);
  if (!target) {
    ab.timer = cfg.retry;
    return;
  }
  ab.timer = cfg.cooldown / m.cdr;
  const lv = ab.level;
  const radius = (cfg.radius + cfg.perLevel.radius * (lv - 1)) * m.area;
  const damage = (cfg.damage + cfg.perLevel.damage * (lv - 1)) * m.dmg;
  const tp = target.transform!.position;
  explode(
    ctx,
    tp.x,
    tp.y,
    radius,
    damage,
    { kind: 'burn', stacks: cfg.burnStacks, duration: cfg.burnDuration },
    FIRE_COLOR,
  );
}

function skyfire(ctx: SimContext, ab: AbilityState, origin: { x: number; y: number }, m: Mult) {
  const cfg = BALANCE.abilities.skyfire;
  // 只要范围内有敌人就开火；落点逐发随机选范围内敌人。
  if (!nearestEnemy(ctx, origin, cfg.targetRange)) {
    ab.timer = cfg.retry;
    return;
  }
  ab.timer = cfg.cooldown / m.cdr;
  const lv = ab.level;
  const count = cfg.meteors + cfg.perLevel.meteors * (lv - 1);
  const radius = cfg.radius * m.area;
  const damage = (cfg.damage + cfg.perLevel.damage * (lv - 1)) * m.dmg;
  const rng = ctx.rng.stream('combat');
  const candidates = [...ctx.queries.enemies.entities].filter((e) => {
    const dx = e.transform!.position.x - origin.x;
    const dy = e.transform!.position.y - origin.y;
    return dx * dx + dy * dy <= cfg.targetRange * cfg.targetRange;
  });
  for (let i = 0; i < count && candidates.length > 0; i++) {
    const pick = candidates[rng.int(0, candidates.length - 1)]!;
    const tp = pick.transform!.position;
    explode(
      ctx,
      tp.x,
      tp.y,
      radius,
      damage,
      { kind: 'burn', stacks: cfg.burnStacks, duration: cfg.burnDuration },
      FIRE_COLOR,
    );
  }
}

/** 玄冰咒：以玩家为中心爆发冰环（圈内有敌即放），范围内敌人受伤 + 霜寒减速。 */
function frostNova(ctx: SimContext, ab: AbilityState, origin: { x: number; y: number }, m: Mult) {
  const cfg = BALANCE.abilities.frostNova;
  const lv = ab.level;
  const radius = (cfg.radius + cfg.perLevel.radius * (lv - 1)) * m.area;
  // 圈内有敌人才放（搜索半径随范围词条扩大，与爆发半径一致）。
  if (!nearestEnemy(ctx, origin, radius)) {
    ab.timer = cfg.retry;
    return;
  }
  ab.timer = cfg.cooldown / m.cdr;
  const damage = (cfg.damage + cfg.perLevel.damage * (lv - 1)) * m.dmg;
  explode(
    ctx,
    origin.x,
    origin.y,
    radius,
    damage,
    { kind: 'frost', stacks: cfg.frostStacks, duration: cfg.frostDuration },
    FROST_COLOR,
  );
}
