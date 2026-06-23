export type Faction = 'haven' | 'necro';

export interface UnitType {
  id: string;
  name: string;
  faction: Faction;
  icon: string;
  tier: number;
  atk: number;
  def: number;
  baseInit: number;
  minDmg: number;
  maxDmg: number;
  hp: number;
  ranged: boolean;
  morale: number;
}

export interface Stack {
  uid: string;
  type: UnitType;
  side: Faction;
  count: number;
  curHp: number;
  x: number;
  y: number;
  initRoll: number;
  defending: boolean;
  hasActed: boolean;
  waited: boolean;
  morale: number;
  luck: number;
}

export const COLS = 10;
export const ROWS = 8;

// ── Юниты ──────────────────────────────────────────────────────────────
// minDmg/maxDmg — как в HoMM V, morale: 1=нормально, 0=нежить (вне морали)
export const HAVEN_UNITS: UnitType[] = [
  { id: 'militia',  name: 'Ополченец',  faction: 'haven', icon: '🛡️', tier: 1, atk: 4,  def: 5,  baseInit: 5,  minDmg: 1,  maxDmg: 3,  hp: 6,  ranged: false, morale: 1 },
  { id: 'crossbow', name: 'Арбалетчик', faction: 'haven', icon: '🏹', tier: 2, atk: 6,  def: 4,  baseInit: 6,  minDmg: 2,  maxDmg: 4,  hp: 8,  ranged: true,  morale: 1 },
  { id: 'paladin',  name: 'Паладин',    faction: 'haven', icon: '⚔️', tier: 6, atk: 11, def: 10, baseInit: 9,  minDmg: 10, maxDmg: 20, hp: 35, ranged: false, morale: 1 },
];

export const NECRO_UNITS: UnitType[] = [
  { id: 'skeleton', name: 'Скелет-лучник', faction: 'necro', icon: '💀', tier: 1, atk: 5,  def: 3, baseInit: 5,  minDmg: 1,  maxDmg: 3,  hp: 5,  ranged: true,  morale: 0 },
  { id: 'vampire',  name: 'Вампир',        faction: 'necro', icon: '🦇', tier: 4, atk: 8,  def: 7, baseInit: 9,  minDmg: 5,  maxDmg: 8,  hp: 18, ranged: false, morale: 0 },
  { id: 'lich',     name: 'Лич',           faction: 'necro', icon: '🔮', tier: 5, atk: 10, def: 6, baseInit: 8,  minDmg: 6,  maxDmg: 10, hp: 22, ranged: true,  morale: 0 },
];

export interface Hero {
  name: string;
  faction: Faction;
  silhouette: string;
  atk: number;
  magic: number;
  mana: number;
  maxMana: number;
  isMage: boolean;
}

export const HEROES: Record<Faction, Hero> = {
  haven: { name: 'Сэр Роланд', faction: 'haven', silhouette: '🤴', atk: 6, magic: 3, mana: 8,  maxMana: 8,  isMage: false },
  necro: { name: 'Мортис',     faction: 'necro', silhouette: '🧙', atk: 3, magic: 7, mana: 10, maxMana: 10, isMage: true  },
};

// ── Скорости по HoMM V (тир → клеток за ход) ──────────────────────────
export const MOVE_SPEED: Record<number, number> = { 1: 5, 2: 6, 3: 5, 4: 7, 5: 6, 6: 7, 7: 10 };

// ── Рандом ─────────────────────────────────────────────────────────────
export const d = (sides: number) => Math.floor(Math.random() * sides) + 1;
export const rng = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// ── Инициатива ─────────────────────────────────────────────────────────
export function rollInitiative(stacks: Stack[]): Stack[] {
  return stacks
    .map((s) => ({ ...s, initRoll: s.type.baseInit + d(4), defending: false, hasActed: false, waited: false }))
    .sort((a, b) => b.initRoll - a.initRoll || b.type.baseInit - a.type.baseInit);
}

// ── Мораль фракций ─────────────────────────────────────────────────────
// Хэйвен +1, Некрополис (нежить) 0 — иммунна к морали
export function factionMorale(side: Faction): number {
  return side === 'haven' ? 1 : 0;
}

export function factionLuck(side: Faction): number {
  return side === 'haven' ? 1 : 0;
}

