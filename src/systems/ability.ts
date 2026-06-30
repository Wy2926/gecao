import type { System, SimContext } from './types';
import type { Entity, AbilityState } from '@/ecs/components';
import { BALANCE } from '@/game/balance';
import { applyStatus, incomingDamageFactor, type StatusKind } from '@/game/status';

/** 命中同时施加的状态（焚烧/雷殛…）。 */
interface HitStatus {
  kind: StatusKind;
  stacks: number;
  duration: number;
}

/**
 * 统一的「对敌人造成伤害」入口：乘上雷殛等易伤系数后扣血，可选施加状态，并写命中表现。
 * 这样雷殛的「受伤 +X%」对所有伤害源（横扫/火爆/雷链）一致生效。
 */
function damageEnemy(ctx: SimContext, e: Entity, base: number, status?: HitStatus): void {
  const factor = e.status ? incomingDamageFactor(e.status) : 1;
  e.health!.current -= base * factor;
  if (e.hitFlash) e.hitFlash.timer = e.hitFlash.duration;
  if (status) {
    if (!e.status) ctx.world.addComponent(e, 'status', {});
    applyStatus(e.status!, status.kind, status.stacks, status.duration);
  }
  ctx.state.hits.push({ x: e.transform!.position.x, y: e.transform!.position.y, crit: false });
}

/**
 * 绝技系统（M3，09 §绝技自动调度）：施法者按内部冷却自动释放绝技。
 * 词条加成（伤害/范围/冷却）在此统一作用于所有绝技，与卡牌解耦。
 * 已实装：火油弹、神火天降（焚烧）、雷火连环（链电·雷殛）。
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
        else if (ab.id === 'chainLightning') chainLightning(ctx, ab, origin, mult);
      }
    }
  },
};

interface Mult {
  dmg: number;
  area: number;
  cdr: number;
}

/** 在 (x,y) 引爆一个半径 radius 的火爆：范围内敌人受伤 + 焚烧，并写入表现缓冲。 */
function explode(
  ctx: SimContext,
  x: number,
  y: number,
  radius: number,
  damage: number,
  burnStacks: number,
  burnDuration: number,
): void {
  const r2 = radius * radius;
  for (const e of ctx.queries.enemies.entities) {
    const dx = e.transform!.position.x - x;
    const dy = e.transform!.position.y - y;
    if (dx * dx + dy * dy > r2) continue;
    damageEnemy(ctx, e, damage, { kind: 'burn', stacks: burnStacks, duration: burnDuration });
  }
  ctx.state.blasts.push({ x, y, radius });
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
  explode(ctx, tp.x, tp.y, radius, damage, cfg.burnStacks, cfg.burnDuration);
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
    explode(ctx, tp.x, tp.y, radius, damage, cfg.burnStacks, cfg.burnDuration);
  }
}

/** 离 from 最近、在 maxRange 内、且不在 exclude 内的敌人（雷链下一跳）。 */
function nearestUnhit(
  ctx: SimContext,
  from: { x: number; y: number },
  maxRange: number,
  exclude: Set<Entity>,
): Entity | undefined {
  let best: Entity | undefined;
  let bestD2 = maxRange * maxRange;
  for (const e of ctx.queries.enemies.entities) {
    if (exclude.has(e)) continue;
    const dx = e.transform!.position.x - from.x;
    const dy = e.transform!.position.y - from.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = e;
    }
  }
  return best;
}

function chainLightning(
  ctx: SimContext,
  ab: AbilityState,
  origin: { x: number; y: number },
  m: Mult,
) {
  const cfg = BALANCE.abilities.chainLightning;
  const first = nearestEnemy(ctx, origin, cfg.targetRange);
  if (!first) {
    ab.timer = cfg.retry;
    return;
  }
  ab.timer = cfg.cooldown / m.cdr;
  const lv = ab.level;
  const jumps = cfg.jumps + cfg.perLevel.jumps * (lv - 1);
  const headDamage = (cfg.damage + cfg.perLevel.damage * (lv - 1)) * m.dmg;
  const decay = Math.max(0, cfg.decay + cfg.perLevel.decay * (lv - 1));

  const hit = new Set<Entity>();
  let cur: Entity | undefined = first;
  let prev = origin;
  for (let j = 0; j < jumps && cur; j++) {
    const p = cur.transform!.position;
    // 弹体轨迹（origin→首目标→逐跳），供场景画闪电线段。
    ctx.state.bolts.push({ x1: prev.x, y1: prev.y, x2: p.x, y2: p.y });
    const damage = headDamage * Math.pow(1 - decay, j);
    hit.add(cur);
    damageEnemy(ctx, cur, damage, {
      kind: 'shock',
      stacks: cfg.shockStacks,
      duration: cfg.shockDuration,
    });
    prev = { x: p.x, y: p.y };
    cur = nearestUnhit(ctx, p, cfg.jumpRange, hit);
  }
}
