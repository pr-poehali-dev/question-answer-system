import { useState, useMemo, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import {
  COLS, ROWS, Stack, Faction, makeInitialStacks, rollInitiative,
  computeDamage, applyDamage, distance, heroAttack, HEROES, Hero,
} from '@/game/battle';

const FACTION_LABEL: Record<Faction, string> = { haven: 'Хэйвен', necro: 'Некрополис' };
const FACTION_COLOR: Record<Faction, string> = { haven: 'haven', necro: 'necro' };

interface LogEntry { text: string; tone: 'haven' | 'necro' | 'system' }

const Index = () => {
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [order, setOrder] = useState<Stack[]>([]);
  const [turnIdx, setTurnIdx] = useState(0);
  const [round, setRound] = useState(1);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [heroes, setHeroes] = useState<Record<Faction, Hero>>(HEROES);
  const [heroMode, setHeroMode] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [started, setStarted] = useState(false);
  const [winner, setWinner] = useState<Faction | null>(null);
  const [shakeUid, setShakeUid] = useState<string | null>(null);

  const addLog = useCallback((text: string, tone: LogEntry['tone']) => {
    setLog((l) => [{ text, tone }, ...l].slice(0, 40));
  }, []);

  const startBattle = () => {
    const init = makeInitialStacks();
    setStacks(init);
    const ord = rollInitiative(init);
    setOrder(ord);
    setStacks(ord);
    setTurnIdx(0);
    setRound(1);
    setHeroes(HEROES);
    setStarted(true);
    setWinner(null);
    setSelectedTarget(null);
    setHeroMode(false);
    setLog([{ text: 'Битва началась! Брошена инициатива.', tone: 'system' }]);
  };

  const active = order[turnIdx];
  const activeStack = useMemo(
    () => stacks.find((s) => s.uid === active?.uid && s.count > 0),
    [stacks, active]
  );

  const checkWin = useCallback((next: Stack[]) => {
    const havenAlive = next.some((s) => s.side === 'haven' && s.count > 0);
    const necroAlive = next.some((s) => s.side === 'necro' && s.count > 0);
    if (!havenAlive) { setWinner('necro'); addLog('Некрополис побеждает! Хэйвен пал.', 'necro'); return true; }
    if (!necroAlive) { setWinner('haven'); addLog('Хэйвен побеждает! Нежить рассеяна.', 'haven'); return true; }
    return false;
  }, [addLog]);

  const advanceTurn = useCallback((current: Stack[]) => {
    const alive = order.filter((o) => current.find((s) => s.uid === o.uid && s.count > 0));
    let next = turnIdx + 1;
    while (next < order.length && !current.find((s) => s.uid === order[next].uid && s.count > 0)) next++;
    if (next >= order.length) {
      const reordered = rollInitiative(current.filter((s) => s.count > 0));
      setOrder(reordered);
      setTurnIdx(0);
      setRound((r) => r + 1);
      addLog(`— Раунд ${round + 1} —`, 'system');
    } else {
      setTurnIdx(next);
    }
    setSelectedTarget(null);
    setHeroMode(false);
    void alive;
  }, [order, turnIdx, round, addLog]);

  const enemyTargets = useMemo(() => {
    if (!activeStack) return [];
    return stacks.filter((s) => s.side !== activeStack.side && s.count > 0);
  }, [stacks, activeStack]);

  const performAttack = (targetUid: string) => {
    if (!activeStack) return;
    const target = stacks.find((s) => s.uid === targetUid);
    if (!target) return;
    if (!activeStack.type.ranged && distance(activeStack, target) > 6) {
      addLog(`${activeStack.type.name}: цель слишком далеко для ближнего боя`, 'system');
      return;
    }
    const res = computeDamage(activeStack, target);
    const updated = stacks.map((s) =>
      s.uid === targetUid ? applyDamage(s, res.total) : s
    );
    setShakeUid(targetUid);
    setTimeout(() => setShakeUid(null), 300);
    addLog(
      `${activeStack.type.name} бьёт ${target.type.name}: ${res.total} урона (×${res.multiplier})${res.killed > 0 ? `, убито ${res.killed}` : ''}`,
      activeStack.side
    );
    setStacks(updated);
    if (!checkWin(updated)) advanceTurn(updated);
  };

  const performDefend = () => {
    if (!activeStack) return;
    const updated = stacks.map((s) => s.uid === activeStack.uid ? { ...s, defending: true } : s);
    addLog(`${activeStack.type.name} встаёт в защиту (+2 защита)`, activeStack.side);
    setStacks(updated);
    advanceTurn(updated);
  };

  const performHeroAttack = (targetUid: string) => {
    if (!activeStack) return;
    const hero = heroes[activeStack.side];
    if (hero.mana < 2) { addLog('Недостаточно маны для удара героя', 'system'); return; }
    const target = stacks.find((s) => s.uid === targetUid);
    if (!target) return;
    const frontX = activeStack.side === 'haven' ? 1 : COLS - 2;
    const res = heroAttack(hero, target, frontX);
    const updated = stacks.map((s) => s.uid === targetUid ? applyDamage(s, res.total) : s);
    setShakeUid(targetUid);
    setTimeout(() => setShakeUid(null), 300);
    setHeroes((h) => ({ ...h, [activeStack.side]: { ...hero, mana: hero.mana - 2 } }));
    addLog(
      `⚡ ${hero.name} атакует ${target.type.name}: ${res.total} урона (d6=${res.roll})${res.killed > 0 ? `, убито ${res.killed}` : ''}`,
      activeStack.side
    );
    setStacks(updated);
    if (!checkWin(updated)) advanceTurn(updated);
  };

  const handleCellClick = (uid: string) => {
    if (winner) return;
    if (heroMode) performHeroAttack(uid);
    else { setSelectedTarget(uid); performAttack(uid); }
  };

  const countAlive = (side: Faction) =>
    stacks.filter((s) => s.side === side && s.count > 0).reduce((a, s) => a + s.count, 0);

  return (
    <div className="min-h-screen text-foreground px-4 py-6 md:px-8">
      <header className="max-w-6xl mx-auto text-center mb-6 animate-fade-in">
        <p className="font-serif tracking-[0.4em] text-gold/70 text-xs md:text-sm uppercase">Пошаговая стратегия</p>
        <h1 className="font-display font-black text-4xl md:text-6xl text-gold text-glow-gold tracking-wide">
          Легенды Эльтиара
        </h1>
        <p className="font-serif text-muted-foreground mt-1 text-sm md:text-base">
          Битва на Драконьей Обители · Некрополис против Хэйвена
        </p>
      </header>

      {!started ? (
        <StartScreen onStart={startBattle} />
      ) : (
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-4">
            <ScoreBar haven={countAlive('haven')} necro={countAlive('necro')} round={round} />

            <Battlefield
              stacks={stacks}
              activeUid={activeStack?.uid ?? null}
              enemyUids={enemyTargets.map((e) => e.uid)}
              heroMode={heroMode}
              shakeUid={shakeUid}
              onCellClick={handleCellClick}
            />

            {activeStack && !winner && (
              <ActionPanel
                active={activeStack}
                hero={heroes[activeStack.side]}
                heroMode={heroMode}
                onToggleHero={() => setHeroMode((m) => !m)}
                onDefend={performDefend}
              />
            )}

            {winner && (
              <div className="parchment rounded-xl border border-gold/40 p-6 text-center animate-scale-in">
                <Icon name="Crown" size={40} className="mx-auto text-gold mb-2" />
                <h2 className="font-display text-2xl text-gold">
                  Победа: {FACTION_LABEL[winner]}
                </h2>
                <button onClick={startBattle}
                  className="mt-4 font-serif px-6 py-2 rounded-lg bg-gold text-primary-foreground hover:brightness-110 transition">
                  Сыграть снова
                </button>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <HeroPanel hero={heroes['haven']} active={activeStack?.side === 'haven'} />
            <HeroPanel hero={heroes['necro']} active={activeStack?.side === 'necro'} />
            <BattleLog log={log} />
          </aside>
        </div>
      )}
    </div>
  );
};

const StartScreen = ({ onStart }: { onStart: () => void }) => (
  <div className="max-w-3xl mx-auto parchment rounded-2xl border border-border p-8 md:p-12 text-center animate-scale-in">
    <p className="font-serif text-muted-foreground leading-relaxed mb-6">
      После Войны Фракций выжившие осели на последнем материке — Драконьей Обители.
      Хрупкое перемирие нарушено. Поведите армию в тактическом бою на сетке 10×8:
      инициатива, формулы урона, удары героя на дистанции.
    </p>
    <div className="grid grid-cols-2 gap-4 mb-8 text-left">
      <FactionTeaser faction="haven" desc="Щит и вера. Держат линию дольше всех." />
      <FactionTeaser faction="necro" desc="Смерть — не конец. Армия растёт." />
    </div>
    <button onClick={onStart}
      className="font-display text-lg px-10 py-3 rounded-xl bg-gold text-primary-foreground font-bold hover:brightness-110 transition animate-glow-pulse">
      Начать битву
    </button>
  </div>
);

const FactionTeaser = ({ faction, desc }: { faction: Faction; desc: string }) => (
  <div className={`rounded-xl border border-${FACTION_COLOR[faction]}/40 bg-${FACTION_COLOR[faction]}/10 p-4`}>
    <h3 className={`font-display text-${FACTION_COLOR[faction]} text-lg`}>{FACTION_LABEL[faction]}</h3>
    <p className="font-sans text-xs text-muted-foreground mt-1">{desc}</p>
  </div>
);

const ScoreBar = ({ haven, necro, round }: { haven: number; necro: number; round: number }) => (
  <div className="flex items-center justify-between gap-4 parchment rounded-xl border border-border px-5 py-3">
    <div className="flex items-center gap-2">
      <span className="text-haven font-display text-lg">Хэйвен</span>
      <span className="font-sans text-sm text-muted-foreground">{haven} воинов</span>
    </div>
    <div className="font-serif text-gold tracking-widest text-sm">РАУНД {round}</div>
    <div className="flex items-center gap-2">
      <span className="font-sans text-sm text-muted-foreground">{necro} воинов</span>
      <span className="text-necro font-display text-lg">Некрополис</span>
    </div>
  </div>
);

const Battlefield = ({
  stacks, activeUid, enemyUids, heroMode, shakeUid, onCellClick,
}: {
  stacks: Stack[]; activeUid: string | null; enemyUids: string[];
  heroMode: boolean; shakeUid: string | null; onCellClick: (uid: string) => void;
}) => {
  const cellMap = new Map<string, Stack>();
  stacks.forEach((s) => { if (s.count > 0) cellMap.set(`${s.x},${s.y}`, s); });

  return (
    <div className="parchment rounded-xl border border-gold/30 p-3 md:p-4 overflow-x-auto">
      <div
        className="grid-cell rounded-lg mx-auto"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, minmax(34px, 1fr))`,
          gridTemplateRows: `repeat(${ROWS}, minmax(34px, 1fr))`,
          gap: 2,
          minWidth: 380,
        }}
      >
        {Array.from({ length: ROWS }).map((_, y) =>
          Array.from({ length: COLS }).map((_, x) => {
            const stack = cellMap.get(`${x},${y}`);
            const isActive = stack?.uid === activeUid;
            const isTargetable = stack && enemyUids.includes(stack.uid);
            const color = stack?.side === 'haven' ? 'haven' : 'necro';
            return (
              <button
                key={`${x},${y}`}
                disabled={!stack || !isTargetable}
                onClick={() => stack && onCellClick(stack.uid)}
                className={[
                  'relative aspect-square rounded-md flex flex-col items-center justify-center transition-all',
                  stack ? `bg-${color}/15 border` : 'border border-transparent',
                  stack ? `border-${color}/40` : '',
                  isActive ? 'ring-2 ring-gold animate-glow-pulse scale-105 z-10' : '',
                  isTargetable ? `cursor-pointer hover:bg-${color}/30 ${heroMode ? 'ring-1 ring-gold/60' : ''}` : '',
                  shakeUid === stack?.uid ? 'animate-hit-shake' : '',
                ].join(' ')}
              >
                {stack && (
                  <>
                    <span className="text-lg md:text-xl leading-none select-none">{stack.type.icon}</span>
                    <span className={`absolute -bottom-1 -right-1 text-[10px] font-bold px-1 rounded bg-${color} text-background min-w-[16px] text-center`}>
                      {stack.count}
                    </span>
                    {stack.defending && (
                      <Icon name="Shield" size={10} className="absolute top-0 left-0 text-gold" />
                    )}
                  </>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

const ActionPanel = ({
  active, hero, heroMode, onToggleHero, onDefend,
}: {
  active: Stack; hero: Hero; heroMode: boolean;
  onToggleHero: () => void; onDefend: () => void;
}) => {
  const color = active.side === 'haven' ? 'haven' : 'necro';
  return (
    <div className="parchment rounded-xl border border-border p-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{active.type.icon}</span>
          <div>
            <p className={`font-display text-${color} text-lg leading-tight`}>{active.type.name}</p>
            <p className="font-sans text-xs text-muted-foreground">
              Ход: {FACTION_LABEL_SHORT[active.side]} · {active.count} шт · АТК {active.type.atk}/ЗАЩ {active.type.def}
              {active.type.ranged ? ' · 🏹 стрелок' : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onToggleHero}
            disabled={hero.mana < 2}
            className={`font-serif text-sm px-4 py-2 rounded-lg border transition disabled:opacity-40
              ${heroMode ? 'bg-gold text-primary-foreground border-gold' : 'border-gold/50 text-gold hover:bg-gold/10'}`}>
            ⚡ Удар героя
          </button>
          <button onClick={onDefend}
            className="font-serif text-sm px-4 py-2 rounded-lg border border-border hover:bg-secondary transition">
            🛡️ Защита
          </button>
        </div>
      </div>
      <p className="font-sans text-xs text-muted-foreground mt-3">
        {heroMode
          ? 'Режим героя: выберите вражеский отряд для удара на дистанции (−2 маны).'
          : 'Кликните по вражескому отряду, чтобы атаковать.'}
      </p>
    </div>
  );
};

const FACTION_LABEL_SHORT: Record<Faction, string> = { haven: 'Хэйвен', necro: 'Некрополис' };

const HeroPanel = ({ hero, active }: { hero: Hero; active: boolean }) => {
  const color = hero.faction === 'haven' ? 'haven' : 'necro';
  return (
    <div className={`parchment rounded-xl border p-4 transition ${active ? `border-${color} animate-glow-pulse` : 'border-border'}`}>
      <div className="flex items-center gap-3">
        <span className="text-3xl">{hero.silhouette}</span>
        <div className="flex-1">
          <p className={`font-display text-${color}`}>{hero.name}</p>
          <p className="font-sans text-[11px] text-muted-foreground">
            {FACTION_LABEL_SHORT[hero.faction]} · {hero.isMage ? 'Маг' : 'Воин'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <Stat label="АТК" value={hero.atk} />
        <Stat label="МАГ" value={hero.magic} />
        <Stat label="МАНА" value={`${hero.mana}/${hero.maxMana}`} />
      </div>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="bg-secondary/60 rounded-md py-1">
    <p className="font-sans text-[10px] text-muted-foreground">{label}</p>
    <p className="font-display text-gold text-sm">{value}</p>
  </div>
);

const BattleLog = ({ log }: { log: LogEntry[] }) => (
  <div className="parchment rounded-xl border border-border p-4 max-h-72 overflow-y-auto">
    <p className="font-serif text-gold/80 text-xs tracking-widest uppercase mb-2">Хроника боя</p>
    <div className="space-y-1.5">
      {log.map((e, i) => (
        <p key={i} className={`font-sans text-xs leading-snug
          ${e.tone === 'haven' ? 'text-haven' : e.tone === 'necro' ? 'text-necro' : 'text-muted-foreground'}`}>
          {e.text}
        </p>
      ))}
    </div>
  </div>
);

export default Index;
