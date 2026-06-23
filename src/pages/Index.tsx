import { useState, useMemo, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import {
  COLS, ROWS, Stack, Faction, makeInitialStacks, rollInitiative,
  computeDamage, applyDamage, heroAttack, HEROES, Hero,
  getMoveCells, getAttackCells,
} from '@/game/battle';

const FACTION_LABEL: Record<Faction, string> = { haven: 'Хэйвен', necro: 'Некрополис' };

interface LogEntry { text: string; tone: 'haven' | 'necro' | 'system' }

type Phase = 'select' | 'move';

const Index = () => {
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [order, setOrder] = useState<Stack[]>([]);
  const [turnIdx, setTurnIdx] = useState(0);
  const [round, setRound] = useState(1);
  const [heroes, setHeroes] = useState<Record<Faction, Hero>>(HEROES);
  const [heroMode, setHeroMode] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [started, setStarted] = useState(false);
  const [winner, setWinner] = useState<Faction | null>(null);
  const [shakeUid, setShakeUid] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('select');

  const addLog = useCallback((text: string, tone: LogEntry['tone']) => {
    setLog((l) => [{ text, tone }, ...l].slice(0, 40));
  }, []);

  const startBattle = () => {
    const init = makeInitialStacks();
    const ord = rollInitiative(init);
    setStacks(ord);
    setOrder(ord);
    setTurnIdx(0);
    setRound(1);
    setHeroes(HEROES);
    setStarted(true);
    setWinner(null);
    setHeroMode(false);
    setPhase('select');
    setLog([{ text: 'Битва началась! Брошена инициатива.', tone: 'system' }]);
  };

  const activeOrder = order[turnIdx];
  const activeStack = useMemo(
    () => stacks.find((s) => s.uid === activeOrder?.uid && s.count > 0),
    [stacks, activeOrder]
  );

  const checkWin = useCallback((next: Stack[]) => {
    const hAlive = next.some((s) => s.side === 'haven' && s.count > 0);
    const nAlive = next.some((s) => s.side === 'necro' && s.count > 0);
    if (!hAlive) { setWinner('necro'); addLog('Некрополис побеждает! Хэйвен пал.', 'necro'); return true; }
    if (!nAlive) { setWinner('haven'); addLog('Хэйвен побеждает! Нежить рассеяна.', 'haven'); return true; }
    return false;
  }, [addLog]);

  const advanceTurn = useCallback((current: Stack[]) => {
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
    setPhase('select');
    setHeroMode(false);
  }, [order, turnIdx, round, addLog]);

  const moveCells = useMemo(() => {
    if (!activeStack || phase !== 'move' || heroMode) return new Set<string>();
    return getMoveCells(activeStack, stacks);
  }, [activeStack, stacks, phase, heroMode]);

  const attackCells = useMemo(() => {
    if (!activeStack || phase !== 'move' || heroMode) return new Set<string>();
    return getAttackCells(activeStack, stacks);
  }, [activeStack, stacks, phase, heroMode]);

  const doAttack = useCallback((attackerStack: Stack, targetUid: string, currentStacks: Stack[]) => {
    const target = currentStacks.find((s) => s.uid === targetUid);
    if (!target) return;
    const res = computeDamage(attackerStack, target);
    const updated = currentStacks.map((s) => s.uid === targetUid ? applyDamage(s, res.total) : s);
    setShakeUid(targetUid);
    setTimeout(() => setShakeUid(null), 350);
    addLog(
      `${attackerStack.type.name} бьёт ${target.type.name}: ${res.total} урона (×${res.multiplier})${res.killed > 0 ? `, убито ${res.killed}` : ''}`,
      attackerStack.side
    );
    setStacks(updated);
    if (!checkWin(updated)) advanceTurn(updated);
  }, [addLog, checkWin, advanceTurn]);

  const handleCellClick = (x: number, y: number) => {
    if (winner || !activeStack) return;

    const clickedStack = stacks.find((s) => s.x === x && s.y === y && s.count > 0);

    if (heroMode) {
      if (clickedStack && clickedStack.side !== activeStack.side) {
        const hero = heroes[activeStack.side];
        if (hero.mana < 2) { addLog('Недостаточно маны для удара героя', 'system'); return; }
        const frontX = activeStack.side === 'haven' ? 1 : COLS - 2;
        const res = heroAttack(hero, clickedStack, frontX);
        const updated = stacks.map((s) => s.uid === clickedStack.uid ? applyDamage(s, res.total) : s);
        setShakeUid(clickedStack.uid);
        setTimeout(() => setShakeUid(null), 350);
        setHeroes((h) => ({ ...h, [activeStack.side]: { ...hero, mana: hero.mana - 2 } }));
        addLog(`⚡ ${hero.name} атакует ${clickedStack.type.name}: ${res.total} урона (d6=${res.roll})${res.killed > 0 ? `, убито ${res.killed}` : ''}`, activeStack.side);
        setStacks(updated);
        if (!checkWin(updated)) advanceTurn(updated);
      }
      return;
    }

    if (phase === 'select') {
      if (clickedStack?.uid === activeStack.uid) {
        setPhase('move');
        addLog(`${activeStack.type.name}: выберите клетку хода или врага`, activeStack.side);
      }
      return;
    }

    if (phase === 'move') {
      const key = `${x},${y}`;

      if (attackCells.has(key) && clickedStack && clickedStack.side !== activeStack.side) {
        const enemyAdj = stacks.find((s) => s.x === x && s.y === y && s.side !== activeStack.side && s.count > 0);
        if (enemyAdj) {
          if (!activeStack.type.ranged) {
            const adjToEnemy = [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].find(([nx,ny]) => {
              const adjKey = `${nx},${ny}`;
              const occupied = stacks.some((s) => s.uid !== activeStack.uid && s.count > 0 && s.x === nx && s.y === ny);
              return moveCells.has(adjKey) && !occupied;
            });
            const moveTarget = adjToEnemy
              ? { x: adjToEnemy[0], y: adjToEnemy[1] }
              : { x: activeStack.x, y: activeStack.y };
            const movedStack = { ...activeStack, x: moveTarget.x, y: moveTarget.y };
            const withMove = stacks.map((s) => s.uid === activeStack.uid ? movedStack : s);
            setStacks(withMove);
            doAttack(movedStack, enemyAdj.uid, withMove);
          } else {
            doAttack(activeStack, enemyAdj.uid, stacks);
          }
          return;
        }
      }

      if (moveCells.has(key) && !clickedStack) {
        const updated = stacks.map((s) => s.uid === activeStack.uid ? { ...s, x, y } : s);
        addLog(`${activeStack.type.name} переходит на (${x+1},${y+1})`, activeStack.side);
        setStacks(updated);
        advanceTurn(updated);
        return;
      }

      setPhase('select');
    }
  };

  const performDefend = () => {
    if (!activeStack) return;
    const updated = stacks.map((s) => s.uid === activeStack.uid ? { ...s, defending: true } : s);
    addLog(`${activeStack.type.name} встаёт в защиту (+2 защита)`, activeStack.side);
    setStacks(updated);
    advanceTurn(updated);
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
              moveCells={moveCells}
              attackCells={attackCells}
              heroMode={heroMode}
              phase={phase}
              shakeUid={shakeUid}
              onCellClick={handleCellClick}
            />

            {activeStack && !winner && (
              <ActionPanel
                active={activeStack}
                hero={heroes[activeStack.side]}
                heroMode={heroMode}
                phase={phase}
                onToggleHero={() => { setHeroMode((m) => !m); setPhase('move'); }}
                onDefend={performDefend}
                onActivate={() => setPhase('move')}
              />
            )}

            {winner && (
              <div className="parchment rounded-xl border border-gold/40 p-6 text-center animate-scale-in">
                <Icon name="Crown" size={40} className="mx-auto text-gold mb-2" />
                <h2 className="font-display text-2xl text-gold">Победа: {FACTION_LABEL[winner]}</h2>
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
      инициатива, формулы урона, движение по клеткам, удары героя на дистанции.
    </p>
    <div className="grid grid-cols-2 gap-4 mb-8 text-left">
      {(['haven', 'necro'] as Faction[]).map((f) => (
        <div key={f} className={`rounded-xl border border-${f}/40 bg-${f}/10 p-4`}>
          <h3 className={`font-display text-${f} text-lg`}>{FACTION_LABEL[f]}</h3>
          <p className="font-sans text-xs text-muted-foreground mt-1">
            {f === 'haven' ? 'Щит и вера. Держат линию дольше всех.' : 'Смерть — не конец. Армия растёт.'}
          </p>
        </div>
      ))}
    </div>
    <button onClick={onStart}
      className="font-display text-lg px-10 py-3 rounded-xl bg-gold text-primary-foreground font-bold hover:brightness-110 transition animate-glow-pulse">
      Начать битву
    </button>
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
  stacks, activeUid, moveCells, attackCells, heroMode, phase, shakeUid, onCellClick,
}: {
  stacks: Stack[];
  activeUid: string | null;
  moveCells: Set<string>;
  attackCells: Set<string>;
  heroMode: boolean;
  phase: Phase;
  shakeUid: string | null;
  onCellClick: (x: number, y: number) => void;
}) => {
  const cellMap = new Map<string, Stack>();
  stacks.forEach((s) => { if (s.count > 0) cellMap.set(`${s.x},${s.y}`, s); });

  return (
    <div className="parchment rounded-xl border border-gold/30 p-3 md:p-4 overflow-x-auto">
      <div
        className="grid-cell rounded-lg mx-auto"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, minmax(40px, 1fr))`,
          gridTemplateRows: `repeat(${ROWS}, minmax(40px, 1fr))`,
          gap: 3,
          minWidth: 420,
        }}
      >
        {Array.from({ length: ROWS }).map((_, y) =>
          Array.from({ length: COLS }).map((_, x) => {
            const key = `${x},${y}`;
            const stack = cellMap.get(key);
            const isActive = stack?.uid === activeUid;
            const isMove = moveCells.has(key) && !stack;
            const isAttack = attackCells.has(key) && stack;
            const isHeroTarget = heroMode && phase === 'move' && stack && stack.uid !== activeUid && stack.side !== stacks.find(s => s.uid === activeUid)?.side;
            const color = stack?.side === 'haven' ? 'haven' : 'necro';

            let bgClass = 'bg-transparent border border-white/5 hover:border-white/15';
            if (isMove) bgClass = 'bg-blue-500/20 border border-blue-400/60 hover:bg-blue-500/35 cursor-pointer';
            if (isAttack) bgClass = `bg-red-600/25 border border-red-400/70 hover:bg-red-600/40 cursor-pointer`;
            if (isHeroTarget) bgClass = `bg-${color}/20 border border-gold/60 hover:bg-gold/20 cursor-pointer`;
            if (isActive) bgClass = `bg-${color}/20 border-2 border-gold animate-glow-pulse cursor-pointer`;
            if (stack && !isActive && !isAttack && !isHeroTarget)
              bgClass = `bg-${color}/12 border border-${color}/30 cursor-pointer`;

            return (
              <button
                key={key}
                onClick={() => onCellClick(x, y)}
                className={[
                  'relative aspect-square rounded-md flex flex-col items-center justify-center transition-all duration-150 select-none',
                  bgClass,
                  shakeUid === stack?.uid ? 'animate-hit-shake' : '',
                ].join(' ')}
              >
                {isMove && (
                  <span className="text-blue-300/70 text-base">·</span>
                )}
                {stack && (
                  <>
                    <span className="text-xl leading-none">{stack.type.icon}</span>
                    <span className={`absolute -bottom-1 -right-1 text-[10px] font-bold px-1 rounded-sm
                      ${stack.side === 'haven' ? 'bg-haven text-background' : 'bg-necro text-background'}
                      min-w-[16px] text-center leading-4`}>
                      {stack.count}
                    </span>
                    {stack.defending && (
                      <Icon name="Shield" size={9} className="absolute top-0 left-0 text-gold opacity-80" />
                    )}
                    {isActive && phase === 'select' && (
                      <span className="absolute -top-1 -right-1 text-[8px] bg-gold text-primary-foreground rounded px-0.5 leading-3 py-0.5">
                        ▶
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })
        )}
      </div>
      <div className="flex gap-4 mt-2 px-1 text-[11px] text-muted-foreground font-sans">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500/40 inline-block border border-blue-400/60" /> ход</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-600/40 inline-block border border-red-400/70" /> атака</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gold/30 inline-block border border-gold/60" /> удар героя</span>
      </div>
    </div>
  );
};

const ActionPanel = ({
  active, hero, heroMode, phase, onToggleHero, onDefend, onActivate,
}: {
  active: Stack; hero: Hero; heroMode: boolean; phase: Phase;
  onToggleHero: () => void; onDefend: () => void; onActivate: () => void;
}) => {
  const color = active.side === 'haven' ? 'haven' : 'necro';
  const hint =
    heroMode ? 'Режим героя: кликните вражеский отряд (−2 маны)'
    : phase === 'select' ? `Кликните на ${active.type.icon} ${active.type.name}, чтобы начать ход`
    : active.type.ranged ? 'Кликните по врагу (🔴) для стрельбы, или по синей клетке для перехода'
    : 'Кликните по синей клетке для хода, или по красной — для атаки';

  return (
    <div className="parchment rounded-xl border border-border p-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{active.type.icon}</span>
          <div>
            <p className={`font-display text-${color} text-lg leading-tight`}>{active.type.name}</p>
            <p className="font-sans text-xs text-muted-foreground">
              {FACTION_LABEL[active.side]} · {active.count} шт · АТК {active.type.atk} / ЗАЩ {active.type.def}
              {active.type.ranged ? ' · 🏹' : ' · ⚔️'}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {phase === 'select' && !heroMode && (
            <button onClick={onActivate}
              className={`font-serif text-sm px-4 py-2 rounded-lg border border-${color}/50 text-${color} hover:bg-${color}/10 transition`}>
              Выбрать отряд
            </button>
          )}
          <button onClick={onToggleHero} disabled={hero.mana < 2}
            className={`font-serif text-sm px-4 py-2 rounded-lg border transition disabled:opacity-40
              ${heroMode ? 'bg-gold text-primary-foreground border-gold' : 'border-gold/50 text-gold hover:bg-gold/10'}`}>
            ⚡ Герой {hero.mana}/{hero.maxMana}
          </button>
          <button onClick={onDefend}
            className="font-serif text-sm px-4 py-2 rounded-lg border border-border hover:bg-secondary transition">
            🛡️ Защита
          </button>
        </div>
      </div>
      <p className="font-sans text-xs text-muted-foreground mt-3 italic">{hint}</p>
    </div>
  );
};

const HeroPanel = ({ hero, active }: { hero: Hero; active: boolean }) => {
  const color = hero.faction === 'haven' ? 'haven' : 'necro';
  return (
    <div className={`parchment rounded-xl border p-4 transition-all ${active ? `border-${color} animate-glow-pulse` : 'border-border'}`}>
      <div className="flex items-center gap-3">
        <span className="text-3xl">{hero.silhouette}</span>
        <div className="flex-1">
          <p className={`font-display text-${color}`}>{hero.name}</p>
          <p className="font-sans text-[11px] text-muted-foreground">
            {FACTION_LABEL[hero.faction]} · {hero.isMage ? 'Маг' : 'Воин'}
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
