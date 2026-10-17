// Run from any directory: node scripts/generate_share_cards.mjs
// Uses the repo's existing browser tooling; the deployed site only needs the PNGs.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../frontend/public/assets/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const invitation of [false, true]) {
    await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;background:#2c303a;color:#f0f3f7;font-family:Arial,Helvetica,sans-serif}
      main{width:1200px;height:630px;padding:48px 60px;position:relative;overflow:hidden;background:radial-gradient(ellipse at 90% 30%,#64f69619,transparent 55%),linear-gradient(125deg,#2c303a,#242932)}
      header{display:flex;align-items:center;gap:12px;font-size:30px;font-weight:800;letter-spacing:-1.1px}
      .mark{display:grid;place-items:center;width:42px;height:42px;border-radius:10px;background:#64f696;color:#11291b;font-size:29px;box-shadow:0 0 35px #64f69626}
      .eyebrow{margin:52px 0 18px;color:#64f696;font-size:14px;font-weight:700;letter-spacing:3px;text-transform:uppercase}
      h1{margin:0;font-size:76px;line-height:1.04;letter-spacing:-4px;position:relative;z-index:1}em{font-style:normal;color:#64f696}
      .description{margin-top:25px;color:#bbc3cf;font-size:23px;line-height:1.5}
      .board{position:absolute;top:156px;right:58px;width:358px;padding:24px 23px 26px;border:1px solid #ffffff0d;border-radius:28px;background:linear-gradient(145deg,#303641,#272c35);box-shadow:12px 12px 30px #1a1e2688,-6px -6px 22px #3b424e66;transform:rotate(-5deg)}
      .label{color:#bbc3cf;font-size:11px;letter-spacing:1.4px;margin-bottom:22px;font-weight:700}
      .row{display:flex;gap:9px;margin-top:12px;padding-left:25px;position:relative}.stamp{position:absolute;left:-7px;top:15px;font-size:25px}
      .tile{display:grid;place-items:center;width:49px;height:57px;border-radius:10px;background:#505662;box-shadow:inset 2px 2px 5px #00000013;font-size:29px;font-weight:800}.green{background:#538d4e}.gold{background:#b59f3b}.empty{background:#2c303a;box-shadow:inset 3px 3px 7px #1a1e2688}
      .squad{display:flex;align-items:center;gap:10px;margin-top:23px;color:#bbc3cf;font-size:12px}.avatars{font-size:25px;letter-spacing:-6px;margin-right:4px}
      footer{position:absolute;bottom:44px;left:60px;right:60px;display:flex;justify-content:space-between;align-items:center;font-size:17px;color:#bbc3cf}.url{color:#f0f3f7;font-weight:700}.pill{padding:12px 20px;border-radius:30px;border:1px solid #64f69633;background:#64f6960a;color:#64f696;font-size:14px;letter-spacing:.3px}.edge{position:absolute;bottom:0;left:0;right:0;height:5px;background:linear-gradient(90deg,#64f696,#64f69611)}
    </style><main>
      <header><span class="mark">W</span>WordSquad</header>
      <p class="eyebrow">✦ ${invitation ? 'You’re invited' : 'Multiplayer wordplay'}</p>
      <h1>${invitation ? 'Your squad<br><em>is waiting.</em>' : 'Better words.<br><em>Better together.</em>'}</h1>
      <p class="description">${invitation ? 'Five letters. Six guesses. Let’s play.' : 'Five letters. Six guesses. One squad.'}</p>
      <div class="board">
        <div class="label">ONE BOARD. YOUR WHOLE SQUAD.</div>
        <div class="row"><span class="stamp">🦊</span>${[...'CRANE'].map((letter,i)=>`<span class="tile ${i===2?'gold':''}">${letter}</span>`).join('')}</div>
        <div class="row"><span class="stamp">🐸</span>${[...'SQUAD'].map(letter=>`<span class="tile green">${letter}</span>`).join('')}</div>
        <div class="row">${Array(5).fill('<span class="tile empty"></span>').join('')}</div>
        <div class="squad"><span class="avatars">🦊 🐸 🐻</span> A shared board. A shared win.</div>
      </div>
      <footer><span class="url">wordsquad.io</span><span class="pill">${invitation ? 'Bring your best guess ↗' : 'Make time for your people ↗'}</span></footer>
      <div class="edge"></div>
    </main></html>`);
    await page.screenshot({ path: `${output}wordsquad-${invitation ? 'invite' : 'share'}-v1.png` });
  }
} finally {
  await browser.close();
}
