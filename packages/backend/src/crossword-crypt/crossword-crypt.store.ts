import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  applyCellUpdates,
  applyGuess,
  applyRelic,
  assembleAnswer,
  CROSSWORD_CRYPT_CHAIN_LENGTH,
  CROSSWORD_CRYPT_GAME_ID,
  CROSSWORD_CRYPT_RUN_SETTINGS,
  type CrosswordCryptChooseRelicPayload,
  type CrosswordCryptCommandResult,
  type CrosswordCryptDeal,
  type CrosswordCryptDifficulty,
  type CrosswordCryptFillCellsPayload,
  type CrosswordCryptGuessPayload,
  type CrosswordCryptPlayer,
  type CrosswordCryptPrivateSlice,
  type CrosswordCryptPublicState,
  type CrosswordCryptRoomCommand,
  type CrosswordCryptSyncPayload,
  type CrosswordCryptUseRelicPayload,
  containsBlockedTerm,
  crosswordGridGuess,
  dealRoom,
  dealVault,
  drawRelicChoices,
  emptyGridLetters,
  type GameRoomState,
  hiddenAnswerCells,
  INITIAL_CROSSWORD_CRYPT_STATE,
  redistribute,
  roomDifficulty,
  spendHint,
} from "@resync-game-framework/api";
import {
  type GameRoomServerDecision,
  type GameRoomServerMember,
  type GameRoomServerResult,
  GameRoomStore,
} from "../game-room/game-room.store";
import { RedisService } from "../infra/redis/redis.service";

const SECRET_TTL_SECONDS = 24 * 60 * 60;
/** Most squares one fill command may touch; the largest grid is far smaller. */
const MAX_CELL_UPDATES = 64;

interface SecretState {
  assignmentVersion: number;
  deal: CrosswordCryptDeal;
  playerIds: string[];
  seed: string;
  usedEntryIds: string[];
}

type SliceDeliveries = Record<string, CrosswordCryptPrivateSlice | null>;
type StoreResult = CrosswordCryptCommandResult & {
  deliveries?: SliceDeliveries;
};

/** Server-authoritative run rules and Redis-backed private slices. */
@Injectable()
export class CrosswordCryptStore {
  /**
   * @param gameRoomStore - Locked room and membership store
   * @param redisService - Hidden answer and slice storage
   */
  public constructor(
    private readonly gameRoomStore: GameRoomStore,
    private readonly redisService: RedisService,
  ) {}

  /** Registers difficulty and reconciles membership-driven slice changes. */
  public async sync(
    payload: CrosswordCryptSyncPayload,
    socketId: string,
  ): Promise<StoreResult> {
    return this.mutate(
      payload.roomId,
      socketId,
      async (room, playerId, members) => {
        const state = publicState(room);
        state.difficulties[playerId] = normalizeDifficulty(payload.difficulty);
        for (const member of members)
          state.difficulties[member.id] ??= "standard";
        const activeIds = members.map((member) => member.id);
        const secret = await this.readSecret(room.id);
        if (
          secret &&
          isPuzzlePhase(state.phase) &&
          activeIds.join("|") !== secret.playerIds.join("|")
        ) {
          secret.assignmentVersion += 1;
          secret.deal = redistribute(
            secret.deal,
            playersFor(members, state),
            secret.assignmentVersion,
          );
          secret.playerIds = activeIds;
          state.whisper = secret.deal.whisper;
          state.notice = "The party changed, so the private slices moved.";
          await this.saveSecret(room.id, secret);
        }
        return accept(state, deliveriesFor(members, secret?.deal ?? null));
      },
    );
  }

  /** Starts a new four-room chain when 2–4 players are seated. */
  public async start(
    payload: CrosswordCryptRoomCommand,
    socketId: string,
  ): Promise<StoreResult> {
    return this.mutate(
      payload.roomId,
      socketId,
      async (room, playerId, members) => {
        if (room.hostPlayerId !== playerId)
          return reject("HOST_ONLY", "Only the host can open the first door.");
        if (members.length < 2 || members.length > 4)
          return reject("PLAYER_COUNT", "Seat 2–4 players before starting.");
        const current = publicState(room);
        const seed = randomUUID();
        const party = playersFor(members, current);
        const settings = CROSSWORD_CRYPT_RUN_SETTINGS[roomDifficulty(party)];
        const deal = dealRoom(seed, party, 0);
        if (containsBlockedTerm(deal.answer))
          return reject(
            "BLOCKED_CONTENT",
            "The dealt answer was blocked by the family dictionary.",
          );
        const state: CrosswordCryptPublicState = {
          ...structuredClone(INITIAL_CROSSWORD_CRYPT_STATE),
          answerCells: hiddenAnswerCells(deal.answer),
          difficulties: Object.fromEntries(
            members.map((member) => [
              member.id,
              current.difficulties[member.id] ?? "standard",
            ]),
          ),
          grid: deal.grid,
          gridLetters: emptyGridLetters(deal),
          hintTokens: settings.hints,
          maxTorches: settings.torches,
          phase: "room",
          roomIndex: 0,
          roomToken: deal.roomToken,
          roomType: deal.roomType,
          torches: settings.torches,
          whisper: deal.whisper,
        };
        await this.saveSecret(room.id, {
          assignmentVersion: 1,
          deal,
          playerIds: members.map((member) => member.id),
          seed,
          usedEntryIds: [deal.entryId],
        });
        return accept(state, deliveriesFor(members, deal));
      },
    );
  }

