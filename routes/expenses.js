const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const ocrService = require('../services/ocrService');
const dictamenService = require('../services/dictamenService');
const storage = require('../services/storageService');
const rutas = require('../lib/rutas');

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, storage.ensureIncomingDir());
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
            cb(null, 'incoming-' + uniqueSuffix + path.extname(file.originalname));
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedExt = /jpeg|jpg|png|pdf|heic|heif/;
        const extname = allowedExt.test(path.extname(file.originalname).toLowerCase());
        const allowedMime = /image\/(jpeg|jpg|png|heic|heif)|application\/pdf/;
        const mimetype = allowedMime.test(file.mimetype) || file.mimetype === 'application/octet-stream';

        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Solo se permiten imágenes (JPEG, PNG, HEIC) o PDF'));
    }
});

function rutaIdFrom(req) {
    return req.body.ruta_id || req.body.event_id || req.query.ruta_id || req.query.event_id || null;
}

function loadRuta(id) {
    if (!id) return null;
    return rutas.getRuta(db, id);
}

function asExpense(row) {
    if (!row) return null;
    return {
        ...row,
        ruta_id: row.event_id,
        event_id: row.event_id
    };
}

router.get('/categories/all', (req, res) => {
    try {
        const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
        res.json(categories);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener categorías' });
    }
});

router.post('/process-ticket', upload.single('image'), async (req, res) => {
    try {
        const visionText = req.body.vision_text || req.body.ocr_text || req.body.text;
        if (!req.file && !(visionText && String(visionText).trim())) {
            return res.status(400).json({ error: 'Se requiere imagen o texto Vision' });
        }

        const imagePath = req.file ? req.file.path : null;
        const ticketData = await ocrService.processTicket(imagePath, visionText);

        let categoryId = null;
        let categoryName = ticketData.suggestedCategory || null;
        if (categoryName) {
            const category = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName);
            categoryId = category ? category.id : null;
        }

        const dictamen = dictamenService.analyze(ticketData);
        const ruta = loadRuta(rutaIdFrom(req));

        let stored = null;
        if (req.file && ruta) {
            stored = storage.saveTicketFiles({
                ruta,
                sourcePath: req.file.path,
                originalName: req.file.originalname,
                metadata: {
                    ...ticketData,
                    dictamen,
                    status: 'review'
                }
            });
            try {
                fs.unlinkSync(req.file.path);
            } catch (_) {
                /* ignore */
            }
        }

        res.json({
            ...ticketData,
            imagePath: stored ? stored.image_path : (req.file ? req.file.filename : null),
            image_path: stored ? stored.image_path : null,
            ticket_code: stored ? stored.ticket_code : null,
            metadata_path: stored ? stored.metadata_path : null,
            categoryId,
            category_id: categoryId,
            dictamen
        });
    } catch (error) {
        console.error(error);
        const msg = error.message || 'Error al procesar ticket';
        const bad = /pequeña|ilegible|Solo se permiten|Se requiere imagen/i.test(msg);
        res.status(bad ? 400 : 500).json({ error: msg });
    }
});

