// Lee productos de las webs de Novomode y los devuelve en un formato único.
// Detecta sola la plataforma (Shopify, VTEX o WooCommerce).
// Uso: /api/productos?site=newbalance.com.ec&modo=marca&q=new balance&page=1

const SITIOS_PERMITIDOS = (process.env.SITIOS_PERMITIDOS ||
  "newbalance.com.ec,sie7e.ec").split(",").map(s => s.trim().toLowerCase());

const UA = { "User-Agent": "Mozilla/5.0 (NovomodeCatalogos/1.0)", "Accept": "application/json" };

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" }
});

const limpiarHost = s => (s || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();

async function getJSON(url) {
  const r = await fetch(url, { headers: UA, redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("json")) throw new Error("No es JSON");
  return r.json();
}

// ---------- Detección de plataforma ----------
async function detectar(base) {
  try { const d = await getJSON(`${base}/products.json?limit=1`); if (Array.isArray(d.products)) return "shopify"; } catch {}
  try { const d = await getJSON(`${base}/api/catalog_system/pub/products/search?_from=0&_to=0`); if (Array.isArray(d)) return "vtex"; } catch {}
  try { const d = await getJSON(`${base}/wp-json/wc/store/v1/products?per_page=1`); if (Array.isArray(d)) return "woocommerce"; } catch {}
  return null;
}

// Referencia base: prefijo común de los SKU de las tallas (CT500CLA-9, CT500CLA-10 → CT500CLA)
function refBase(skus) {
  const s = skus.filter(Boolean);
  if (!s.length) return "";
  if (s.length === 1) return s[0];
  let p = s[0];
  for (const x of s) while (!x.startsWith(p)) p = p.slice(0, -1);
  p = p.replace(/[-_. ]+$/, "");
  return p.length >= 4 ? p : s[0];
}

// ---------- Shopify ----------
async function shopify(base, modo, q, page) {
  const handle = modo === "coleccion" ? (q.match(/collections\/([^/?#]+)/)?.[1] || q) : null;
  const url = handle
    ? `${base}/collections/${encodeURIComponent(handle)}/products.json?limit=250&page=${page}`
    : `${base}/products.json?limit=250&page=${page}`;
  const d = await getJSON(url);
  const items = d.products.map(p => {
    const precios = p.variants.map(v => parseFloat(v.price)).filter(n => !isNaN(n));
    const antes = p.variants.map(v => parseFloat(v.compare_at_price)).filter(n => !isNaN(n) && n > 0);
    const img = p.images?.[0]?.src || "";
    return {
      id: String(p.id),
      nombre: p.title,
      ref: refBase(p.variants.map(v => v.sku)),
      precio: precios.length ? Math.min(...precios) : null,
      precioAntes: antes.length ? Math.max(...antes) : null,
      imagen: img ? img + (img.includes("?") ? "&" : "?") + "width=800" : "",
      url: `${base}/products/${p.handle}`,
      marca: p.vendor || "",
      etiquetas: [...(Array.isArray(p.tags) ? p.tags : String(p.tags || "").split(",")), p.product_type].map(t => String(t || "").trim()).filter(Boolean),
      disponible: p.variants.some(v => v.available !== false),
      fecha: p.published_at || p.created_at || ""
    };
  });
  return { items, hayMas: d.products.length === 250 };
}

// ---------- VTEX ----------
function vtexImg(u) { return (u || "").replace(/\/ids\/(\d+)(-\d+-\d+)?\//, "/ids/$1-800-800/"); }

async function vtex(base, modo, q, page) {
  const por = 50, from = (page - 1) * por, to = from + por - 1;
  let url;
  if (modo === "coleccion") {
    const ruta = q.replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "").replace(/^\/|\/$/g, "");
    const partes = ruta.split("/").filter(Boolean);
    url = `${base}/api/catalog_system/pub/products/search/${partes.map(encodeURIComponent).join("/")}?map=${partes.map(() => "c").join(",")}&_from=${from}&_to=${to}`;
  } else {
    url = `${base}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(q)}&_from=${from}&_to=${to}`;
  }
  const d = await getJSON(url);
  const items = d.map(p => {
    const it = p.items?.[0] || {};
    const of = it.sellers?.[0]?.commertialOffer || {};
    const clusters = [...Object.values(p.clusterHighlights || {}), ...Object.values(p.productClusters || {})];
    return {
      id: String(p.productId),
      nombre: p.productName,
      ref: p.productReference || it.referenceId?.[0]?.Value || "",
      precio: of.Price ?? null,
      precioAntes: of.ListPrice && of.ListPrice > of.Price ? of.ListPrice : null,
      imagen: vtexImg(it.images?.[0]?.imageUrl),
      url: p.link || `${base}/${p.linkText}/p`,
      marca: p.brand || "",
      etiquetas: [...clusters, ...(p.categories || []).flatMap(c => c.split("/")), p.brand].map(t => String(t || "").trim()).filter(Boolean),
      disponible: (p.items || []).some(i => (i.sellers?.[0]?.commertialOffer?.AvailableQuantity || 0) > 0),
      fecha: p.releaseDate || ""
    };
  });
  return { items, hayMas: d.length === por && page < 50 };
}

// ---------- WooCommerce ----------
async function woo(base, modo, q, page) {
  let url = `${base}/wp-json/wc/store/v1/products?per_page=100&page=${page}`;
  if (modo === "coleccion") {
    const slug = q.replace(/[?#].*$/, "").replace(/\/$/, "").split("/").pop();
    const cats = await getJSON(`${base}/wp-json/wc/store/v1/products/categories?slug=${encodeURIComponent(slug)}`).catch(() => []);
    if (cats[0]) url += `&category=${cats[0].id}`; else url += `&search=${encodeURIComponent(slug)}`;
  } else if (q) url += `&search=${encodeURIComponent(q)}`;
  const d = await getJSON(url);
  const items = d.map(p => {
    const m = Math.pow(10, p.prices?.currency_minor_unit ?? 2);
    const precio = p.prices?.price ? Number(p.prices.price) / m : null;
    const regular = p.prices?.regular_price ? Number(p.prices.regular_price) / m : null;
    return {
      id: String(p.id),
      nombre: p.name,
      ref: p.sku || "",
      precio,
      precioAntes: regular && precio && regular > precio ? regular : null,
      imagen: p.images?.[0]?.src || "",
      url: p.permalink,
      marca: (p.brands || []).map(b => b.name).join(" "),
      etiquetas: [...(p.tags || []).map(t => t.name), ...(p.categories || []).map(c => c.name)],
      disponible: p.is_in_stock !== false,
      fecha: ""
    };
  });
  return { items, hayMas: d.length === 100 };
}

const LECTORES = { shopify, vtex, woocommerce: woo };

export default async (req) => {
  const u = new URL(req.url);
  const host = limpiarHost(u.searchParams.get("site"));
  if (!SITIOS_PERMITIDOS.includes(host)) return json({ error: `Sitio no permitido: ${host}. Agrégalo en la variable SITIOS_PERMITIDOS de Netlify.` }, 400);
  const base = `https://www.${host}`;
  const modo = u.searchParams.get("modo") || "marca";
  const q = (u.searchParams.get("q") || "").trim();
  const page = Math.max(1, parseInt(u.searchParams.get("page") || "1", 10));

  try {
    let plataforma = u.searchParams.get("plataforma");
    if (!LECTORES[plataforma]) plataforma = await detectar(base);
    if (!plataforma) return json({ error: `No pude reconocer la plataforma de ${host}. Pásale este mensaje a IT o a Claude para agregar un lector a medida.` }, 422);
    if (u.searchParams.get("detectar")) return json({ plataforma });
    const { items, hayMas } = await LECTORES[plataforma](base, modo, q, page);
    return json({ plataforma, page, hayMas, items });
  } catch (e) {
    return json({ error: `Error leyendo ${host}: ${e.message}` }, 502);
  }
};

export const config = { path: "/api/productos" };