  /** Checks a submitted guess against the private key and advances the run. */
  public async guess(
    payload: CrosswordCryptGuessPayload,
    socketId: string,
  ): Promise<StoreResult> {
    return this.mutate(
      payload.roomId,
      socketId,
      async (room, _playerId, members) => {
        const state = publicState(room);
        const secretResult = await this.requireSecret(
          room.id,
          payload.roomToken,
          state,
        );
        if (!secretResult.ok) return secretResult;
        const secret = secretResult.value;
        if (!isPuzzlePhase(state.phase))
          return reject("WRONG_PHASE", "There is no open puzzle to answer.");
        const submitted =
          state.roomType === "crossword"
            ? crosswordGridGuess(state)
            : String(payload.guess ?? "");
        if (submitted === null)
          return reject(
            "INCOMPLETE_GRID",
            "Fill every square before checking the grid.",
          );

        let next = applyGuess(
          state,
          assembleAnswer(submitted, secret.deal.answer),
        );
        if (!next.lastGuess?.correct) {
          if (next.torches === 0) next = terminalState(next, "sealed");
          return accept(
            next,
            deliveriesFor(
              members,
              next.phase === "sealed" ? null : secret.deal,
            ),
          );
        }
        if (state.phase === "vault") {
          return accept(
            terminalState(next, "escaped"),
            deliveriesFor(members, null),
          );
        }
        if (state.roomIndex + 1 >= CROSSWORD_CRYPT_CHAIN_LENGTH) {
          const vault = dealVault(secret.seed, playersFor(members, state));
          secret.deal = vault;
          secret.assignmentVersion += 1;
          secret.playerIds = members.map((member) => member.id);
          await this.saveSecret(room.id, secret);
          return accept(
            stateForDeal(next, vault, "vault", state.roomIndex + 1),
            deliveriesFor(members, vault),
          );
        }
        next.phase = "relic";
        next.relicChoices = drawRelicChoices(secret.seed, state.roomIndex);
        next.notice = "The door opens. Choose one relic for the party.";
        return accept(next, deliveriesFor(members, null));
      },
    );
  }

  /**
   * Stores letters the group typed on the shared crossword and broadcasts
   * them. Private slices are not re-sent.
   * @param payload - Room, current room token, and squares to set or clear
   * @param socketId - Socket of the typing player
   * @returns The updated room, or a rejection outside a crossword room
   */
  public async fillCells(
    payload: CrosswordCryptFillCellsPayload,
    socketId: string,
  ): Promise<StoreResult> {
    return this.mutate(payload.roomId, socketId, async (room) => {
      const state = publicState(room);
      const secretResult = await this.requireSecret(
        room.id,
        payload.roomToken,
        state,
      );
      if (!secretResult.ok) return secretResult;
      if (state.phase !== "room" || state.roomType !== "crossword")
        return reject("WRONG_PHASE", "There is no crossword grid to fill.");
      if (
        !Array.isArray(payload.cells) ||
        payload.cells.length > MAX_CELL_UPDATES
      )
        return reject("INVALID_CELLS", "Send one to 64 squares at a time.");
      return accept(applyCellUpdates(state, payload.cells), {});
    });
  }

  /** Reveals one previously hidden answer cell without burning a torch. */
  public async hint(
    payload: CrosswordCryptRoomCommand,
    socketId: string,
  ): Promise<StoreResult> {
    return this.mutate(
      payload.roomId,
      socketId,
      async (room, _playerId, members) => {
        const state = publicState(room);
        const secretResult = await this.requireSecret(
          room.id,
          payload.roomToken,
          state,
        );
        if (!secretResult.ok) return secretResult;
        if (!isPuzzlePhase(state.phase))
          return reject("WRONG_PHASE", "Hints can only be used at a puzzle.");
        const next = spendHint(state, secretResult.value.deal.answer);
        if (next === state)
          return reject(
            "NO_HINT",
            "No unused hint token or hidden letter remains.",
          );
        return accept(next, deliveriesFor(members, secretResult.value.deal));
      },
    );
  }

