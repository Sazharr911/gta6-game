// input.js — keyboard and mouse state for the game.
//
// One Input object owns the held-key set, the just-pressed edge set (cleared
// by the game loop at the end of each frame), and the mouse position in both
// screen and world space. The playtest drives the game by dispatching real
// keyboard and mouse events, and they land here exactly as a player's would.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width;
      this.mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
  }

  down(...names) {
    return names.some((n) => this.keys.has(n));
  }

  justPressed(...names) {
    return names.some((n) => this.pressed.has(n));
  }

  // Movement axes from WASD or the arrow keys: x right, y down, each -1..1.
  axes() {
    let x = 0;
    let y = 0;
    if (this.down('a', 'arrowleft')) x -= 1;
    if (this.down('d', 'arrowright')) x += 1;
    if (this.down('w', 'arrowup')) y -= 1;
    if (this.down('s', 'arrowdown')) y += 1;
    if (x !== 0 && y !== 0) {
      const s = Math.SQRT1_2;
      x *= s;
      y *= s;
    }
    return { x, y };
  }

  endFrame() {
    this.pressed.clear();
    this.mouseClicked = false;
  }
}
