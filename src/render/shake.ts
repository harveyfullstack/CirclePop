/** Trauma-based screen shake (Squirrel Eiserloh's "juice" talk): offset ∝ trauma². */
export class Shake {
  trauma = 0;
  x = 0;
  y = 0;
  enabled = true;
  private t = 0;

  add(amount: number): void {
    if (this.enabled) this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number, unit: number): void {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    const k = this.trauma * this.trauma;
    if (k <= 0.0001) {
      this.x = this.y = 0;
      return;
    }
    const m = 20 * unit * k;
    const t = this.t;
    this.x = m * (Math.sin(t * 47.3) * 0.6 + Math.sin(t * 91.7 + 1.3) * 0.4);
    this.y = m * (Math.sin(t * 53.9 + 4.1) * 0.6 + Math.sin(t * 83.1 + 2.7) * 0.4);
  }
}