  /** Adds the host-confirmed reward and deals the next chain room. */
  public async chooseRelic(
    payload: CrosswordCryptChooseRelicPayload,
    socketId: string,
  ): Promise<StoreResult> {
    return this.mutate(
      payload.roomId,
      socketId,
      async (room, playerId, members) => {
        const state = publicState(room);
        if (room.hostPlayerId !== playerId)
          return reject(
            "HOST_ONLY",
            "Only the host confirms the party's relic.",
          );
        if (
          state.phase !== "relic" ||
          !state.relicChoices.includes(payload.relic)
        )
          return reject("INVALID_RELIC", "Choose one of the offered relics.");
        const secret = await this.readSecret(room.id);
        if (!secret)
          return reject("NO_RUN", "Start a run before choosing relics.");
        const roomIndex = state.roomIndex + 1;
        const deal = dealRoom(
          secret.seed,
          playersFor(members, state),
          roomIndex,
          secret.usedEntryIds,
        );
        if (containsBlockedTerm(deal.answer)) {
          return reject(
            "BLOCKED_CONTENT",
            "The dealt answer was blocked by the family dictionary.",
          );
        }
        secret.deal = deal;
        secret.usedEntryIds.push(deal.entryId);
        secret.assignmentVersion += 1;
        secret.playerIds = members.map((member) => member.id);
        await this.saveSecret(room.id, secret);
        return accept(
          stateForDeal(
            { ...state, relics: [...state.relics, payload.relic] },
            deal,
            "room",
            roomIndex,
          ),
          deliveriesFor(members, deal),
        );
      },
    );
  }

  /** Applies one held relic; Swap Slices also rotates private ownership. */
  public async useRelic(
    payload: CrosswordCryptUseRelicPayload,
    socketId: string,
  ): Promise<StoreResult> {
    return this.mutate(
      payload.roomId,
      socketId,
      async (room, _playerId, members) => {
        const state = publicState(room);
        const secretResult = await this.requireSecret(
          room.id,
          payload.roomToken,
          state,
        );
        if (!secretResult.ok) return secretResult;
        const secret = secretResult.value;
        if (!isPuzzlePhase(state.phase)) {
          return reject(
            "WRONG_PHASE",
            "Relics can only be spent at an open puzzle.",
          );
        }
        if (!state.relics.includes(payload.relic))
          return reject(
            "INVALID_RELIC",
            "That relic is not in the party tray.",
          );
        let next = applyRelic(state, payload.relic, secret.deal.answer);
        if (payload.relic === "swap-slices") {
          secret.assignmentVersion += 1;
          secret.deal = redistribute(
            secret.deal,
            playersFor(members, state),
            secret.assignmentVersion,
          );
          next = {
            ...next,
            notice: "The Swap Slices relic moved every private clue.",
            whisper: secret.deal.whisper,
          };
          await this.saveSecret(room.id, secret);
        }
        return accept(next, deliveriesFor(members, secret.deal));
      },
    );
  }

  /** Adapts one game decision to the generic locked room mutation result. */
  private async mutate(
    roomId: string,
    socketId: string,
    apply: (
      room: GameRoomState,
      playerId: string,
      members: readonly GameRoomServerMember[],
    ) => Promise<GameRoomServerDecision<SliceDeliveries>>,
  ): Promise<StoreResult> {
    return commandResult(
      await this.gameRoomStore.mutateServerRoom(
        roomId,
        CROSSWORD_CRYPT_GAME_ID,
        socketId,
        apply,
      ),
    );
  }

  /** Reads the current secret only when the opaque room token still matches. */
  private async requireSecret(
    roomId: string,
    roomToken: string | undefined,
    state: CrosswordCryptPublicState,
  ): Promise<{ ok: true; value: SecretState } | GameRoomServerDecision<never>> {
    const secret = await this.readSecret(roomId);
    if (!secret)
      return reject("NO_RUN", "Start a run before using puzzle commands.");
    if (
      !roomToken ||
      roomToken !== state.roomToken ||
      roomToken !== secret.deal.roomToken
    ) {
      return reject("STALE_ROOM", "That command belongs to an older room.");
    }
    return { ok: true, value: secret };
  }

  /** Reads one room's private answer and assignments from Redis. */
  private async readSecret(roomId: string): Promise<SecretState | null> {
    const serialized = await this.redisService.get(secretKey(roomId));
    return serialized ? (JSON.parse(serialized) as SecretState) : null;
  }

  /** Saves one room's private answer and assignments with a room-lifetime TTL. */
  private async saveSecret(roomId: string, secret: SecretState): Promise<void> {
    await this.redisService.set(
      secretKey(roomId),
      JSON.stringify(secret),
      SECRET_TTL_SECONDS,
    );
  }
}

