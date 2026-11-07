# Grupo Tesela · Organigrama e inversiones

App web instalable (PWA) con el organigrama de sociedades y activos del Grupo Tesela, fichas editables, modelo de rentabilidad, cartera, flujo de caja, documentos y decisiones.

- Datos: Supabase (lectura pública, edición solo con el login de Israel).
- Sin build: HTML, CSS y JavaScript planos; d3 y supabase-js vendorizados para funcionar sin conexión.
- Al publicar cambios de `app.js`, `styles.css` o `config.js`: subir el `?v=` en `index.html` y en la lista `SHELL` de `sw.js`, y el nombre `CACHE` de `sw.js` (GitHub Pages cachea 10 minutos y el service worker guarda copia).
- Publicada en GitHub Pages desde la rama `main`: https://israelat4grupo-gif.github.io/grupo-tesela-app/ (cada push la actualiza en uno o dos minutos). Servidor local: `python -m http.server 8787` en esta carpeta.
