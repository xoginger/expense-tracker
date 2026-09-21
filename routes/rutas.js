const express = require('express');
const router = express.Router();
const db = require('../config/database');
const rutas = require('../lib/rutas');
const { agentIdFrom, teamScope, canSeeRuta } = require('../middleware/teamAuth');

router.get('/', (req, res) => {
    try {
        const opts = {};
        if (!teamScope(req) && agentIdFrom(req)) {
            opts.agent_id = agentIdFrom(req);
        }
        res.json(rutas.listRutas(db, opts));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener rutas' });
    }
});

router.get('/:id/totals', (req, res) => {
    try {
        const ruta = rutas.getRuta(db, req.params.id);
        if (!ruta || !canSeeRuta(req, ruta)) {
            return res.status(404).json({ error: 'Ruta no encontrada' });
        }

        const byCategory = db.prepare(`
      SELECT c.id as category_id, c.name, c.icon, c.color,
             COUNT(e.id) as count,
             COALESCE(SUM(e.amount), 0) as total
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.event_id = ?
      GROUP BY c.id
      ORDER BY total DESC
    `).all(req.params.id);

        const totals = db.prepare(`
      SELECT COUNT(id) as count, COALESCE(SUM(amount), 0) as total
      FROM expenses WHERE event_id = ?
    `).get(req.params.id);

        res.json({
            ruta,
            grand_total: totals.total,
            expense_count: totals.count,
            by_category: byCategory,
            by_ruta: [{
                ruta_id: ruta.id,
                slug: ruta.slug,
                name: ruta.name,
                origin: ruta.origin,
                destination: ruta.destination,
                total: totals.total,
                count: totals.count
            }]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener totales' });
    }
});

router.get('/:id/report', async (req, res) => {
    try {
        const ruta = rutas.getRuta(db, req.params.id);
        if (!ruta || !canSeeRuta(req, ruta)) {
            return res.status(404).json({ error: 'Ruta no encontrada' });
        }

        const expenses = db.prepare(`
      SELECT * FROM expenses WHERE event_id = ? ORDER BY expense_date
    `).all(req.params.id);
        const categories = db.prepare('SELECT * FROM categories').all();
        const pdfService = require('../services/pdfService');
        const report = await pdfService.generateEventReport(ruta, expenses, categories);

        res.json({
            message: 'Reporte de viaje generado (no es un CFDI)',
            file: `/files/${report.relativePath}`,
            fileName: report.fileName
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al generar reporte' });
    }
});

router.get('/:id', (req, res) => {
    try {
        const ruta = rutas.getRuta(db, req.params.id);
        if (!ruta || !canSeeRuta(req, ruta)) {
            return res.status(404).json({ error: 'Ruta no encontrada' });
        }

        const expenses = db.prepare(`
      SELECT e.*, c.name as category_name, c.icon as category_icon
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.event_id = ?
      ORDER BY e.expense_date DESC
    `).all(req.params.id);

        res.json({ ...ruta, expenses });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener ruta' });
    }
});

router.post('/', (req, res) => {
    try {
        const body = { ...req.body };
        if (!body.agent_id && agentIdFrom(req)) {
            body.agent_id = agentIdFrom(req);
        }
        const created = rutas.createRuta(db, body);
        res.status(201).json(created);
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ error: error.message || 'Error al crear ruta' });
    }
});

router.put('/:id', (req, res) => {
    try {
        const current = rutas.getRuta(db, req.params.id);
        if (!current || !canSeeRuta(req, current)) {
            return res.status(404).json({ error: 'Ruta no encontrada' });
        }
        const updated = rutas.updateRuta(db, req.params.id, req.body);
        if (!updated) {
            return res.status(404).json({ error: 'Ruta no encontrada' });
        }
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar ruta' });
    }
});

router.delete('/:id', (req, res) => {
    try {
        const current = rutas.getRuta(db, req.params.id);
        if (!current || !canSeeRuta(req, current)) {
            return res.status(404).json({ error: 'Ruta no encontrada' });
        }
        const result = db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Ruta no encontrada' });
        }
        res.json({ message: 'Ruta eliminada correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar ruta' });
    }
});

module.exports = router;
