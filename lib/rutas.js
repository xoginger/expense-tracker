const storage = require('../services/storageService');

function normalizeStatus(status) {
    if (!status) return 'abierta';
    if (status === 'active' || status === 'abierta' || status === 'open') return 'abierta';
    if (status === 'closed' || status === 'cerrada' || status === 'inactive') return 'cerrada';
    return status;
}

function buildSlug({ origin, destination, slug, name, cliente }) {
    return storage.slugFromRuta({ origin, destination, slug, name, cliente });
}

function asRuta(row) {
    if (!row) return null;
    const slug = row.slug || buildSlug(row);
    return {
        ...row,
        slug,
        name: row.name || slug,
        origin: row.origin || null,
        destination: row.destination || null,
        notes: row.notes || row.description || null,
        status: normalizeStatus(row.status),
        ruta_id: row.id,
        agent_id: row.agent_id || null,
        agent_name: row.agent_name || null,
        cliente: row.cliente || null,
        zona: row.zona || null
    };
}

function listRutas(db, opts = {}) {
    let sql = `
      SELECT e.*,
             COUNT(DISTINCT ex.id) as expense_count,
             COALESCE(SUM(ex.amount), 0) as total_amount
      FROM events e
      LEFT JOIN expenses ex ON e.id = ex.event_id
    `;
    const params = [];
    if (opts.agent_id) {
        sql += ' WHERE e.agent_id = ?';
        params.push(String(opts.agent_id));
    }
    sql += ' GROUP BY e.id ORDER BY e.created_at DESC';
    return db.prepare(sql).all(...params).map(asRuta);
}

function getRuta(db, id) {
    const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    return asRuta(row);
}

function createRuta(db, body) {
    const origin = body.origin || body.origen || null;
    const destination = body.destination || body.destino || null;
    const cliente = body.cliente || null;
    const zona = body.zona || null;
    const slug = buildSlug({
        origin,
        destination,
        slug: body.slug,
        name: body.name,
        cliente
    });
    const name = body.name || slug;
    const notes = body.notes || body.description || null;
    const start_date = body.start_date || null;
    const end_date = body.end_date || null;
    const status = normalizeStatus(body.status || 'abierta');
    const agent_id = body.agent_id ? String(body.agent_id) : null;
    const agent_name = body.agent_name || null;

    if (!name && !origin && !destination) {
        const err = new Error('Origen y destino, o el nombre de la ruta, son requeridos');
        err.status = 400;
        throw err;
    }

    const result = db.prepare(`
      INSERT INTO events (
        name, description, start_date, end_date, status,
        origin, destination, slug, notes, agent_id, agent_name, cliente, zona
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        name, notes, start_date, end_date, status,
        origin, destination, slug, notes, agent_id, agent_name, cliente, zona
    );

    return getRuta(db, result.lastInsertRowid);
}

function updateRuta(db, id, body) {
    const current = getRuta(db, id);
    if (!current) return null;

    const origin = body.origin !== undefined ? body.origin : current.origin;
    const destination = body.destination !== undefined ? body.destination : current.destination;
    const cliente = body.cliente !== undefined ? body.cliente : current.cliente;
    const zona = body.zona !== undefined ? body.zona : current.zona;
    const name = body.name !== undefined ? body.name : current.name;
    const notes = body.notes !== undefined ? body.notes : (body.description !== undefined ? body.description : current.notes);
    const start_date = body.start_date !== undefined ? body.start_date : current.start_date;
    const end_date = body.end_date !== undefined ? body.end_date : current.end_date;
    const status = body.status !== undefined ? normalizeStatus(body.status) : current.status;
    const agent_id = body.agent_id !== undefined ? (body.agent_id ? String(body.agent_id) : null) : current.agent_id;
    const agent_name = body.agent_name !== undefined ? body.agent_name : current.agent_name;
    const slug = body.slug !== undefined
        ? storage.sanitizeSlug(body.slug)
        : buildSlug({ origin, destination, name, slug: current.slug, cliente });

    db.prepare(`
      UPDATE events
      SET name = ?,
          description = ?,
          start_date = ?,
          end_date = ?,
          status = ?,
          origin = ?,
          destination = ?,
          slug = ?,
          notes = ?,
          agent_id = ?,
          agent_name = ?,
          cliente = ?,
          zona = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
        name, notes, start_date, end_date, status,
        origin, destination, slug, notes,
        agent_id, agent_name, cliente, zona, id
    );

    return getRuta(db, id);
}

module.exports = {
    normalizeStatus,
    buildSlug,
    asRuta,
    listRutas,
    getRuta,
    createRuta,
    updateRuta
};