// Бросок морали: возвращает 'extra' | 'none' | 'skip'
export function rollMorale(stack: Stack): 'extra' | 'none' | 'skip' {
  if (stack.type.morale === 0) return 'none'; // нежить — вне системы
  const m = stack.morale;
  if (m >= 1) {
    const chance = m === 1 ? 0.083 : m === 2 ? 0.167 : 0.25;
    if (Math.random() < chance) return 'extra';
  }
  if (m <= -1) {
    const chance = m === -1 ? 0.083 : m === -2 ? 0.167 : 0.25;
    if (Math.random() < chance) return 'skip';
  }
  return 'none';
}

// Бросок удачи: возвращает ×1.5 или ×1 (негативная — 0.5)
export function rollLuck(stack: Stack): number {
  const l = stack.luck;
  if (l >= 1) {
    const chance = l === 1 ? 0.1 : l === 2 ? 0.2 : 0.3;
    if (Math.random() < chance) return 1.5;
  }
  if (l <= -1) {
    const chance = l === -1 ? 0.1 : l === -2 ? 0.2 : 0.3;
    if (Math.random() < chance) return 0.5;
  }
  return 1;
}

// ── Дистанция ──────────────────────────────────────────────────────────
export function distance(a: Stack, b: Stack) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isAdjacentTo(a: Stack, b: Stack): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

// ── Блокировка стрелков ────────────────────────────────────────────────
export function isRangedBlocked(stack: Stack, allStacks: Stack[]): boolean {
  if (!stack.type.ranged) return false;
  return allStacks.some(
    (s) => s.side !== stack.side && s.count > 0 && !s.type.ranged &&
      Math.abs(s.x - stack.x) + Math.abs(s.y - stack.y) === 1
  );
}

// ── Формула урона (HoMM V) ─────────────────────────────────────────────
// ATK > DEF: +5% за каждый пункт разницы (линейно)
// DEF > ATK: нелинейное затухание — никогда не уходит в 0
// Минимум 10% базового урона
export function calcDamageMult(atk: number, def: number): number {
  if (atk >= def) {
    return 1 + 0.05 * (atk - def);
  } else {
    const diff = def - atk;
    return 1 - diff / (diff + 20);
  }
}

export interface DamageResult {
  total: number;
  killed: number;
  multiplier: number;
  blocked?: boolean;
  shooterMeleePenalty?: boolean;
  luckMult?: number;
  moraleTrigger?: 'extra' | 'skip' | 'none';
}

export function computeDamage(
  attacker: Stack,
  target: Stack,
  allStacks: Stack[]
): DamageResult {
  const t = attacker.type;
  const tgtDef = target.type.def + (target.defending ? 2 : 0);

  // Стрелок заблокирован ближним бойцом
  if (t.ranged && isRangedBlocked(attacker, allStacks)) {
    return { total: 0, killed: 0, multiplier: 0, blocked: true };
  }

  let mult = calcDamageMult(t.atk, tgtDef);

  // Минимум 10% (как в HoMM V)
  if (mult < 0.1) mult = 0.1;

  // Стрелок атакует в ближнем бою — штраф ×0.5 (как в HoMM V)
  const shooterMeleePenalty = t.ranged && isAdjacentTo(attacker, target);
  if (shooterMeleePenalty) mult *= 0.5;

  // Штраф дальности ×0.5 (дальше 5 клеток)
  let rangePenalty = 1;
  if (t.ranged && !shooterMeleePenalty && distance(attacker, target) > 5) rangePenalty = 0.5;

  // Разброс урона: min/maxDmg на каждого юнита в стеке
  const baseDmg = rng(t.minDmg, t.maxDmg) * attacker.count;

  // Удача
  const luckMult = rollLuck(attacker);

  const raw = baseDmg * mult * rangePenalty * luckMult;
  const total = Math.max(Math.round(t.minDmg * attacker.count * 0.1), Math.round(raw));

  const totalTargetHp = (target.count - 1) * target.type.hp + target.curHp;
  const remaining = totalTargetHp - total;
  const killed = target.count - Math.max(0, Math.ceil(remaining / target.type.hp));

  return {
    total,
    killed: Math.min(killed, target.count),
    multiplier: Math.round(mult * rangePenalty * 100) / 100,
    shooterMeleePenalty,
    luckMult,
  };
}

// ── Применить урон к стеку ─────────────────────────────────────────────
export function applyDamage(target: Stack, dmg: number): Stack {
  const totalHp = (target.count - 1) * target.type.hp + target.curHp;
  const remaining = totalHp - dmg;
  if (remaining <= 0) return { ...target, count: 0, curHp: 0 };
  const newCount = Math.ceil(remaining / target.type.hp);
  const newCurHp = remaining - (newCount - 1) * target.type.hp;
  return { ...target, count: newCount, curHp: newCurHp };
}

