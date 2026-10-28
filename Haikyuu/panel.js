
import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0?bundle";

const ID = "br.com.haikyuu.rtt";
const SHEET = `${ID}/sheet`, BALL = `${ID}/ball`, COURT = `${ID}/court`;
const TOOL = `${ID}/tool-saque`, MODE_SERVE = `${ID}/mode-saque`, MODE_COURT = `${ID}/mode-calibrar`;
const PANEL = `${ID}/side-sheet`;
const ATTRS = ["Ataque", "Defesa", "Passe", "Salto", "Saque", "Levantamento", "Bloqueio"];
const app = document.querySelector("#app");
let selectedId = null, selectedItem = null, sceneItems = [], userRole = "PLAYER";
let view = "choose", notice = "", noticeType = "ok", calibrated = false;
let gridScale = "", busy = false, selectionSerial = 0;
const rollRequests = new Map();

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[c]);
}
function sheetOf(item) {
  const saved = item?.metadata?.[SHEET];
  const attributes = Object.fromEntries(ATTRS.map(key => {
    const value = Number(saved?.attributes?.[key]);
    return [key, Number.isFinite(value) ? Math.max(-9999, Math.min(9999, Math.trunc(value))) : 0];
  }));
  return {
    name: typeof saved?.name === "string" ? saved.name : item?.name || "Personagem",
    kind: saved?.kind === "npc" ? "npc" : "jogador",
    attributes
  };
}
function isBall(item) { return item?.layer === "MOUNT" && item?.metadata?.[BALL] === true; }
function show(text, type = "ok") { notice = String(text); noticeType = type; render(); }
function header() {
  const switchButton = selectedItem?.layer === "CHARACTER" && view !== "choose"
    ? `<button class="switch" data-action="switch">⇄ Trocar ficha</button>` : "";
  return `<header class="hero"><div class="head"><div><b>🏐 HAIKYUU!!</b><small>ROAD TO THE TOP • v0.3</small></div>
    <button class="close" data-action="close" aria-label="Fechar">×</button></div>
    ${switchButton}</header>`;
}
function choice() {
  const name = safe(sheetOf(selectedItem).name);
  return `<section class="panel"><p class="kicker">Token selecionado</p><h2>${name}</h2>
    <p class="muted">Qual ficha você deseja abrir?</p>
    <div class="options">
      <button data-view="jogador">👤 Ficha Jogador</button>
      <button data-view="mestre" ${userRole !== "GM" ? "disabled title='Somente o mestre'" : ""}>⚙️ Ficha Mestre</button>
      <button data-view="npc">🎭 Ficha NPC</button>
    </div><p class="muted">Depois de escolher, apenas a ficha selecionada ficará visível.</p></section>`;
}
function attributes(sheet, edit) {
  return `<section class="panel"><div class="between"><h2>Atributos</h2><span class="pill">1d20 + valor</span></div>
    ${ATTRS.map(attr => `<div class="attribute"><label>${attr}</label>
      <input type="number" aria-label="Valor de ${attr}" data-attribute="${attr}" value="${sheet.attributes[attr]}" min="-9999" max="9999" step="1" ${edit ? "" : "disabled"}>
      <button data-roll="${attr}" ${busy ? "disabled" : ""}>🎲 Rolar</button></div>`).join("")}
    <p class="muted">Rolagens realizadas pelo Dice+ da sala.</p></section>`;
}
function characterSheet(kind) {
  const sheet = sheetOf(selectedItem);
  const npc = kind === "npc";
  const edit = userRole === "GM" || (!npc && sheet.kind !== "npc");
  return `<section class="panel"><p class="kicker">${npc ? "Ficha NPC" : "Ficha Jogador"}</p>
    <label class="field">Nome <input type="text" data-field="name" maxlength="80" value="${safe(sheet.name)}" ${edit ? "" : "disabled"}></label>
    <p class="muted">Dados salvos diretamente no token.</p></section>
    ${attributes(sheet, edit)}
    ${!npc ? `<section class="panel special"><p class="kicker">Saque</p><h2>🏐 Saque por Baixo</h2>
      <p class="muted">Mira de 1,5 × 1,5 m, centralizada no cruzamento da grade, quatro casas possíveis de queda.</p>
      <button class="primary wide" data-action="serve" ${busy ? "disabled" : ""}>🎯 Preparar saque</button>
      <p class="muted">Depois clique na ferramenta 🏐 do Owlbear, aponte para a quadra adversária e clique para lançar.</p>
      <p class="muted">${calibrated ? "✅ Quadra calibrada." : "⚠️ Mestre deve calibrar a quadra."}</p>
    </section>` : ""}`;
}
function masterSheet() {
  if (userRole !== "GM") return `<section class="panel">Acesso exclusivo do mestre.</section>`;
  const token = selectedItem?.layer === "CHARACTER";
  const mount = selectedItem?.layer === "MOUNT";
  const balls = sceneItems.filter(isBall).length;
  return `<section class="panel"><p class="kicker">Ficha Mestre</p><h2>⚙️ Gerenciar partida</h2>
      <p class="muted">Bolas oficiais: ${balls} • NPCs: ${sceneItems.filter(x=>x.layer==="CHARACTER" && sheetOf(x).kind==="npc").length}</p>
    </section>
    ${token ? `<section class="panel"><h2>${safe(sheetOf(selectedItem).name)}</h2>
      <p class="muted">Tipo salvo: ${sheetOf(selectedItem).kind === "npc" ? "NPC" : "Jogador"}.</p>
      <div class="stack"><button data-action="type-player">Registrar como Jogador</button>
      <button data-action="type-npc">Registrar como NPC</button></div></section>` : ""}
    ${mount ? ballCard() : ""}
    <section class="panel"><p class="kicker">Quadra</p><h2>📍 Calibrar quadra</h2>
      <p class="muted">${calibrated ? "✅ Calibrada" : "⚠️ Não calibrada"} • Grade: ${safe(gridScale || "verificando")}.</p>
      <p class="muted">Cada quadrado representa 1,5 m. Marque dois cantos opostos da área interna de 18 × 9 m, com a rede na vertical ao centro.</p>
      <button class="primary wide" data-action="calibrate">${calibrated ? "Recalibrar" : "Calibrar quadra"}</button>
    </section>
    <section class="panel"><p class="muted">Para definir a bola, selecione uma imagem na camada Montarias e clique em <b>Definir como bola</b>.</p></section>`;
}
function ballCard() {
  const marked = isBall(selectedItem);
  return `<section class="panel"><p class="kicker">Objeto • Montarias</p><h2>${marked ? "🏐 Bola oficial" : "Objeto selecionado"}</h2>
    <p class="muted">${safe(selectedItem?.name || "Montaria")}</p>
    ${userRole === "GM" ? `<button class="${marked ? "danger" : "primary"} wide" data-action="${marked ? "unmark" : "mark"}">${marked ? "Remover definição de bola" : "Definir como bola 🏐"}</button>` : `<p class="muted">Apenas o mestre pode definir a bola.</p>`}
  </section>`;
}
function render() {
  let body = "";
  if (selectedItem?.layer === "MOUNT") body = ballCard();
  else if (selectedItem?.layer === "CHARACTER") {
    body = view === "choose" ? choice() : view === "mestre" ? masterSheet() : characterSheet(view);
  } else body = `<section class="panel"><h2>Selecione um token</h2><p class="muted">Clique em um personagem para escolher entre Ficha Jogador, Mestre ou NPC.</p>
      ${userRole === "GM" ? `<button class="primary" data-action="master-no-token">Abrir controles do Mestre</button>` : ""}</section>`;
  if (!selectedItem && view === "mestre" && userRole === "GM") body = masterSheet();
  app.innerHTML = `${header()}<main>${notice ? `<div class="notice ${noticeType}" role="status">${safe(notice)}</div>` : ""}
    ${body}<footer>Haikyuu!! Road to the Top • Dice+</footer></main>`;
}
async function updateSelection(ids) {
  const id = Array.isArray(ids) && ids.length === 1 ? ids[0] : null;
  const serial = ++selectionSerial;
  if (id !== selectedId) { view = "choose"; notice = ""; }
  selectedId = id;
  if (!id || !(await OBR.scene.isReady())) { selectedItem = null; render(); return; }
  const [item] = await OBR.scene.items.getItems([id]);
  if (serial !== selectionSerial) return;
  selectedItem = item || null;
  render();
}
async function saveSheet(patch, id = selectedId) {
  if (!id) throw new Error("Selecione um personagem primeiro.");
  await OBR.scene.items.updateItems([id], draft => {
    for (const item of draft) {
      const current = sheetOf(item);
      item.metadata[SHEET] = { ...current, ...patch,
        attributes: { ...current.attributes, ...(patch.attributes || {}) } };
    }
  });
}
async function setBall(marked) {
  if (userRole !== "GM" || selectedItem?.layer !== "MOUNT") throw new Error("Selecione uma Montaria como mestre.");
  const balls = await OBR.scene.items.getItems(x => isBall(x));
  const ids = [...new Set([...balls.map(x => x.id), selectedId])];
  await OBR.scene.items.updateItems(ids, draft => {
    for (const item of draft) {
      if (item.id === selectedId && marked) item.metadata[BALL] = true;
      else delete item.metadata[BALL];
    }
  });
  show(marked ? "🏐 Bola definida!" : "Definição de bola removida.");
}
async function prepareMode(mode, settings) {
  await OBR.tool.setMetadata(TOOL, settings);
  await OBR.tool.activateMode(TOOL, mode);
}
async function readyDicePlus() {
  const requestId = crypto.randomUUID();
  return new Promise(resolve => {
    let finished = false, timer;
    const off = OBR.broadcast.onMessage("dice-plus/isReady", e => {
      if (e.data?.ready === true && e.data?.requestId === requestId) done(true);
    });
    function done(result) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      off(); resolve(result);
    }
    timer = setTimeout(() => done(false), 1700);
    OBR.broadcast.sendMessage("dice-plus/isReady", {requestId, timestamp: Date.now()}, {destination: "ALL"}).catch(()=>done(false));
  });
}
async function roll(attr) {
  if (busy || !ATTRS.includes(attr) || selectedItem?.layer !== "CHARACTER") return;
  const sheet = sheetOf(selectedItem), modifier = sheet.attributes[attr];
  busy = true; render();
  try {
    if (!(await readyDicePlus())) { show("O Dice+ não respondeu. Verifique se está ativo na sala.", "warn"); return; }
    const rollId = crypto.randomUUID();
    const notation = `1d20${modifier >= 0 ? "+" : ""}${modifier} # ${attr}`;
    rollRequests.set(rollId, `${sheet.name} • ${attr}`);
    await OBR.broadcast.sendMessage("dice-plus/roll-request", {
      rollId, playerId: await OBR.player.getId(), playerName: await OBR.player.getName(),
      rollTarget: "everyone", diceNotation: notation, showResults: true,
      timestamp: Date.now(), source: ID
    }, {destination: "ALL"});
    show(`🎲 ${sheet.name} • ${attr}: ${notation}`);
    setTimeout(() => rollRequests.delete(rollId), 30000);
  } catch (e) { show(`Erro no Dice+: ${e.message}`, "error"); }
  finally { busy = false; render(); }
}
app.addEventListener("click", async event => {
  const btn = event.target.closest("button");
  if (!btn || btn.disabled) return;
  if (btn.dataset.view) {
    if (btn.dataset.view === "mestre" && userRole !== "GM") return;
    view = btn.dataset.view;
    notice = "";
    // Apenas o mestre altera a classificação persistente do token.
    if (userRole === "GM" && (view === "jogador" || view === "npc")) {
      try { await saveSheet({kind:view}); } catch (e) { show(e.message, "error"); }
    }
    render(); return;
  }
  if (btn.dataset.roll) { await roll(btn.dataset.roll); return; }
  try {
    switch (btn.dataset.action) {
      case "close": await Promise.allSettled([OBR.popover.close(PANEL), OBR.action.close()]); break;
      case "switch": view = "choose"; notice = ""; render(); break;
      case "type-player": await saveSheet({kind:"jogador"}); show("Token registrado como Jogador."); break;
      case "type-npc": await saveSheet({kind:"npc"}); show("Token registrado como NPC."); break;
      case "mark": await setBall(true); break;
      case "unmark": await setBall(false); break;
      case "master-no-token": view = "mestre"; render(); break;
      case "calibrate":
        if (userRole !== "GM") throw new Error("Somente o mestre calibra a quadra.");
        await prepareMode(MODE_COURT, {serverId:""});
        show("Selecione a ferramenta 🏐 do Owlbear e marque os dois cantos opostos da quadra."); break;
      case "serve":
        if (!calibrated) throw new Error("O mestre precisa calibrar a quadra.");
        if (sceneItems.filter(isBall).length !== 1) throw new Error("O mestre deve definir uma bola em Montarias.");
        await prepareMode(MODE_SERVE, {serveType:"underhand", serverId:selectedId});
        show("Saque pronto! Escolha a ferramenta 🏐 do Owlbear, mire e clique para sacar."); break;
    }
  } catch (e) { show(`Falha: ${e.message}`, "error"); }
});
app.addEventListener("change", async event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || selectedItem?.layer !== "CHARACTER") return;
  const id = selectedId;
  try {
    if (input.dataset.field === "name") {
      await saveSheet({name: input.value.trim().slice(0,80) || selectedItem.name || "Personagem"}, id);
    } else if (ATTRS.includes(input.dataset.attribute)) {
      const n = Number(input.value);
      if (!Number.isFinite(n)) throw new Error("Digite um número válido.");
      await saveSheet({attributes:{[input.dataset.attribute]:Math.max(-9999,Math.min(9999,Math.trunc(n)))}}, id);
    } else return;
    show("Ficha salva no token.");
  } catch (e) { show(`Erro ao salvar: ${e.message}`, "error"); }
});

