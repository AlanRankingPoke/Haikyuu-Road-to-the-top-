import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0?bundle";

const ID = "br.com.haikyuu.rtt";
const SHEET = `${ID}/sheet`;
const BALL = `${ID}/ball`;
const PANEL_ID = `${ID}/side-sheet`;
const TOOL = `${ID}/tool-saque`;
const MODE_SERVE = `${ID}/mode-saque`;
const MODE_COURT = `${ID}/mode-calibrar`;
const COURT = `${ID}/court`;
const ATTRS = ["Ataque", "Defesa", "Passe", "Salto", "Saque", "Levantamento", "Bloqueio"];
const app = document.getElementById("app");

let selectedId = null;
let selectedItem = null;
let sceneItems = [];
let calibrated = false;
let gridText = "";
let role = "PLAYER";
let tab = "jogador";
let message = "";
let messageKind = "ok";
let processing = false;
let selectionSerial = 0;
const rollsPending = new Map();

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}
function defaultSheet(item) {
  return {
    name: item?.name || "Novo personagem",
    kind: "jogador",
    attributes: Object.fromEntries(ATTRS.map(a => [a, 0]))
  };
}
function sheetFor(item) {
  const base = defaultSheet(item);
  const saved = item?.metadata?.[SHEET];
  if (!saved || typeof saved !== "object") return base;
  const attributes = { ...base.attributes };
  for (const key of ATTRS) {
    const n = Number(saved?.attributes?.[key]);
    if (Number.isFinite(n)) attributes[key] = Math.max(-9999, Math.min(9999, Math.trunc(n)));
  }
  return {
    name: typeof saved.name === "string" ? saved.name : base.name,
    kind: saved.kind === "npc" ? "npc" : "jogador",
    attributes
  };
}
function showMessage(text, kind = "ok") {
  message = String(text);
  messageKind = kind;
  render();
}
function statusMarkup() {
  return message ? `<div class="status ${messageKind}" role="status">${escapeHtml(message)}</div>` : "";
}
function headerMarkup() {
  return `<header class="hero"><div class="brand"><div><div class="brand-name">🏐 HAIKYUU!!</div><div class="subtitle">ROAD TO THE TOP • V0.2</div></div><button title="Fechar ficha" aria-label="Fechar ficha" class="close" data-action="close">×</button></div></header>
    <nav class="tabs" aria-label="Abas da ficha">
      <button class="tab ${tab === "jogador" ? "active" : ""}" data-tab="jogador">Jogador</button>
      <button class="tab ${tab === "mestre" ? "active" : ""}" data-tab="mestre" ${role !== "GM" ? "disabled title='Apenas mestre'" : ""}>Mestre</button>
      <button class="tab ${tab === "npcs" ? "active" : ""}" data-tab="npcs">NPCs</button>
    </nav>`;
}
function isBall(item) { return item?.metadata?.[BALL] === true; }
function ballMarkup() {
  const marked = isBall(selectedItem);
  return `<section class="section"><p class="kicker">Objeto • Camada Montarias</p><h2 class="h2">${marked ? "🏐 Bola oficial" : "Objeto selecionado"}</h2>
    <p class="small">${escapeHtml(selectedItem?.name || "Montaria")}</p>
    <p class="small">${marked ? "Este objeto está marcado como a bola da partida. Movimente normalmente pelo Owlbear Rodeo." : "Esta imagem está na camada MOUNT (Montarias). O mestre pode defini-la como a bola do jogo."}</p>
    ${role === "GM" ? `<button class="${marked ? "danger" : "primary"}" data-action="${marked ? "unmark-ball" : "mark-ball"}">${marked ? "Remover definição de bola" : "Definir como bola 🏐"}</button>` : `<span class="pill">Somente o mestre define a bola</span>`}
  </section>`;
}
function characterMarkup() {
  if (!selectedItem || selectedItem.layer !== "CHARACTER") {
    if (selectedItem?.layer === "MOUNT") return ballMarkup();
    return `<section class="section empty">Selecione um token na camada <strong>Personagens</strong> para abrir a ficha.<br>Para definir a bola, selecione um objeto em <strong>Montarias</strong>.</section>`;
  }
  const sheet = sheetFor(selectedItem);
  const canEdit = role === "GM" || sheet.kind === "jogador";
  return `<section class="section">
    <div class="row"><p class="kicker">Ficha de ${sheet.kind === "npc" ? "NPC" : "jogador"}</p><span class="pill">${sheet.kind === "npc" ? "NPC" : "Jogador"}</span></div>
    <label class="field"><span>Nome do personagem</span><input type="text" maxlength="80" data-field="name" value="${escapeHtml(sheet.name)}" ${canEdit ? "" : "disabled"}></label>
    <p class="small">Os atributos são salvos no token, e acompanham o personagem nesta cena.</p>
  </section>
  <section class="section">
    <div class="row"><h2 class="h2">Atributos</h2><span class="pill">1d20 + valor</span></div>
    ${ATTRS.map(attr => {
      const val = sheet.attributes[attr];
      return `<div class="attribute"><span class="attr-name">${attr}</span><input type="number" min="-9999" max="9999" step="1" aria-label="Valor de ${attr}" value="${val}" data-attr="${attr}" ${canEdit ? "" : "disabled"}><button type="button" class="roll" data-roll="${attr}" aria-label="Rolar ${attr}" ${processing ? "disabled" : ""}>🎲 Rolar</button></div>`;
    }).join("")}
    <p class="small">Cada botão envia uma solicitação real ao Dice+ para rolar o dado e aplicar o bônus correspondente. Sem Dice+ ativo, não há rolagem alternativa.</p>
  </section>
  <section class="section serve-section">
    <p class="kicker">Saque • Direcionamento da bola</p>
    <h2 class="h2">🏐 Escolher saque</h2>
    <label class="field"><span>Tipo de saque</span><select id="serve-type" aria-label="Tipo de saque"><option value="underhand">Saque por Baixo — área 1,5 × 1,5 m</option></select></label>
    <p class="small">Mira centralizada em um cruzamento da grade: alcança 4 quadradinhos. A bola cai no centro de um deles, sorteado automaticamente.</p>
    <button class="primary" data-action="prepare-serve" ${processing ? "disabled" : ""}>🎯 Sacar: ativar mira</button>
    <p class="small">Depois, escolha a ferramenta <strong>🏐 Haikyuu!!</strong> na barra direita do Owlbear e clique no lado adversário para sacar. ${calibrated ? "✅ Quadra calibrada." : "⚠️ Peça ao mestre para calibrar a quadra primeiro."}</p>
  </section>`;
}
function masterMarkup() {
  if (role !== "GM") return `<section class="section empty">Esta aba é exclusiva do mestre.</section>`;
  const token = selectedItem?.layer === "CHARACTER";
  const mount = selectedItem?.layer === "MOUNT";
  const kind = token ? sheetFor(selectedItem).kind : null;
  const nNpcs = sceneItems.filter(i => i.layer === "CHARACTER" && sheetFor(i).kind === "npc").length;
  const nBalls = sceneItems.filter(isBall).length;
  return `<section class="section"><p class="kicker">Controles do mestre</p><h2 class="h2">Gerenciar a partida</h2><p class="small">NPCs cadastrados: <strong>${nNpcs}</strong> • Bolas marcadas: <strong>${nBalls}</strong></p></section>
    ${token ? `<section class="section"><p class="kicker">Token selecionado</p><h2 class="h2">${escapeHtml(sheetFor(selectedItem).name)}</h2><p class="small">Tipo atual: ${kind === "npc" ? "NPC" : "Jogador"}</p>
      <div class="stack"><button class="primary" data-action="set-npc">Marcar como NPC</button><button class="secondary" data-action="set-player">Marcar como Jogador</button></div></section>` : ""}
    ${mount ? ballMarkup() : ""}
    ${!token && !mount ? `<section class="section empty">Selecione um personagem para determinar se é Jogador ou NPC, ou uma Montaria para defini-la como a bola da partida.</section>` : ""}
    <section class="section"><p class="kicker">Bola</p><p class="small">Para definir a bola: coloque a imagem na camada <strong>Montarias (MOUNT)</strong>, selecione-a e clique em <strong>Definir como bola</strong>. Apenas uma bola será marcada por cena.</p></section>
    <section class="section"><p class="kicker">Quadra oficial • Configuração</p><h2 class="h2">📍 Calibrar quadra</h2>
      <p class="small">${calibrated ? "✅ Quadra delimitada nesta cena." : "⚠️ Quadra ainda não calibrada."}</p>
      <p class="small">Grade do Owlbear: <strong>${escapeHtml(gridText || "verificando...")}</strong>. Cada quadrado deve medir <strong>1,5 m</strong>.</p>
      <p class="small">Clique no botão e na ferramenta 🏐 da barra direita. Marque dois cantos internos opostos: <strong>superior esquerdo</strong> e <strong>inferior direito</strong>. A linha da rede será o meio da quadra (mapa horizontal).</p>
      <button class="primary" data-action="calibrate-court">${calibrated ? "Recalibrar quadra" : "Calibrar quadra"}</button>
    </section>`;
}
function npcsMarkup() {
  const npcs = sceneItems.filter(i => i.layer === "CHARACTER" && sheetFor(i).kind === "npc").sort((a,b) => sheetFor(a).name.localeCompare(sheetFor(b).name, "pt-BR"));
  return `<section class="section"><p class="kicker">Personagens não jogadores</p><h2 class="h2">NPCs desta cena</h2>
    ${npcs.length ? `<div class="stack">${npcs.map(item => `<button class="list-item" data-npc-id="${escapeHtml(item.id)}">${escapeHtml(sheetFor(item).name)} ${item.id === selectedId ? "• selecionado" : ""}</button>`).join("")}</div>` : `<p class="small">Ainda não há NPCs. O mestre pode selecionar um token e usar a aba Mestre para marcá-lo como NPC.</p>`}
  </section>${selectedItem?.layer === "CHARACTER" && sheetFor(selectedItem).kind === "npc" ? characterMarkup() : ""}`;
}
function render() {
  app.innerHTML = `${headerMarkup()}<main class="body">
    ${statusMarkup()}
    ${tab === "jogador" ? characterMarkup() : tab === "mestre" ? masterMarkup() : npcsMarkup()}
    <p class="footer">Dados salvos na cena • Dice+ integrado por broadcast</p>
  </main>`;
}