// ── Атака героя ────────────────────────────────────────────────────────
const heroDiceMult = (roll: number) => {
  if (roll <= 2) return 0.25;
  if (roll <= 4) return 0.5;
  if (roll === 5) return 0.75;
  return 1.5;
};
const heroDistProb = (dist: number, defending: boolean) => {
  if (dist <= 3) return defending ? 0.5 : 0.75;
  if (dist <= 6) return defending ? 0.25 : 0.5;
  return defending ? 0 : 0.25;
};
export function heroAttack(hero: Hero, target: Stack, frontX: number): DamageResult & { roll: number } {
  const stat = hero.isMage ? hero.magic : hero.atk;
  const roll = d(6);
  const dist = Math.abs(target.x - frontX) + 1;
  const prob = heroDistProb(dist, target.defending);
  const total = Math.max(prob === 0 ? 0 : 1, Math.round(stat * heroDiceMult(roll) * prob * target.count * 0.6));
  const totalTargetHp = (target.count - 1) * target.type.hp + target.curHp;
  const killed = target.count - Math.max(0, Math.ceil((totalTargetHp - total) / target.type.hp));
  return { total, killed: Math.min(killed, target.count), multiplier: heroDiceMult(roll), roll };
}

// ── Движение по полю (BFS) ─────────────────────────────────────────────
export function getMoveCells(mover: Stack, allStacks: Stack[]): Set<string> {
  const speed = MOVE_SPEED[mover.type.tier] ?? 5;
  const occupied = new Set(allStacks.filter((s) => s.uid !== mover.uid && s.count > 0).map((s) => `${s.x},${s.y}`));
  const reachable = new Set<string>();
  const queue: Array<{ x: number; y: number; steps: number }> = [{ x: mover.x, y: mover.y, steps: 0 }];
  const visited = new Set<string>([`${mover.x},${mover.y}`]);

  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.steps > 0 && !occupied.has(`${cur.x},${cur.y}`)) reachable.add(`${cur.x},${cur.y}`);
    if (cur.steps >= speed) continue;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ x: nx, y: ny, steps: cur.steps + 1 });
    }
  }
  return reachable;
}

export function getAttackCells(mover: Stack, allStacks: Stack[]): Set<string> {
  if (mover.type.ranged) {
    return new Set(allStacks.filter((s) => s.side !== mover.side && s.count > 0).map((s) => `${s.x},${s.y}`));
  }
  const moveZone = getMoveCells(mover, allStacks);
  const occupied = new Set(allStacks.filter((s) => s.uid !== mover.uid && s.count > 0).map((s) => `${s.x},${s.y}`));
  const attackable = new Set<string>();
  const reachIncl = new Set([`${mover.x},${mover.y}`, ...moveZone]);
  for (const key of reachIncl) {
    const [cx, cy] = key.split(',').map(Number);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nk = `${cx+dx},${cy+dy}`;
      if (occupied.has(nk)) {
        const enemy = allStacks.find((s) => `${s.x},${s.y}` === nk && s.side !== mover.side && s.count > 0);
        if (enemy) attackable.add(nk);
      }
    }
  }
  return attackable;
}

// ── Начальные стеки ────────────────────────────────────────────────────
export function makeInitialStacks(): Stack[] {
  const stacks: Stack[] = [];
  HAVEN_UNITS.forEach((u, i) => {
    stacks.push({
      uid: `h${i}`, type: u, side: 'haven',
      count: u.tier >= 5 ? 4 : u.tier >= 3 ? 8 : 20,
      curHp: u.hp, x: i === 1 ? 0 : 1, y: 1 + i * 2,
      initRoll: 0, defending: false, hasActed: false, waited: false,
      morale: factionMorale('haven'),
      luck: factionLuck('haven'),
    });
  });
  NECRO_UNITS.forEach((u, i) => {
    stacks.push({
      uid: `n${i}`, type: u, side: 'necro',
      count: u.tier >= 5 ? 4 : u.tier >= 3 ? 8 : 20,
      curHp: u.hp, x: i === 0 || i === 2 ? COLS - 1 : COLS - 2, y: 1 + i * 2,
      initRoll: 0, defending: false, hasActed: false, waited: false,
      morale: factionMorale('necro'),
      luck: factionLuck('necro'),
    });
  });
  return stacks;
}
