import type { BattleSceneInput } from "./battleAssetRequests";

/**
 * Boots one battle on `parent`. The canvas fills the parent and resizes with it.
 * @param parent - Element Phaser will attach the game to
 * @param input - Party, enemies, deck, and room for this battle
 * @returns Handle to destroy the game instance
 */
export async function createDynamicGame(
  parent: HTMLElement,
  input: BattleSceneInput,
): Promise<{ destroy: () => void }> {
  const Phaser = await import("phaser");
  const { createBattleSceneClass } = await import("./battleScene");

  const game = new Phaser.Game({
    backgroundColor: "#f3efe4",
    disableContextMenu: true,
    loader: {
      crossOrigin: "anonymous",
      imageLoadType: "HTMLImageElement",
    },
    parent,
    scale: {
      height: "100%",
      mode: Phaser.Scale.RESIZE,
      parent,
      width: "100%",
    },
    scene: createBattleSceneClass(Phaser, input),
    type: Phaser.AUTO,
  });

  return {
    destroy: () => {
      game.destroy(true);
    },
  };
}
