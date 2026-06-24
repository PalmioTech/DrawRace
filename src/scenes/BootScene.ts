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

  create(): void {
    // Phaser is up and rendering — fade out the HTML loading screen.
    const loader = document.getElementById('loader');
    if (loader) {
      loader.classList.add('hide');
      window.setTimeout(() => loader.remove(), 500);
    }
    this.scene.start('Menu');
  }
}
