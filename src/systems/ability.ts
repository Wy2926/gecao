import type { System, SimContext } from './types';
import type { Entity, AbilityState } from '@/ecs/components';
import { BALANCE } from '@/game/balance';
import { applyStatus } from '@/game/status';

/**
 * 绝技系统（M3，09 §绝技自动调度）：施法者按内部冷却自动释放绝技。
 * 词条加成（伤害/范围/冷却）在此统一作用于所有绝技，与卡牌解耦。
 * MVP 实装「火油弹」：朝最近敌人投掷，落点范围爆炸 + 施加焚烧。
 */
export const AbilitySystem: System = {
  name: 'AbilitySystem',
  update(ctx: SimContext, dt: number): void {
    if (ctx.state.gameOver) return;
    const dmgMult = 1 + ctx.stats.get('damagePct');
    const areaMult = 1 + ctx.stats.get('areaPct');
    const cdrMult = 1 + ctx.stats.get('cdrPct');

    for (const caster of ctx.queries.casters) {
      const origin = caster.transform!.position;
      for (const ab of caster.caster!.abilities) {
        ab.timer -= dt;
        if (ab.timer > 0) continue;
        if (ab.id === 'fireBomb') fireBomb(ctx, ab, origin, dmgMult, areaMult, cdrMult);
      }
    }
  },
};

function fireBomb(
  ctx: SimContext,
  ab: AbilityState,
  origin: { x: number; y: number },
  dmgMult: number,
  areaMult: number,
  cdrMult: number,
): void {
  const cfg = BALANCE.abilities.fireBomb;
  const enemies = ctx.queries.enemies.entities;

  // 选取范围内最近的倭寇作为落点；无目标则短暂重试，不空放。
  let target: Entity | undefined;
  let bestD2 = cfg.targetRange * cfg.targetRange;
  for (const e of enemies) {
    const dx = e.transform!.position.x - origin.x;
    const dy = e.transform!.position.y - origin.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) {
      bestD2 = d2;
      target = e;
    }
  }
  if (!target) {
    ab.timer = cfg.retry;
    return;
  }
  ab.timer = cfg.cooldown / cdrMult;

  const lv = ab.level;
  const radius = (cfg.radius + cfg.perLevel.radius * (lv - 1)) * areaMult;
  const damage = (cfg.damage + cfg.perLevel.damage * (lv - 1)) * dmgMult;
  const tp = target.transform!.position;
  const r2 = radius * radius;

  for (const e of enemies) {
    const dx = e.transform!.position.x - tp.x;
    const dy = e.transform!.position.y - tp.y;
    if (dx * dx + dy * dy > r2) continue;
    e.health!.current -= damage;
    if (e.hitFlash) e.hitFlash.timer = e.hitFlash.duration;
    if (!e.status) ctx.world.addComponent(e, 'status', {});
    applyStatus(e.status!, 'burn', cfg.burnStacks, cfg.burnDuration);
    ctx.state.hits.push({ x: e.transform!.position.x, y: e.transform!.position.y, crit: false });
  }
  ctx.state.blasts.push({ x: tp.x, y: tp.y, radius });
}
