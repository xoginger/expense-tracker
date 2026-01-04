const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../config/database');
const ocrService = require('../services/ocrService');

// Configurar multer para upload de imágenes
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'ticket-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Solo se permiten imágenes (JPEG, JPG, PNG)'));
    }
});

// GET /api/expenses - Listar gastos con filtros
router.get('/', (req, res) => {
    try {
        const { event_id, category_id, start_date, end_date } = req.query;

        let query = `
      SELECT e.*, c.name as category_name, c.icon as category_icon, ev.name as event_name
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      LEFT JOIN events ev ON e.event_id = ev.id
      WHERE 1=1
    `;
        const params = [];

        if (event_id) {
            query += ' AND e.event_id = ?';
            params.push(event_id);
        }

        if (category_id) {
            query += ' AND e.category_id = ?';
            params.push(category_id);
        }

        if (start_date) {
            query += ' AND e.expense_date >= ?';
            params.push(start_date);
        }

        if (end_date) {
            query += ' AND e.expense_date <= ?';
            params.push(end_date);
        }

        query += ' ORDER BY e.expense_date DESC';

        const expenses = db.prepare(query).all(...params);
        res.json(expenses);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener gastos' });
    }
});

// GET /api/expenses/:id - Obtener gasto específico
router.get('/:id', (req, res) => {
    try {
        const expense = db.prepare(`
      SELECT e.*, c.name as category_name, ev.name as event_name,
             tbd.rfc, tbd.business_name, tbd.address as billing_address
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      LEFT JOIN events ev ON e.event_id = ev.id
      LEFT JOIN ticket_billing_data tbd ON e.id = tbd.expense_id
      WHERE e.id = ?
    `).get(req.params.id);

        if (!expense) {
            return res.status(404).json({ error: 'Gasto no encontrado' });
        }

        res.json(expense);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener gasto' });
    }
});

// POST /api/expenses - Crear nuevo gasto
router.post('/', upload.single('image'), async (req, res) => {
    try {
        const { event_id, category_id, amount, description, merchant, expense_date } = req.body;

        if (!amount || !expense_date) {
            return res.status(400).json({ error: 'Monto y fecha son requeridos' });
        }

        const imagePath = req.file ? req.file.filename : null;

        const stmt = db.prepare(`
      INSERT INTO expenses (event_id, category_id, amount, description, merchant, expense_date, image_path)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

        const result = stmt.run(event_id, category_id, amount, description, merchant, expense_date, imagePath);
        const expenseId = result.lastInsertRowid;

        const newExpense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId);

        res.status(201).json(newExpense);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al crear gasto' });
    }
});

// POST /api/expenses/process-ticket - Procesar imagen con OCR
router.post('/process-ticket', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se proporcionó imagen' });
        }

        const imagePath = path.join(__dirname, '../uploads', req.file.filename);

        // Procesar con OCR
        const ticketData = await ocrService.processTicket(imagePath);

        // Buscar ID de categoría sugerida
        let categoryId = null;
        if (ticketData.suggestedCategory) {
            const category = db.prepare('SELECT id FROM categories WHERE name = ?').get(ticketData.suggestedCategory);
            categoryId = category ? category.id : null;
        }

        res.json({
            ...ticketData,
            imagePath: req.file.filename,
            categoryId
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al procesar ticket' });
    }
});

// PUT /api/expenses/:id - Actualizar gasto
router.put('/:id', (req, res) => {
    try {
        const { event_id, category_id, amount, description, merchant, expense_date } = req.body;

        const stmt = db.prepare(`
      UPDATE expenses 
      SET event_id = COALESCE(?, event_id),
          category_id = COALESCE(?, category_id),
          amount = COALESCE(?, amount),
          description = COALESCE(?, description),
          merchant = COALESCE(?, merchant),
          expense_date = COALESCE(?, expense_date),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

        stmt.run(event_id, category_id, amount, description, merchant, expense_date, req.params.id);

        const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);

        if (!updated) {
            return res.status(404).json({ error: 'Gasto no encontrado' });
        }

        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar gasto' });
    }
});

// DELETE /api/expenses/:id - Eliminar gasto
router.delete('/:id', (req, res) => {
    try {
        const stmt = db.prepare('DELETE FROM expenses WHERE id = ?');
        const result = stmt.run(req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Gasto no encontrado' });
        }

        res.json({ message: 'Gasto eliminado correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar gasto' });
    }
});

// GET /api/expenses/categories/all - Obtener todas las categorías
router.get('/categories/all', (req, res) => {
    try {
        const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
        res.json(categories);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener categorías' });
    }
});

module.exports = router;
