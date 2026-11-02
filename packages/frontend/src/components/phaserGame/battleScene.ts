import type Phaser from "phaser";
import { attackSoundUrl, playClip } from "../tower/audio/clips";
import { playSound, type SoundName } from "../tower/audio/sound";
import { type CardTargeting, cardTargeting } from "../tower/logic/cardRules";
import {
  automaticTarget,
  type CombatCard,
  type CombatEvent,
  type CombatState,
  type CombatStep,
  canAfford,
  createCombat,
  endTurn,
  incomingDamage,
  isAlive,
  livingEnemies,
  livingParty,
  playCard,
} from "../tower/logic/combat";
import { describeTarget } from "../tower/logic/enemyMoves";
import {
  CULTIVATOR_GLYPH,
  ownerColor as ownerColorAt,
  partyAccentIndex,
} from "../tower/ownerColors";
import {
  type BattleRoomInfo,
  type BattleSceneInput,
  listBattleAssetRequests,
} from "./battleAssetRequests";
import { type BattleLayout, layoutBattle } from "./battleLayout";
import { isHeavyImpact, paced, soundForEvent } from "./battleMotion";
import { BattlePainter, PALETTE, rgb } from "./battlePaint";
import { BattleSpriteDirector, type SpriteUnit } from "./battleSprites";
import {
  arrowCurve,
  arrowMarkCount,
  type CardRelease,
  resolveCardRelease,
} from "./cardAim";
import { type CardPose, layoutHandFan, pickHandCard } from "./handFan";
import { DASH_IMPACT_MS, scheduleStep } from "./stepTimeline";
import { BattleHud, type EndTurnState } from "./views/battleHud";
import { BattleStage, DEPTH } from "./views/battleStage";
import { CardView } from "./views/cardView";
import {
  type AimMark,
  type UnitCues,
  UnitView,
  type ViewKit,
} from "./views/unitView";

const FINISH_DELAY_MS = 1700;
const FADE_MS = 450;
/** Pointer travel under which a press and release count as a click. */
const CLICK_SLOP_PX = 12;
/** Press length under which a press and release count as a click. */
const CLICK_MS = 260;
/** Gap between cards arriving from the draw pile. */
const DRAW_STAGGER_MS = 75;
/** Distance between chevrons on the aiming arrow. */
const ARROW_SPACING = 34;
/** Freeze on a heavy blow, so it lands with weight. */
const HIT_STOP_MS = 70;

type PhaserRuntime = typeof import("phaser");

/** A card the player has picked up. */
type HeldCard = {
  /** "drag" while the button is down; "hold" after a click picked it up */
  mode: "drag" | "hold";
  pressedAt: number;
  startX: number;
  startY: number;
  /** Unit under the arrow that the card may be played on */
  targetId?: string;
  targeting: CardTargeting;
  view: CardView;
};

/**
 * @param room - Room the fight takes place in
 * @returns The banner naming the room
 */
function floorLabel(room: BattleRoomInfo): string {
  if (room.isBoss) {
    return `Summit · ${room.title}`;
  }
  return `Floor ${room.floor} of ${room.floorCount} · ${room.title}`;
}

/**
 * @param room - Room the fight took place in
 * @param victory - Whether the party won
 * @returns The line under the outcome title
 */
function finishSubtitle(room: BattleRoomInfo, victory: boolean): string {
  if (!victory) {
    return "The tower keeps its secrets";
  }
  if (room.isBoss) {
    return "The Tower Heart is quiet";
  }
  return `Floor ${room.floor} cleared`;
}

/**
 * @param sound - Effect to play
 */
function playVaried(sound: SoundName): void {
  playSound(sound, { pitch: 0.92 + Math.random() * 0.16 });
}

/**
 * Builds the battle scene class for one fight.
 * The scene owns the combat state while the fight lasts and reports the
 * result through `input.onFinish`. Rules resolve at once in `combat`; the
 * scene replays each resulting step on a timeline so every blow reads,
 * while the player stays free to keep playing cards.
 * @param Phaser - Phaser module namespace
 * @param input - Party, enemies, deck, and room for this fight
 * @returns Scene class Phaser can instantiate
 */