async function syncSelection(ids) {
  const id = Array.isArray(ids) && ids.length === 1 ? ids[0] : null;
  const generation = ++selectionSerial;
  selectedId = id;
  if (!id || !(await OBR.scene.isReady())) {
    selectedItem = null;
    render();
    return;
  }
  try {
    const [item] = await OBR.scene.items.getItems([id]);
    if (generation !== selectionSerial) return;
    selectedItem = item || null;
    render();
  } catch (error) {
    if (generation === selectionSerial) showMessage(`Erro ao ler token: ${error.message}`, "error");
  }
}

async function saveSheet(patch, id = selectedId) {
  if (!id) return;
  await OBR.scene.items.updateItems([id], items => {
    for (const item of items) {
      const current = sheetFor(item);
      item.metadata[SHEET] = {
        ...current,
        ...patch,
        attributes: { ...current.attributes, ...(patch.attributes || {}) }
      };
    }
  });
}

async function markBall(itemId, marked) {
  if (role !== "GM" || !itemId) return;
  if (marked) {
    const existing = sceneItems.filter(isBall);
    const ids = [...new Set([...existing.map(i => i.id), itemId])];
    await OBR.scene.items.updateItems(ids, items => {
      for (const item of items) {
        if (item.id === itemId) item.metadata[BALL] = true;
        else delete item.metadata[BALL];
      }
    });
  } else {
    await OBR.scene.items.updateItems([itemId], items => {
      for (const item of items) delete item.metadata[BALL];
    });
  }
  showMessage(marked ? "Bola definida! Mova o objeto normalmente no mapa." : "Definição de bola removida.");
}

