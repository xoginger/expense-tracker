const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const ocrService = require('../services/ocrService');
const dictamenService = require('../services/dictamenService');
const storage = require('../services/storageService');
const { parseCfdiXml } = require('../services/cfdiService');
const rutas = require('../lib/rutas');

const OXXO_TEXT = `OXXO SUCURSAL REFORMA
RFC: OXX970814HS9
FOLIO: A12345
TOTAL $128.50
Fecha: 15/09/2026
Solicite su factura en https://factura.oxxo.com
`;

test('parseTicketData extrae monto, fecha, RFC, folio y URL', () => {
    const data = ocrService.parseTicketData(OXXO_TEXT);
    assert.equal(data.amount, 128.5);
    assert.equal(data.date, '2026-09-15');
    assert.equal(data.rfc, 'OXX970814HS9');
    assert.equal(data.folio, 'A12345');
    assert.ok(data.urls.some((u) => u.includes('factura.oxxo.com')));
    assert.equal(data.suggestedCategory, 'Alimentación');
});

test('processVisionText no llama Tesseract', () => {
    const result = ocrService.processVisionText(OXXO_TEXT);
    assert.equal(result.source, 'vision');
    assert.equal(result.amount, 128.5);
    assert.match(result.rawText, /OXXO/);
});

test('dictamen OXXO usa playbook portal', () => {
    const parsed = ocrService.parseTicketData(OXXO_TEXT);
    const dictamen = dictamenService.analyze({ ...parsed, rawText: OXXO_TEXT });
    assert.equal(dictamen.facturable, 'sí');
    assert.equal(dictamen.metodo, 'portal_web');
    assert.equal(dictamen.playbook_id, 'oxxo_v1');
    assert.equal(dictamen.portal_url, 'https://factura.oxxo.com');
    assert.equal(dictamen.folio, 'A12345');
});

test('dictamen estacionamiento sin RFC no es facturable', () => {
    const text = 'Estacionamiento Centro\nTOTAL $40.00\n01/09/2026';
    const dictamen = dictamenService.analyze({ rawText: text, merchant: 'Estacionamiento Centro' });
    assert.equal(dictamen.facturable, 'no');
    assert.equal(dictamen.metodo, 'no_disponible');
    assert.match(dictamen.motivo_si_no, /estacionamiento/i);
});

test('slug y carpeta YYYY-MM-DD_RUTA', () => {
    const ruta = { origin: 'CDMX', destination: 'GDL', start_date: '2026-09-15' };
    assert.equal(storage.slugFromRuta(ruta), 'CDMX-GDL');
    assert.equal(storage.tripFolderName(ruta), '2026-09-15_CDMX-GDL');
    assert.equal(storage.relativeTripDir('Tickets', ruta), path.join('Tickets', '2026', '2026-09-15_CDMX-GDL'));
    assert.equal(storage.relativeTripDir('Facturas', ruta), path.join('Facturas', '2026', '2026-09-15_CDMX-GDL'));
});

test('nextTicketCode incrementa TCK-YYYYMMDD-NNN', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-store-'));
    process.env.DATA_DIR = tmp;
    const ruta = { origin: 'CDMX', destination: 'GDL', start_date: '2026-09-15' };
    const first = storage.saveTicketFiles({
        ruta,
        buffer: Buffer.from('fake'),
        originalName: 't.jpg',
        metadata: { merchant: 'OXXO' }
    });
    const second = storage.saveTicketFiles({
        ruta,
        buffer: Buffer.from('fake2'),
        originalName: 't.jpg',
        metadata: { merchant: 'OXXO' }
    });
    assert.equal(first.ticket_code, 'TCK-20260915-001');
    assert.equal(second.ticket_code, 'TCK-20260915-002');
    assert.ok(fs.existsSync(path.join(tmp, first.image_path)));
    assert.ok(fs.existsSync(path.join(tmp, first.metadata_path)));
});

test('parseCfdiXml lee UUID y RFCs', () => {
    const xml = `<?xml version="1.0"?>
    <cfdi:Comprobante Fecha="2026-09-15T12:00:00" Total="128.50" FormaPago="01">
      <cfdi:Emisor Rfc="OXX970814HS9"/>
      <cfdi:Receptor Rfc="XAXX010101000"/>
      <tfd:TimbreFiscalDigital UUID="12345678-1234-1234-1234-1234567890AB"/>
    </cfdi:Comprobante>`;
    const parsed = parseCfdiXml(xml);
    assert.equal(parsed.uuid, '12345678-1234-1234-1234-1234567890AB');
    assert.equal(parsed.rfc_emisor, 'OXX970814HS9');
    assert.equal(parsed.rfc_receptor, 'XAXX010101000');
    assert.equal(parsed.total, 128.5);
});

test('buildSlug desde origen-destino', () => {
    assert.equal(rutas.buildSlug({ origin: 'GDL', destination: 'PUE' }), 'GDL-PUE');
    assert.equal(rutas.buildSlug({ origin: 'GDL', destination: 'LEON', cliente: 'Dist Bajio' }), 'GDL-LEON_DIST-BAJIO');
    assert.equal(storage.slugFromRuta({ slug: 'GDL-LEON_DIST-BAJIO' }), 'GDL-LEON_DIST-BAJIO');
    assert.equal(rutas.normalizeStatus('active'), 'abierta');
    assert.equal(rutas.normalizeStatus('closed'), 'cerrada');
});
