const HEAD = `
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Hanken+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
`;

const RESET = `
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0b0c0f; --panel:#131519; --panel2:#181b21; --line:#262a32;
  --text:#e9e5db; --muted:#888d99; --accent:#ff8a3d; --accent2:#ffd6a0;
  --glow:rgba(255,138,61,.22); --ok:#7ee0a8; --err:#ff6b6b;
  --mono:'JetBrains Mono',monospace; --disp:'Syne',sans-serif; --body:'Hanken Grotesk',sans-serif;
}
html,body{height:100%}
body{
  background:var(--bg); color:var(--text); font-family:var(--body);
  background-image:
    radial-gradient(1200px 500px at 80% -10%, var(--glow), transparent 60%),
    linear-gradient(transparent 95%, rgba(255,255,255,.025) 95%),
    linear-gradient(90deg, transparent 95%, rgba(255,255,255,.025) 95%);
  background-size:auto, 28px 28px, 28px 28px;
  -webkit-font-smoothing:antialiased;
}
::selection{background:var(--accent);color:#1a1205}
button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit}
input,textarea{font-family:inherit}
a{color:var(--accent)}
.mono{font-family:var(--mono)}
`;

export function landingPage(): string {
  return `<!doctype html><html lang="en"><head>${HEAD}<title>forge · build a live website by chatting</title><style>${RESET}
  body{min-height:100dvh;display:flex;flex-direction:column}
  .wrap{width:min(92vw,920px);margin:0 auto;padding:0 4px}
  nav{display:flex;align-items:center;justify-content:space-between;padding:26px 0 0}
  nav .mark{font-family:var(--disp);font-weight:800;font-size:23px;letter-spacing:-.02em}
  nav .mark b{color:var(--accent)}
  nav a.enter{font-family:var(--mono);font-size:12px;color:var(--accent2);text-decoration:none;border:1px solid var(--line);
    padding:9px 16px;border-radius:99px;transition:border-color .15s,color .15s}
  nav a.enter:hover{border-color:var(--accent);color:var(--accent)}

  .hero{flex:1;display:flex;flex-direction:column;justify-content:center;padding:60px 0 40px}
  .eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);margin-bottom:20px}
  h1{font-family:var(--disp);font-weight:800;font-size:clamp(40px,7vw,76px);line-height:1.02;letter-spacing:-.03em;max-width:14ch}
  h1 b{color:var(--accent)}
  .lede{font-size:clamp(16px,2.2vw,20px);line-height:1.6;color:var(--muted);max-width:56ch;margin:24px 0 38px}
  .lede b{color:var(--text);font-weight:600}
  .cta{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
  .cta a.primary{background:var(--accent);color:#1a1205;font-family:var(--disp);font-weight:700;font-size:16px;
    padding:15px 26px;border-radius:12px;text-decoration:none;transition:filter .15s,transform .1s}
  .cta a.primary:hover{filter:brightness(1.08)}.cta a.primary:active{transform:translateY(1px)}
  .cta .note{font-family:var(--mono);font-size:11.5px;color:var(--muted)}

  .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:10px 0 70px}
  @media(max-width:720px){.steps{grid-template-columns:1fr}h1{max-width:none}.hero{padding:40px 0 28px}}
  .step{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:22px 22px 24px}
  .step .n{font-family:var(--disp);font-weight:800;font-size:15px;color:var(--accent);
    width:30px;height:30px;border-radius:9px;border:1px solid var(--line);display:grid;place-items:center;margin-bottom:14px}
  .step h3{font-family:var(--disp);font-weight:700;font-size:17px;letter-spacing:-.01em;margin-bottom:7px}
  .step p{font-size:13.5px;line-height:1.6;color:var(--muted)}
  .step p .mono{color:var(--accent2)}
  footer{border-top:1px solid var(--line);padding:18px 0 26px;font-family:var(--mono);font-size:11px;color:var(--muted);
    display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
  </style></head><body>
    <div class="wrap">
      <nav>
        <div class="mark">⬡ for<b>ge</b></div>
        <a class="enter" href="/login">Enter →</a>
      </nav>
      <section class="hero">
        <div class="eyebrow">worker site builder</div>
        <h1>Build a live website by just <b>chatting</b>.</h1>
        <p class="lede">Describe what you want and Forge writes it, ships it to its own
          <b>Cloudflare&nbsp;Worker</b> on a real URL, and shows you the result. Don't like something?
          Just say so — it rebuilds and redeploys while you watch. No code, no setup, no deploy step.</p>
        <div class="cta">
          <a class="primary" href="/login">Enter the forge →</a>
          <span class="note">one passphrase · ships to &lt;name&gt;.clydeford.net</span>
        </div>
      </section>
      <section class="steps">
        <div class="step"><div class="n">1</div><h3>Name it</h3><p>Pick a name — your site goes live at <span class="mono">&lt;name&gt;.clydeford.net</span>.</p></div>
        <div class="step"><div class="n">2</div><h3>Describe it</h3><p>Write a short brief of the site you want. A landing page, a tool, an AI-powered app — whatever.</p></div>
        <div class="step"><div class="n">3</div><h3>Ship &amp; refine</h3><p>Forge deploys it in seconds, then keeps editing it live as you chat. Your conversation is saved for next time.</p></div>
      </section>
      <footer><span>⬡ forge · clydeford.net</span><span>built on Cloudflare Workers</span></footer>
    </div>
  </body></html>`;
}

