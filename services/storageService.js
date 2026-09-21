const fs = require('fs');
const path = require('path');

function dataRoot() {
    return process.env.DATA_DIR || path.join(__dirname, '..', 'data', 'scanFacturas');
}

function posix(rel) {
    return String(rel).split(path.sep).join('/');
}

function sanitizeSlug(value) {
    const cleaned = String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toUpperCase();
    return cleaned || 'RUTA';
}

function slugFromRuta(ruta = {}) {
    if (ruta.slug) {
        return sanitizeSlug(ruta.slug);
    }
    if (ruta.origin && ruta.destination) {
        let slug = `${sanitizeSlug(ruta.origin)}-${sanitizeSlug(ruta.destination)}`;
        if (ruta.cliente) {
            slug += `_${sanitizeSlug(ruta.cliente)}`;
        }
        return slug;
    }
    return sanitizeSlug(ruta.name);
}

function folderDate(ruta = {}) {
    const raw = ruta.start_date || new Date().toISOString().slice(0, 10);
    return String(raw).slice(0, 10);
}

function tripFolderName(ruta = {}) {
    return `${folderDate(ruta)}_${slugFromRuta(ruta)}`;
}

function relativeTripDir(kind, ruta) {
    const date = folderDate(ruta);
    const year = date.slice(0, 4);
    return path.join(kind, year, tripFolderName(ruta));
}

function absoluteTripDir(kind, ruta) {
    const abs = path.join(dataRoot(), relativeTripDir(kind, ruta));
    fs.mkdirSync(abs, { recursive: true });
    return abs;
}

function nextTicketCode(ruta) {
    const dateCompact = folderDate(ruta).replace(/-/g, '');
    const dir = absoluteTripDir('Tickets', ruta);
    const re = new RegExp(`^TCK-${dateCompact}-(\\d{3})`);
    let max = 0;
    for (const name of fs.readdirSync(dir)) {
        const match = name.match(re);
        if (match) {
            max = Math.max(max, parseInt(match[1], 10));
        }
    }
    return `TCK-${dateCompact}-${String(max + 1).padStart(3, '0')}`;
}

function ensureIncomingDir() {
    const dir = path.join(dataRoot(), '_incoming');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function saveTicketFiles({ ruta, sourcePath, originalName, buffer, metadata = {} }) {
    const code = metadata.ticket_code || nextTicketCode(ruta);
    const dir = absoluteTripDir('Tickets', ruta);
    const ext = path.extname(originalName || sourcePath || '.jpg').toLowerCase() || '.jpg';
    const imageName = `${code}${ext}`;
    const destAbs = path.join(dir, imageName);

    if (buffer) {
        fs.writeFileSync(destAbs, buffer);
    } else if (sourcePath) {
        fs.copyFileSync(sourcePath, destAbs);
    }

    const jsonName = `${code}.json`;
    const payload = {
        ticket_code: code,
        ...metadata
    };
    fs.writeFileSync(path.join(dir, jsonName), JSON.stringify(payload, null, 2), 'utf8');

    return {
        ticket_code: code,
        image_path: posix(path.join(relativeTripDir('Tickets', ruta), imageName)),
        metadata_path: posix(path.join(relativeTripDir('Tickets', ruta), jsonName))
    };
}

function saveCfdiFiles({ ruta, ticketCode, uuid, xmlBuffer, pdfBuffer, metadata = {} }) {
    const dir = absoluteTripDir('Facturas', ruta);
    const stem = `${ticketCode || 'TCK'}_${uuid || 'SIN-UUID'}`;
    const xmlRel = path.join(relativeTripDir('Facturas', ruta), `${stem}.xml`);
    const pdfRel = path.join(relativeTripDir('Facturas', ruta), `${stem}.pdf`);
    const jsonRel = path.join(relativeTripDir('Facturas', ruta), `${stem}.json`);

    if (xmlBuffer) {
        fs.writeFileSync(path.join(dataRoot(), xmlRel), xmlBuffer);
    }
    if (pdfBuffer) {
        fs.writeFileSync(path.join(dataRoot(), pdfRel), pdfBuffer);
    }
    fs.writeFileSync(
        path.join(dataRoot(), jsonRel),
        JSON.stringify({ ticket_code: ticketCode, uuid, ...metadata }, null, 2),
        'utf8'
    );

    return {
        xml_path: xmlBuffer ? posix(xmlRel) : null,
        pdf_path: pdfBuffer ? posix(pdfRel) : null,
        metadata_path: posix(jsonRel)
    };
}

function resolveFile(relPath) {
    if (!relPath) return null;
    return path.join(dataRoot(), relPath);
}

module.exports = {
    dataRoot,
    sanitizeSlug,
    slugFromRuta,
    folderDate,
    tripFolderName,
    relativeTripDir,
    absoluteTripDir,
    nextTicketCode,
    ensureIncomingDir,
    saveTicketFiles,
    saveCfdiFiles,
    resolveFile
};