async function prepareTool(mode, extra = {}) {
  // O SDK expõe a ativação do modo, mas não dispõe de 'activateTool'.
  // O jogador ainda deve clicar no ícone 🏐 da barra de ferramentas.
  await OBR.tool.setMetadata(TOOL, extra);
  await OBR.tool.activateMode(TOOL, mode);
}

async function prepareServe() {
  if (processing || !selectedItem || selectedItem.layer !== "CHARACTER") throw new Error("Selecione o token do sacador.");
  if (!calibrated) throw new Error("O mestre precisa calibrar a quadra primeiro.");
  const balls = sceneItems.filter(i => i.layer === "MOUNT" && isBall(i));
  if (balls.length !== 1) throw new Error("Defina exatamente uma bola na camada Montarias.");
  const kind = document.getElementById("serve-type")?.value;
  if (kind !== "underhand") throw new Error("Tipo de saque ainda não implementado.");
  await prepareTool(MODE_SERVE, {serveType: kind, serverId: selectedId});
  showMessage("Saque por Baixo pronto! Clique na ferramenta 🏐 do Owlbear e mire no lado adversário.");
}

async function dicePlusReady() {
  const requestId = crypto.randomUUID();
  return new Promise(resolve => {
    let finished = false;
    let timer;
    const unsubscribe = OBR.broadcast.onMessage("dice-plus/isReady", event => {
      const data = event.data;
      if (data?.requestId === requestId && data?.ready === true) done(true);
    });
    function done(value) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(value);
    }
    timer = setTimeout(() => done(false), 1300);
    OBR.broadcast.sendMessage("dice-plus/isReady", {
      requestId,
      timestamp: Date.now()
    }, { destination: "ALL" }).catch(() => done(false));
  });
}

