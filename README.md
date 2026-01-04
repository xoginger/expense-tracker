# 📊 Expense Tracker - Sistema de Gestión de Gastos

Aplicación web progresiva (PWA) para la gestión y control de gastos con análisis automático de tickets mediante OCR e inteligencia artificial.

## 🚀 Características

- **📸 Captura de Tickets**: Toma fotos de recibos y tickets de gastos
- **🤖 OCR Inteligente**: Extracción automática de datos usando Tesseract.js
- **📁 Gestión de Eventos**: Organiza gastos por proyectos o eventos
- **💰 Control de Gastos**: Seguimiento detallado de todos tus gastos
- **📄 Facturación Automática**: Genera PDFs profesionales con facturas
- **📱 PWA**: Funciona como aplicación nativa en móviles y desktop
- **💾 Base de Datos**: Almacenamiento local con SQLite

## 🛠️ Tecnologías

### Backend
- **Node.js** + **Express.js** - Servidor y API REST
- **SQLite** (better-sqlite3) - Base de datos
- **Tesseract.js** - OCR para análisis de imágenes
- **PDFKit** - Generación de documentos PDF
- **Multer** - Gestión de archivos subidos
- **Sharp** - Procesamiento de imágenes

### Frontend
- **PWA** - Progressive Web Application
- **HTML5** + **CSS3** + **JavaScript**

## 📋 Requisitos Previos

- Node.js v16 o superior
- npm o yarn

## 🔧 Instalación

1. Clona el repositorio:
```bash
git clone <url-del-repositorio>
cd expense-tracker
```

2. Instala las dependencias:
```bash
npm install
```

3. Configura las variables de entorno:
```bash
cp .env.example .env
```

Edita el archivo `.env` según tus necesidades.

4. Inicia el servidor:
```bash
# Modo producción
npm start

# Modo desarrollo (con auto-reload)
npm run dev
```

5. Abre tu navegador en `http://localhost:3000`

## 📁 Estructura del Proyecto

```
expense-tracker/
├── config/
│   └── database.js          # Configuración de SQLite
├── routes/
│   ├── events.js            # API de eventos/proyectos
│   ├── expenses.js          # API de gastos
│   └── billing.js           # API de facturación
├── services/
│   ├── ocrService.js        # Servicio de OCR
│   └── pdfService.js        # Generación de PDFs
├── public/                  # Archivos estáticos (PWA)
├── uploads/                 # Tickets y recibos subidos
├── server.js               # Punto de entrada
└── package.json
```

## 🔌 API Endpoints

### Eventos
- `GET /api/events` - Listar todos los eventos
- `POST /api/events` - Crear nuevo evento
- `GET /api/events/:id` - Obtener evento específico
- `PUT /api/events/:id` - Actualizar evento
- `DELETE /api/events/:id` - Eliminar evento

### Gastos
- `GET /api/expenses` - Listar todos los gastos
- `POST /api/expenses` - Crear nuevo gasto
- `POST /api/expenses/upload` - Subir ticket con OCR
- `GET /api/expenses/:id` - Obtener gasto específico
- `PUT /api/expenses/:id` - Actualizar gasto
- `DELETE /api/expenses/:id` - Eliminar gasto

### Facturación
- `POST /api/billing/generate` - Generar factura en PDF
- `GET /api/billing/invoices` - Listar facturas generadas

## 🎯 Uso

1. **Crear un Evento/Proyecto**: Define un proyecto o evento para organizar gastos
2. **Registrar Gastos**: 
   - Manualmente introduciendo datos
   - Fotografiando tickets (OCR automático)
3. **Revisar y Editar**: Verifica los datos extraídos automáticamente
4. **Generar Facturas**: Crea PDFs profesionales para reportes

## 🔒 Seguridad

- Validación de datos en todas las entradas
- Sanitización de archivos subidos
- Límites de tamaño en uploads
- CORS configurado

## 📝 Variables de Entorno

```env
PORT=3000                    # Puerto del servidor
NODE_ENV=development        # Entorno (development/production)
```

## 🚧 Desarrollo

Para contribuir al proyecto:

1. Crea una rama para tu feature: `git checkout -b feature/nueva-funcionalidad`
2. Realiza tus cambios y commits
3. Push a la rama: `git push origin feature/nueva-funcionalidad`
4. Crea un Pull Request

## 📄 Licencia

MIT License - Consulta el archivo LICENSE para más detalles

## 📞 Soporte

Para reportar bugs o solicitar nuevas características, abre un issue en el repositorio.

---

**Desarrollado con ❤️ para facilitar la gestión de gastos**
