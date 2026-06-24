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
    this.scene.start('Menu');
  }
}
