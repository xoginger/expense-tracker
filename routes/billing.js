const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const ocrService = require('../services/ocrService');
const dictamenService = require('../services/dictamenService');
const storage = require('../services/storageService');
const { parseCfdiXml } = require('../services/cfdiService');
const rutas = require('../lib/rutas');

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, storage.ensureIncomingDir());
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
            cb(null, 'cfdi-' + uniqueSuffix + path.extname(file.originalname));
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 }
});

function getSingleProfile() {
    return db.prepare(`
      SELECT * FROM billing_profiles ORDER BY is_default DESC, id ASC LIMIT 1
    `).get();
}

function shapeProfile(profile) {
    if (!profile) return null;
    return profile;
}

function guidedFields(profile) {
    if (!profile) return null;
    const lines = [
        `RFC: ${profile.rfc || ''}`,
        `Razón social: ${profile.business_name || ''}`,
        `Régimen: ${profile.tax_regime || ''}`,
        `CP: ${profile.postal_code || ''}`,
        `Email: ${profile.email || ''}`
    ];
    return {
        rfc: profile.rfc,
        business_name: profile.business_name,
        tax_regime: profile.tax_regime,
        postal_code: profile.postal_code,
        email: profile.email,
        copy_text: lines.join('\n')
    };
}

function upsertProfile(body, existing) {
    const rfc = body.rfc ? String(body.rfc).toUpperCase() : existing && existing.rfc;
    const business_name = body.business_name || (existing && existing.business_name);
    const postal_code = body.postal_code || (existing && existing.postal_code);

    if (!rfc || !business_name || !postal_code) {
        const err = new Error('RFC, razón social y código postal son requeridos');
        err.status = 400;
        throw err;
    }

    if (existing) {
        db.prepare(`
      UPDATE billing_profiles
      SET name = COALESCE(?, name),
          rfc = ?,
          business_name = ?,
          tax_regime = COALESCE(?, tax_regime),
          postal_code = ?,
          address = COALESCE(?, address),
          email = COALESCE(?, email),
          is_default = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
            body.name || business_name,
            rfc,
            business_name,
            body.tax_regime,
            postal_code,
            body.address,
            body.email,
            existing.id
        );
        return getSingleProfile();
    }

    const result = db.prepare(`
      INSERT INTO billing_profiles (name, rfc, business_name, tax_regime, postal_code, address, email, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
        body.name || business_name,
        rfc,
        business_name,
        body.tax_regime || null,
        postal_code,
        body.address || null,
        body.email || null
    );
    return db.prepare('SELECT * FROM billing_profiles WHERE id = ?').get(result.lastInsertRowid);
}

router.get('/profiles', (req, res) => {
    try {
        const profiles = db.prepare(`
      SELECT * FROM billing_profiles ORDER BY is_default DESC, created_at DESC
    `).all();
        res.json(profiles);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener perfiles' });
    }
});

router.get('/profile', (req, res) => {
    try {
        const profile = getSingleProfile();
        if (!profile) {
            return res.status(404).json({ error: 'No hay perfil fiscal' });
        }
        res.json(shapeProfile(profile));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener perfil' });
    }
});

router.put('/profile', (req, res) => {
    try {
        const saved = upsertProfile(req.body, getSingleProfile());
        res.json(saved);
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ error: error.message || 'Error al guardar perfil' });
    }
});

router.get('/guided-fields', (req, res) => {
    try {
        const profile = getSingleProfile();
        if (!profile) {
            return res.status(404).json({ error: 'No hay perfil fiscal' });
        }
        res.json(guidedFields(profile));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener campos' });
    }
});

router.get('/profiles/:id', (req, res) => {
    try {
        const profile = db.prepare('SELECT * FROM billing_profiles WHERE id = ?').get(req.params.id);
        if (!profile) {
            return res.status(404).json({ error: 'Perfil no encontrado' });
        }
        res.json(profile);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener perfil' });
    }
});

router.post('/profiles', (req, res) => {
    try {
        const existing = getSingleProfile();
        if (existing) {
            const saved = upsertProfile(req.body, existing);
            return res.json(saved);
        }
        const saved = upsertProfile(req.body, null);
        res.status(201).json(saved);
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ error: error.message || 'Error al crear perfil' });
    }
});

router.put('/profiles/:id', (req, res) => {
    try {
        const existing = db.prepare('SELECT * FROM billing_profiles WHERE id = ?').get(req.params.id);
        if (!existing) {
            return res.status(404).json({ error: 'Perfil no encontrado' });
        }
        const saved = upsertProfile(req.body, existing);
        res.json(saved);
    } catch (error) {
        console.error(error);
        res.status(error.status || 500).json({ error: error.message || 'Error al actualizar perfil' });
    }
});

