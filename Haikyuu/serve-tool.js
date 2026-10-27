import { buildShape } from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0?bundle";
import { courtFromCorners, isCourtValid, calculateServe, pickCell } from "./serve-math.mjs";

const ID = "br.com.haikyuu.rtt";
export const TOOL = `${ID}/tool-saque`;
export const MODE_SERVE = `${ID}/mode-saque`;
export const MODE_COURT = `${ID}/mode-calibrar`;
export const COURT = `${ID}/court`;
const BALL = `${ID}/ball`;
const ICON = new URL("./icon.svg", import.meta.url).href;
let firstCorner = null;
let dpi = 0;
let previewIds = [];
let previewCreation = null;
let pointerSeq = 0;
let committing = false;
let modeIsActive = false;
let courtCache = null;
let serverCache = {id:null, position:null, x:null};

const notify = (obr, msg, severity) => obr.notification.show(msg, severity).catch(console.warn);

async function removePreview(obr) {
  ++pointerSeq;
  const ids = previewIds;
  previewIds = [];
  if (ids.length) {
    try { await obr.scene.local.deleteItems(ids); } catch (e) { console.warn("Preview:", e); }
  }
}

function rect(label, width, height, fill, opacity, stroke) {
  return buildShape().name(`Haikyuu!! • ${label}`).shapeType("RECTANGLE")
    .width(width).height(height).position({x:0,y:0}).layer("DRAWING")
    .disableHit(true).fillColor(fill).fillOpacity(opacity)
    .strokeColor(stroke).strokeOpacity(0.9).strokeWidth(2).build();
}

async function ensurePreview(obr) {
  if (previewIds.length) return;
  if (previewCreation) return previewCreation;
  // Quatro quadrados fantasma = quadrículas candidatas; o último é a mira real.
  const shapes = [
    ...Array.from({length:4}, (_,i) => rect(`Quadradinho ${i+1}`, dpi, dpi, "#74C3FF", 0.13, "#69B7F5")),
    rect("Mira 1,5 × 1,5 m", dpi, dpi, "#28AAEA", 0.3, "#00D5FF")
  ];
  previewCreation = (async () => {
    await obr.scene.local.addItems(shapes);
    previewIds = shapes.map(s => s.id);
    if (!modeIsActive) await removePreview(obr);
  })();
  try { await previewCreation; }
  finally { previewCreation = null; }
}

async function getSnapshot(obr, point, toolMeta) {
  const corner = await obr.scene.grid.snapPosition(point, 1, true, false);
  if (!courtCache) {
    const courtMeta = await obr.scene.getMetadata();
    courtCache = courtMeta[COURT] || null;
  }
  const court = courtCache;
  const serverId = typeof toolMeta?.serverId === "string" ? toolMeta.serverId : null;
  if (!serverId) {
    return {corner, result:{valid:false,reason:"Selecione um jogador e escolha Saque por Baixo na ficha.",cells:[]}};
  }
  if (!isCourtValid(court)) {
    return {corner, result:{valid:false,reason:"O mestre precisa calibrar a quadra primeiro.",cells:[]}};
  }
  if (serverCache.id !== serverId || !Number.isFinite(serverCache.x)) {
    const [server] = await obr.scene.items.getItems([serverId]);
    if (!server || server.layer !== "CHARACTER") {
      return {corner, result:{valid:false,reason:"O token do sacador não existe mais.",cells:[]}};
    }
    const bounds = await obr.scene.items.getItemBounds([serverId]);
    serverCache = {id:serverId, position:{...server.position}, x: bounds?.center?.x ?? server.position.x};
  }
  const sourceX = serverCache.x;
  const result = calculateServe(corner, dpi, court, sourceX);
  return {corner, result, serverId};
}

async function previewMove(obr, point, meta) {
  const seq = ++pointerSeq;
  if (!modeIsActive) return;
  if (!dpi) dpi = await obr.scene.grid.getDpi();
  const snapshot = await getSnapshot(obr, point, meta);
  if (seq !== pointerSeq) return;
  if (!snapshot.result.valid) { await removePreview(obr); return; }
  await ensurePreview(obr);
  if (seq !== pointerSeq || !modeIsActive) return;
  if (!previewIds.length) return;
  const cellPositions = snapshot.result.cells.map(cell => ({x:cell.x-dpi/2,y:cell.y-dpi/2}));
  const aim = { x:snapshot.corner.x-dpi/2, y:snapshot.corner.y-dpi/2 };
  const byId = new Map(previewIds.map((id,i)=>[id, i]));
  await obr.scene.local.updateItems(previewIds, items => {
    for (const item of items) {
      const idx = byId.get(item.id);
      item.position = idx === 4 ? aim : cellPositions[idx];
    }
  });
}

