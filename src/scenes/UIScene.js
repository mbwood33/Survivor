import Phaser from 'phaser';
import { HUD } from "../ui/HUD.js";

// UIScene renders overlay UI (fixed to camera), pulling data from GameScene via events.
export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: "UIScene" });
  }

  create() {
    this.hud = new HUD(this);

    // Listen for player reference and updates from GameScene
    this.player = null;
    this.game.events.on("hud:set-player", (player) => {
      this.player = player;
    });

    // Fallback: try grabbing directly from GameScene if already created
    const gs = this.scene.get('GameScene');
    if (gs && gs.player) {
      this.player = gs.player;
    }
  }

  update() {
    if (this.player) {
      this.hud.updateFromPlayer(this.player);
    }
  }
}
