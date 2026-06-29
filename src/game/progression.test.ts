import { describe, it, expect } from 'vitest';
import { Simulation } from './simulation';
import { FIXED_DT } from '@/core/fixed-timestep';
import type { StatKey } from './stats';
import { STAT_KEYS } from './stats';

function dropOrbsAtPlayer(sim: Simulation, count: number): void {
  const p = sim.player.transform!.position;
  for (let i = 0; i < count; i++) {
    sim.ctx.world.add({
      pickup: { kind: 'xp', amount: 1, magnetRadius: 150 },
      faction: { faction: 'neutral' },
      transform: { position: { x: p.x, y: p.y }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      renderable: { spriteKey: 'pickup.xp', prevPosition: { x: p.x, y: p.y } },
    });
  }
}

function totalStats(sim: Simulation): number {
  const snap = sim.stats.snapshot();
  return (STAT_KEYS as readonly StatKey[]).reduce((s, k) => s + snap[k], 0);
}

describe('M2 progression: xp pickup → level → draft → card', () => {
  it('picks up orbs, gains xp and levels up, opening a draft', () => {
    const sim = new Simulation({ seed: 1 });
    dropOrbsAtPlayer(sim, 30);
    sim.advance(FIXED_DT);

    expect(sim.ctx.queries.pickups.size).toBe(0);
    expect(sim.ctx.state.progression.level).toBeGreaterThan(1);
    expect(sim.ctx.state.draft.active).toBe(true);
    expect(sim.ctx.state.draft.options.length).toBe(3);
    expect(sim.ctx.state.draft.rerollsLeft).toBe(1);
  });

  it('picking a card applies its stat modifier and closes the draft', () => {
    const sim = new Simulation({ seed: 1 });
    dropOrbsAtPlayer(sim, 12);
    sim.advance(FIXED_DT);
    expect(sim.ctx.state.draft.active).toBe(true);

    const idx = sim.ctx.state.draft.options.findIndex((o) => o.card.kind === 'term');
    const opt = sim.ctx.state.draft.options[idx]!;
    const card = opt.card;
    if (card.kind !== 'term') throw new Error('expected a term card in draft');
    expect(totalStats(sim)).toBe(0);
    sim.pickDraft(idx);

    expect(sim.stats.get(card.stat)).toBeCloseTo(opt.amount);
    expect(totalStats(sim)).toBeGreaterThan(0);
    expect(sim.ctx.state.draft.active).toBe(false);
  });

  it('queues multiple level-ups and reopens the draft after each pick', () => {
    const sim = new Simulation({ seed: 3 });
    dropOrbsAtPlayer(sim, 200);
    sim.advance(FIXED_DT);

    expect(sim.ctx.state.draft.pending).toBeGreaterThan(0);
    const queued = sim.ctx.state.draft.pending;
    sim.pickDraft(0);
    expect(sim.ctx.state.draft.active).toBe(true);
    expect(sim.ctx.state.draft.pending).toBe(queued - 1);
  });

  it('damage card increases the player attacker damage immediately', () => {
    const sim = new Simulation({ seed: 1 });
    const baseDamage = sim.player.attacker!.damage;
    dropOrbsAtPlayer(sim, 12);
    sim.advance(FIXED_DT);
    // force a known damage card by injecting an option
    sim.ctx.state.draft.options[0] = {
      card: {
        id: 'whetstone',
        kind: 'term',
        stat: 'damagePct',
        unit: 'pct',
        basePerStack: 0.5,
        color: 0,
      },
      rarity: 'common',
      amount: 0.5,
    };
    sim.pickDraft(0);
    expect(sim.player.attacker!.damage).toBeCloseTo(baseDamage * 1.5);
  });

  it('is deterministic: same seed yields identical draft options', () => {
    const draftIds = (seed: number): string[] => {
      const sim = new Simulation({ seed });
      dropOrbsAtPlayer(sim, 12);
      sim.advance(FIXED_DT);
      return sim.ctx.state.draft.options.map((o) => `${o.card.id}:${o.rarity}`);
    };
    expect(draftIds(99)).toEqual(draftIds(99));
  });
});