export function createBattleSceneClass(
  Phaser: PhaserRuntime,
  input: BattleSceneInput,
): new () => Phaser.Scene {
  const ownerColor = new Map(
    input.setup.party.map((unit, index) => [
      unit.id,
      ownerColorAt(partyAccentIndex(input.setup.party, index)),
    ]),
  );
  const ownerName = new Map(
    input.setup.party.map((unit) => [unit.id, unit.name]),
  );
  const spriteUnits: SpriteUnit[] = [
    ...input.setup.party.map((unit) => ({
      id: unit.id,
      side: "party" as const,
      sprite: unit.sprite,
    })),
    ...input.setup.enemies.map((enemy) => ({
      id: enemy.id,
      side: "enemy" as const,
      sprite: enemy.sprite,
    })),
  ];

  /**
   * @param ms - Duration at normal battle speed
   * @returns The duration at the player's battle speed
   */
  const wait = (ms: number): number => paced(ms, input.pace);

  return class BattleScene extends Phaser.Scene {
    private animating = false;
    private arrow!: Phaser.GameObjects.Graphics;
    private combat!: CombatState;
    private finished = false;
    private hand: CardView[] = [];
    private held?: HeldCard;
    private hovered?: number;
    private hud?: BattleHud;
    private inputLocked = true;
    private kit!: ViewKit;
    private layout!: BattleLayout;
    private queue: CombatStep[] = [];
    private sprites!: BattleSpriteDirector;
    private stage!: BattleStage;
    private tooltip?: Phaser.GameObjects.Container;
    private tooltipUnitId?: string;
    private unitViews = new Map<string, UnitView>();

    public constructor() {
      super({ key: "BattleScene" });
    }

    /**
     * Queues the backdrop, portraits, unit sprites, and card art.
     */
    public preload(): void {
      this.load.setCORS("anonymous");
      this.load.on("loaderror", this.onAssetLoadError);
      for (const asset of listBattleAssetRequests(input)) {
        this.load.image(asset.key, asset.url);
      }
      this.sprites = new BattleSpriteDirector(
        Phaser,
        this,
        spriteUnits,
        input.pace,
      );
      this.sprites.preload();
    }

    /**
     * Sets up the field, then plays the title card and deals the first hand.
     */
    public create(): void {
      const opening = createCombat(input.setup);
      this.combat = opening.state;
      this.sprites.create();
      this.kit = {
        Phaser,
        painter: new BattlePainter(Phaser, this),
        reducedMotion: input.reducedMotion,
        scene: this,
        sprites: this.sprites,
        wait,
      };
      this.stage = new BattleStage(this.kit, input.room);
      this.arrow = this.add.graphics().setDepth(DEPTH.arrow);
      this.buildField();
      this.stage.createAmbient();

      this.scale.on("resize", this.buildField, this);
      this.input.on("pointermove", this.onPointerMove, this);
      this.input.on("pointerdown", this.onPointerDown, this);
      this.input.on("pointerup", this.onPointerUp, this);
      this.input.on("gameout", this.onPointerLeave, this);
      this.input.keyboard?.on("keydown", this.onKeyDown, this);
      this.events.once("shutdown", () => {
        this.load.off("loaderror", this.onAssetLoadError);
        this.scale.off("resize", this.buildField, this);
      });

      const [red, green, blue] = rgb(PALETTE.paper);
      this.cameras.main.fadeIn(wait(FADE_MS), red, green, blue);
      if (input.room.isBoss) {
        playSound("heavy-hit");
      }
      this.stage.showTitleCard(() => {
        if (!this.finished) {
          this.enqueue(opening);
        }
      });
    }

    /**
     * Eases every hand card toward its pose, drifts the ambient leaves,
     * and redraws the aiming arrow.
     * @param time - Scene time in milliseconds
     * @param delta - Frame time in milliseconds
     */
    public update(time: number, delta: number): void {
      this.stage.driftAmbient(time, delta, this.layout.groundY + 40);
      for (const card of this.hand) {
        card.ease(delta);
      }
      this.held?.view.ease(delta);
      this.drawArrow();
    }

    /**
     * Logs an asset URL Phaser could not fetch. The unit keeps its stand-in.
     * @param file - Loader file that failed
     */
    private readonly onAssetLoadError = (file: {
      key: string;
      url: string;
    }): void => {
      // biome-ignore lint/suspicious/noConsole: a missing generated asset should be visible in devtools
      console.warn(`Could not load battle asset ${file.key} from ${file.url}`);
    };

    /**
     * Lays the field out for the current view size and rebuilds the room,
     * units, and HUD. Hand cards keep their objects and glide to new poses.
     */
    private buildField(): void {
      this.layout = layoutBattle(this.scale.width, this.scale.height, {
        enemies: this.combat.enemies.length,
        party: this.combat.party.length,
      });
      this.stage.paintBackdrop(this.layout);
      for (const view of this.unitViews.values()) {
        view.destroy();
      }
      this.unitViews.clear();
      const cues = this.unitCues(this.combat);
      this.combat.party.forEach((unit, index) => {
        const slot = this.layout.party[index];
        if (!slot) {
          return;
        }
        const accent = ownerColor.get(unit.id) ?? PALETTE.jade;
        const view = new UnitView(
          this.kit,
          unit,
          "party",
          slot,
          accent,
          cues.get(unit.id) ?? {},
        );
        view.container.setDepth(DEPTH.units);
        this.unitViews.set(unit.id, view);
      });
      this.combat.enemies.forEach((enemy, index) => {
        const slot = this.layout.enemies[index];
        if (!slot) {
          return;
        }
        const accent = enemy.isBoss ? PALETTE.gold : PALETTE.ember;
        const view = new UnitView(
          this.kit,
          enemy,
          "enemy",
          slot,
          accent,
          cues.get(enemy.id) ?? {},
        );
        view.container.setDepth(DEPTH.units);
        this.unitViews.set(enemy.id, view);
      });
      this.hud?.destroy();
      this.hud = new BattleHud(this.kit, this.layout, floorLabel(input.room));
      this.hud.container.setDepth(DEPTH.hud);
      this.refan();
    }

    /**
     * @param state - Battle to read
     * @returns Incoming damage for each party member and action order for each enemy
     */
    private unitCues(state: CombatState): Map<string, UnitCues> {
      const cues = new Map<string, UnitCues>();
      const incoming = incomingDamage(state);
      for (const unit of state.party) {
        cues.set(unit.id, { incoming: incoming.get(unit.id) ?? 0 });
      }
      const living = livingEnemies(state);
      living.forEach((enemy, index) => {
        cues.set(enemy.id, { actsAt: living.length - index });
      });
      return cues;
    }

    // ---- Hand -------------------------------------------------------------

    /**
     * Fans the hand around the hovered card, leaving out the held card.
     */
    private refan(): void {
      const poses = layoutHandFan(
        this.hand.length,
        this.layout.hand,
        this.held ? undefined : this.hovered,
      );
      this.hand.forEach((card, index) => {
        const pose = poses[index];
        if (!pose) {
          return;
        }
        card.target = pose;
        const raised = index === this.hovered && !this.held;
        card.container.setDepth(
          raised ? DEPTH.cardHovered : DEPTH.card + index,
        );
      });
      this.refreshGlows();
    }

    /**
     * @returns Each hand card's resting pose, for picking
     */
    private restPoses(): CardPose[] {
      return layoutHandFan(this.hand.length, this.layout.hand);
    }

    /**
     * Shows which cards can be played now, whether letting go of the held
     * card would play it, and the HUD.
     */
    private refreshGlows(): void {
      for (const card of this.hand) {
        const affordable = canAfford(this.combat, card.id);
        const playable = affordable && !this.inputLocked;
        card.setGlow(playable ? "playable" : "none", affordable);
      }
      const held = this.held;
      if (held) {
        const ready = this.releaseNow().kind === "play";
        held.view.setGlow(ready ? "ready" : "playable", true);
      }
      this.refreshHud();
    }

    /**
     * Brings cards that are in the step's hand, and still in the true hand,
     * in from the draw pile one after another.
     * @param state - State after the draw
     */
    private dealFrom(state: CombatState): void {
      const shown = new Set(this.hand.map((card) => card.id));
      const live = new Set(this.combat.hand.map((card) => card.instanceId));
      const heldId = this.held?.view.id;
      const arriving = state.hand.filter(
        (card) =>
          !shown.has(card.instanceId) &&
          live.has(card.instanceId) &&
          card.instanceId !== heldId,
      );
      arriving.forEach((card, index) => {
        this.time.delayedCall(wait(DRAW_STAGGER_MS) * index, () => {
          this.addCardView(card);
          playVaried("draw");
        });
      });
    }

    /**
     * Adds one card to the hand, appearing at the draw pile, in the same
     * order as the true hand.
     * @param card - Card drawn
     */
    private addCardView(card: CombatCard): void {
      const present =
        this.hand.some((view) => view.id === card.instanceId) ||
        this.held?.view.id === card.instanceId;
      const live = this.combat.hand.some(
        (entry) => entry.instanceId === card.instanceId,
      );
      if (this.finished || present || !live) {
        return;
      }
      const { drawPile, hand } = this.layout;
      const view = new CardView(
        this.kit,
        card,
        { height: hand.cardHeight, width: hand.cardWidth },
        ownerColor.get(card.ownerId) ?? PALETTE.jade,
        ownerName.get(card.ownerId) ?? "",
        { rotation: -0.5, scale: 0.25, x: drawPile.x, y: drawPile.y },
      );
      this.hand.push(view);
      this.sortHand();
      this.refan();
    }

    /**
     * Orders the hand views the same way as the true hand.
     */
    private sortHand(): void {
      const order = new Map(
        this.combat.hand.map((entry, index) => [entry.instanceId, index]),
      );
      this.hand.sort(
        (left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
      );
    }

    /**
     * Sends cards to the discard pile, leaving the hand one by one.
     * @param cards - Cards leaving the hand
     */
    private discardViews(cards: CardView[]): void {
      const { discardPile } = this.layout;
      cards.forEach((card, index) => {
        card.container.setDepth(DEPTH.cardFlying);
        card.flyTo(
          { rotation: 0.6, scale: 0.2, x: discardPile.x, y: discardPile.y },
          wait(320),
          { alpha: 0.4, delay: wait(45) * index, ease: "Cubic.easeIn" },
          () => card.destroy(),
        );
      });
    }

    /**
     * Burns cards out of the hand when their owner falls.
     * @param ownerId - Fallen party member
     */
    private burnCardsOf(ownerId: string): void {
      const lost = this.hand.filter((card) => card.card.ownerId === ownerId);
      if (lost.length === 0) {
        return;
      }
      this.hand = this.hand.filter((card) => card.card.ownerId !== ownerId);
      for (const card of lost) {
        const { rotation, x, y } = card.container;
        card.flyTo(
          { rotation, scale: 0.8, x, y: y - 80 },
          wait(500),
          { alpha: 0, ease: "Quad.easeIn" },
          () => card.destroy(),
        );
      }
      this.refan();
    }

    // ---- Input ------------------------------------------------------------

    /**
     * Moves the held card and arrow, or hovers hand cards, the End Turn
     * button, and units.
     * @param pointer - Pointer that moved
     */
    private onPointerMove(pointer: Phaser.Input.Pointer): void {
      if (this.held) {
        this.moveHeld(pointer.x, pointer.y);
        return;
      }
      if (this.finished) {
        return;
      }
      const onButton = this.hud?.isOnButton(pointer.x, pointer.y) ?? false;
      this.hud?.setButtonHover(onButton && !this.inputLocked);
      const index = this.pickCard(pointer.x, pointer.y);
      if (index !== this.hovered) {
        this.hovered = index;
        if (index !== undefined) {
          playSound("hover");
        }
        this.refan();
      }
      const overUnit =
        index === undefined ? this.unitAt(pointer.x, pointer.y) : undefined;
      this.showTooltip(overUnit);
      const interactive = onButton || index !== undefined;
      this.input.setDefaultCursor(
        interactive && !this.inputLocked ? "pointer" : "default",
      );
    }

    /**
     * Picks up a card, presses End Turn, settles a card held by a click,
     * or cancels on right click.
     * @param pointer - Pointer that was pressed
     */
    private onPointerDown(pointer: Phaser.Input.Pointer): void {
      if (pointer.rightButtonDown()) {
        this.cancelHeld();
        return;
      }
      if (this.held?.mode === "hold") {
        this.moveHeld(pointer.x, pointer.y);
        this.releaseHeld();
        return;
      }
      if (this.inputLocked || this.finished) {
        return;
      }
      if (this.hud?.isOnButton(pointer.x, pointer.y)) {
        this.runEnemyTurn();
        return;
      }
      const index = this.pickCard(pointer.x, pointer.y);
      const card = index === undefined ? undefined : this.hand[index];
      if (card) {
        this.pickUp(card, pointer.x, pointer.y, "drag");
      }
    }

    /**
     * Plays or returns a dragged card. A quick click instead keeps the
     * card held until the next click.
     * @param pointer - Pointer that was released
     */
    private onPointerUp(pointer: Phaser.Input.Pointer): void {
      const held = this.held;
      if (held?.mode !== "drag") {
        return;
      }
      const travel = Math.hypot(
        pointer.x - held.startX,
        pointer.y - held.startY,
      );
      const quick = this.time.now - held.pressedAt < CLICK_MS;
      if (travel < CLICK_SLOP_PX && quick) {
        held.mode = "hold";
        return;
      }
      this.moveHeld(pointer.x, pointer.y);
      this.releaseHeld();
    }

    /**
     * Drops hover state when the pointer leaves the canvas.
     */
    private onPointerLeave(): void {
      if (this.held?.mode === "drag") {
        this.cancelHeld();
      }
      this.hovered = undefined;
      this.showTooltip(undefined);
      this.hud?.setButtonHover(false);
      this.refan();
    }

    /**
     * Number keys pick up or play cards, E ends the turn, Escape cancels.
     * @param event - Keyboard event
     */
    private onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        this.cancelHeld();
        return;
      }
      if (this.inputLocked || this.finished) {
        return;
      }
      if (event.key === "e" || event.key === "E") {
        this.runEnemyTurn();
        return;
      }
      const index = Number.parseInt(event.key, 10) - 1;
      const card = Number.isNaN(index) ? undefined : this.hand[index];
      if (!card) {
        return;
      }
      this.cancelHeld();
      const automatic = automaticTarget(this.combat, card.card);
      const targeting = cardTargeting(card.card.definition.rules);
      const playsAtOnce = targeting === "none" || automatic !== undefined;
      const pointer = this.input.activePointer;
      this.pickUp(card, pointer.x, pointer.y, "hold");
      if (playsAtOnce && this.held) {
        this.play(this.held, automatic);
      }
    }

    /**
     * @param x - Pointer x
     * @param y - Pointer y
     * @returns Index of the hand card under the pointer
     */
    private pickCard(x: number, y: number): number | undefined {
      const index = this.hovered;
      const view = index === undefined ? undefined : this.hand[index];
      const raised =
        view && index !== undefined ? { index, pose: view.target } : undefined;
      const { cardHeight, cardWidth } = this.layout.hand;
      return pickHandCard(
        { x, y },
        this.restPoses(),
        { height: cardHeight, width: cardWidth },
        raised,
      );
    }

    /**
     * Lifts a card out of the hand. An aimed card moves to the middle and
     * an arrow follows the pointer; any other card follows the pointer.
     * @param view - Card picked up
     * @param x - Pointer x
     * @param y - Pointer y
     * @param mode - Dragging with the button down, or held after a click
     */
    private pickUp(
      view: CardView,
      x: number,
      y: number,
      mode: HeldCard["mode"],
    ): void {
      if (!canAfford(this.combat, view.id)) {
        view.refuse();
        this.stage.showNotice("Not enough Aether", this.layout.playLineY - 50);
        return;
      }
      playSound("select");
      this.hand = this.hand.filter((card) => card !== view);
      this.hovered = undefined;
      this.showTooltip(undefined);
      view.container.setDepth(DEPTH.cardHeld);
      this.held = {
        mode,
        pressedAt: this.time.now,
        startX: x,
        startY: y,
        targeting: cardTargeting(view.card.definition.rules),
        view,
      };
      this.moveHeld(x, y);
      this.refan();
    }

    /**
     * Moves the held card or its arrow, and marks what it would land on.
     * @param x - Pointer x
     * @param y - Pointer y
     */
    private moveHeld(x: number, y: number): void {
      const held = this.held;
      if (!held) {
        return;
      }
      const { aimPose, hand } = this.layout;
      held.view.target =
        held.targeting === "none"
          ? { rotation: 0, scale: 1.12, x, y: y + hand.cardHeight * 0.2 }
          : { rotation: 0, scale: 1.12, x: aimPose.x, y: aimPose.y };
      held.targetId = this.targetAt(x, y, held.targeting);
      for (const [unitId, view] of this.unitViews) {
        view.setAim(this.aimMarkFor(unitId, held));
      }
      this.refreshGlows();
    }

    /**
     * @param unitId - Unit to mark
     * @param held - Card being aimed
     * @returns Locked under the arrow, candidate when it is a legal target
     */
    private aimMarkFor(unitId: string, held: HeldCard): AimMark {
      if (!this.isLegalTarget(unitId, held.targeting)) {
        return "none";
      }
      return unitId === held.targetId ? "locked" : "candidate";
    }

    /**
     * @returns What letting go of the held card right now would do
     */
    private releaseNow(): CardRelease {
      const held = this.held;
      if (!held) {
        return { kind: "cancel" };
      }
      return resolveCardRelease({
        hoveredTargetId: held.targetId,
        onlyTargetId: automaticTarget(this.combat, held.view.card),
        playLineY: this.layout.playLineY,
        pointerY: this.input.activePointer.y,
        targeting: held.targeting,
      });
    }

    /**
     * Plays the held card where it was let go, or returns it to the hand.
     */
    private releaseHeld(): void {
      const held = this.held;
      if (!held) {
        return;
      }
      const release = this.releaseNow();
      if (release.kind === "cancel") {
        this.cancelHeld();
        return;
      }
      this.play(held, release.targetId);
    }

    /**
     * Returns the held card to the hand.
     */
    private cancelHeld(): void {
      const held = this.held;
      if (!held) {
        return;
      }
      this.held = undefined;
      this.clearAim();
      this.hand.push(held.view);
      this.sortHand();
      this.refan();
    }

    /**
     * Clears the arrow and every reticle.
     */
    private clearAim(): void {
      this.arrow.clear();
      for (const view of this.unitViews.values()) {
        view.setAim("none");
      }
    }

    /**
     * Resolves the held card, flies it out, and queues its effects.
     * @param held - Card being played
     * @param targetId - Unit it was played on
     */
    private play(held: HeldCard, targetId: string | undefined): void {
      const result = playCard(this.combat, held.view.id, targetId);
      if (!result.ok) {
        held.view.refuse();
        const reason =
          result.reason === "not-enough-aether"
            ? "Not enough Aether"
            : "Aim it at a target";
        this.stage.showNotice(reason, this.layout.playLineY - 50);
        this.cancelHeld();
        return;
      }
      this.held = undefined;
      this.clearAim();
      this.combat = result.step.state;
      playVaried("whoosh");
      this.flyPlayedCard(held.view, targetId);
      this.refan();
      this.enqueue(result.step);
    }

    /**
     * Snaps a played card toward its target, then lets it fold into the
     * discard pile.
     * @param view - Played card
     * @param targetId - Unit it was played on
     */
    private flyPlayedCard(view: CardView, targetId: string | undefined): void {
      const { aimPose, discardPile } = this.layout;
      const target = targetId ? this.unitViews.get(targetId) : undefined;
      view.container.setDepth(DEPTH.cardFlying);
      const toward = target
        ? {
            x: aimPose.x + (target.chest.x - aimPose.x) * 0.25,
            y: aimPose.y + (target.chest.y - aimPose.y) * 0.25,
          }
        : { x: aimPose.x, y: aimPose.y - 30 };
      view.flyTo(
        { rotation: 0, scale: 1.18, x: toward.x, y: toward.y },
        wait(140),
        { ease: "Quad.easeOut" },
        () =>
          view.flyTo(
            { rotation: 0.8, scale: 0.2, x: discardPile.x, y: discardPile.y },
            wait(340),
            { alpha: 0.3, delay: wait(120), ease: "Cubic.easeIn" },
            () => view.destroy(),
          ),
      );
    }

    /**
     * Ends the turn: the hand is discarded and each enemy acts in turn.
     */
    private runEnemyTurn(): void {
      if (this.inputLocked || this.finished || this.combat.phase !== "player") {
        return;
      }
      this.cancelHeld();
      const steps = endTurn(this.combat);
      const last = steps[steps.length - 1];
      if (!last) {
        return;
      }
      playSound("confirm");
      this.inputLocked = true;
      this.hovered = undefined;
      this.showTooltip(undefined);
      this.discardViews(this.hand);
      this.hand = [];
      this.combat = last.state;
      this.hud?.setButtonHover(false);
      this.input.setDefaultCursor("default");
      this.refreshGlows();
      this.stage.showBanner(
        "Enemy Turn",
        this.layout.groundY * 0.4,
        PALETTE.damageText,
      );
      this.time.delayedCall(wait(650), () => {
        for (const step of steps) {
          this.enqueue(step);
        }
      });
    }

    /**
     * @param x - Pointer x
     * @param y - Pointer y
     * @param targeting - What the held card aims at
     * @returns The legal target under the pointer, if any
     */
    private targetAt(
      x: number,
      y: number,
      targeting: CardTargeting,
    ): string | undefined {
      if (targeting === "none") {
        return undefined;
      }
      const unitId = this.unitAt(x, y);
      if (unitId === undefined || !this.isLegalTarget(unitId, targeting)) {
        return undefined;
      }
      return unitId;
    }

    /**
     * @param x - Pointer x
     * @param y - Pointer y
     * @returns The standing unit whose figure is under the pointer
     */
    private unitAt(x: number, y: number): string | undefined {
      for (const [unitId, view] of this.unitViews) {
        const { bottom, left, right, top } = view.bounds;
        const inside = x >= left && x <= right && y >= top && y <= bottom;
        if (inside && view.standing) {
          return unitId;
        }
      }
      return undefined;
    }

    /**
     * @param unitId - Unit to test
     * @param targeting - What the card aims at
     * @returns Whether the card may be played on this unit now
     */
    private isLegalTarget(unitId: string, targeting: CardTargeting): boolean {
      if (targeting === "enemy") {
        return livingEnemies(this.combat).some((enemy) => enemy.id === unitId);
      }
      if (targeting === "ally") {
        return livingParty(this.combat).some((unit) => unit.id === unitId);
      }
      return false;
    }

    /**
     * Draws the curved chevron arrow from the held card to the pointer.
     * It turns ember over an enemy and jade over an ally.
     */
    private drawArrow(): void {
      const held = this.held;
      this.arrow.clear();
      if (!held || held.targeting === "none") {
        return;
      }
      const pointer = this.input.activePointer;
      const from = held.view.top;
      const to = { x: pointer.x, y: pointer.y };
      const marks = arrowCurve(
        from,
        to,
        arrowMarkCount(from, to, ARROW_SPACING),
      );
      let color: number = PALETTE.paperLight;
      if (held.targetId !== undefined) {
        color = held.targeting === "enemy" ? PALETTE.ember : PALETTE.jade;
      }
      marks.forEach((mark, index) => {
        const isHead = index === marks.length - 1;
        const size = isHead ? 20 : 7 + (index / marks.length) * 6;
        this.drawChevron(mark.x, mark.y, mark.angle, size, color, isHead);
      });
    }

    /**
     * @param x - Chevron tip x
     * @param y - Chevron tip y
     * @param angle - Heading in radians
     * @param size - Chevron length
     * @param color - Fill color
     * @param filled - Draw a solid arrowhead instead of an open chevron
     */
    private drawChevron(
      x: number,
      y: number,
      angle: number,
      size: number,
      color: number,
      filled: boolean,
    ): void {
      const back = angle + Math.PI;
      const wing = 0.6;
      const left = {
        x: x + Math.cos(back - wing) * size,
        y: y + Math.sin(back - wing) * size,
      };
      const right = {
        x: x + Math.cos(back + wing) * size,
        y: y + Math.sin(back + wing) * size,
      };
      if (filled) {
        const tipX = x + Math.cos(angle) * 3;
        const tipY = y + Math.sin(angle) * 3;
        this.arrow.fillStyle(PALETTE.inkNumber, 0.9);
        this.arrow.fillTriangle(tipX, tipY, left.x, left.y, right.x, right.y);
        this.arrow.fillStyle(color, 1);
        this.arrow.fillTriangle(x, y, left.x, left.y, right.x, right.y);
        return;
      }
      this.arrow.lineStyle(7, PALETTE.inkNumber, 0.85);
      this.arrow.lineBetween(left.x, left.y, x, y);
      this.arrow.lineBetween(right.x, right.y, x, y);
      this.arrow.lineStyle(4, color, 1);
      this.arrow.lineBetween(left.x, left.y, x, y);
      this.arrow.lineBetween(right.x, right.y, x, y);
    }

    // ---- Step playback ----------------------------------------------------

    /**
     * Adds a step to the playback queue, starting it if nothing is playing.
     * @param step - State and the events that produced it
     */
    private enqueue(step: CombatStep): void {
      this.queue.push(step);
      if (!this.animating) {
        this.playNext();
      }
    }

    /**
     * Plays the next queued step on its timeline, then settles the field
     * to its state and moves on. When the queue empties, a finished
     * battle shows its outcome.
     */
    private playNext(): void {
      const step = this.queue.shift();
      if (!step) {
        this.animating = false;
        this.afterPlayback();
        return;
      }
      this.animating = true;
      const timeline = scheduleStep(step.events, input.pace);
      for (const beat of timeline.beats) {
        const { event } = beat;
        if (beat.windupAt !== undefined && event.kind === "damage") {
          this.time.delayedCall(beat.windupAt, () => this.windUp(event));
        }
        this.time.delayedCall(beat.at, () =>
          this.animateEvent(event, step.state),
        );
      }
      this.time.delayedCall(timeline.duration, () => {
        this.settle(step.state);
        this.playNext();
      });
    }

    /**
     * Snaps every unit to the shown state, so health, block, and intents
     * are exact once a step's motion is done. While more steps wait, the
     * step's own state is shown; once caught up, the true state is.
     * @param state - State after the step
     */
    private settle(state: CombatState): void {
      const source = this.queue.length === 0 ? this.combat : state;
      const cues = this.unitCues(source);
      for (const unit of [...source.party, ...source.enemies]) {
        this.unitViews.get(unit.id)?.sync(unit, cues.get(unit.id) ?? {});
      }
      const live = new Set(this.combat.hand.map((card) => card.instanceId));
      const stale = this.hand.filter((card) => !live.has(card.id));
      if (stale.length > 0) {
        this.hand = this.hand.filter((card) => live.has(card.id));
        this.discardViews(stale);
      }
      this.refan();
    }

    /**
     * Starts an attacker's dash and swing so the blow lands on the beat.
     * @param event - The blow
     */
    private windUp(event: Extract<CombatEvent, { kind: "damage" }>): void {
      const source = this.unitViews.get(event.sourceId);
      const target = this.unitViews.get(event.targetId);
      if (!source || !target) {
        return;
      }
      const clip = attackSoundUrl(this.combat.enemies, event.sourceId);
      if (!clip) {
        playVaried("slash");
      }
      source.container.setDepth(DEPTH.units + 1);
      source.dash(target.feet.x, wait(DASH_IMPACT_MS));
      this.sprites.playMove(event.sourceId, "attack");
      this.time.delayedCall(wait(DASH_IMPACT_MS + 400), () =>
        source.container.setDepth(DEPTH.units),
      );
    }

    /**
     * Shows one event as it lands.
     * @param event - One combat event
     * @param state - State after the step it belongs to
     */
    private animateEvent(event: CombatEvent, state: CombatState): void {
      const clip =
        event.kind === "damage"
          ? attackSoundUrl(this.combat.enemies, event.sourceId)
          : undefined;
      if (clip) {
        void playClip(clip);
      } else {
        const sound = soundForEvent(event);
        if (sound && event.kind !== "card-played") {
          playVaried(sound);
        }
      }
      if (event.kind === "damage") {
        this.showHit(event);
        return;
      }
      if (event.kind === "block") {
        this.sprites.play(event);
        const view = this.unitViews.get(event.targetId);
        if (view) {
          view.gainBlock(event.amount);
          const { x, y } = view.chest;
          this.stage.popNumber(x, y, `+${event.amount}`, PALETTE.blockText, 26);
        }
        return;
      }
      if (event.kind === "aether") {
        const { aether } = this.layout;
        const text = `+${event.amount} Aether`;
        this.stage.float(aether.x, aether.y - 50, text, PALETTE.aetherText, 22);
        return;
      }
      if (event.kind === "draw") {
        this.dealFrom(state);
        return;
      }
      if (event.kind === "shuffle") {
        const { drawPile } = this.layout;
        const x = drawPile.x + 40;
        this.stage.float(x, drawPile.y - 70, "Reshuffled", PALETTE.inkSoft, 15);
        return;
      }
      if (event.kind === "combo") {
        this.showCombo(event.triggered);
        return;
      }
      if (event.kind === "death") {
        this.showDeath(event.unitId, event.cardsRemoved);
        return;
      }
      if (event.kind === "enemy-move") {
        const view = this.unitViews.get(event.enemyId);
        if (view) {
          view.announce(event.move);
          const { x } = view.chest;
          const y = view.bounds.top - 70;
          this.stage.float(x, y, event.move.text, PALETTE.ink, 15, 1300);
        }
        return;
      }
      if (event.kind === "turn-start") {
        this.inputLocked = false;
        if (event.turn > 1) {
          this.stage.showBanner("Your Turn", this.layout.groundY * 0.4);
        }
        this.refreshGlows();
      }
    }

    /**
     * @param triggered - Whether the combo's chain was met
     */
    private showCombo(triggered: boolean): void {
      const x = this.scale.width / 2;
      const y = this.layout.groundY * 0.55;
      if (!triggered) {
        this.stage.float(x, y, "Combo fizzles", PALETTE.inkSoft, 18);
        return;
      }
      this.stage.float(x, y, "Combo!", "#a37a1f", 34);
      this.stage.spark(x, y, PALETTE.gold, 70);
    }

    /**
     * A blow lands: the target recoils and flinches, sparks fly, and the
     * number pops out. A heavy blow also freezes for a beat and shakes
     * the room.
     * @param event - The blow
     */
    private showHit(event: Extract<CombatEvent, { kind: "damage" }>): void {
      const target = this.unitViews.get(event.targetId);
      if (!target) {
        return;
      }
      const source = this.unitViews.get(event.sourceId);
      this.sprites.play(event);
      target.takeHit(
        event.dealt,
        event.blocked,
        source?.feet.x ?? target.feet.x,
      );
      const { x, y } = target.chest;
      const wounded = event.dealt > 0;
      const sparkColor = wounded ? PALETTE.ember : PALETTE.steel;
      this.stage.spark(x, y, sparkColor, wounded ? 54 : 38);
      this.stage.popNumber(
        x,
        y - 20,
        wounded ? String(event.dealt) : "Blocked",
        wounded ? PALETTE.damageText : PALETTE.blockText,
        wounded ? 40 : 24,
      );
      if (wounded && event.blocked > 0) {
        const text = `${event.blocked} blocked`;
        this.stage.float(x, y + 24, text, PALETTE.blockText, 16);
      }
      if (isHeavyImpact(event) && !input.reducedMotion) {
        this.hitStop();
        this.cameras.main.shake(wait(200), 0.007);
      }
    }

    /**
     * Freezes motion for a moment so a heavy blow lands with weight. The
     * step timeline runs on scene time and is not delayed.
     */
    private hitStop(): void {
      this.tweens.pauseAll();
      this.anims.pauseAll();
      this.time.delayedCall(HIT_STOP_MS, () => {
        this.tweens.resumeAll();
        this.anims.resumeAll();
      });
    }

    /**
     * A unit falls; a fallen party member's cards burn out of the hand.
     * @param unitId - Unit that fell
     * @param cardsRemoved - Cards lost with it
     */
    private showDeath(unitId: string, cardsRemoved: number): void {
      const view = this.unitViews.get(unitId);
      if (!view) {
        return;
      }
      view.fall();
      this.burnCardsOf(unitId);
      const { x, y } = view.chest;
      this.stage.burstLeaves(x, y, 12, 140);
      const text =
        cardsRemoved > 0 ? `Fallen · ${cardsRemoved} cards lost` : "Defeated";
      this.stage.float(x, view.feet.y + 20, text, PALETTE.ink, 18, 1200);
      if (!input.reducedMotion) {
        this.cameras.main.shake(wait(220), 0.006);
      }
    }

    /**
     * Shows the outcome once the last step has played, then reports once.
     */
    private afterPlayback(): void {
      if (this.combat.phase === "player" || this.finished) {
        return;
      }
      this.finished = true;
      this.inputLocked = true;
      this.cancelHeld();
      this.showTooltip(undefined);
      const victory = this.combat.phase === "victory";
      const sting = victory ? input.room.victoryUrl : input.room.defeatUrl;
      if (sting) {
        void playClip(sting);
      } else {
        playSound(victory ? "victory" : "defeat");
      }
      this.discardViews(this.hand);
      this.hand = [];
      this.refreshHud();
      this.stage.showOutcome(victory, finishSubtitle(input.room, victory));
      const report = {
        outcome: victory ? ("victory" as const) : ("defeat" as const),
        party: this.combat.party.map((unit) => ({
          hitPoints: unit.hitPoints,
          id: unit.id,
        })),
        randomState: this.combat.randomState,
      };
      this.time.delayedCall(wait(FINISH_DELAY_MS), () => {
        const fade = wait(FADE_MS);
        const veil = victory ? PALETTE.paper : PALETTE.defeatVeil;
        const [red, green, blue] = rgb(veil);
        this.cameras.main.fadeOut(fade, red, green, blue);
        this.time.delayedCall(fade + 30, () => input.onFinish(report));
      });
    }

    /**
     * Shows Aether, piles, turn, and the End Turn state. While enemies
     * act, the numbers come from the step on screen, not the turn ahead.
     */
    private refreshHud(): void {
      const state = this.combat;
      let endTurnState: EndTurnState = "ready";
      if (this.inputLocked || this.finished) {
        endTurnState = "waiting";
      } else if (
        !state.hand.some((card) => canAfford(state, card.instanceId))
      ) {
        endTurnState = "suggested";
      }
      this.hud?.update({
        aether: this.inputLocked ? 0 : state.aether,
        aetherPerTurn: state.aetherPerTurn,
        discardCount: state.discardPile.length,
        drawCount: state.drawPile.length,
        endTurn: endTurnState,
        turn: Math.max(1, state.turn),
      });
      this.hud?.setHint(this.hintText());
    }

    /**
     * @returns Guidance for the held card, or empty
     */
    private hintText(): string {
      const held = this.held;
      if (!held) {
        return "";
      }
      const name = held.view.card.definition.rules.name;
      if (held.targeting === "enemy") {
        return `Aim ${name} at an enemy · right-click to cancel`;
      }
      if (held.targeting === "ally") {
        return `Aim ${name} at an ally to shield · right-click to cancel`;
      }
      return `Release above the hand to play ${name}`;
    }

    // ---- Tooltip ----------------------------------------------------------

    /**
     * Shows a unit's lore and, for enemies, its full cycle with the next
     * move marked. Passing nothing hides it.
     * @param unitId - Hovered unit
     */
    private showTooltip(unitId: string | undefined): void {
      if (unitId === this.tooltipUnitId) {
        return;
      }
      this.tooltipUnitId = unitId;
      this.tooltip?.destroy();
      this.tooltip = undefined;
      const view = unitId ? this.unitViews.get(unitId) : undefined;
      const lines = unitId ? this.tooltipLines(unitId) : [];
      if (!view || lines.length === 0) {
        return;
      }
      const width = 270;
      const text = this.kit.painter.text(0, 0, lines.join("\n"), {
        align: "left",
        color: PALETTE.ink,
        fontSize: 13,
        wrapWidth: width - 24,
      });
      text.setOrigin(0, 0);
      const height = text.height + 20;
      const { bottom, left, right, top } = view.bounds;
      const onRight = (left + right) / 2 < this.scale.width / 2;
      const x = Math.min(
        this.scale.width - width - 8,
        Math.max(8, onRight ? right + 12 : left - width - 12),
      );
      const y = Math.max(
        8,
        Math.min(
          this.scale.height - height - 8,
          (top + bottom) / 2 - height / 2,
        ),
      );
      const panel = this.add.graphics();
      panel.fillStyle(PALETTE.paperLight, 0.97);
      panel.fillRoundedRect(0, 0, width, height, 12);
      panel.lineStyle(2, PALETTE.jade, 0.9);
      panel.strokeRoundedRect(0, 0, width, height, 12);
      text.setPosition(12, 10);
      this.tooltip = this.add
        .container(x, y, [panel, text])
        .setDepth(DEPTH.tooltip);
    }

    /**
     * @param unitId - Hovered unit
     * @returns Tooltip lines for that unit
     */
    private tooltipLines(unitId: string): string[] {
      const enemy = this.combat.enemies.find((entry) => entry.id === unitId);
      if (enemy) {
        const cycle = enemy.moves.map((move, index) => {
          const marker = index === enemy.moveIndex ? "▶ " : "   ";
          const target =
            move.kind === "attack" ? ` → ${describeTarget(move.target)}` : "";
          return `${marker}${move.text}${target}`;
        });
        return [enemy.name, "", enemy.description, "", "Cycle:", ...cycle];
      }
      const party = this.combat.party.find((entry) => entry.id === unitId);
      if (!party) {
        return [];
      }
      const cards = [
        ...this.combat.drawPile,
        ...this.combat.discardPile,
        ...this.combat.hand,
      ].filter((card) => card.ownerId === party.id).length;
      const glyph = party.isCultivator ? `${CULTIVATOR_GLYPH} ` : "";
      const role = party.isCultivator
        ? "Your cultivator. If you fall, the run ends."
        : `Tier ${party.tier} Coreborn`;
      const status = isAlive(party) ? "" : "Fallen";
      return [
        `${glyph}${party.name}`,
        role,
        `${cards} cards in the deck`,
        status,
      ].filter((line) => line !== "");
    }
  };
}