OBR.onReady(async () => {
  try {
    userRole = await OBR.player.getRole();
    async function loadScene(ready) {
      if (!ready) { sceneItems=[]; selectedItem=null; selectedId=null; calibrated=false; view="choose"; render(); return; }
      sceneItems = await OBR.scene.items.getItems();
      calibrated = !!(await OBR.scene.getMetadata())?.[COURT]?.midX;
      gridScale = (await OBR.scene.grid.getScale())?.raw || "não definida";
      await updateSelection(await OBR.player.getSelection());
    }
    OBR.scene.onReadyChange(ready=>{void loadScene(ready).catch(console.error);});
    OBR.scene.onMetadataChange(data=>{calibrated=!!data?.[COURT]?.midX;render();});
    OBR.scene.grid.onChange(data=>{gridScale=data?.scale||"não definida";render();});
    OBR.scene.items.onChange(items=>{
      sceneItems=items;
      selectedItem=selectedId?items.find(x=>x.id===selectedId)||null:null;
      if (!document.activeElement?.matches("input")) render();
    });
    OBR.player.onChange(data=>{
      userRole=data.role;
      const id=data.selection?.length===1?data.selection[0]:null;
      if(id!==selectedId)void updateSelection(data.selection).catch(console.error);
    });
    OBR.broadcast.onMessage(`${ID}/roll-result`, e=>{
      const r=e.data;
      if(!rollRequests.has(r?.rollId))return;
      const title=rollRequests.get(r.rollId);rollRequests.delete(r.rollId);
      show(`${title}: resultado ${r.result?.totalValue ?? "indisponível"} (${r.result?.rollSummary||"Dice+"})`);
    });
    OBR.broadcast.onMessage(`${ID}/roll-error`, e=>{
      const r=e.data;
      if(!rollRequests.has(r?.rollId))return;
      rollRequests.delete(r.rollId);show(`Erro Dice+: ${r.error||"falha na rolagem"}`,"error");
    });
    await loadScene(await OBR.scene.isReady());
  } catch (e) { app.innerHTML=`<div class="loading">Erro ao conectar ao Owlbear: ${safe(e.message)}</div>`; }
});
