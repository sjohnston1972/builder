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
  .brand{padding:20px 22px 16px;border-bottom:1px solid var(--line)}
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

  .sites{flex:1;overflow:auto;padding:12px 12px 20px}
  .sites h2{font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:8px 8px 10px}
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
  .chead .t{font-family:var(--disp);font-weight:700;font-size:17px;letter-spacing:-.01em}
  .chead .u{font-family:var(--mono);font-size:11.5px;color:var(--muted)}
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
    .chead{padding:13px 14px}
    #chat{padding:20px 16px}
    .composer{padding:13px 14px calc(13px + env(safe-area-inset-bottom))}
    .new{padding:16px 16px 18px}
    .msg{max-width:90%}
  }
  </style></head><body>

  <aside>
    <div class="brand"><div class="mark">⬡ for<b>ge</b></div><div class="sub">clydeford · worker builder</div></div>
    <form class="new" id="new-site" autocomplete="off">
      <h2>+ new site</h2>
      <div class="field urlrow">
        <input id="name" placeholder="my-site" maxlength="63" />
        <span class="zone">.clydeford.net</span>
      </div>
      <label class="field"><textarea id="spec" placeholder="Describe the site to build — e.g. a neon retro landing page for a synthwave band with an email signup."></textarea></label>
      <button class="forge-btn" type="submit" id="createBtn">⚒ Forge it</button>
    </form>
    <div class="sites">
      <h2>your sites</h2>
      <div id="siteList"><div class="empty">No sites yet. Name one and describe it above to forge your first.</div></div>
    </div>
  </aside>

  <main>
    <div class="chead">
      <button class="backbtn" id="backBtn" title="Back to sites">←</button>
      <div><div class="t" id="hTitle">No site selected</div><div class="u" id="hUrl">pick or create a site →</div></div>
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
  var state = { active:null, busy:false };
  var $ = function(id){ return document.getElementById(id); };
  function isMobile(){ return window.matchMedia('(max-width:720px)').matches; }

  var chat=$('chat'), input=$('input'), send=$('send'), pill=$('pill'), pillTxt=$('pillTxt');
  var hTitle=$('hTitle'), hUrl=$('hUrl'), addr=$('addr'), preview=$('preview'), noprev=$('noprev');
  var siteList=$('siteList'), welcome=$('welcome'), openLink=$('openLink');

  function setPill(kind, txt){ pill.className='pill'+(kind?(' '+kind):''); pillTxt.textContent=txt; }

  function api(path, opts){ return fetch(path, Object.assign({headers:{'content-type':'application/json'}}, opts||{})); }

  function loadSites(){
    api('/api/sites').then(function(r){return r.json();}).then(renderSites);
  }
  function renderSites(sites){
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
    hTitle.textContent=name; hUrl.textContent=url;
    openLink.href=url; openLink.classList.remove('hidden');
    document.body.classList.add('show-chat'); // mobile: switch to chat view
    addr.innerHTML='https://<b>'+name+'.'+ZONE+'</b>';
    input.disabled=false; send.disabled=false; input.placeholder='Tell Forge what to build or change…';
    setPill('','ready');
    if(welcome) welcome.remove();
    chat.innerHTML='';
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

  function loadHistory(name){
    api('/api/sites/'+name+'/history')
      .then(function(r){ return r.ok ? r.json() : {messages:[]}; })
      .then(function(d){
        if(state.active!==name) return; // user switched sites while loading
        renderHistory((d&&d.messages)||[]);
        sysLine('▸ session opened for '+name+'.'+ZONE);
        chat.scrollTop=chat.scrollHeight;
      })
      .catch(function(){
        if(state.active!==name) return;
        sysLine('▸ session opened for '+name+'.'+ZONE);
      });
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
    state.busy=true; send.disabled=true; input.disabled=true;
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
          else if(ev.type==='deploying'){ setPill('work','deploying'); deployEl=document.createElement('div');
            deployEl.className='deploy'; deployEl.innerHTML='<span class="spin"></span> shipping worker to the edge…'; chat.appendChild(deployEl); chat.scrollTop=chat.scrollHeight; }
          else if(ev.type==='deployed'){ setPill('live','live');
            if(deployEl){ deployEl.className='deploy done'; deployEl.innerHTML='✔ deployed → <a href="'+ev.url+'" target="_blank" rel="noopener">'+ev.url.replace('https://','')+'</a>'; }
            setTimeout(function(){ setPreview(ev.url); }, 1200); }
          else if(ev.type==='error'){ setPill('','error'); var eb=bubble('sys',''); eb.style.color='var(--err)'; eb.textContent='▲ '+ev.message; }
        }
        function finish(){
          bb.classList.remove('cursor');
          if(!bb.textContent) bb.textContent='(done)';
          if(pill.className.indexOf('live')<0) setPill('','ready');
          state.busy=false; send.disabled=false; input.disabled=false; input.focus();
        }
        return pump();
      })
      .catch(function(){ bb.classList.remove('cursor'); setPill('','error'); state.busy=false; send.disabled=false; input.disabled=false; });
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
  $('name').addEventListener('input', function(){ this.value=this.value.toLowerCase().replace(/[^a-z0-9-]/g,'-'); });
  $('refresh').addEventListener('click', function(){ if(state.active) setPreview('https://'+state.active+'.'+ZONE); });
  $('backBtn').addEventListener('click', function(){ document.body.classList.remove('show-chat'); }); // mobile: back to sites

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

  loadSites();
})();
`;
