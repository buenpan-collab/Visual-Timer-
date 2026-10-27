"use strict";
const $ = id => document.getElementById(id);
const ICONS = ["🪥","🍽️","🛁","🧸","📚","😴","👕","🚌","🧼","🎨","🏠","⏰"];
const CIRC = 2 * Math.PI * 25; // pie circumference (r=25)

const S = { icon:"🪥", total:300, remaining:300, warn:60, running:false, end:0, tick:null, warned:false };
let presets = load("vt_presets", []);
let log = load("vt_log", []);
let setupStart = performance.now(), errors = 0;

function load(k, d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d; }catch{ return d; } }
function save(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} }

/* ---------- Audio (gentle tones, Web Audio API) ---------- */
let ctx;
function beep(freq, dur, times=1){
  if(!$("soundToggle").checked) return;
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  for(let i=0;i<times;i++){
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i*(dur+0.15);
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.25,t+0.05);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t+dur);
  }
}

/* ---------- Display ---------- */
const fmt = s => String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
function render(){
  const secs = Math.max(0, Math.ceil(S.remaining));
  $("clock").textContent = fmt(secs);
  const frac = S.total ? S.remaining / S.total : 0;
  $("pieFill").style.strokeDashoffset = CIRC * (1 - Math.max(0, frac));
  const card = $("timerView");
  card.classList.toggle("warn", secs > 0 && secs <= S.warn);
  card.classList.toggle("done", secs === 0);
}
function setStatus(t){ $("status").textContent = t; }

function loop(){
  S.remaining = (S.end - Date.now()) / 1000;
  if(S.remaining <= S.warn && !S.warned){ S.warned = true; beep(660,0.5,2); setStatus("Almost done!"); }
  if(S.remaining <= 0){
    S.remaining = 0; stop(); render(); setStatus("Time's up! ✔"); beep(880,0.6,3); return;
  }
  render();
}
function start(){
  if(S.running) return;
  if(S.remaining <= 0) S.remaining = S.total;
  S.end = Date.now() + S.remaining*1000;
  S.running = true; S.warned = S.remaining <= S.warn;
  $("startBtn").hidden = true; $("pauseBtn").hidden = false;
  setStatus("Running…"); S.tick = setInterval(loop, 200); loop();
}
function stop(){
  S.running = false; clearInterval(S.tick);
  $("startBtn").hidden = false; $("pauseBtn").hidden = true;
}
function pause(){ stop(); setStatus("Paused"); }
function reset(){ stop(); S.remaining = S.total; S.warned = false; setStatus("Ready"); render(); }

/* ---------- Setup + validation + research log ---------- */
function showMsg(t, ok){ const m=$("msg"); m.textContent=t; m.className = ok ? "ok" : ""; }

function readForm(){
  const text = $("textInput").value.trim();
  const min = Number($("minInput").value), warn = Number($("warnInput").value);
  if(!text){ return fail("Please type a reminder."); }
  if(!Number.isFinite(min) || min < 1 || min > 120){ return fail("Minutes must be 1 to 120."); }
  if(!Number.isFinite(warn) || warn < 5 || warn >= min*60){ return fail("Warning must be at least 5 sec and less than total time."); }
  return { text, icon:S.icon, min, warn };
}
function fail(m){ errors++; showMsg("⚠ "+m); return null; }

function apply(cfg){
  stop();
  S.icon = cfg.icon; S.total = S.remaining = cfg.min*60; S.warn = cfg.warn; S.warned = false;
  $("reminderText").textContent = cfg.text; $("reminderIcon").textContent = cfg.icon;
  setStatus("Ready"); render();
}
$("applyBtn").onclick = () => {
  const cfg = readForm(); if(!cfg) return;
  apply(cfg); showMsg("Timer set ✔", true);
  const secs = Math.round((performance.now() - setupStart)/100)/10;
  log.push({ setupSeconds:secs, errors }); save("vt_log", log);
  setupStart = performance.now(); errors = 0; renderLog();
};

/* ---------- Icon picker ---------- */
ICONS.forEach(ic => {
  const b = document.createElement("button");
  b.type="button"; b.textContent = ic; b.setAttribute("aria-label","Icon "+ic);
  b.onclick = () => { S.icon = ic; [...$("iconPicker").children].forEach(x=>x.classList.toggle("sel",x===b)); };
  if(ic===S.icon) b.classList.add("sel");
  $("iconPicker").appendChild(b);
});

/* ---------- Presets (localStorage now; swap for Flask REST API later) ---------- */
function renderPresets(){
  const ul = $("presetList"); ul.innerHTML = "";
  if(!presets.length){ ul.innerHTML = "<li>No presets yet.</li>"; return; }
  presets.forEach((p,i) => {
    const li = document.createElement("li");
    const a = document.createElement("button"); a.className="load";
    a.textContent = `${p.icon} ${p.text} — ${p.min} min`;
    a.onclick = () => {
      $("textInput").value=p.text; $("minInput").value=p.min; $("warnInput").value=p.warn;
      S.icon=p.icon; [...$("iconPicker").children].forEach(x=>x.classList.toggle("sel",x.textContent===p.icon));
      apply(p); showMsg("Preset loaded ✔", true);
    };
    const d = document.createElement("button"); d.className="del"; d.textContent="🗑"; d.setAttribute("aria-label","Delete preset");
    d.onclick = () => { presets.splice(i,1); save("vt_presets",presets); renderPresets(); };
    li.append(a,d); ul.appendChild(li);
  });
}
$("saveBtn").onclick = () => {
  const cfg = readForm(); if(!cfg) return;
  presets.push(cfg); save("vt_presets", presets); renderPresets(); showMsg("Preset saved ★", true);
};

/* ---------- Log table + CSV ---------- */
function renderLog(){
  $("logTable").tBodies[0].innerHTML = log.map((r,i)=>`<tr><td>${i+1}</td><td>${r.setupSeconds}</td><td>${r.errors}</td></tr>`).join("");
}
$("csvBtn").onclick = () => {
  const csv = "trial,setup_seconds,errors\n" + log.map((r,i)=>`${i+1},${r.setupSeconds},${r.errors}`).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download = "usability_log.csv"; a.click();
};
$("clearLogBtn").onclick = () => { log=[]; save("vt_log",log); renderLog(); };

/* ---------- Wire up ---------- */
$("startBtn").onclick = start; $("pauseBtn").onclick = pause; $("resetBtn").onclick = reset;
renderPresets(); renderLog(); render();
