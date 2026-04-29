import { Game } from './core/Game';

async function main() {
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('renderCanvas missing');
  const game = new Game(canvas);
  (window as unknown as { __gta: Game }).__gta = game;
  await game.boot();
}

main().catch((err) => {
  // Render the error to the page so it's visible without devtools.
  console.error(err);
  const div = document.createElement('div');
  div.style.cssText =
    'position:fixed;inset:0;background:#0a0a0a;color:#ff6b6b;font:16px sans-serif;padding:24px;white-space:pre-wrap;';
  div.textContent = `${(err as Error).message ?? err}\n${(err as Error).stack ?? ''}`;
  document.body.appendChild(div);
});