export function loginPage(error?: string): string {
  return `<!doctype html><html lang="en"><head>${HEAD}<title>forge · access</title><style>${RESET}
  body{display:grid;place-items:center}
  .card{width:min(92vw,400px);background:var(--panel);border:1px solid var(--line);
    border-radius:18px;padding:38px 34px;box-shadow:0 30px 80px -20px rgba(0,0,0,.8)}
  .mark{font-family:var(--disp);font-weight:800;font-size:30px;letter-spacing:-.02em}
  .mark b{color:var(--accent)}
  .sub{font-family:var(--mono);font-size:11px;color:var(--muted);letter-spacing:.18em;
    text-transform:uppercase;margin:6px 0 28px}
  label{font-family:var(--mono);font-size:11px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase}
  input{width:100%;margin-top:8px;background:var(--bg);border:1px solid var(--line);color:var(--text);
    padding:13px 14px;border-radius:11px;font-size:15px;outline:none;transition:border-color .15s,box-shadow .15s}
  input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--glow)}
  button{width:100%;margin-top:18px;background:var(--accent);color:#1a1205;font-weight:700;
    font-family:var(--disp);font-size:15px;padding:13px;border-radius:11px;letter-spacing:.01em;
    transition:transform .12s, filter .15s}
  button:hover{filter:brightness(1.07)}
  button:active{transform:translateY(1px)}
  .err{margin-top:16px;color:var(--err);font-family:var(--mono);font-size:12px;text-align:center}
  </style></head><body>
    <form class="card" method="POST" action="/login">
      <div class="mark">⬡ for<b>ge</b></div>
      <div class="sub">worker site builder</div>
      <label for="p">passphrase</label>
      <input id="p" name="password" type="password" autofocus autocomplete="current-password" />
      <button type="submit">Enter the forge</button>
      ${error ? `<div class="err">▲ ${error}</div>` : ""}
    </form>
  </body></html>`;
}

