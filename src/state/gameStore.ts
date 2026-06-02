import { create } from 'zustand';
import type { Round, TimeAttackConfig } from '../engine/types';
import { DEFAULT_TIME_ATTACK_CONFIG } from '../engine/types';
import { planGame, planGalleryGame, resolveGuess, expire as expireRound, resolveGameMode, type PlannedRound, type RevealMode } from '../engine/timeAttack';
import { fetchEnabledRevealModes } from '../reveal/client';
import { fetchCandidates } from '../cards/client';
import type { PoolSelection, ScryfallCard } from '../scryfall/types';
import { loadHighscores, saveHighscore, bumpGamesPlayed, type HighscoreEntry, type PoolKind } from './highscores';
import { decodeResult, type SharedResult } from '../share/score';
import { getBuiltinModes } from '../modes/client';
import type { CustomMode } from '../modes/types';
import type { CustomFilter } from '../modes/filter';

export type GamePhase = 'idle' | 'loading' | 'playing' | 'error' | 'gameover';

interface GameState {
  config: TimeAttackConfig;
  phase: GamePhase;
  error: string | null;

  pool: ScryfallCard[];
  /** Which pool the current game is played on (recorded in highscores). */
  poolKind: PoolKind;
  /** Mode id for the current game — always set for every game. */
  currentModeId: string | null;
  /** Display name of the current mode, for the game-over header. */
  currentModeName: string | null;
  /** The filter used to deal cards for the current game; needed for lazy mode creation on submit. */
  currentModeFilter: CustomFilter | null;
  /** Set when the current game is the Daily Set; the single allowed reveal mode. Null otherwise. */
  dailyReveal: RevealMode | null;
  /** The selection that built the current game, so "play again" can re-fetch. */
  lastSelection: PoolSelection | null;
  /** The whole game pre-planned so no card or name repeats across rounds. */
  plan: PlannedRound[];
  round: Round | null;
  /** 0-based index of the current card within the game. */
  roundIndex: number;
  /** The reveal mode in use for this game (resolved from pendingRevealChoice at start). */
  gameMode: RevealMode;
  pendingRevealChoice: RevealMode | 'random';
  enabledModes: RevealMode[];
  /** Per-game seed for deterministic scanner sweep angles. */
  revealSeed: number;
  /** Date.now() when the game started. */
  gameStartedAt: number;

  correctCount: number;
  totalScore: number;
  /** Points earned on the most recent guess (drives the snackbar). */
  earned: number;
  /** Bumped on every resolved guess so the snackbar can re-trigger. */
  earnedSeq: number;

  highscores: HighscoreEntry[];
  /** A friend's shared result from a `?r=` link, shown as a challenge banner. */
  challenge: SharedResult | null;

  /** Cached builtin mode rows loaded from DB once. */
  builtinModes: { all: CustomMode; popular: CustomMode } | null;

  setRevealChoice: (choice: RevealMode | 'random') => void;
  loadRevealModes: () => Promise<void>;
  selectPool: (selection: PoolSelection) => Promise<void>;
  guessName: (name: string) => void;
  /** Called by the game clock when the per-card timer reaches durationMs. */
  expire: () => void;
  /** Move to the next card, or end the game when the plan runs out. */
  advance: () => void;
  /** End the game when the clock runs out, recording a highscore. */
  endGame: () => void;
  /** Start a fresh game on the same pool. */
  restart: () => void;
  reset: () => void;
}

// Floor for the "summoning" screen so the loading texts are actually seen and a
// fresh card load feels deliberate (the RPC itself is usually much faster).
const MIN_SUMMON_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function startPlanned(planned: PlannedRound, now: number): Round {
  return {
    target: planned.target,
    options: planned.options,
    optionCards: planned.optionCards,
    startedAt: now,
    status: 'playing',
    guess: null,
    score: 0,
  };
}

function uniqueNameCount(pool: ScryfallCard[]): number {
  return new Set(pool.map((c) => c.name)).size;
}

function finishGame(
  state: { totalScore: number; correctCount: number; poolKind: PoolKind },
  set: (partial: Partial<GameState>) => void,
): void {
  bumpGamesPlayed();
  // Custom modes keep their history on the per-mode global board only, so we skip
  // the local top-5 (which has no notion of which mode a score belonged to).
  const highscores =
    state.poolKind === 'custom'
      ? loadHighscores()
      : saveHighscore({
          score: state.totalScore,
          correct: state.correctCount,
          date: Date.now(),
          pool: state.poolKind,
        });
  set({ phase: 'gameover', round: null, highscores });
}

