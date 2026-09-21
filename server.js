require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const storage = require('./services/storageService');
const { tokenMiddleware } = require('./middleware/teamAuth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true }));

fs.mkdirSync(storage.dataRoot(), { recursive: true });
app.use('/files', tokenMiddleware, express.static(storage.dataRoot()));

const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
}

app.get('/api/health', (req, res) => {
    res.json({ ok: true, name: 'scanFacturas' });
});

app.use('/api', tokenMiddleware);

app.use('/api/rutas', require('./routes/rutas'));
app.use('/api/events', require('./routes/events'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/totals', require('./routes/totals'));
app.use('/api/categories', require('./routes/categories'));

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: err.message || 'Algo salió mal en el servidor' });
});

function startServer(port = PORT) {
    return app.listen(port, () => {
        console.log(`scanFacturas API en http://localhost:${port}`);
    });
}

if (require.main === module) {
    startServer();
}

module.exports = { app, startServer };