router.delete('/profiles/:id', (req, res) => {
    try {
        const result = db.prepare('DELETE FROM billing_profiles WHERE id = ?').run(req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Perfil no encontrado' });
        }
        res.json({ message: 'Perfil eliminado correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar perfil' });
    }
});

function dictamenFromExpense(expense, extraText) {
    const parsed = extraText ? ocrService.parseTicketData(extraText) : {};
    const additional = expense && expense.additional_data ? (() => {
        try {
            return JSON.parse(expense.additional_data);
        } catch (_) {
            return {};
        }
    })() : {};

    return dictamenService.analyze({
        rawText: extraText || expense.ocr_text || '',
        merchant: expense.merchant || parsed.merchant,
        rfc: expense.rfc || parsed.rfc,
        folio: additional.folio || parsed.folio,
        ticket_id: parsed.ticket_id,
        urls: parsed.urls,
        amount: expense.amount
    });
}

router.post('/dictamen', (req, res) => {
    try {
        const { expense_id, text, merchant, rfc, folio } = req.body;
        let expense = null;

        if (expense_id) {
            expense = db.prepare(`
        SELECT e.*, tbd.rfc, tbd.business_name, tbd.additional_data
        FROM expenses e
        LEFT JOIN ticket_billing_data tbd ON e.id = tbd.expense_id
        WHERE e.id = ?
      `).get(expense_id);
            if (!expense) {
                return res.status(404).json({ error: 'Gasto no encontrado' });
            }
        }

        const dictamen = expense
            ? dictamenFromExpense(expense, text)
            : dictamenService.analyze({
                rawText: text || '',
                merchant,
                rfc,
                folio
            });

        let job = null;
        if (expense) {
            const existing = db.prepare('SELECT * FROM invoice_jobs WHERE expense_id = ? ORDER BY id DESC').get(expense.id);
            if (existing) {
                db.prepare(`
          UPDATE invoice_jobs
          SET playbook_id = ?, metodo = ?, portal_url = ?, folio = ?, dictamen_json = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
                    dictamen.playbook_id,
                    dictamen.metodo,
                    dictamen.portal_url,
                    dictamen.folio,
                    JSON.stringify(dictamen),
                    existing.id
                );
                job = db.prepare('SELECT * FROM invoice_jobs WHERE id = ?').get(existing.id);
            } else {
                const result = db.prepare(`
          INSERT INTO invoice_jobs (expense_id, playbook_id, metodo, portal_url, folio, estado, dictamen_json)
          VALUES (?, ?, ?, ?, ?, 'pendiente', ?)
        `).run(
                    expense.id,
                    dictamen.playbook_id,
                    dictamen.metodo,
                    dictamen.portal_url,
                    dictamen.folio,
                    JSON.stringify(dictamen)
                );
                job = db.prepare('SELECT * FROM invoice_jobs WHERE id = ?').get(result.lastInsertRowid);
            }
        }

        res.json({ dictamen, job, guided_fields: guidedFields(getSingleProfile()) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al generar dictamen' });
    }
});

router.get('/jobs', (req, res) => {
    try {
        const { estado, ruta_id, event_id } = req.query;
        const tripId = ruta_id || event_id;
        let query = `
      SELECT j.*, e.merchant, e.amount, e.expense_date, e.ticket_code, e.event_id as ruta_id,
             ev.slug as ruta_slug
      FROM invoice_jobs j
      JOIN expenses e ON j.expense_id = e.id
      LEFT JOIN events ev ON e.event_id = ev.id
      WHERE 1=1
    `;
        const params = [];
        if (estado) {
            query += ' AND j.estado = ?';
            params.push(estado);
        }
        if (tripId) {
            query += ' AND e.event_id = ?';
            params.push(tripId);
        }
        query += ' ORDER BY j.created_at DESC';
        const jobs = db.prepare(query).all(...params).map((job) => ({
            ...job,
            dictamen: job.dictamen_json ? JSON.parse(job.dictamen_json) : null
        }));
        res.json(jobs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al listar jobs' });
    }
});

router.patch('/jobs/:id', (req, res) => {
    try {
        const { estado, cfdi_uuid } = req.body;
        const allowed = ['pendiente', 'guiado', 'descargado', 'fallido'];
        if (estado && !allowed.includes(estado)) {
            return res.status(400).json({ error: 'Estado inválido' });
        }

        const current = db.prepare('SELECT * FROM invoice_jobs WHERE id = ?').get(req.params.id);
        if (!current) {
            return res.status(404).json({ error: 'Job no encontrado' });
        }

        db.prepare(`
      UPDATE invoice_jobs
      SET estado = COALESCE(?, estado),
          cfdi_uuid = COALESCE(?, cfdi_uuid),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(estado || null, cfdi_uuid || null, req.params.id);

        res.json(db.prepare('SELECT * FROM invoice_jobs WHERE id = ?').get(req.params.id));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar job' });
    }
});

router.get('/invoices', (req, res) => {
    try {
        const { ruta_id, event_id, expense_id } = req.query;
        const tripId = ruta_id || event_id;
        let query = `
      SELECT d.*, e.ticket_code, e.merchant, e.event_id as ruta_id, ev.slug as ruta_slug
      FROM cfdi_documents d
      LEFT JOIN expenses e ON d.expense_id = e.id
      LEFT JOIN events ev ON e.event_id = ev.id
      WHERE 1=1
    `;
        const params = [];
        if (tripId) {
            query += ' AND e.event_id = ?';
            params.push(tripId);
        }
        if (expense_id) {
            query += ' AND d.expense_id = ?';
            params.push(expense_id);
        }
        query += ' ORDER BY d.created_at DESC';
        res.json(db.prepare(query).all(...params));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al listar CFDIs' });
    }
});

router.get('/invoices/:id', (req, res) => {
    try {
        const doc = db.prepare('SELECT * FROM cfdi_documents WHERE id = ?').get(req.params.id);
        if (!doc) {
            return res.status(404).json({ error: 'CFDI no encontrado' });
        }
        res.json(doc);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener CFDI' });
    }
});

router.post('/invoices', upload.fields([
    { name: 'xml', maxCount: 1 },
    { name: 'pdf', maxCount: 1 }
]), (req, res) => {
    try {
        const expenseId = req.body.expense_id;
        if (!expenseId) {
            return res.status(400).json({ error: 'expense_id es requerido' });
        }

        const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId);
        if (!expense) {
            return res.status(404).json({ error: 'Gasto no encontrado' });
        }

        const xmlFile = req.files && req.files.xml && req.files.xml[0];
        const pdfFile = req.files && req.files.pdf && req.files.pdf[0];
        if (!xmlFile && !pdfFile) {
            return res.status(400).json({ error: 'Se requiere XML y/o PDF del CFDI' });
        }

        const xmlBuffer = xmlFile ? fs.readFileSync(xmlFile.path) : null;
        const pdfBuffer = pdfFile ? fs.readFileSync(pdfFile.path) : null;
        const parsed = xmlBuffer ? parseCfdiXml(xmlBuffer.toString('utf8')) : {};
        const uuid = req.body.uuid || parsed.uuid || null;

        const ruta = expense.event_id ? rutas.getRuta(db, expense.event_id) : null;
        if (!ruta) {
            return res.status(400).json({ error: 'El gasto no tiene ruta para ubicar Facturas/' });
        }

        const stored = storage.saveCfdiFiles({
            ruta,
            ticketCode: expense.ticket_code,
            uuid,
            xmlBuffer,
            pdfBuffer,
            metadata: {
                uuid,
                rfc_emisor: parsed.rfc_emisor,
                rfc_receptor: parsed.rfc_receptor,
                total: parsed.total,
                fecha: parsed.fecha,
                forma_pago: parsed.forma_pago,
                expense_id: expense.id
            }
        });

        const job = db.prepare('SELECT * FROM invoice_jobs WHERE expense_id = ? ORDER BY id DESC').get(expense.id);
        if (job) {
            db.prepare(`
        UPDATE invoice_jobs
        SET estado = 'descargado', cfdi_uuid = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(uuid, job.id);
        }

        const result = db.prepare(`
      INSERT INTO cfdi_documents (
        expense_id, invoice_job_id, uuid, rfc_emisor, rfc_receptor, total, fecha,
        xml_path, pdf_path, metadata_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            expense.id,
            job ? job.id : null,
            uuid,
            parsed.rfc_emisor || req.body.rfc_emisor || null,
            parsed.rfc_receptor || req.body.rfc_receptor || null,
            parsed.total || req.body.total || null,
            parsed.fecha || req.body.fecha || null,
            stored.xml_path,
            stored.pdf_path,
            stored.metadata_path
        );

        [xmlFile, pdfFile].forEach((file) => {
            if (file) {
                try {
                    fs.unlinkSync(file.path);
                } catch (_) {
                    /* ignore */
                }
            }
        });

        const saved = db.prepare('SELECT * FROM cfdi_documents WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(saved);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al guardar CFDI' });
    }
});

module.exports = router;