/** Parses a table-safe state or restores the canonical lobby defaults. */
function publicState(room: GameRoomState): CrosswordCryptPublicState {
  const candidate = room.gameState as Partial<CrosswordCryptPublicState>;
  if (
    candidate.phase &&
    Array.isArray(candidate.relics) &&
    typeof candidate.torches === "number"
  ) {
    const state = structuredClone(candidate) as CrosswordCryptPublicState;
    state.gridLetters ??= [];
    state.maxTorches ??= state.torches;
    return state;
  }
  return structuredClone(INITIAL_CROSSWORD_CRYPT_STATE);
}

/** Adds private difficulty choices to the generic seated-player list. */
function playersFor(
  members: readonly GameRoomServerMember[],
  state: CrosswordCryptPublicState,
): CrosswordCryptPlayer[] {
  return members.map((member) => ({
    difficulty: state.difficulties[member.id] ?? "standard",
    id: member.id,
    name: member.name,
  }));
}

/** Replaces only public puzzle fields for a newly dealt room. */
function stateForDeal(
  state: CrosswordCryptPublicState,
  deal: CrosswordCryptDeal,
  phase: "room" | "vault",
  roomIndex: number,
): CrosswordCryptPublicState {
  return {
    ...state,
    answerCells: hiddenAnswerCells(deal.answer),
    grid: deal.grid,
    gridLetters: emptyGridLetters(deal),
    lastGuess: null,
    notice: phase === "vault" ? "The final vault waits for every voice." : null,
    phase,
    relicChoices: [],
    roomIndex,
    roomToken: deal.roomToken,
    roomType: deal.roomType,
    whisper: deal.whisper,
  };
}

/** Builds the family-hall-compatible terminal table state. */
function terminalState(
  state: CrosswordCryptPublicState,
  outcome: "escaped" | "sealed",
): CrosswordCryptPublicState {
  return {
    ...state,
    notice:
      outcome === "escaped"
        ? "Morning light pours into the crypt."
        : "The last torch fades. The crypt is sealed.",
    phase: outcome,
    roomToken: null,
    runRecord: {
      outcome,
      relics: state.relics,
      roomCount: CROSSWORD_CRYPT_CHAIN_LENGTH,
      roomIndexReached: state.roomIndex,
      theme: state.theme,
      torchesLeft: state.torches,
    },
    whisper: null,
  };
}

/** Targets each current socket with only its assigned slice. */
function deliveriesFor(
  members: readonly GameRoomServerMember[],
  deal: CrosswordCryptDeal | null,
): SliceDeliveries {
  return Object.fromEntries(
    members.map((member) => [
      member.socketId,
      deal?.privateSlices[member.id] ?? null,
    ]),
  );
}

/** Returns whether puzzle commands are currently legal. */
function isPuzzlePhase(phase: CrosswordCryptPublicState["phase"]): boolean {
  return phase === "room" || phase === "vault";
}

/** Normalizes untrusted difficulty input to a family level. */
function normalizeDifficulty(value: unknown): CrosswordCryptDifficulty {
  if (value === "easy" || value === "expert") return value;
  return "standard";
}

/** Builds a successful generic server-room decision. */
function accept(
  state: CrosswordCryptPublicState,
  deliveries: SliceDeliveries,
): GameRoomServerDecision<SliceDeliveries> {
  return { gameState: state as never, ok: true, value: deliveries };
}

/** Builds a rejected generic server-room decision. */
function reject(code: string, message: string): GameRoomServerDecision<never> {
  return { code: code as never, message, ok: false };
}

/** Converts a generic mutation into the game acknowledgement contract. */
function commandResult(
  outcome: GameRoomServerResult<SliceDeliveries>,
): StoreResult {
  if (!outcome.result.ok) {
    return {
      error: outcome.result.error,
      ok: false,
      room: outcome.result.room as unknown as
        | GameRoomState<CrosswordCryptPublicState>
        | undefined,
    };
  }
  if (!outcome.result.room) {
    return {
      error: { code: "ROOM_NOT_FOUND", message: "The room no longer exists." },
      ok: false,
    };
  }
  const callerSocket = outcome.members?.find(
    (member) => member.id === outcome.playerId,
  )?.socketId;
  return {
    deliveries: outcome.value,
    ok: true,
    room: outcome.result
      .room as unknown as GameRoomState<CrosswordCryptPublicState>,
    slice: callerSocket ? outcome.value?.[callerSocket] : undefined,
  };
}

/** Builds the Redis key for one room's non-broadcast state. */
function secretKey(roomId: string): string {
  return `crossword-crypt:room:${roomId}:secret`;
}
