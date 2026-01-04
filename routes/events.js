const express = require('express');
const router = express.Router();
const db = require('../config/database');

// GET /api/events - Listar todos los eventos
router.get('/', (req, res) => {
    try {
        const events = db.prepare(`
      SELECT e.*, 
             COUNT(DISTINCT ex.id) as expense_count,
             COALESCE(SUM(ex.amount), 0) as total_amount
      FROM events e
      LEFT JOIN expenses ex ON e.id = ex.event_id
      GROUP BY e.id
      ORDER BY e.created_at DESC
    `).all();

        res.json(events);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener eventos' });
    }
});

// GET /api/events/:id - Obtener un evento específico con sus gastos
router.get('/:id', (req, res) => {
    try {
        const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);

        if (!event) {
            return res.status(404).json({ error: 'Evento no encontrado' });
        }

        const expenses = db.prepare(`
      SELECT e.*, c.name as category_name, c.icon as category_icon
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.event_id = ?
      ORDER BY e.expense_date DESC
    `).all(req.params.id);

        res.json({ ...event, expenses });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener evento' });
    }
});

// POST /api/events - Crear nuevo evento
router.post('/', (req, res) => {
    try {
        const { name, description, start_date, end_date } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }

        const stmt = db.prepare(`
      INSERT INTO events (name, description, start_date, end_date)
      VALUES (?, ?, ?, ?)
    `);

        const result = stmt.run(name, description, start_date, end_date);

        const newEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json(newEvent);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al crear evento' });
    }
});

// PUT /api/events/:id - Actualizar evento
router.put('/:id', (req, res) => {
    try {
        const { name, description, start_date, end_date, status } = req.body;

        const stmt = db.prepare(`
      UPDATE events 
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          start_date = COALESCE(?, start_date),
          end_date = COALESCE(?, end_date),
          status = COALESCE(?, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

        stmt.run(name, description, start_date, end_date, status, req.params.id);

        const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);

        if (!updated) {
            return res.status(404).json({ error: 'Evento no encontrado' });
        }

        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar evento' });
    }
});

// DELETE /api/events/:id - Eliminar evento
router.delete('/:id', (req, res) => {
    try {
        const stmt = db.prepare('DELETE FROM events WHERE id = ?');
        const result = stmt.run(req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Evento no encontrado' });
        }

        res.json({ message: 'Evento eliminado correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar evento' });
    }
});

// GET /api/events/:id/report - Generar reporte PDF del evento
router.get('/:id/report', async (req, res) => {
    try {
        const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);

        if (!event) {
            return res.status(404).json({ error: 'Evento no encontrado' });
        }

        const expenses = db.prepare(`
      SELECT * FROM expenses WHERE event_id = ? ORDER BY expense_date
    `).all(req.params.id);

        const categories = db.prepare('SELECT * FROM categories').all();

        const pdfService = require('../services/pdfService');
        const fileName = await pdfService.generateEventReport(event, expenses, categories);

        res.json({
            message: 'Reporte generado',
            file: `/uploads/${fileName}`,
            fileName
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al generar reporte' });
    }
});

module.exports = router;
