import {initServeTool} from "./serve-tool.js";
// SDK carrega via CDN: dispensa terminal/compilação para hospedagem no GitHub Pages.
import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0?bundle";

const ID = "br.com.haikyuu.rtt";
const BALL = `${ID}/ball`;
const PANEL_ID = `${ID}/side-sheet`;
const ICON = new URL("./icon.svg", import.meta.url).href;
const PANEL_URL = new URL("./index.html", import.meta.url).href;
let lastSelectedId = null;
let selectionGeneration = 0;
let panelOpening = false;

async function openSidePanel() {
  if (panelOpening) return;
  panelOpening = true;
  try {
    const [width, height] = await Promise.all([
      OBR.viewport.getWidth(), OBR.viewport.getHeight()
    ]);
    // Um popover na borda direita, semelhante a uma ficha lateral.
    await OBR.popover.open({
      id: PANEL_ID,
      url: PANEL_URL,
      width: Math.min(400, Math.max(280, width - 24)),
      height: Math.min(730, Math.max(340, height - 90)),
      anchorReference: "POSITION",
      anchorPosition: { left: Math.max(300, width - 10), top: 72 },
      anchorOrigin: { horizontal: "RIGHT", vertical: "TOP" },
      transformOrigin: { horizontal: "RIGHT", vertical: "TOP" },
      disableClickAway: true
    });
  } catch (error) {
    console.error("Haikyuu: não foi possível abrir a ficha", error);
  } finally {
    panelOpening = false;
  }
}

async function handleSelection(selection) {
  const id = Array.isArray(selection) && selection.length === 1 ? selection[0] : null;
  if (!id || id === lastSelectedId) {
    if (!id) lastSelectedId = null;
    return;
  }
  const generation = ++selectionGeneration;
  lastSelectedId = id;
  try {
    if (!(await OBR.scene.isReady())) return;
    const [item] = await OBR.scene.items.getItems([id]);
    if (generation !== selectionGeneration) return;
    if (item && (item.layer === "CHARACTER" || item.layer === "MOUNT")) {
      await openSidePanel();
    }
  } catch (error) {
    console.warn("Haikyuu: erro ao verificar seleção", error);
  }
}

async function defineBall(items) {
  // Somente um objeto marcado como bola por cena.
  const chosen = new Set(items.map(item => item.id));
  const previousBalls = await OBR.scene.items.getItems(item => item.metadata?.[BALL] === true);
  const ids = [...new Set([...previousBalls.map(item => item.id), ...chosen])];
  await OBR.scene.items.updateItems(ids, draft => {
    for (const item of draft) {
      if (chosen.has(item.id)) item.metadata[BALL] = true;
      else delete item.metadata[BALL];
    }
  });
  await OBR.notification.show("🏐 Bola definida! Você pode movê-la como montaria.");
}

OBR.onReady(async () => {
  try {
    await initServeTool(OBR);
    await OBR.contextMenu.create({
      id: `${ID}/abrir-ficha`,
      icons: [{
        icon: ICON,
        label: "Abrir ficha Haikyuu!!",
        filter: { min: 1, max: 1, every: [{ key: "layer", value: "CHARACTER" }] }
      }],
      async onClick(context) {
        await OBR.player.select([context.items[0].id], true);
        await openSidePanel();
      }
    });
    await OBR.contextMenu.create({
      id: `${ID}/definir-bola`,
      icons: [{
        icon: ICON,
        label: "Definir como bola de vôlei",
        filter: {
          min: 1, max: 1,
          roles: ["GM"],
          every: [{ key: "layer", value: "MOUNT" }]
        }
      }],
      async onClick(context) {
        try {
          await defineBall(context.items);
          await OBR.player.select([context.items[0].id], true);
          await openSidePanel();
        } catch (error) {
          console.error(error);
          await OBR.notification.show("Não foi possível definir a bola.", "ERROR");
        }
      }
    });

    // Selecionar um token também abre o painel. Ele acompanha a seleção atual.
    OBR.player.onChange(player => {
      void handleSelection(player.selection);
    });
    OBR.scene.onReadyChange(ready => {
      lastSelectedId = null;
      selectionGeneration++;
      if (ready) void OBR.player.getSelection().then(handleSelection).catch(console.error);
    });
    if (await OBR.scene.isReady()) {
      await handleSelection(await OBR.player.getSelection());
    }
  } catch (error) {
    console.error("Haikyuu: erro na inicialização de menus", error);
  }
});
