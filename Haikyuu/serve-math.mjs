/** Regras puras de posicionamento. Cada célula equivale a 1,5 m (configuração da cena). */
export function courtFromCorners(a, b) {
  if (![a?.x, a?.y, b?.x, b?.y].every(Number.isFinite)) throw new Error("Coordenadas inválidas.");
  const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
  const max = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  if (max.x - min.x < 20 || max.y - min.y < 20) throw new Error("Marque dois cantos opostos da quadra.");
  return { min, max, midX: (min.x + max.x) / 2, version: 1 };
}
export function isCourtValid(c) {
  return !!c && [c.min?.x,c.min?.y,c.max?.x,c.max?.y,c.midX].every(Number.isFinite)
    && c.min.x < c.midX && c.midX < c.max.x && c.min.y < c.max.y;
}
/** Quatro células tocadas pelo quadrado de 1 célula centrado no cruzamento. */
export function calculateServe(intersection, dpi, court, serverX) {
  if (!Number.isFinite(dpi) || dpi <= 0 || !isCourtValid(court) || !Number.isFinite(serverX)) {
    return { valid: false, reason: "Calibre a quadra e selecione um sacador válido.", cells: [] };
  }
  const sourceSide = serverX < court.midX ? "LEFT" : "RIGHT";
  if (Math.abs(serverX - court.midX) < 0.001) {
    return { valid: false, reason: "O sacador está sobre a linha central.", cells: [] };
  }
  const cells = [
    { x: intersection.x-dpi/2, y: intersection.y-dpi/2 },
    { x: intersection.x+dpi/2, y: intersection.y-dpi/2 },
    { x: intersection.x-dpi/2, y: intersection.y+dpi/2 },
    { x: intersection.x+dpi/2, y: intersection.y+dpi/2 },
  ];
  const eps = Math.max(0.00001, dpi * 0.0001);
  const valid = cells.every(p => p.x >= court.min.x+eps && p.x <= court.max.x-eps &&
    p.y >= court.min.y+eps && p.y <= court.max.y-eps &&
    (sourceSide === "LEFT" ? p.x > court.midX+eps : p.x < court.midX-eps));
  return {
    valid, cells, sourceSide,
    reason: valid ? "" : "Posicione a mira até os quatro quadradinhos caberem na quadra adversária."
  };
}
export function pickCell(cells, random = Math.random) {
  if (!Array.isArray(cells) || !cells.length) throw new Error("Nenhuma célula para sortear.");
  const r = Math.min(0.999999999999, Math.max(0, random()));
  return cells[Math.floor(r*cells.length)];
}
