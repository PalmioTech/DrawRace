/**
 * Settings: audio toggle + clear saved records. Reached from the Menu.
 * The audio flag is persisted and will gate sound playback once audio lands.
 */
import Phaser from 'phaser';
import { COLORS, DESIGN } from '../config/constants';
import { makeButton, type Button } from '../ui/Button';
import { addBackground, displayStyle, bodyStyle, glow } from '../ui/theme';
import { save } from '../data/SaveManager';

export class SettingsScene extends Phaser.Scene {
  private audioBtns: Button[] = [];
  private clearArmed = false;

  constructor() {
    super('Settings');
  }

  create(): void {
    const cx = DESIGN.width / 2;
    this.clearArmed = false;
    addBackground(this);

    const title = this.add
      .text(cx, 70, 'IMPOSTAZIONI', displayStyle(46, COLORS.trackBorder, '900'))
      .setOrigin(0.5);
    title.setLetterSpacing?.(5);
    glow(title, COLORS.trackBorder, 1.2);

    this.add
      .text(cx, 190, 'AUDIO', bodyStyle(18, COLORS.textDim, '700'))
      .setOrigin(0.5)
      .setLetterSpacing?.(4);
    this.audioBtns = [
      makeButton(this, cx - 110, 252, 190, 70, 'ON', () => this.setAudio(true)),
      makeButton(this, cx + 110, 252, 190, 70, 'OFF', () => this.setAudio(false)),
    ];

    // Danger zone: two-tap confirm, no dialog.
    const clearBtn = makeButton(
      this,
      cx,
      420,
      440,
      74,
      'CANCELLA RECORD',
      () => {
        const label = clearBtn.list[1] as Phaser.GameObjects.Text;
        if (!this.clearArmed) {
          this.clearArmed = true;
          label.setText('SICURO? TOCCA ANCORA');
        } else {
          save.clearBestTimes();
          this.clearArmed = false;
          label.setText('RECORD CANCELLATI');
        }
      },
      0xff3b3b,
    );

    makeButton(this, cx, DESIGN.height - 70, 320, 80, 'INDIETRO', () => this.scene.start('Menu'), COLORS.accent);

    this.refresh();
  }

  private setAudio(on: boolean): void {
    save.setAudio(on);
    this.refresh();
  }

  private refresh(): void {
    this.audioBtns[0].setSelected(save.settings.audio);
    this.audioBtns[1].setSelected(!save.settings.audio);
  }
}