export function appPage(): string {
  return `<!doctype html><html lang="en"><head>${HEAD}<title>forge</title><style>${RESET}
  body{display:grid;grid-template-columns:300px 1fr 6px var(--preview-w,42%);height:100vh;overflow:hidden}
  @media(max-width:1100px){body{grid-template-columns:260px 1fr}#previewpane,#divider{display:none}}

  /* ---- draggable chat/preview divider ---- */
  #divider{cursor:col-resize;background:var(--line);position:relative;transition:background .15s}
  #divider::after{content:'';position:absolute;inset:0 -5px}
  #divider:hover,#divider.drag{background:var(--accent)}

  /* ---- sidebar ---- */
  aside{background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
  .brand{padding:20px 22px 16px;border-bottom:1px solid var(--line);display:grid;grid-template-columns:1fr auto;align-items:center;column-gap:10px;row-gap:5px;position:relative}
  .brand .sub{grid-column:1 / -1}
  .brand-actions{display:flex;align-items:center;gap:8px}
  .sites-btn{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);
    border:1px solid var(--line);padding:6px 10px;border-radius:8px;display:flex;align-items:center;gap:6px;white-space:nowrap;transition:color .15s,border-color .15s}
  .sites-btn:hover,.sites-btn.open{color:var(--accent);border-color:var(--accent)}
  .sites-btn .cnt{background:var(--line);color:var(--text);border-radius:99px;padding:1px 6px;font-size:9.5px;min-width:16px;text-align:center}
  .sites-btn:hover .cnt,.sites-btn.open .cnt{background:var(--accent);color:#1a1205}
  .brand a.logout{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);
    text-decoration:none;border:1px solid var(--line);padding:6px 10px;border-radius:8px;white-space:nowrap;transition:color .15s,border-color .15s}
  .brand a.logout:hover{color:var(--accent);border-color:var(--accent)}
  .sites-panel{position:absolute;top:100%;left:0;right:0;margin-top:2px;z-index:40;background:var(--panel2);
    border:1px solid var(--line);border-radius:12px;box-shadow:0 28px 70px -26px rgba(0,0,0,.85);
    max-height:min(62vh,440px);overflow:auto;padding:10px;display:none}
  .sites-panel.open{display:block}
  .sites-panel h2{font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:6px 8px 10px}
  .brand .mark{font-family:var(--disp);font-weight:800;font-size:23px;letter-spacing:-.02em}
  .brand .mark b{color:var(--accent)}
  .brand .sub{font-family:var(--mono);font-size:9.5px;color:var(--muted);letter-spacing:.2em;text-transform:uppercase;margin-top:3px}

  .new{padding:18px 18px 20px;border-bottom:1px solid var(--line)}
  .new h2{font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
  .field{display:block;margin-bottom:11px}
  .urlrow{display:flex;align-items:center;background:var(--bg);border:1px solid var(--line);border-radius:10px;overflow:hidden}
  .urlrow input{flex:1;min-width:0;background:none;border:none;color:var(--text);padding:11px 12px;font-size:13px;outline:none;font-family:var(--mono)}
  .urlrow .zone{font-family:var(--mono);font-size:12px;color:var(--muted);padding:0 12px 0 0;white-space:nowrap}
  textarea#spec{width:100%;background:var(--bg);border:1px solid var(--line);color:var(--text);border-radius:10px;
    padding:11px 12px;font-size:13.5px;line-height:1.5;resize:vertical;min-height:280px;outline:none}
  .urlrow input:focus,textarea#spec:focus{border-color:var(--accent)}
  .urlrow:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--glow)}
  textarea#spec:focus{box-shadow:0 0 0 3px var(--glow)}
  .forge-btn{width:100%;background:var(--accent);color:#1a1205;font-family:var(--disp);font-weight:700;font-size:14px;
    padding:11px;border-radius:10px;transition:filter .15s,transform .1s;display:flex;align-items:center;justify-content:center;gap:7px}
  .forge-btn:hover{filter:brightness(1.08)}.forge-btn:active{transform:translateY(1px)}
  .forge-btn[disabled]{opacity:.45;cursor:not-allowed}

  /* ---- onboarding step pulses ---- */
  @keyframes stepPulse{0%,100%{box-shadow:0 0 0 0 var(--glow)}50%{box-shadow:0 0 0 6px var(--glow)}}
  .pulse-step{animation:stepPulse 1.7s ease-in-out infinite;border-color:var(--accent)!important}
  .stephint{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;
    color:var(--accent2);margin:-2px 0 12px;display:none}
  .stephint.on{display:block}
  .stephint b{color:var(--accent)}

  .site{display:flex;align-items:center;gap:10px;padding:10px 11px;border-radius:10px;border:1px solid transparent;cursor:pointer;transition:background .12s,border-color .12s}
  .site:hover{background:var(--panel2)}
  .site.active{background:var(--panel2);border-color:var(--line)}
  .site .dot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 9px var(--accent);flex:none}
  .site .meta{flex:1;min-width:0}
  .site .nm{font-weight:600;font-size:13.5px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .site .ur{font-family:var(--mono);font-size:10.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .site .del{opacity:0;color:var(--muted);font-size:17px;line-height:1;padding:2px 4px;border-radius:6px;transition:opacity .12s,color .12s,background .12s}
  .site:hover .del{opacity:1}
  .site .del:hover{color:var(--err);background:rgba(255,107,107,.1)}
  .empty{color:var(--muted);font-size:13px;padding:14px 9px;line-height:1.6}

  /* ---- chat ---- */
  main{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--bg)}
  .chead{display:flex;align-items:center;gap:14px;padding:16px 24px;border-bottom:1px solid var(--line)}
  .chead-id{flex:1;min-width:0}
  .chead .t{font-family:var(--disp);font-weight:700;font-size:17px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .chead .u{font-family:var(--mono);font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .chead-sites{display:none;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);
    border:1px solid var(--line);padding:7px 11px;border-radius:8px;white-space:nowrap;transition:color .15s,border-color .15s}
  .chead-sites:hover{color:var(--accent);border-color:var(--accent)}
  .backbtn{display:none;place-items:center;font-size:20px;color:var(--muted);padding:2px 9px;border-radius:9px;line-height:1}
  .backbtn:hover{color:var(--text);background:var(--panel2)}
  .openlink{margin-left:auto;font-family:var(--mono);font-size:11px;letter-spacing:.03em;color:var(--accent2);border:1px solid var(--line);padding:6px 12px;border-radius:99px;text-decoration:none;white-space:nowrap;transition:border-color .15s,color .15s}
  .openlink:hover{border-color:var(--accent);color:var(--accent)}
  .openlink.hidden{display:none}
  .pill{margin-left:auto;font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;
    padding:5px 11px;border-radius:99px;border:1px solid var(--line);color:var(--muted);display:flex;align-items:center;gap:7px}
  .pill .d{width:6px;height:6px;border-radius:50%;background:var(--muted)}
  .pill.live{color:var(--ok);border-color:rgba(126,224,168,.3)}.pill.live .d{background:var(--ok);box-shadow:0 0 8px var(--ok)}
  .pill.work{color:var(--accent2);border-color:rgba(255,138,61,.35)}.pill.work .d{background:var(--accent);animation:pulse 1s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}

  #chat{flex:1;overflow:auto;padding:26px 24px;display:flex;flex-direction:column;gap:18px}
  .welcome{margin:auto;max-width:440px;text-align:center;color:var(--muted)}
  .welcome .big{font-family:var(--disp);font-weight:800;font-size:26px;color:var(--text);letter-spacing:-.02em;margin-bottom:12px}
  .welcome .big b{color:var(--accent)}
  .welcome p{font-size:14px;line-height:1.7}
  .msg{max-width:82%;display:flex;flex-direction:column;gap:5px}
  .msg .who{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
  .msg .bub{padding:13px 16px;border-radius:14px;font-size:14.5px;line-height:1.62;white-space:pre-wrap;word-break:break-word}
  .msg.user{align-self:flex-end;align-items:flex-end}
  .msg.user .bub{background:var(--accent);color:#1a1205;border-bottom-right-radius:5px;font-weight:500}
  .msg.bot{align-self:flex-start}
  .msg.bot .bub{background:var(--panel);border:1px solid var(--line);border-bottom-left-radius:5px}
  .msg.sys{align-self:center;max-width:90%}
  .msg.sys .bub{background:transparent;border:1px dashed var(--line);color:var(--muted);font-family:var(--mono);font-size:12px;text-align:center}
  .deploy{align-self:flex-start;display:flex;align-items:center;gap:9px;font-family:var(--mono);font-size:12px;color:var(--accent2);padding:4px 2px}
  .deploy .spin{width:13px;height:13px;border:2px solid rgba(255,138,61,.3);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .deploy.done{color:var(--ok)}
  .deploy.done a{color:var(--ok);text-decoration:underline}
  .deploy .verb{transition:opacity .18s}

  /* ---- build-complete announcement ---- */
  @keyframes annPop{0%{transform:scale(.95);opacity:0}60%{transform:scale(1.02)}100%{transform:scale(1);opacity:1}}
  @keyframes annSpin{to{transform:rotate(360deg)}}
  .announce{align-self:flex-start;max-width:min(94%,440px);display:flex;align-items:center;gap:14px;
    background:linear-gradient(135deg,rgba(255,138,61,.18),rgba(255,138,61,.04));
    border:1px solid rgba(255,138,61,.4);border-radius:16px;padding:14px 16px;
    animation:annPop .5s cubic-bezier(.2,.8,.2,1) both}
  .announce .spark{font-size:22px;color:var(--accent);line-height:1;animation:annSpin 3.5s linear infinite}
  .announce .body{flex:1;min-width:0}
  .announce .title{font-family:var(--disp);font-weight:800;font-size:16px;letter-spacing:-.01em;color:var(--text);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .announce .url{font-family:var(--mono);font-size:11.5px;color:var(--accent2);margin-top:2px;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .announce .open{background:var(--accent);color:#1a1205;font-family:var(--disp);font-weight:700;font-size:13.5px;
    padding:10px 16px;border-radius:10px;text-decoration:none;white-space:nowrap;transition:filter .15s,transform .1s}
  .announce .open:hover{filter:brightness(1.08)}.announce .open:active{transform:translateY(1px)}
  .announce.prov{align-items:flex-start}
  .announce .note{font-family:var(--mono);font-size:11px;line-height:1.55;color:var(--accent2);margin-top:8px;white-space:normal}
  .buildlog{align-self:flex-start;max-width:min(94%,560px);background:#0a0b0e;border:1px solid var(--line);
    border-radius:12px;padding:10px 12px;font-family:var(--mono);font-size:11px;line-height:1.5;
    color:var(--muted);white-space:pre-wrap;max-height:220px;overflow:auto}
  .buildlog.fail{border-color:var(--err);color:var(--err)}

  /* ---- confetti burst ---- */
  .confetti{position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden}
  .confetti i{position:absolute;top:46%;left:50%;width:9px;height:9px;border-radius:2px;animation:conf 1s ease-out forwards}
  @keyframes conf{0%{opacity:1;transform:translate(-50%,-50%)}100%{opacity:0;transform:translate(calc(-50% + var(--x)),calc(-50% + var(--y))) rotate(var(--r))}}
  .cursor::after{content:'▋';color:var(--accent);animation:blink 1s step-end infinite;margin-left:1px}
  @keyframes blink{50%{opacity:0}}

  .composer{padding:16px 20px;border-top:1px solid var(--line)}
  .cbox{display:flex;gap:10px;align-items:flex-end;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:9px 9px 9px 15px;transition:border-color .15s,box-shadow .15s}
  .cbox:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--glow)}
  .cbox textarea{flex:1;background:none;border:none;color:var(--text);resize:none;outline:none;font-size:14.5px;line-height:1.5;max-height:160px;padding:6px 0}
  .send{background:var(--accent);color:#1a1205;width:38px;height:38px;border-radius:10px;font-size:17px;flex:none;display:grid;place-items:center;transition:filter .15s,transform .1s}
  .send:hover{filter:brightness(1.08)}.send:active{transform:translateY(1px)}
  .send[disabled]{opacity:.4;cursor:not-allowed}
  .hint{font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:8px;text-align:center;letter-spacing:.04em}

  /* ---- preview ---- */
  #previewpane{background:var(--panel);border-left:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
  .browser{margin:14px;flex:1;border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;background:#fff;box-shadow:0 24px 60px -28px rgba(0,0,0,.7)}
  .bbar{display:flex;align-items:center;gap:11px;padding:11px 14px;background:var(--panel2);border-bottom:1px solid var(--line)}
  .dots{display:flex;gap:6px}.dots i{width:11px;height:11px;border-radius:50%;display:block}
  .dots i:nth-child(1){background:#ff5f57}.dots i:nth-child(2){background:#febc2e}.dots i:nth-child(3){background:#28c840}
  .addr{flex:1;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:7px 12px;font-family:var(--mono);font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .addr b{color:var(--accent2);font-weight:500}
  .refresh{color:var(--muted);font-size:15px;padding:3px 6px;border-radius:7px}.refresh:hover{color:var(--text);background:var(--bg)}
  .frame{flex:1;position:relative;background:#fff}
  #preview{width:100%;height:100%;border:none;display:block}
  .noprev{position:absolute;inset:0;display:grid;place-items:center;background:var(--panel);color:var(--muted);text-align:center;padding:30px}
  .noprev .g{font-family:var(--disp);font-size:42px;opacity:.3;margin-bottom:14px}
  .noprev p{font-size:13px;line-height:1.6;font-family:var(--mono)}

  /* ---- mobile: two-view switch (sites <-> chat), no preview ---- */
  @media(max-width:720px){
    body{display:block;height:100dvh;overflow:hidden}
    aside{height:100dvh;width:100%;border-right:none}
    main{display:none;height:100dvh;width:100%}
    body.show-chat aside{display:none}
    body.show-chat main{display:flex}
    #previewpane,#divider{display:none}
    .backbtn{display:grid}
    .chead-sites{display:inline-flex;align-items:center}
    .chead .pill{display:none}
    .chead{padding:13px 14px;overflow:hidden}
    #chat{padding:20px 16px}
    .composer{padding:13px 14px calc(13px + env(safe-area-inset-bottom))}
    .new{padding:16px 16px 18px}
    .msg{max-width:90%}
  }
  </style></head><body>

  <aside>
    <div class="brand">
      <div class="mark">⬡ for<b>ge</b></div>
      <div class="brand-actions">
        <button class="sites-btn" id="sitesBtn" type="button">sites <span class="cnt" id="siteCount">0</span></button>
        <a class="logout" href="/logout" title="Log out">log out</a>
      </div>
      <div class="sub">clydeford · worker builder</div>
      <div class="sites-panel" id="sitesPanel">
        <h2>your sites</h2>
        <div id="siteList"><div class="empty">No sites yet. Name one and describe it above to forge your first.</div></div>
      </div>
    </div>
    <form class="new" id="new-site" autocomplete="off">
      <h2>+ new site</h2>
      <div class="stephint" id="stepHint"></div>
      <div class="field urlrow">
        <input id="name" placeholder="my-site" maxlength="63" />
        <span class="zone">.clydeford.net</span>
      </div>
      <label class="field"><textarea id="spec" placeholder="Describe the site to build — e.g. a neon retro landing page for a synthwave band with an email signup."></textarea></label>
      <button class="forge-btn" type="submit" id="createBtn">⚒ Forge it</button>
    </form>
  </aside>

  <main>
    <div class="chead">
      <button class="backbtn" id="backBtn" title="Back to sites">←</button>
      <div class="chead-id"><div class="t" id="hTitle">No site selected</div><div class="u" id="hUrl">pick or create a site →</div></div>
      <button class="chead-sites" id="cheadSites" type="button" title="Switch site">sites</button>
      <a class="openlink hidden" id="openLink" target="_blank" rel="noopener">open ↗</a>
      <div class="pill" id="pill"><span class="d"></span><span id="pillTxt">idle</span></div>
    </div>
    <div id="chat">
      <div class="welcome" id="welcome">
        <div class="big">Build a worker, <b>live</b>.</div>
        <p>Name a site and describe it. Forge ships it to <span class="mono">&lt;name&gt;.clydeford.net</span> on its own Cloudflare Worker, then refine it by chatting.</p>
      </div>
    </div>
    <div class="composer">
      <div class="cbox">
        <textarea id="input" rows="1" placeholder="Select a site to start building…" disabled></textarea>
        <button class="send" id="send" disabled>↑</button>
      </div>
      <div class="hint">enter to send · shift+enter for newline</div>
    </div>
  </main>

  <div class="divider" id="divider" title="Drag to resize · double-click to reset"></div>

  <section id="previewpane">
    <div class="browser">
      <div class="bbar">
        <div class="dots"><i></i><i></i><i></i></div>
        <div class="addr" id="addr">https://<b>—</b></div>
        <button class="refresh" id="refresh" title="Refresh preview">⟳</button>
      </div>
      <div class="frame">
        <iframe id="preview" title="preview"></iframe>
        <div class="noprev" id="noprev"><div><div class="g">⬡</div><p>live preview appears here<br/>once you forge a site</p></div></div>
      </div>
    </div>
  </section>

  <script>${APP_JS}</script>
  </body></html>`;
}

