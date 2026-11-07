# Grupo Tesela · Organigrama e inversiones

App web instalable (PWA) con el organigrama de sociedades y activos del Grupo Tesela, fichas editables, modelo de rentabilidad, cartera, flujo de caja, documentos y decisiones.

- Datos: Supabase (lectura pública, edición solo con el login de Israel).
- Sin build: HTML, CSS y JavaScript planos; d3 y supabase-js vendorizados para funcionar sin conexión.
- Despliegue: Vercel desde este repositorio. Servidor local: `python -m http.server 8787` en esta carpeta.
