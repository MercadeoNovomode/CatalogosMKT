// Trae una imagen de producto para que el navegador pueda comprimirla y meterla en el PDF.
// Solo acepta imágenes de las webs permitidas y de sus CDNs.

const SITIOS = (process.env.SITIOS_PERMITIDOS || "newbalance.com.ec,sie7e.ec").split(",").map(s => s.trim().toLowerCase());
const CDNS = ["cdn.shopify.com", "vteximg.com.br", "vtexassets.com", "vtexcommercestable.com.br", "wp.com"];

export default async (req) => {
  const u = new URL(req.url).searchParams.get("u");
  let destino;
  try { destino = new URL(u); } catch { return new Response("URL inválida", { status: 400 }); }
  const h = destino.hostname.toLowerCase();
  const ok = [...SITIOS, ...CDNS].some(d => h === d || h.endsWith("." + d));
  if (!ok || destino.protocol !== "https:") return new Response("Host no permitido", { status: 403 });

  const r = await fetch(destino, { headers: { "User-Agent": "Mozilla/5.0 (NovomodeCatalogos/1.0)" } });
  const tipo = r.headers.get("content-type") || "";
  if (!r.ok || !tipo.startsWith("image/")) return new Response("No es una imagen", { status: 502 });
  const buf = await r.arrayBuffer();
  if (buf.byteLength > 5_500_000) return new Response("Imagen demasiado grande", { status: 413 });
  return new Response(buf, { headers: { "Content-Type": tipo, "Cache-Control": "public, max-age=86400" } });
};

export const config = { path: "/api/img" };