// Client logic. No backticks / no ${...} so it can live inside the page template.
const APP_JS = `
(function(){
  var ZONE = 'clydeford.net';
  var BUILD_VERBS = ['Forging the worker','Compiling your code','Bundling modules',
    'Wiring up routes','Shipping to the edge','Spinning up the runtime','Warming the cache'];
  var state = { active:null, busy:false, building:false, streamLost:false };
  var $ = function(id){ return document.getElementById(id); };

  function confetti(){
    var colors=['#ff8a3d','#ffd6a0','#7ee0a8','#e9e5db'];
    var box=document.createElement('div'); box.className='confetti';
    for(var i=0;i<26;i++){
      var p=document.createElement('i');
      p.style.background=colors[i%colors.length];
      p.style.setProperty('--x',((Math.random()*2-1)*260)+'px');
      p.style.setProperty('--y',((Math.random()*2-1)*220-40)+'px');
      p.style.setProperty('--r',(Math.random()*540-270)+'deg');
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function(){ box.remove(); }, 1200);
  }

  var verbTimer=null;
  function stopVerbs(){ if(verbTimer){ clearInterval(verbTimer); verbTimer=null; } }
  function isMobile(){ return window.matchMedia('(max-width:720px)').matches; }

  var chat=$('chat'), input=$('input'), send=$('send'), pill=$('pill'), pillTxt=$('pillTxt');
  var hTitle=$('hTitle'), hUrl=$('hUrl'), addr=$('addr'), preview=$('preview'), noprev=$('noprev');
  var siteList=$('siteList'), welcome=$('welcome'), openLink=$('openLink');
  var stepHint=$('stepHint'), specEl=$('spec'), nameWrap=document.querySelector('#new-site .urlrow');
  var sitesPanel=$('sitesPanel'), sitesBtn=$('sitesBtn'), siteCount=$('siteCount');
  function closeSites(){ sitesPanel.classList.remove('open'); sitesBtn.classList.remove('open'); }

  function setPill(kind, txt){ pill.className='pill'+(kind?(' '+kind):''); pillTxt.textContent=txt; }

  function api(path, opts){ return fetch(path, Object.assign({headers:{'content-type':'application/json'}}, opts||{})); }

  function loadSites(){
    api('/api/sites').then(function(r){return r.json();}).then(renderSites);
  }
  // Guide first-time users: pulse the name field (step 1), then the brief (step 2).
  function setStep(n){
    nameWrap.classList.toggle('pulse-step', n===1);
    specEl.classList.toggle('pulse-step', n===2);
    if(!n){ stepHint.classList.remove('on'); return; }
    stepHint.classList.add('on');
    stepHint.innerHTML = n===1 ? 'Step <b>1</b> — name your site' : 'Step <b>2</b> — describe what to build';
  }
  // Pulse step 1 (name) until named, then step 2 (brief) until described — whenever the form is empty.
  function refreshOnboarding(){
    setStep(!$('name').value.trim() ? 1 : (!specEl.value.trim() ? 2 : 0));
  }

  var recoveredOnce=false;
  function renderSites(sites){
    refreshOnboarding();
    siteCount.textContent = sites.length;
    if(!recoveredOnce){ recoveredOnce=true; maybeRecoverOnLoad(sites); }
    sites.sort(function(a,b){return (b.updatedAt||0)-(a.updatedAt||0);});
    if(!sites.length){ siteList.innerHTML='<div class="empty">No sites yet. Name one and describe it above to forge your first.</div>'; return; }
    siteList.innerHTML='';
    sites.forEach(function(s){
      var row=document.createElement('div'); row.className='site'+(s.name===state.active?' active':'');
      var host=s.name+'.'+ZONE;
      row.innerHTML='<span class="dot"></span><div class="meta"><div class="nm"></div><div class="ur"></div></div><button class="del" title="Delete">×</button>';
      row.querySelector('.nm').textContent=s.name;
      row.querySelector('.ur').textContent=host;
      row.addEventListener('click', function(e){ if(e.target.classList.contains('del'))return; selectSite(s.name, s.url||('https://'+host)); });
      row.querySelector('.del').addEventListener('click', function(e){ e.stopPropagation(); delSite(s.name); });
      siteList.appendChild(row);
    });
  }

  function selectSite(name, url){
    state.active=name;
    try{ localStorage.setItem('forge_active', name); }catch(e){} // remember for reload recovery
    hTitle.textContent=name; hUrl.textContent=url;
    openLink.href=url; openLink.classList.remove('hidden');
    document.body.classList.add('show-chat'); // mobile: switch to chat view
    addr.innerHTML='https://<b>'+name+'.'+ZONE+'</b>';
    input.disabled=false; send.disabled=false; input.placeholder='Tell Forge what to build or change…';
    setPill('','ready');
    if(welcome) welcome.remove();
    chat.innerHTML='';
    closeSites();
    setPreview(url);
    loadSites();
    if(!isMobile()) input.focus(); // mobile: don't pop the keyboard on site select
    loadHistory(name);
  }

  function renderHistory(messages){
    messages.forEach(function(m){
      if(m.role==='user'){ bubble('user','you').textContent=m.content; }
      else if(m.content && m.content!=='(deployed)'){ bubble('bot','forge').textContent=m.content; }
      else { sysLine('▸ deployed'); }
    });
  }

  // The build runs server-side regardless of the client connection. These helpers
  // let a client that lost the stream (mobile app-switch, screen sleep, reload)
  // rejoin: load saved history, and if a build is still in progress, poll until done.
  var pollTimer=null;
  function pollStop(){ if(pollTimer){ clearTimeout(pollTimer); pollTimer=null; } }

  function finalizeIdle(d){
    pollStop(); stopVerbs();
    state.building=false; state.busy=false; state.streamLost=false;
    send.disabled=false; input.disabled=false;
    if(pill.className.indexOf('live')<0) setPill('','ready');
    if(d && d.url) setPreview(d.url);
  }

  function loadHistory(name){
    pollStop();
    api('/api/sites/'+name+'/history')
      .then(function(r){ return r.ok ? r.json() : {messages:[]}; })
      .then(function(d){
        if(state.active!==name) return; // user switched sites while loading
        renderHistory((d&&d.messages)||[]);
        if(d && d.status==='building'){
          // A turn is still running server-side — show it and poll to completion.
          state.building=true; state.busy=true; send.disabled=true; input.disabled=true;
          setPill('work','building');
          var el=document.createElement('div'); el.className='deploy';
          el.innerHTML='<span class="spin"></span> finishing your build…';
          chat.appendChild(el);
          pollStatus(name);
        } else {
          sysLine('▸ session opened for '+name+'.'+ZONE);
          finalizeIdle(d);
        }
        chat.scrollTop=chat.scrollHeight;
      })
      .catch(function(){
        if(state.active!==name) return;
        sysLine('▸ session opened for '+name+'.'+ZONE);
      });
  }

  function pollStatus(name){
    pollStop();
    var tries=0;
    (function loop(){
      pollTimer=setTimeout(function(){
        if(state.active!==name) return;
        api('/api/sites/'+name+'/history')
          .then(function(r){ return r.json(); })
          .then(function(d){
            if(state.active!==name) return;
            if(d.status==='building' && ++tries<60){ loop(); return; } // ~150s max
            chat.innerHTML='';
            renderHistory(d.messages||[]);
            sysLine(d.status==='building' ? '▸ still building — tap a site again to refresh' : '▸ build finished');
            finalizeIdle(d);
            chat.scrollTop=chat.scrollHeight;
          })
          .catch(function(){ if(++tries<60){ loop(); } else { finalizeIdle(null); } });
      }, 2500);
    })();
  }

  // Came back to the app (foreground / bfcache restore) after losing a build's stream.
  function recover(){
    if(!state.active || !state.building) return;
    window.__bl=null; // detached by the chat clear below — drop the stale ref so a new build log is created
    chat.innerHTML='';
    loadHistory(state.active);
  }

  // On first load, if the last-open site has a build in progress, rejoin it.
  function maybeRecoverOnLoad(sites){
    var last; try{ last=localStorage.getItem('forge_active'); }catch(e){}
    if(!last || state.active) return;
    var match=sites.filter(function(s){ return s.name===last; })[0];
    if(!match) return;
    api('/api/sites/'+last+'/history').then(function(r){ return r.json(); }).then(function(d){
      if(d && d.status==='building' && !state.active){
        selectSite(match.name, match.url||('https://'+match.name+'.'+ZONE));
      }
    }).catch(function(){});
  }

  function setPreview(url){
    if(!url){ noprev.style.display='grid'; return; }
    noprev.style.display='none';
    preview.src=url+'?t='+Date.now();
  }

  function bubble(kind, who){
    var m=document.createElement('div'); m.className='msg '+kind;
    var w=document.createElement('div'); w.className='who'; w.textContent=who;
    var b=document.createElement('div'); b.className='bub';
    if(kind!=='sys') m.appendChild(w);
    m.appendChild(b); chat.appendChild(m); chat.scrollTop=chat.scrollHeight;
    return b;
  }
  function sysLine(t){ var b=bubble('sys',''); b.textContent=t; }

  function createSite(e){
    e.preventDefault();
    var name=$('name').value.trim(); var spec=$('spec').value.trim();
    if(!name){ $('name').focus(); return; }
    var btn=$('createBtn'); btn.disabled=true;
    api('/api/sites',{method:'POST',body:JSON.stringify({name:name})})
      .then(function(r){ return r.json().then(function(d){ return {ok:r.ok,d:d}; }); })
      .then(function(res){
        btn.disabled=false;
        if(!res.ok){ alert(res.d.error||'Could not create site'); return; }
        $('name').value=''; $('spec').value='';
        selectSite(res.d.name, res.d.url);
        if(spec) sendMessage(spec);
      }).catch(function(){ btn.disabled=false; });
  }

  function sendMessage(text){
    if(state.busy||!state.active) return;
    state.busy=true; state.building=true; state.streamLost=false; send.disabled=true; input.disabled=true;
    var ub=bubble('user','you'); ub.textContent=text;
    var bb=bubble('bot','forge'); bb.classList.add('cursor');
    setPill('work','thinking');
    var deployEl=null;

    api('/api/sites/'+state.active+'/chat',{method:'POST',body:JSON.stringify({message:text})})
      .then(function(r){
        var reader=r.body.getReader(); var dec=new TextDecoder(); var buf='';
        function pump(){
          return reader.read().then(function(res){
            if(res.done){ finish(); return; }
            buf+=dec.decode(res.value,{stream:true});
            var parts=buf.split('\\n\\n'); buf=parts.pop();
            parts.forEach(function(line){
              line=line.trim(); if(line.indexOf('data:')!==0) return;
              var ev; try{ ev=JSON.parse(line.slice(5).trim()); }catch(e){ return; }
              handle(ev);
            });
            return pump();
          });
        }
        function handle(ev){
          if(ev.type==='text'){ bb.textContent+=ev.text; chat.scrollTop=chat.scrollHeight; }
          else if(ev.type==='deploying'){
            setPill('work','building');
            deployEl=document.createElement('div'); deployEl.className='deploy';
            deployEl.innerHTML='<span class="spin"></span> <span class="verb">'+BUILD_VERBS[0]+'…</span>';
            chat.appendChild(deployEl); chat.scrollTop=chat.scrollHeight;
            var vi=0;
            verbTimer=setInterval(function(){
              vi=(vi+1)%BUILD_VERBS.length;
              var v=deployEl&&deployEl.querySelector('.verb'); if(!v) return;
              v.style.opacity='0';
              setTimeout(function(){ v.textContent=BUILD_VERBS[vi]+'…'; v.style.opacity='1'; }, 180);
            }, 1100);
          }
          else if(ev.type==='provisioning'){
            // Worker is deployed, but the edge TLS cert for a brand-new
            // subdomain is still being issued. Tell the user it's first-deploy.
            stopVerbs(); setPill('work','provisioning');
            if(deployEl){
              var v=deployEl.querySelector('.verb');
              if(v) v.textContent='Provisioning TLS certificate — first deploys can take a few minutes…';
            }
          }
          else if(ev.type==='building_project'){
            stopVerbs(); setPill('work','building');
            if(!window.__bl){
              window.__bl=document.createElement('div'); window.__bl.className='buildlog';
              chat.appendChild(window.__bl);
            }
            window.__bl.textContent='Building project…\\n';
            chat.scrollTop=chat.scrollHeight;
          }
          else if(ev.type==='build_log'){
            if(window.__bl){ window.__bl.textContent+=ev.line+'\\n'; window.__bl.scrollTop=window.__bl.scrollHeight; }
          }
          else if(ev.type==='build_failed'){
            stopVerbs(); state.building=false; setPill('','error');
            if(window.__bl){ window.__bl.className='buildlog fail'; window.__bl.textContent+='\\n▲ '+ev.error+'\\n'; }
            window.__bl=null;
          }
          else if(ev.type==='deployed'){
            stopVerbs(); setPill('live','live');
            var host=ev.url.replace('https://','');
            if(deployEl){
              deployEl.className='announce'+(ev.provisioning?' prov':'');
              var note=ev.provisioning
                ? '<div class="note">⏳ First deploy — SSL is still activating. Your site can take a few minutes to load; refresh the page if it doesn\\'t open right away.</div>'
                : '';
              deployEl.innerHTML='<span class="spark">✦</span>'
                +'<div class="body"><div class="title">'+(ev.provisioning?'Your site is almost live':'Your site is live')+'</div>'
                +'<div class="url">'+host+'</div>'+note+'</div>'
                +'<a class="open" href="'+ev.url+'" target="_blank" rel="noopener">Open ↗</a>';
            }
            confetti();
            setTimeout(function(){ setPreview(ev.url); }, 1200);
            window.__bl=null;
          }
          else if(ev.type==='error'){ stopVerbs(); state.building=false; setPill('','error'); var eb=bubble('sys',''); eb.style.color='var(--err)'; eb.textContent='▲ '+ev.message; }
        }
        function finish(){
          stopVerbs();
          state.building=false; state.streamLost=false;
          bb.classList.remove('cursor');
          if(!bb.textContent) bb.textContent='(done)';
          if(pill.className.indexOf('live')<0) setPill('','ready');
          state.busy=false; send.disabled=false; input.disabled=false;
          if(!isMobile()) input.focus(); // mobile: don't pop the keyboard after a turn finishes
        }
        return pump();
      })
      .catch(function(){
        // The stream died (often a mobile app-switch / screen sleep). The build keeps
        // running server-side — rejoin and poll for the result instead of giving up.
        stopVerbs(); bb.classList.remove('cursor');
        state.streamLost=true;
        if(state.building && state.active){ recover(); }
        else { setPill('','error'); state.busy=false; send.disabled=false; input.disabled=false; }
      });
  }

  function delSite(name){
    if(!confirm('Delete '+name+' permanently?\\n\\nThis removes every trace: the worker, the '+name+'.'+ZONE+' domain and its DNS record, and all chat history. This cannot be undone.')) return;
    api('/api/sites/'+name,{method:'DELETE'}).then(function(){
      if(state.active===name){ state.active=null; hTitle.textContent='No site selected'; hUrl.textContent='pick or create a site →';
        addr.innerHTML='https://<b>—</b>'; setPreview(null); input.disabled=true; send.disabled=true; setPill('','idle');
        openLink.classList.add('hidden'); document.body.classList.remove('show-chat'); }
      loadSites();
    });
  }

  function autoGrow(){ input.style.height='auto'; input.style.height=Math.min(input.scrollHeight,160)+'px'; }

  $('new-site').addEventListener('submit', createSite);
  send.addEventListener('click', function(){ var v=input.value.trim(); if(v){ input.value=''; autoGrow(); sendMessage(v); } });
  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', function(e){ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); var v=input.value.trim(); if(v){ input.value=''; autoGrow(); sendMessage(v); } } });
  $('name').addEventListener('input', function(){ this.value=this.value.toLowerCase().replace(/[^a-z0-9-]/g,'-'); refreshOnboarding(); });
  specEl.addEventListener('input', refreshOnboarding);
  $('refresh').addEventListener('click', function(){ if(state.active) setPreview('https://'+state.active+'.'+ZONE); });
  document.addEventListener('visibilitychange', function(){
    // Returned to foreground after the stream was lost (backgrounding aborts it) → rejoin.
    if(document.visibilityState==='visible' && state.active && state.building && state.streamLost) recover();
  });
  window.addEventListener('pageshow', function(e){
    // Restored from bfcache/freeze (mobile screen sleep / back-forward) → the stream is dead; rejoin.
    if(e.persisted && state.active && state.building) recover();
  });
  $('backBtn').addEventListener('click', function(){ document.body.classList.remove('show-chat'); }); // mobile: back to sites
  $('cheadSites').addEventListener('click', function(e){ // mobile: open sites list from the chat header
    e.stopPropagation();
    document.body.classList.remove('show-chat');
    sitesPanel.classList.add('open'); sitesBtn.classList.add('open');
  });
  sitesBtn.addEventListener('click', function(e){ e.stopPropagation(); var open=sitesPanel.classList.toggle('open'); sitesBtn.classList.toggle('open', open); });
  document.addEventListener('click', function(e){
    if(!sitesPanel.classList.contains('open')) return;
    if(sitesBtn.contains(e.target) || sitesPanel.contains(e.target)) return;
    closeSites();
  });

  // ---- draggable chat/preview divider ----
  (function(){
    var divider=$('divider'), root=document.documentElement, KEY='forge_preview_w';
    var saved=localStorage.getItem(KEY);
    if(saved) root.style.setProperty('--preview-w', saved);
    function clamp(w){
      var min=320, max=window.innerWidth-560;
      if(max<min) max=min;
      return Math.max(min, Math.min(max, w));
    }
    var dragging=false;
    function onMove(e){
      if(!dragging) return;
      root.style.setProperty('--preview-w', clamp(window.innerWidth-e.clientX)+'px');
    }
    function onUp(){
      if(!dragging) return;
      dragging=false; divider.classList.remove('drag');
      document.body.style.userSelect=''; preview.style.pointerEvents='';
      localStorage.setItem(KEY, root.style.getPropertyValue('--preview-w')||'42%');
    }
    divider.addEventListener('mousedown', function(e){
      dragging=true; divider.classList.add('drag');
      document.body.style.userSelect='none';
      preview.style.pointerEvents='none'; // let mousemove through the iframe
      e.preventDefault();
    });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    divider.addEventListener('dblclick', function(){
      root.style.removeProperty('--preview-w'); localStorage.removeItem(KEY);
    });
  })();

  refreshOnboarding(); // show step 1 immediately, before the sites list loads
  loadSites();
})();
`;
