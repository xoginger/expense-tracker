const express = require('express');
const router = express.Router();
const db = require('../config/database');

// GET /api/billing/profiles - Listar perfiles de facturación
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

// GET /api/billing/profiles/:id - Obtener perfil específico
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

// POST /api/billing/profiles - Crear perfil de facturación
router.post('/profiles', (req, res) => {
    try {
        const { name, rfc, business_name, tax_regime, postal_code, address, email, is_default } = req.body;

        if (!rfc || !business_name || !postal_code) {
            return res.status(400).json({ error: 'RFC, razón social y código postal son requeridos' });
        }

        // Si este perfil es el default, quitar default a los demás
        if (is_default) {
            db.prepare('UPDATE billing_profiles SET is_default = 0').run();
        }

        const stmt = db.prepare(`
      INSERT INTO billing_profiles (name, rfc, business_name, tax_regime, postal_code, address, email, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

        const result = stmt.run(
            name || business_name,
            rfc.toUpperCase(),
            business_name,
            tax_regime,
            postal_code,
            address,
            email,
            is_default ? 1 : 0
        );

        const newProfile = db.prepare('SELECT * FROM billing_profiles WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json(newProfile);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al crear perfil' });
    }
});

// PUT /api/billing/profiles/:id - Actualizar perfil
router.put('/profiles/:id', (req, res) => {
    try {
        const { name, rfc, business_name, tax_regime, postal_code, address, email, is_default } = req.body;

        // Si este perfil es el default, quitar default a los demás
        if (is_default) {
            db.prepare('UPDATE billing_profiles SET is_default = 0 WHERE id != ?').run(req.params.id);
        }

        const stmt = db.prepare(`
      UPDATE billing_profiles 
      SET name = COALESCE(?, name),
          rfc = COALESCE(?, rfc),
          business_name = COALESCE(?, business_name),
          tax_regime = COALESCE(?, tax_regime),
          postal_code = COALESCE(?, postal_code),
          address = COALESCE(?, address),
          email = COALESCE(?, email),
          is_default = COALESCE(?, is_default),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

        stmt.run(
            name,
            rfc ? rfc.toUpperCase() : null,
            business_name,
            tax_regime,
            postal_code,
            address,
            email,
            is_default !== undefined ? (is_default ? 1 : 0) : null,
            req.params.id
        );

        const updated = db.prepare('SELECT * FROM billing_profiles WHERE id = ?').get(req.params.id);

        if (!updated) {
            return res.status(404).json({ error: 'Perfil no encontrado' });
        }

        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar perfil' });
    }
});

// DELETE /api/billing/profiles/:id - Eliminar perfil
router.delete('/profiles/:id', (req, res) => {
    try {
        const stmt = db.prepare('DELETE FROM billing_profiles WHERE id = ?');
        const result = stmt.run(req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Perfil no encontrado' });
        }

        res.json({ message: 'Perfil eliminado correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar perfil' });
    }
});

module.exports = router;
