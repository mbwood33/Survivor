import Phaser from 'phaser';
import { GAME } from "./config.js";
import { GameScene } from "./scenes/GameScene.js";
import { UIScene } from "./scenes/UIScene.js";

// Bootstraps the Phaser game instance with our scenes and config.
const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME.width,
  height: GAME.height,
  backgroundColor: GAME.backgroundColor,
  pixelArt: true,
  input: { gamepad: true },
  scene: [GameScene, UIScene],
  physics: { default: 'arcade' }, // Arcade physics is not used directly; kept available for future
};

new Phaser.Game(config);