async function rollAttribute(attr) {
  if (processing || !selectedItem || selectedItem.layer !== "CHARACTER" || !ATTRS.includes(attr)) return;
  const character = sheetFor(selectedItem);
  const bonus = character.attributes[attr];
  processing = true;
  render();
  try {
    if (!(await dicePlusReady())) {
      showMessage("Dice+ não respondeu. Ative a extensão Dice+ na mesma sala e tente novamente.", "warn");
      return;
    }
    const rollId = crypto.randomUUID();
    const notation = `1d20${bonus >= 0 ? "+" : ""}${bonus} # ${attr}`;
    rollsPending.set(rollId, `${character.name} • ${attr}`);
    await OBR.broadcast.sendMessage("dice-plus/roll-request", {
      rollId,
      playerId: await OBR.player.getId(),
      playerName: await OBR.player.getName(),
      rollTarget: "everyone",
      diceNotation: notation,
      showResults: true,
      timestamp: Date.now(),
      source: ID
    }, { destination: "ALL" });
    showMessage(`Rolando ${character.name} • ${attr}: ${notation}`);
    // Remove pedidos antigos que eventualmente não receberam resposta.
    setTimeout(() => rollsPending.delete(rollId), 30000);
  } catch (error) {
    showMessage(`Não foi possível rolar no Dice+: ${error.message}`, "error");
  } finally {
    processing = false;
    render();
  }
}

app.addEventListener("click", async event => {
  const el = event.target.closest("button");
  if (!el || el.disabled) return;
  if (el.dataset.tab) {
    if (el.dataset.tab === "mestre" && role !== "GM") return;
    tab = el.dataset.tab;
    message = "";
    render();
    return;
  }
  if (el.dataset.npcId) {
    try {
      tab = "npcs";
      await OBR.player.select([el.dataset.npcId], true);
    } catch (error) { showMessage(error.message, "error"); }
    return;
  }
  if (el.dataset.roll) { await rollAttribute(el.dataset.roll); return; }
  try {
    switch (el.dataset.action) {
      case "close":
        await Promise.allSettled([OBR.popover.close(PANEL_ID), OBR.action.close()]);
        break;
      case "set-npc":
        if (role === "GM") { await saveSheet({ kind: "npc" }); showMessage("Token registrado como NPC."); }
        break;
      case "set-player":
        if (role === "GM") { await saveSheet({ kind: "jogador" }); showMessage("Token registrado como Jogador."); }
        break;
      case "prepare-serve": await prepareServe(); break;
      case "calibrate-court":
        if (role !== "GM") throw new Error("Somente o mestre pode calibrar a quadra.");
        await prepareTool(MODE_COURT, {serverId:""});
        showMessage("Calibração: selecione a ferramenta 🏐 no Owlbear, clique no canto superior esquerdo e depois no inferior direito.");
        break;
      case "mark-ball": await markBall(selectedId, true); break;
      case "unmark-ball": await markBall(selectedId, false); break;
    }
  } catch (error) { showMessage(`Falha: ${error.message}`, "error"); }
});

