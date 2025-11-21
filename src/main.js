/*************************************************************************
 * File: main.js
 ************************************************************************* 
 * Application entrypoint
 * 
 * CONCEPTS:
 * 1. Integer Scaling: To prevent pixel distortion ("shimmering"), we calculate
 *    the largest whole number (integer) that fits the browser window and scale
 *    that canvas by that factor.
 * 2. Bootstrapping: Initializing the Phaser game engine with our config.
 */

import Phaser from 'phaser';
import { GAME } from "./config.js";
import { GameScene } from "./scenes/GameScene.js";
import { UIScene } from "./scenes/UIScene.js";

// Bootstraps the Phaser game instance with our scenes and config.
const config = {
  type: Phaser.AUTO,  // Automatically choose WebGL or Canvas rendering
  parent: 'game-container',
  width: GAME.width,  // Logical width (internal game resolution)
  height: GAME.height,  // Logical height
  backgroundColor: GAME.backgroundColor,
  pixelArt: true,   // Phaser setting to disable anti-aliasing on textures
  input: { gamepad: true },
  scale: {
    // Mode NONE means Phaser won't auto-scale the canvas via CSS.
    // We handle this manually in 'applyIntegerScale' to ensure perfect pixel ratios
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: GAME.width,
    height: GAME.height,
  },
  render: {
    antialias: false, // Ensure textures are drawn sharp
    roundPixels: true,  // Force coordinates to integers during render to prevent sub-pixel blurring
  },
  scene: [GameScene, UIScene],
  physics: { default: 'arcade' }, // Loaded but we use custom kinematic movement in this project
};

const game = new Phaser.Game(config);

/**
 * Calculates the max integer scale factor that fits the window.
 * e.g., If game is 640 wide and window is 1300, scale is 2 (1280px).
 * This ensures pixels are always 1x1, 2x2, 3x3, etc., never 2.5x2.5.
 * @returns 
 */

function applyIntegerScale() {
  const canvas = game.canvas;

  if (!canvas) return;

  const ww = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
  const wh = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;

  const scaleX = Math.floor(ww / GAME.width);
  const scaleY = Math.floor(wh / GAME.height);

  const factor = Math.max(1, Math.min(scaleX, scaleY));

  const displayW = GAME.width * factor;
  const displayH = GAME.height * factor;

  canvas.style.width = `${displayW}px`;
  canvas.style.height = `${displayH}px`;

  // CSS Absolute Centering
  canvas.style.position = 'absolute';
  canvas.style.left = '50%';
  canvas.style.top = '50%';
  canvas.style.transform = 'translate(-50%, -50%)';
}

window.addEventListener('resize', applyIntegerScale);
window.addEventListener('orientationchange', applyIntegerScale);

// Apply scaling immediately
requestAnimationFrame(applyIntegerScale);