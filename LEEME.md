# Generador de catálogos · Novomode

## Publicar (una sola vez)
1. Sube esta carpeta a un repo nuevo en GitHub (ej. MercadeoNovomode/catalogos) y conéctalo en Netlify
   → "Add new site" → "Import from Git". No necesita build: Netlify detecta el netlify.toml.
   (El drag-and-drop de Netlify NO sirve aquí porque no publica las funciones de /netlify/functions.)
2. Abre la URL del sitio y listo.

## Agregar otra web (Chevignon, Outlets…)
En Netlify → Site configuration → Environment variables, crea:
SITIOS_PERMITIDOS = newbalance.com.ec,sie7e.ec,otraweb.com
y agrega la opción en el <select id="sitio"> de index.html.

## Cómo lee las webs
La función /api/productos detecta sola si la web es Shopify, VTEX o WooCommerce.
- "Marca" / "Familia": busca por texto en nombre, referencia, marca y etiquetas.
- "Link": pega el link de la sección (ej. la pestaña NEW de New Balance) y trae exactamente esa sección.
- El filtro de etiqueta (por defecto NEW) busca en etiquetas, colecciones y destacados.

## Peso del PDF
Las fotos se redimensionan a 640 px y se comprimen en JPEG. Un catálogo de ~20 productos
con portada suele quedar entre 1 y 3 MB.