router.get('/', (req, res) => {
    try {
        const { event_id, ruta_id, category_id, start_date, end_date } = req.query;
        const tripId = ruta_id || event_id;

        let query = `
      SELECT e.*, c.name as category_name, c.icon as category_icon,
             ev.name as event_name, ev.slug as ruta_slug, ev.origin, ev.destination
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      LEFT JOIN events ev ON e.event_id = ev.id
      WHERE 1=1
    `;
        const params = [];

        if (tripId) {
            query += ' AND e.event_id = ?';
            params.push(tripId);
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
        res.json(expenses.map(asExpense));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener gastos' });
    }
});

router.get('/:id', (req, res) => {
    try {
        const expense = db.prepare(`
      SELECT e.*, c.name as category_name, ev.name as event_name, ev.slug as ruta_slug,
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

        const job = db.prepare('SELECT * FROM invoice_jobs WHERE expense_id = ? ORDER BY id DESC').get(expense.id);
        const cfdi = db.prepare('SELECT * FROM cfdi_documents WHERE expense_id = ? ORDER BY id DESC').get(expense.id);

        res.json({ ...asExpense(expense), invoice_job: job || null, cfdi: cfdi || null });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener gasto' });
    }
});

router.post('/', upload.single('image'), async (req, res) => {
    try {
        const body = req.body;
        const amount = body.amount;
        const expense_date = body.expense_date;
        const tripId = rutaIdFrom(req);

        if (!amount || !expense_date) {
            return res.status(400).json({ error: 'Monto y fecha son requeridos' });
        }

        const ruta = loadRuta(tripId);
        let imagePath = body.image_path || null;
        let ticketCode = body.ticket_code || null;
        let metadataPath = body.metadata_path || null;

        if (req.file) {
            if (!ruta) {
                return res.status(400).json({ error: 'ruta_id es requerido para guardar el ticket en carpeta' });
            }
            const stored = storage.saveTicketFiles({
                ruta,
                sourcePath: req.file.path,
                originalName: req.file.originalname,
                metadata: {
                    ticket_code: ticketCode || undefined,
                    amount,
                    merchant: body.merchant,
                    expense_date,
                    ocr_text: body.ocr_text,
                    category_id: body.category_id
                }
            });
            imagePath = stored.image_path;
            ticketCode = stored.ticket_code;
            metadataPath = stored.metadata_path;
            try {
                fs.unlinkSync(req.file.path);
            } catch (_) {
                /* ignore */
            }
        }

        const stmt = db.prepare(`
      INSERT INTO expenses (
        event_id, category_id, amount, description, merchant, expense_date,
        image_path, ocr_text, has_billing_data, ticket_code, metadata_path,
        uso_cfdi, forma_pago, iva, deducible, confianza_categoria
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        const hasBilling = body.has_billing_data ? 1 : (body.rfc ? 1 : 0);

        const result = stmt.run(
            tripId,
            body.category_id || null,
            amount,
            body.description || null,
            body.merchant || null,
            expense_date,
            imagePath,
            body.ocr_text || null,
            hasBilling,
            ticketCode,
            metadataPath,
            body.uso_cfdi || null,
            body.forma_pago || null,
            body.iva || null,
            body.deducible ? 1 : 0,
            body.confianza_categoria || null
        );

        const expenseId = result.lastInsertRowid;

        if (body.rfc || body.billing_email || body.billing_address) {
            db.prepare(`
        INSERT INTO ticket_billing_data (expense_id, rfc, business_name, address, email, additional_data)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
                expenseId,
                body.rfc || null,
                body.business_name || null,
                body.billing_address || null,
                body.billing_email || null,
                body.folio ? JSON.stringify({ folio: body.folio }) : null
            );
        }

        const newExpense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId);
        res.status(201).json(asExpense(newExpense));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al crear gasto' });
    }
});

router.put('/:id', (req, res) => {
    try {
        const { event_id, ruta_id, category_id, amount, description, merchant, expense_date, uso_cfdi, forma_pago, iva, deducible } = req.body;
        const tripId = ruta_id || event_id;

        const stmt = db.prepare(`
      UPDATE expenses
      SET event_id = COALESCE(?, event_id),
          category_id = COALESCE(?, category_id),
          amount = COALESCE(?, amount),
          description = COALESCE(?, description),
          merchant = COALESCE(?, merchant),
          expense_date = COALESCE(?, expense_date),
          uso_cfdi = COALESCE(?, uso_cfdi),
          forma_pago = COALESCE(?, forma_pago),
          iva = COALESCE(?, iva),
          deducible = COALESCE(?, deducible),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

        stmt.run(
            tripId || null,
            category_id,
            amount,
            description,
            merchant,
            expense_date,
            uso_cfdi,
            forma_pago,
            iva,
            deducible !== undefined ? (deducible ? 1 : 0) : null,
            req.params.id
        );

        const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
        if (!updated) {
            return res.status(404).json({ error: 'Gasto no encontrado' });
        }
        res.json(asExpense(updated));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar gasto' });
    }
});

router.delete('/:id', (req, res) => {
    try {
        const result = db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Gasto no encontrado' });
        }
        res.json({ message: 'Gasto eliminado correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar gasto' });
    }
});

module.exports = router;