export const useGameStore = create<GameState>((set, get) => ({
  config: DEFAULT_TIME_ATTACK_CONFIG,
  phase: 'idle',
  error: null,

  pool: [],
  poolKind: 'popular',
  currentModeId: null,
  currentModeName: null,
  currentModeFilter: null,
  dailyReveal: null,
  lastSelection: null,
  plan: [],
  round: null,
  roundIndex: 0,
  gameMode: 'blur',
  pendingRevealChoice: 'random',
  enabledModes: ['blur', 'scanner', 'mosaic'],
  revealSeed: 0,
  gameStartedAt: 0,

  correctCount: 0,
  totalScore: 0,
  earned: 0,
  earnedSeq: 0,

  highscores: loadHighscores(),
  challenge: decodeResult(new URLSearchParams(window.location.search).get('r')),
  builtinModes: null,

  setRevealChoice(choice) {
    set({ pendingRevealChoice: choice });
  },

  async loadRevealModes() {
    set({ enabledModes: await fetchEnabledRevealModes() });
  },

  async selectPool(selection) {
    const summonStart = Date.now();
    set({ phase: 'loading', error: null });
    try {
      const { config } = get();

      // Resolve pool/mode identity from selection
      let filter: CustomFilter;
      let modeId: string | null;
      let modeName: string;
      let poolKind: PoolKind;

      if (selection.kind === 'set') {
        filter = { sets: [selection.code] };
        modeId = selection.modeId;
        modeName = selection.name;
        poolKind = 'custom';
      } else if (selection.kind === 'custom') {
        filter = selection.filter;
        modeId = selection.modeId;
        modeName = selection.name;
        poolKind = 'custom';
      } else {
        // Resolve builtin modes lazily
        let b = get().builtinModes;
        if (!b) {
          b = await getBuiltinModes();
          if (b) set({ builtinModes: b });
        }
        if (!b) throw new Error('Card database is not configured.');

        const bm = selection.kind === 'all' ? b.all : b.popular;
        modeId = bm.id;
        modeName = bm.name;
        poolKind = selection.kind;
        // When excluding UB: use the builtin filter as-is (already excludes UB by default).
        // When NOT excluding UB: overlay ub:'yes' to include Universe Beyond cards.
        filter = selection.excludeUniverseBeyond
          ? { ...bm.filter }
          : { ...bm.filter, ub: 'yes' as const };
      }

      // Fetch cards and enabled reveal modes in parallel, then resolve gameMode
      const [rawPool, enabledModes] = await Promise.all([
        fetchCandidates(filter),
        fetchEnabledRevealModes(),
      ]);
      const gameMode = resolveGameMode(get().pendingRevealChoice, enabledModes);
      // Zoom and Gallery both need real artwork, so drop art-less cards first.
      const pool = gameMode === 'zoom' || gameMode === 'gallery'
        ? rawPool.filter(
            (c) => !!(c.image_uris?.art_crop ?? c.card_faces?.[0]?.image_uris?.art_crop),
          )
        : rawPool;

      if (uniqueNameCount(pool) < config.optionCount) {
        throw new Error('Not enough cards in the selected pool.');
      }
      const plan = gameMode === 'gallery' ? planGalleryGame(pool, config) : planGame(pool, config);
      const remaining = MIN_SUMMON_MS - (Date.now() - summonStart);
      if (remaining > 0) await sleep(remaining);
      // The player may have backed out of the loading screen while we were
      // fetching — don't yank them into a game they cancelled.
      if (get().phase !== 'loading') return;
      set({
        pool,
        poolKind,
        currentModeId: modeId,
        currentModeName: modeName,
        currentModeFilter: filter,
        dailyReveal: selection.kind === 'custom' ? (selection.daily ?? null) : null,
        lastSelection: selection,
        plan,
        round: startPlanned(plan[0], Date.now()),
        roundIndex: 0,
        enabledModes,
        gameMode,
        revealSeed: Math.floor(Math.random() * 1_000_000),
        gameStartedAt: Date.now(),
        correctCount: 0,
        totalScore: 0,
        earned: 0,
        phase: 'playing',
      });
    } catch (err) {
      set({ phase: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  guessName(name) {
    const { round, config, totalScore, correctCount, earnedSeq } = get();
    if (!round || round.status !== 'playing') return;
    const next = resolveGuess(round, name, Date.now(), config);
    const won = next.status === 'won';
    set({
      round: next,
      earned: won ? next.score : 0,
      earnedSeq: earnedSeq + 1,
      totalScore: won ? totalScore + next.score : totalScore,
      correctCount: won ? correctCount + 1 : correctCount,
    });
  },

  expire() {
    const { round } = get();
    if (!round || round.status !== 'playing') return;
    set({ round: expireRound(round), earned: 0 });
  },

  advance() {
    const { plan, round, roundIndex } = get();
    if (!round || round.status === 'playing') return;
    const nextIndex = roundIndex + 1;
    if (nextIndex >= plan.length) {
      finishGame(get(), set);
      return;
    }
    set({ round: startPlanned(plan[nextIndex], Date.now()), roundIndex: nextIndex });
  },

  endGame() {
    const { phase } = get();
    if (phase !== 'playing') return;
    finishGame(get(), set);
  },

  restart() {
    // Re-fetch a fresh pool so "play again" pulls new cards rather than
    // replaying the same slice of the catalogue.
    const { lastSelection } = get();
    if (!lastSelection) {
      set({ phase: 'idle' });
      return;
    }
    void get().selectPool(lastSelection);
  },

  reset() {
    set({
      phase: 'idle',
      error: null,
      pool: [],
      currentModeId: null,
      currentModeName: null,
      currentModeFilter: null,
      dailyReveal: null,
      plan: [],
      round: null,
      roundIndex: 0,
      gameMode: 'blur',
      pendingRevealChoice: 'random',
      enabledModes: ['blur', 'scanner', 'mosaic'],
      revealSeed: 0,
      gameStartedAt: 0,
      correctCount: 0,
      totalScore: 0,
      earned: 0,
      highscores: loadHighscores(),
    });
  },
}));