app.addEventListener("change", async event => {
  const field = event.target;
  if (!(field instanceof HTMLInputElement) || !selectedItem || selectedItem.layer !== "CHARACTER") return;
  const id = selectedId;
  if (!id) return;
  const current = sheetFor(selectedItem);
  if (role !== "GM" && current.kind === "npc") return;
  try {
    if (field.dataset.field === "name") {
      const name = field.value.trim().slice(0, 80) || selectedItem.name || "Personagem";
      await saveSheet({ name }, id);
    } else if (ATTRS.includes(field.dataset.attr)) {
      const attr = field.dataset.attr;
      const parsed = Number(field.value);
      if (!Number.isFinite(parsed)) throw new Error("Informe um número válido.");
      const value = Math.max(-9999, Math.min(9999, Math.trunc(parsed)));
      await saveSheet({ attributes: { [attr]: value } }, id);
    }
    // A mudança chega aos outros participantes pelo onChange de itens.
    showMessage("Ficha salva no token.");
  } catch (error) { showMessage(`Não foi possível salvar: ${error.message}`, "error"); }
});

OBR.onReady(async () => {
  try {
    role = await OBR.player.getRole();
    const onScene = async ready => {
      if (!ready) {
        selectedId = null;
        selectedItem = null;
        sceneItems = [];
        calibrated = false;
        gridText = "";
        render();
        return;
      }
      sceneItems = await OBR.scene.items.getItems();
      const metadata = await OBR.scene.getMetadata();
      calibrated = !!metadata[COURT]?.midX;
      const grid = await OBR.scene.grid.getScale();
      gridText = grid?.raw || "não definida";
      await syncSelection(await OBR.player.getSelection());
    };
    OBR.scene.onReadyChange(ready => { void onScene(ready).catch(console.error); });
    OBR.scene.onMetadataChange(metadata => {
      calibrated = !!metadata[COURT]?.midX;
      if (!document.activeElement?.matches("input,select")) render();
    });
    OBR.scene.grid.onChange(grid => {
      gridText = grid?.scale || "não definida";
      if (!document.activeElement?.matches("input,select")) render();
    });
    OBR.scene.items.onChange(items => {
      sceneItems = items;
      selectedItem = selectedId ? items.find(i => i.id === selectedId) || null : null;
      // Não remonta inputs enquanto alguém ainda está digitando.
      if (!document.activeElement?.matches("input")) render();
    });
    OBR.player.onChange(player => {
      if (player.role !== role) {
        role = player.role;
        if (role !== "GM" && tab === "mestre") tab = "jogador";
      }
      const nextId = player.selection?.length === 1 ? player.selection[0] : null;
      if (nextId !== selectedId) void syncSelection(player.selection);
    });
    OBR.broadcast.onMessage(`${ID}/roll-result`, event => {
      const data = event.data;
      if (!rollsPending.has(data?.rollId)) return;
      const title = rollsPending.get(data.rollId);
      rollsPending.delete(data.rollId);
      const total = data.result?.totalValue;
      showMessage(`${title}: resultado ${total ?? "indisponível"} (${data.result?.rollSummary || "Dice+"})`);
    });
    OBR.broadcast.onMessage(`${ID}/roll-error`, event => {
      const data = event.data;
      if (!rollsPending.has(data?.rollId)) return;
      rollsPending.delete(data.rollId);
      showMessage(`Erro do Dice+: ${data.error || "rolagem falhou"}`, "error");
    });
    await onScene(await OBR.scene.isReady());
  } catch (error) {
    app.innerHTML = `<div class="empty">Não foi possível conectar com o Owlbear Rodeo: ${escapeHtml(error.message)}</div>`;
  }
});
