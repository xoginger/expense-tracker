# scanFacturas (iOS)

Abrir en un Mac:

```
ios/ScanFacturas/ScanFacturas.xcodeproj
```

1. Signing & Capabilities → tu Development Team.
2. Si usas el Share Extension, el App Group `group.com.xoginger.scanFacturas` debe estar en el team.
3. En la pestaña Perfil, pon la URL del backend (`http://IP-DE-TU-MAC:3000` en un iPhone físico).
4. Corre en un iPhone o simulador iOS 17+.

Este entorno Linux no ejecuta Xcode ni el simulador iOS.

Pantallas: rutas, detalle, escáner VisionKit + OCR Vision, revisión del ticket, cola de facturación (abrir portal / copiar RFC), perfil fiscal, totales. Tickets y CFDIs se guardan en `Documents/scanFacturas/Tickets|Facturas/{año}/{YYYY-MM-DD}_{SLUG}/`.
