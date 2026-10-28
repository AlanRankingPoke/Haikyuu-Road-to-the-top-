
import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0?bundle";
import { initServeTool } from "./serve-tool.js";

const ID = "br.com.haikyuu.rtt";
const BALL = `${ID}/ball`;
const PANEL_ID = `${ID}/side-sheet`;
const ICON = new URL("./icon.jpg", import.meta.url).href;
const PANEL_URL = new URL("./index.html", import.meta.url).href;
let lastId = null;
let generation = 0;
let opening = false;

async function openLeftPanel() {
  if (opening) return;
  opening = true;
  try {
    const [width, height] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
    await OBR.popover.open({
      id: PANEL_ID,
      url: PANEL_URL,
      width: Math.min(385, Math.max(260, width - 24)),
      height: Math.min(730, Math.max(300, height - 95)),
      anchorReference: "POSITION",
      anchorPosition: { left: 12, top: 72 },
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      disableClickAway: true
    });
  } catch (error) {
    console.error("Haikyuu: falha ao abrir ficha lateral", error);
  } finally { opening = false; }
}

async function checkSelection(selection) {
  const id = Array.isArray(selection) && selection.length === 1 ? selection[0] : null;
  const sequence = ++generation;
  if (!id) { lastId = null; return; }
  if (id === lastId) return;
  lastId = id;
  try {
    if (!(await OBR.scene.isReady())) return;
    const [item] = await OBR.scene.items.getItems([id]);
    if (sequence !== generation) return;
    if (item && (item.layer === "CHARACTER" || item.layer === "MOUNT")) await openLeftPanel();
  } catch (error) { console.warn("Haikyuu: seleção", error); }
}

async function defineBall(item) {
  if ((await OBR.player.getRole()) !== "GM") return;
  if (item.layer !== "MOUNT") throw new Error("A bola deve estar em Montarias.");
  const balls = await OBR.scene.items.getItems(x => x.metadata?.[BALL] === true);
  const ids = [...new Set([...balls.map(x => x.id), item.id])];
  await OBR.scene.items.updateItems(ids, draft => {
    for (const token of draft) {
      if (token.id === item.id) token.metadata[BALL] = true;
      else delete token.metadata[BALL];
    }
  });
  await OBR.notification.show("🏐 Bola oficial definida na camada Montarias!");
}

OBR.onReady(async () => {
  try {
    await initServeTool(OBR);
    await OBR.contextMenu.create({
      id: `${ID}/abrir-ficha`,
      icons: [{ icon: ICON, label: "Abrir ficha Haikyuu!!", filter: {
        min: 1, max: 1, every: [{ key: "layer", value: "CHARACTER" }]
      } }],
      async onClick(context) {
        await OBR.player.select([context.items[0].id], true);
        await openLeftPanel();
      }
    });
    await OBR.contextMenu.create({
      id: `${ID}/definir-bola`,
      icons: [{ icon: ICON, label: "Definir como bola", filter: {
        min: 1, max: 1, roles: ["GM"], every: [{ key: "layer", value: "MOUNT" }]
      } }],
      async onClick(context) {
        try {
          await defineBall(context.items[0]);
          await OBR.player.select([context.items[0].id], true);
          await openLeftPanel();
        } catch (error) {
          console.error(error);
          await OBR.notification.show(`Bola: ${error.message}`, "ERROR");
        }
      }
    });
    OBR.player.onChange(player => { void checkSelection(player.selection); });
    OBR.scene.onReadyChange(ready => {
      lastId = null;
      generation++;
      if (ready) void OBR.player.getSelection().then(checkSelection).catch(console.warn);
    });
    if (await OBR.scene.isReady()) await checkSelection(await OBR.player.getSelection());
  } catch (error) { console.error("Haikyuu: inicialização", error); }
});
