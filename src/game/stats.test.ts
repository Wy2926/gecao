import { describe, it, expect } from 'vitest';
import { StatSheet, deriveStats, applyStats, type PlayerBaseStats } from './stats';
import type { Entity } from '@/ecs/components';

const base: PlayerBaseStats = {
  maxHp: 100,
  moveSpeed: 200,
  damage: 25,
  cooldown: 0.7,
  range: 130,
  halfArc: Math.PI / 3,
  knockback: 60,
  critChance: 0.05,
  critMult: 1.6,
};

describe('StatSheet + deriveStats', () => {
  it('accumulates modifiers additively', () => {
    const s = new StatSheet();
    s.add('damagePct', 0.12);
    s.add('damagePct', 0.18);
    expect(s.get('damagePct')).toBeCloseTo(0.3);
  });

  it('applies percentage modifiers to derived values', () => {
    const s = new StatSheet();
    s.add('damagePct', 0.2);
    s.add('maxHpPct', 0.5);
    s.add('areaPct', 0.1);
    const d = deriveStats(base, s);
    expect(d.damage).toBeCloseTo(30);
    expect(d.maxHp).toBeCloseTo(150);
    expect(d.range).toBeCloseTo(143);
  });

  it('attack speed and cdr both shorten cooldown multiplicatively', () => {
    const s = new StatSheet();
    s.add('attackSpeedPct', 0.5);
    s.add('cdrPct', 0.25);
    const d = deriveStats(base, s);
    expect(d.cooldown).toBeCloseTo(0.7 / (1.5 * 1.25));
  });

  it('adds base crit and clamps total crit chance to 1', () => {
    const s = new StatSheet();
    s.add('critChance', 0.1);
    expect(deriveStats(base, s).critChance).toBeCloseTo(0.15);
    s.add('critChance', 5);
    expect(deriveStats(base, s).critChance).toBe(1);
  });

  it('applyStats writes back to components and preserves hp ratio', () => {
    const player: Entity = {
      health: { current: 50, max: 100 },
      attacker: {
        cooldown: 0.7,
        timer: 0,
        range: 130,
        halfArc: Math.PI / 3,
        damage: 25,
        knockback: 60,
        critChance: 0.05,
        critMult: 1.6,
      },
    };
    const s = new StatSheet();
    s.add('maxHpPct', 1);
    s.add('damagePct', 0.2);
    applyStats(player, base, s);
    expect(player.health!.max).toBeCloseTo(200);
    expect(player.health!.current).toBeCloseTo(100); // 50% ratio preserved
    expect(player.attacker!.damage).toBeCloseTo(30);
  });
});
