/**
 * Boot scene. The MVP draws everything procedurally with Graphics (no image
 * assets), so this just hands straight off to the menu. Asset preloading would
 * go here later.
 */
import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  async create(): Promise<void> {
    // Wait for the web fonts so text renders in Orbitron/Rajdhani — but never
    // block boot more than a moment (offline / slow CDN falls back gracefully).
    const fonts = Promise.all([
      document.fonts.load('900 32px Orbitron'),
      document.fonts.load('700 24px Orbitron'),
      document.fonts.load('600 20px Rajdhani'),
      document.fonts.load('700 20px Rajdhani'),
    ]).catch(() => {});
    const timeout = new Promise((res) => window.setTimeout(res, 1500));
    await Promise.race([fonts, timeout]);

    // Phaser is up and fonts are ready — fade out the HTML loading screen.
    const loader = document.getElementById('loader');
    if (loader) {
      loader.classList.add('hide');
      window.setTimeout(() => loader.remove(), 500);
    }
    this.scene.start('Menu');
  }
}
