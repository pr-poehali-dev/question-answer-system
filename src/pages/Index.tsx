import { useState, useMemo, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import {
  COLS, ROWS, Stack, Faction, makeInitialStacks, rollInitiative,
  computeDamage, applyDamage, heroAttack, HEROES, Hero,
  getMoveCells, getAttackCells, isRangedBlocked, rollMorale,
} from '@/game/battle';

const FACTION_LABEL: Record<Faction, string> = { haven: 'Хэйвен', necro: 'Некрополис' };

interface LogEntry { text: string; tone: 'haven' | 'necro' | 'system' | 'luck' | 'morale' }

type Phase = 'select' | 'move';

const Index = () => {
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [order, setOrder] = useState<Stack[]>([]);
  const [waitQueue, setWaitQueue] = useState<Stack[]>([]);
  const [turnIdx, setTurnIdx] = useState(0);
  const [round, setRound] = useState(1);
  const [heroes, setHeroes] = useState<Record<Faction, Hero>>(HEROES);
  const [heroMode, setHeroMode] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [started, setStarted] = useState(false);
  const [winner, setWinner] = useState<Faction | null>(null);
  const [shakeUid, setShakeUid] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('select');
  const [extraTurnUid, setExtraTurnUid] = useState<string | null>(null);

  const addLog = useCallback((text: string, tone: LogEntry['tone'] = 'system') => {
    setLog((l) => [{ text, tone }, ...l].slice(0, 60));
  }, []);

  const startBattle = () => {
    const init = makeInitialStacks();
    const ord = rollInitiative(init);
    setStacks(ord);
    setOrder(ord);
    setWaitQueue([]);
    setTurnIdx(0);
    setRound(1);
    setHeroes(HEROES);
    setStarted(true);
    setWinner(null);
    setHeroMode(false);
    setPhase('select');
    setExtraTurnUid(null);
    setLog([{ text: 'Битва началась! Инициатива брошена.', tone: 'system' }]);
  };

  const activeOrder = order[turnIdx];
  const activeStack = useMemo(
    () => stacks.find((s) => s.uid === activeOrder?.uid && s.count > 0),
    [stacks, activeOrder]
  );

  const checkWin = useCallback((next: Stack[]) => {
    const hAlive = next.some((s) => s.side === 'haven' && s.count > 0);
    const nAlive = next.some((s) => s.side === 'necro' && s.count > 0);
    if (!hAlive) { setWinner('necro'); addLog('⚰️ Некрополис побеждает! Хэйвен пал.', 'necro'); return true; }
    if (!nAlive) { setWinner('haven'); addLog('✝️ Хэйвен побеждает! Нежить рассеяна.', 'haven'); return true; }
    return false;
  }, [addLog]);

  const advanceTurn = useCallback((current: Stack[], extraSkipUid?: string) => {
    // Если есть очередь ожидания и основной порядок исчерпан — добавить ждунов
    let next = turnIdx + 1;
    while (next < order.length && !current.find((s) => s.uid === order[next].uid && s.count > 0)) next++;

    if (next >= order.length) {
      // Конец раунда — добавляем ждунов в конец, потом новый раунд
      if (waitQueue.length > 0) {
        const alive = waitQueue.filter((s) => current.find((c) => c.uid === s.uid && c.count > 0));
        if (alive.length > 0) {
          const newOrder = [...order.slice(0, next), ...alive];
          setOrder(newOrder);
          setTurnIdx(next);
          setWaitQueue([]);
          setPhase('select');
          setHeroMode(false);
          return;
        }
      }
      const reordered = rollInitiative(current.filter((s) => s.count > 0));
      setOrder(reordered);
      setWaitQueue([]);
      setTurnIdx(0);
      setRound((r) => r + 1);
      addLog(`── Раунд ${round + 1} ──`, 'system');
    } else {
      setTurnIdx(next);
    }
    setPhase('select');
    setHeroMode(false);
    setExtraTurnUid(null);
    void extraSkipUid;
  }, [order, turnIdx, round, waitQueue, addLog]);

  const blockedRangedUids = useMemo(() =>
    new Set(stacks.filter((s) => s.count > 0 && isRangedBlocked(s, stacks)).map((s) => s.uid)),
    [stacks]
  );

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

    if (attackerStack.type.ranged && isRangedBlocked(attackerStack, currentStacks)) {
      addLog(`🚫 ${attackerStack.type.name} заблокирован — не может стрелять!`, 'system');
      advanceTurn(currentStacks);
      return;
    }

    // Бросок морали перед атакой
    const moraleResult = rollMorale(attackerStack);
    if (moraleResult === 'skip') {
      addLog(`😰 ${attackerStack.type.name} теряет боевой дух и пропускает ход!`, 'morale');
      advanceTurn(currentStacks);
      return;
    }

    const res = computeDamage(attackerStack, target, currentStacks);
    const updated = currentStacks.map((s) => s.uid === targetUid ? applyDamage(s, res.total) : s);
    setShakeUid(targetUid);
    setTimeout(() => setShakeUid(null), 350);

    let note = '';
    if (res.luckMult && res.luckMult > 1) note += ' 🍀 Удача! ×1.5';
    if (res.luckMult && res.luckMult < 1) note += ' 💀 Невезение ×0.5';
    if (res.shooterMeleePenalty) note += ' 🏹→⚔️ −50%';

    addLog(
      `${attackerStack.type.name} бьёт ${target.type.name}: ${res.total} урона (×${res.multiplier})${note}${res.killed > 0 ? ` · убито ${res.killed}` : ''}`,
      attackerStack.side
    );

    setStacks(updated);

    if (!checkWin(updated)) {
      if (moraleResult === 'extra') {
        addLog(`⚡ ${attackerStack.type.name} воодушевлён и ходит снова!`, 'morale');
        setExtraTurnUid(attackerStack.uid);
        // Вставляем доп. ход сразу за текущим
        const newOrder = [
          ...order.slice(0, turnIdx + 1),
          { ...attackerStack },
          ...order.slice(turnIdx + 1),
        ];
        setOrder(newOrder);
      }
      advanceTurn(updated);
    }
  }, [addLog, checkWin, advanceTurn, order, turnIdx]);

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
        addLog(`⚡ ${hero.name} атакует ${clickedStack.type.name}: ${res.total} урона (d6=${res.roll})${res.killed > 0 ? ` · убито ${res.killed}` : ''}`, activeStack.side);
        setStacks(updated);
        if (!checkWin(updated)) advanceTurn(updated);
      }
      return;
    }

    if (phase === 'select') {
      if (clickedStack?.uid === activeStack.uid) {
        setPhase('move');
        addLog(`${activeStack.type.name}: выберите клетку или врага`, activeStack.side);
      }
      return;
    }

    if (phase === 'move') {
      const key = `${x},${y}`;

      if (attackCells.has(key) && clickedStack && clickedStack.side !== activeStack.side) {
        if (!activeStack.type.ranged) {
          const adjToEnemy = [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].find(([nx,ny]) => {
            const adjKey = `${nx},${ny}`;
            const occupied = stacks.some((s) => s.uid !== activeStack.uid && s.count > 0 && s.x === nx && s.y === ny);
            return moveCells.has(adjKey) && !occupied;
          });
          const moveTarget = adjToEnemy ? { x: adjToEnemy[0], y: adjToEnemy[1] } : { x: activeStack.x, y: activeStack.y };
          const movedStack = { ...activeStack, x: moveTarget.x, y: moveTarget.y };
          const withMove = stacks.map((s) => s.uid === activeStack.uid ? movedStack : s);
          setStacks(withMove);
          doAttack(movedStack, clickedStack.uid, withMove);
        } else {
          doAttack(activeStack, clickedStack.uid, stacks);
        }
        return;
      }

      if (moveCells.has(key) && !clickedStack) {
        const updated = stacks.map((s) => s.uid === activeStack.uid ? { ...s, x, y } : s);
        addLog(`${activeStack.type.name} → (${x+1},${y+1})`, activeStack.side);
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
    addLog(`🛡️ ${activeStack.type.name} встаёт в защиту (+2 к защите)`, activeStack.side);
    setStacks(updated);
    advanceTurn(updated);
  };

  const performWait = () => {
    if (!activeStack) return;
    addLog(`⏳ ${activeStack.type.name} ждёт...`, activeStack.side);
    setWaitQueue((q) => [...q, activeStack]);
    advanceTurn(stacks);
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
              blockedRangedUids={blockedRangedUids}
              extraTurnUid={extraTurnUid}
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
                onWait={performWait}
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
      Хрупкое перемирие нарушено. Механика боя близка к HoMM V: формула урона, разброс,
      мораль, удача, блокировка стрелков, ход «Ждать».
    </p>
    <div className="grid grid-cols-2 gap-4 mb-6 text-left">
      {(['haven', 'necro'] as Faction[]).map((f) => (
        <div key={f} className={`rounded-xl border border-${f}/40 bg-${f}/10 p-4`}>
          <h3 className={`font-display text-${f} text-lg`}>{FACTION_LABEL[f]}</h3>
          <p className="font-sans text-xs text-muted-foreground mt-1">
            {f === 'haven' ? 'Мораль +1 · Удача +1 · Щит и вера' : 'Нежить · Иммунитет к морали · Смерть не конец'}
          </p>
        </div>
      ))}
    </div>
    <div className="grid grid-cols-3 gap-3 mb-8 text-left">
      {[
        ['🎲', 'Разброс урона', 'min/max как в HoMM V'],
        ['⚡', 'Мораль', 'Доп. ход или пропуск'],
        ['🍀', 'Удача', '×1.5 или ×0.5 урона'],
        ['⏳', 'Ждать', 'Ход в конце раунда'],
        ['🚫', 'Блокировка', 'Стрелок вплотную'],
        ['🏹→⚔️', 'Штраф', 'Стрелок в ближнем −50%'],
      ].map(([icon, title, desc]) => (
        <div key={title} className="rounded-lg border border-border bg-secondary/30 p-3">
          <p className="text-lg mb-0.5">{icon}</p>
          <p className="font-sans text-xs font-semibold text-foreground">{title}</p>
          <p className="font-sans text-[11px] text-muted-foreground">{desc}</p>
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
  stacks, activeUid, moveCells, attackCells, blockedRangedUids,
  extraTurnUid, heroMode, phase, shakeUid, onCellClick,
}: {
  stacks: Stack[];
  activeUid: string | null;
  moveCells: Set<string>;
  attackCells: Set<string>;
  blockedRangedUids: Set<string>;
  extraTurnUid: string | null;
  heroMode: boolean;
  phase: Phase;
  shakeUid: string | null;
  onCellClick: (x: number, y: number) => void;
}) => {
  const cellMap = new Map<string, Stack>();
  stacks.forEach((s) => { if (s.count > 0) cellMap.set(`${s.x},${s.y}`, s); });
  const activeSide = stacks.find((s) => s.uid === activeUid)?.side;

  return (
    <div className="parchment rounded-xl border border-gold/30 p-3 md:p-4 overflow-x-auto">
      <div
        className="grid-cell rounded-lg mx-auto"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, minmax(40px, 1fr))`,
          gridTemplateRows: `repeat(${ROWS}, minmax(40px, 1fr))`,
          gap: 3, minWidth: 420,
        }}
      >
        {Array.from({ length: ROWS }).map((_, y) =>
          Array.from({ length: COLS }).map((_, x) => {
            const key = `${x},${y}`;
            const stack = cellMap.get(key);
            const isActive = stack?.uid === activeUid;
            const isExtra = stack?.uid === extraTurnUid;
            const isMove = moveCells.has(key) && !stack;
            const isAttack = attackCells.has(key) && stack && stack.side !== activeSide;
            const isHeroTarget = heroMode && phase === 'move' && stack && stack.side !== activeSide;
            const color = stack?.side === 'haven' ? 'haven' : 'necro';

            let bgClass = 'bg-transparent border border-white/5 hover:border-white/15';
            if (isMove) bgClass = 'bg-blue-500/20 border border-blue-400/60 hover:bg-blue-500/35 cursor-pointer';
            if (isAttack) bgClass = 'bg-red-600/25 border border-red-400/70 hover:bg-red-600/40 cursor-pointer';
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
                {isMove && <span className="text-blue-300/60 text-lg leading-none">·</span>}
                {stack && (
                  <>
                    <span className="text-xl leading-none">{stack.type.icon}</span>
                    <span className={`absolute -bottom-1 -right-1 text-[10px] font-bold px-1 rounded-sm min-w-[16px] text-center leading-4
                      ${stack.side === 'haven' ? 'bg-haven text-background' : 'bg-necro text-background'}`}>
                      {stack.count}
                    </span>
                    {stack.defending && <Icon name="Shield" size={9} className="absolute top-0 left-0 text-gold opacity-80" />}
                    {blockedRangedUids.has(stack.uid) && <Icon name="Lock" size={9} className="absolute top-0 right-0 text-orange-400" />}
                    {isExtra && <span className="absolute -top-1 -left-1 text-[9px] text-yellow-300">⚡</span>}
                    {isActive && phase === 'select' && (
                      <span className="absolute -top-1 -right-1 text-[8px] bg-gold text-primary-foreground rounded px-0.5 leading-3 py-0.5">▶</span>
                    )}
                    {/* HP bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-md bg-black/40">
                      <div
                        className={`h-full rounded-b-md ${stack.side === 'haven' ? 'bg-haven' : 'bg-necro'}`}
                        style={{ width: `${(stack.curHp / stack.type.hp) * 100}%` }}
                      />
                    </div>
                  </>
                )}
              </button>
            );
          })
        )}
      </div>
      <div className="flex flex-wrap gap-3 mt-2 px-1 text-[11px] text-muted-foreground font-sans">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500/40 inline-block border border-blue-400/60" /> ход</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-600/40 inline-block border border-red-400/70" /> атака</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gold/30 inline-block border border-gold/60" /> удар героя</span>
        <span className="flex items-center gap-1"><Icon name="Lock" size={10} className="text-orange-400" /> блокирован</span>
        <span className="flex items-center gap-1"><span className="text-yellow-300 text-xs">⚡</span> доп. ход (мораль)</span>
      </div>
    </div>
  );
};

const ActionPanel = ({
  active, hero, heroMode, phase, onToggleHero, onDefend, onWait, onActivate,
}: {
  active: Stack; hero: Hero; heroMode: boolean; phase: Phase;
  onToggleHero: () => void; onDefend: () => void; onWait: () => void; onActivate: () => void;
}) => {
  const color = active.side === 'haven' ? 'haven' : 'necro';
  const isUndead = active.type.morale === 0;
  const hint =
    heroMode ? 'Режим героя: кликните вражеский отряд (−2 маны)'
    : phase === 'select' ? `Кликните на ${active.type.icon} чтобы открыть ход, или выберите действие`
    : active.type.ranged ? 'Кликните по врагу (🔴) для стрельбы или по синей клетке'
    : 'Синяя клетка — ход, красная — атака вплотную';

  return (
    <div className="parchment rounded-xl border border-border p-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{active.type.icon}</span>
          <div>
            <p className={`font-display text-${color} text-lg leading-tight`}>{active.type.name}</p>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <span className="font-sans text-xs text-muted-foreground">
                {FACTION_LABEL[active.side]} · {active.count} шт · ⚔️{active.type.atk} 🛡️{active.type.def}
                · {active.type.minDmg}–{active.type.maxDmg} урона
                {active.type.ranged ? ' · 🏹' : ''}
              </span>
              {!isUndead && (
                <span className="flex items-center gap-1 text-[11px]">
                  <span className={active.morale > 0 ? 'text-yellow-400' : active.morale < 0 ? 'text-red-400' : 'text-muted-foreground'}>
                    Мораль {active.morale > 0 ? `+${active.morale}` : active.morale}
                  </span>
                  <span className={active.luck > 0 ? 'text-green-400' : active.luck < 0 ? 'text-red-400' : 'text-muted-foreground'}>
                    · Удача {active.luck > 0 ? `+${active.luck}` : active.luck}
                  </span>
                </span>
              )}
              {isUndead && <span className="text-[11px] text-muted-foreground">☠️ Нежить · иммун к морали</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {phase === 'select' && !heroMode && (
            <button onClick={onActivate}
              className={`font-serif text-sm px-4 py-2 rounded-lg border border-${color}/50 text-${color} hover:bg-${color}/10 transition`}>
              Выбрать
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
          <button onClick={onWait}
            className="font-serif text-sm px-4 py-2 rounded-lg border border-border hover:bg-secondary transition">
            ⏳ Ждать
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
          ${e.tone === 'haven' ? 'text-haven'
          : e.tone === 'necro' ? 'text-necro'
          : e.tone === 'luck' ? 'text-green-400'
          : e.tone === 'morale' ? 'text-yellow-400'
          : 'text-muted-foreground'}`}>
          {e.text}
        </p>
      ))}
    </div>
  </div>
);

export default Index;
