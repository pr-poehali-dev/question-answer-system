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
  dice: number;
  hp: number;
  ranged: boolean;
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
}

export const COLS = 10;
export const ROWS = 8;

export const HAVEN_UNITS: UnitType[] = [
  { id: 'militia', name: 'Ополченец', faction: 'haven', icon: '🛡️', tier: 1, atk: 4, def: 5, baseInit: 4, dice: 4, hp: 6, ranged: false },
  { id: 'crossbow', name: 'Арбалетчик', faction: 'haven', icon: '🏹', tier: 2, atk: 6, def: 4, baseInit: 5, dice: 6, hp: 8, ranged: true },
  { id: 'paladin', name: 'Паладин', faction: 'haven', icon: '⚔️', tier: 6, atk: 11, def: 10, baseInit: 7, dice: 10, hp: 30, ranged: false },
];

export const NECRO_UNITS: UnitType[] = [
  { id: 'skeleton', name: 'Скелет-лучник', faction: 'necro', icon: '💀', tier: 1, atk: 5, def: 3, baseInit: 4, dice: 4, hp: 5, ranged: true },
  { id: 'vampire', name: 'Вампир', faction: 'necro', icon: '🦇', tier: 4, atk: 8, def: 7, baseInit: 6, dice: 8, hp: 18, ranged: false },
  { id: 'lich', name: 'Лич', faction: 'necro', icon: '🔮', tier: 5, atk: 10, def: 6, baseInit: 5, dice: 8, hp: 22, ranged: true },
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
  haven: { name: 'Сэр Роланд', faction: 'haven', silhouette: '🤴', atk: 6, magic: 3, mana: 8, maxMana: 8, isMage: false },
  necro: { name: 'Мортис', faction: 'necro', silhouette: '🧙', atk: 3, magic: 7, mana: 10, maxMana: 10, isMage: true },
};

export const d = (sides: number) => Math.floor(Math.random() * sides) + 1;

export function avgDice(sides: number) {
  return (sides + 1) / 2;
}

export function rollInitiative(stacks: Stack[]): Stack[] {
  return stacks
    .map((s) => ({ ...s, initRoll: s.type.baseInit + d(4), defending: false, hasActed: false }))
    .sort((a, b) => b.initRoll - a.initRoll || b.type.baseInit - a.type.baseInit);
}

export function distance(a: Stack, b: Stack) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export interface DamageResult {
  total: number;
  killed: number;
  multiplier: number;
}

export function computeDamage(attacker: Stack, target: Stack): DamageResult {
  const t = attacker.type;
  const tgtDef = target.type.def + (target.defending ? 2 : 0);
  let mult = 1 + (t.atk - tgtDef) / 20;
  if (mult < 0.5) mult = 0.5;

  let rangePenalty = 1;
  if (t.ranged && distance(attacker, target) > 5) rangePenalty = 0.5;

  const raw = attacker.count * avgDice(t.dice) * mult * rangePenalty;
  const total = Math.max(1, Math.round(raw));

  const totalTargetHp = (target.count - 1) * target.type.hp + target.curHp;
  const remaining = totalTargetHp - total;
  const killed = target.count - Math.max(0, Math.ceil(remaining / target.type.hp));

  return { total, killed: Math.min(killed, target.count), multiplier: Math.round(mult * rangePenalty * 100) / 100 };
}

export function applyDamage(target: Stack, dmg: number): Stack {
  const totalHp = (target.count - 1) * target.type.hp + target.curHp;
  const remaining = totalHp - dmg;
  if (remaining <= 0) return { ...target, count: 0, curHp: 0 };
  const newCount = Math.ceil(remaining / target.type.hp);
  const newCurHp = remaining - (newCount - 1) * target.type.hp;
  return { ...target, count: newCount, curHp: newCurHp };
}

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

export function makeInitialStacks(): Stack[] {
  const stacks: Stack[] = [];
  HAVEN_UNITS.forEach((u, i) => {
    stacks.push({
      uid: `h${i}`, type: u, side: 'haven', count: u.tier >= 5 ? 4 : u.tier >= 3 ? 8 : 20,
      curHp: u.hp, x: i === 1 ? 0 : 1, y: 1 + i * 2, initRoll: 0, defending: false, hasActed: false,
    });
  });
  NECRO_UNITS.forEach((u, i) => {
    stacks.push({
      uid: `n${i}`, type: u, side: 'necro', count: u.tier >= 5 ? 4 : u.tier >= 3 ? 8 : 20,
      curHp: u.hp, x: i === 0 || i === 2 ? COLS - 1 : COLS - 2, y: 1 + i * 2, initRoll: 0, defending: false, hasActed: false,
    });
  });
  return stacks;
}
