# scanFacturas (expense-tracker)

Backend Node/Express/SQLite + app iOS (SwiftUI + VisionKit) para escanear tickets de viaje, organizarlos por **fecha + ruta**, pedir el **CFDI (XML+PDF del emisor)** y clasificar el gasto.

La PWA no es el cliente. El reporte PDFKit de viaje **no** es un CFDI.

## Backend

```bash
npm install
cp .env.example .env
npm test
npm start
```

API en `http://localhost:3000`.

### Endpoints MVP

**Rutas** (`/api/rutas`, alias `/api/events`)

- `GET/POST /api/rutas`
- `GET/PUT/DELETE /api/rutas/:id`
- `GET /api/rutas/:id/totals`
- `GET /api/rutas/:id/report` — reporte de viaje (PDFKit), no factura fiscal

**Gastos**

- `GET /api/expenses?ruta_id=`
- `POST /api/expenses` — guarda imagen en `Tickets/{año}/{YYYY-MM-DD}_{slug}/`
- `POST /api/expenses/process-ticket` — imagen y/o `vision_text`; no inserta el gasto
- `GET /api/categories`

**Facturación CFDI**

- `GET/PUT /api/billing/profile` — un perfil fiscal
- `POST /api/billing/dictamen` — método + URL/folio (sin Playwright)
- `GET /api/billing/jobs` · `PATCH /api/billing/jobs/:id` (`pendiente` / `guiado` / `descargado` / `fallido`)
- `POST /api/billing/invoices` — XML+PDF del emisor a `Facturas/{año}/{YYYY-MM-DD}_{slug}/`
- `GET /api/billing/invoices`
- `GET /api/billing/guided-fields` — RFC/CP/régimen/email listos para pegar

**Totales:** `GET /api/totals?ruta_id=` · `GET /api/totals?agent_id=`

**Equipo (Vixor):** cada salida (`events`) puede llevar `agent_id` / `agent_name` / `cliente` / `zona`. `GET /api/rutas?agent_id=` filtra “mis salidas”; `X-Team-Scope: 1` (o `?team=1`) lista el equipo. Si `EXPENSE_API_TOKEN` está definido, hay que mandarlo en `X-Expense-Token` o `Authorization: Bearer`. El MVP iOS personal no lo necesita.

Carpetas (espejo del iPhone):

```
data/scanFacturas/
├── Tickets/{año}/{YYYY-MM-DD}_{SLUG}/TCK-YYYYMMDD-NNN.jpg
└── Facturas/{año}/{YYYY-MM-DD}_{SLUG}/TCK-YYYYMMDD-NNN_{UUID}.xml
```

## iOS

Abrir `ios/ScanFacturas/ScanFacturas.xcodeproj` en Xcode (Mac). Elegir Development Team y correr en un iPhone.

Pantallas: lista/detalle de ruta, escáner VisionKit, revisión del ticket, cola de facturación (abrir portal / copiar RFC), perfil fiscal, totales.

Archivos locales en `Documents/scanFacturas/` (visibles en la app Archivos). Share sheet / “Abrir en” importa XML+PDF a `Facturas/`.