async function executeServe(obr, point, metadata) {
  if (committing) return;
  committing = true;
  try {
    if (!dpi) dpi = await obr.scene.grid.getDpi();
    if ((await obr.scene.grid.getType()) !== "SQUARE") throw new Error("O Saque por Baixo exige uma grade quadrada.");
    if (metadata?.serveType !== "underhand") throw new Error("Escolha Saque por Baixo na ficha primeiro.");
    const snapshot = await getSnapshot(obr, point, metadata);
    if (!snapshot.result.valid) throw new Error(snapshot.result.reason);
    const balls = await obr.scene.items.getItems(item => item.layer === "MOUNT" && item.metadata?.[BALL] === true);
    if (balls.length !== 1) throw new Error("O mestre precisa definir uma única bola na camada Montarias.");
    const ball = balls[0];
    if (ball.locked) throw new Error("Desbloqueie o token da bola antes de sacar.");
    // Sorteio uniforme entre 4 destinos. A fonte de aleatoriedade do navegador
    // não interfere com a rolagem de atributos, que continua no Dice+.
    const byte = new Uint32Array(1);
    crypto.getRandomValues(byte);
    const target = pickCell(snapshot.result.cells, () => byte[0] / 4294967296);
    // Ajusta pelo centro visual do item, e não pela âncora do arquivo/imagem.
    const ballBounds = await obr.scene.items.getItemBounds([ball.id]);
    const center = ballBounds?.center ?? ball.position;
    await obr.scene.items.updateItems([ball.id], items => {
      for (const item of items) {
        item.position.x += target.x - center.x;
        item.position.y += target.y - center.y;
      }
    });
    // Um clique = um saque. Novo saque exige preparação na ficha.
    await obr.tool.setMetadata(TOOL, {serverId:""});
    await removePreview(obr);
    await notify(obr,"🏐 Saque por Baixo! Bola sorteada em um dos 4 quadradinhos.");
  } catch (err) {
    console.error("Erro no saque", err);
    await notify(obr, `Saque: ${err?.message || "não foi possível mover a bola"}`, "ERROR");
  } finally { committing = false; }
}

export async function initServeTool(obr) {
  await obr.tool.create({
    id: TOOL,
    icons: [{ icon: ICON, label: "Haikyuu!! • Saque / Calibrar quadra" }],
    defaultMode: MODE_SERVE,
    defaultMetadata: {serveType:"underhand", serverId:""}
  });
  await obr.tool.createMode({
    id: MODE_SERVE,
    icons: [{icon:ICON, label:"Mirar Saque", filter:{activeTools:[TOOL]}}],
    cursors:[{cursor:"crosshair"}],
    onActivate() {modeIsActive = true;},
    onToolMove(ctx,event) { void previewMove(obr,event.pointerPosition,ctx.metadata).catch(console.warn); },
    onToolClick(ctx,event) { void executeServe(obr,event.pointerPosition,ctx.metadata); return false; },
    onDeactivate() {modeIsActive = false;void removePreview(obr);},
    onToolDragCancel() {void removePreview(obr);},
  });
  await obr.tool.createMode({
    id: MODE_COURT,
    icons: [{icon:ICON, label:"Calibrar Quadra (mestre)", filter:{activeTools:[TOOL],roles:["GM"]}}],
    cursors:[{cursor:"crosshair"}],
    onActivate() {firstCorner=null;void removePreview(obr);},
    onDeactivate() {firstCorner=null;},
    onToolClick(_ctx,event) {void (async () => {
      if ((await obr.player.getRole()) !== "GM") { await notify(obr,"Somente o mestre pode calibrar a quadra.","ERROR"); return; }
      if (!firstCorner) {
        firstCorner = event.pointerPosition;
        await notify(obr,"📍 Primeiro canto marcado. Agora clique no canto inferior direito da quadra.");
      } else {
        const a = firstCorner;firstCorner=null;
        try {
          const court = courtFromCorners(a,event.pointerPosition);
          await obr.scene.setMetadata({[COURT]:court});
          await notify(obr,"✅ Quadra calibrada! Linha da rede definida no meio.");
          await obr.tool.activateMode(TOOL, MODE_SERVE);
        } catch (e) {await notify(obr, e.message,"ERROR");}
      }
    })().catch(console.error); return false;},
  });
  obr.scene.onReadyChange(ready => {
    modeIsActive = false;
    void removePreview(obr); firstCorner=null; dpi=0; courtCache=null;
    serverCache={id:null,position:null,x:null};
  });
  obr.scene.onMetadataChange(meta => {courtCache=meta[COURT] || null;void removePreview(obr);});
  obr.scene.items.onChange(items => {
    if (!serverCache.id) return;
    const current = items.find(x=>x.id === serverCache.id);
    if (!current || !serverCache.position || current.position.x!==serverCache.position.x || current.position.y!==serverCache.position.y) {
      serverCache={id:null,position:null,x:null};
    }
  });
  obr.tool.onToolChange(tool => { if (tool !== TOOL) {modeIsActive=false;void removePreview(obr);} });
  obr.tool.onToolModeChange(mode => {if (mode !== MODE_SERVE) {modeIsActive=false;void removePreview(obr);} });
  obr.scene.grid.onChange(() => { dpi=0;void removePreview(obr);});
}
