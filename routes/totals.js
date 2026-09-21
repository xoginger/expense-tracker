const express = require('express');
const router = express.Router();
const db = require('../config/database');

router.get('/', (req, res) => {
    try {
        const { ruta_id, event_id, agent_id } = req.query;
        const tripId = ruta_id || event_id;

        let byRutaQuery = `
      SELECT ev.id as ruta_id, ev.slug, ev.name, ev.origin, ev.destination,
             ev.agent_id, ev.agent_name,
             COUNT(e.id) as count, COALESCE(SUM(e.amount), 0) as total
      FROM events ev
      LEFT JOIN expenses e ON e.event_id = ev.id
    `;
        const rutaParams = [];
        const rutaWhere = [];
        if (tripId) {
            rutaWhere.push('ev.id = ?');
            rutaParams.push(tripId);
        }
        if (agent_id) {
            rutaWhere.push('ev.agent_id = ?');
            rutaParams.push(agent_id);
        }
        if (rutaWhere.length) {
            byRutaQuery += ' WHERE ' + rutaWhere.join(' AND ');
        }
        byRutaQuery += ' GROUP BY ev.id ORDER BY total DESC';

        let byCategoryQuery = `
      SELECT c.id as category_id, c.name, c.icon, c.color,
             COUNT(e.id) as count, COALESCE(SUM(e.amount), 0) as total
      FROM categories c
      LEFT JOIN expenses e ON e.category_id = c.id
    `;
        const catParams = [];
        if (tripId) {
            byCategoryQuery += ' AND e.event_id = ?';
            catParams.push(tripId);
        } else if (agent_id) {
            byCategoryQuery += ' AND e.event_id IN (SELECT id FROM events WHERE agent_id = ?)';
            catParams.push(agent_id);
        }
        byCategoryQuery += ' GROUP BY c.id ORDER BY total DESC';

        const by_ruta = db.prepare(byRutaQuery).all(...rutaParams);
        const by_category = db.prepare(byCategoryQuery).all(...catParams);
        const grand = by_ruta.reduce((sum, row) => sum + (row.total || 0), 0);
        const expense_count = by_ruta.reduce((sum, row) => sum + (row.count || 0), 0);

        res.json({
            grand_total: grand,
            expense_count,
            by_ruta,
            by_category
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener totales' });
    }
});

module.exports = router;
