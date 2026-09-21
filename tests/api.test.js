const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-api-'));
process.env.DB_PATH = path.join(tmp, 'test.sqlite');
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.PORT = '0';

const { app } = require('../server');

const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
);

const OXXO_TEXT = `OXXO SUCURSAL REFORMA
RFC: OXX970814HS9
FOLIO: A12345
TOTAL $128.50
Fecha: 15/09/2026
Solicite su factura en https://factura.oxxo.com
`;

const CFDI_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Fecha="2026-09-15T13:00:00" Total="128.50" FormaPago="01">
  <cfdi:Emisor Rfc="OXX970814HS9" Nombre="OXXO"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="VIAJERO"/>
  <tfd:TimbreFiscalDigital UUID="AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"/>
</cfdi:Comprobante>`;

function listen() {
    return new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({ server, base: `http://127.0.0.1:${port}` });
        });
    });
}

async function json(res) {
    const body = await res.json();
    return { status: res.status, body };
}

test('API MVP: rutas, vision ticket, dictamen, CFDI, totales', async (t) => {
    const { server, base } = await listen();
    t.after(() => new Promise((resolve) => server.close(resolve)));

    const health = await json(await fetch(`${base}/api/health`));
    assert.equal(health.status, 200);
    assert.equal(health.body.name, 'scanFacturas');

    const created = await json(await fetch(`${base}/api/rutas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            origin: 'CDMX',
            destination: 'GDL',
            start_date: '2026-09-15',
            end_date: '2026-09-18',
            notes: 'Viaje de prueba'
        })
    }));
    assert.equal(created.status, 201);
    assert.equal(created.body.slug, 'CDMX-GDL');
    assert.equal(created.body.status, 'abierta');
    const rutaId = created.body.id;

    const listed = await json(await fetch(`${base}/api/rutas`));
    assert.equal(listed.status, 200);
    assert.equal(listed.body.length, 1);
    assert.equal(listed.body[0].origin, 'CDMX');

    const alias = await json(await fetch(`${base}/api/events`));
    assert.equal(alias.status, 200);
    assert.equal(alias.body[0].id, rutaId);

    const profile = await json(await fetch(`${base}/api/billing/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            rfc: 'XAXX010101000',
            business_name: 'Xocotzin Granados',
            tax_regime: '612',
            postal_code: '44100',
            email: 'xoginger@gmail.com'
        })
    }));
    assert.equal(profile.status, 200);
    assert.equal(profile.body.rfc, 'XAXX010101000');

    const secondProfile = await json(await fetch(`${base}/api/billing/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            rfc: 'XEXX010101000',
            business_name: 'Otro',
            tax_regime: '612',
            postal_code: '01000',
            email: 'otro@example.com'
        })
    }));
    assert.equal(secondProfile.status, 200);
    assert.equal(secondProfile.body.id, profile.body.id);
    assert.equal(secondProfile.body.rfc, 'XEXX010101000');

    const onlyOne = await json(await fetch(`${base}/api/billing/profiles`));
    assert.equal(onlyOne.body.length, 1);

    const form = new FormData();
    form.append('vision_text', OXXO_TEXT);
    form.append('ruta_id', String(rutaId));
    form.append('image', new Blob([PNG], { type: 'image/png' }), 'ticket.png');

    const processed = await json(await fetch(`${base}/api/expenses/process-ticket`, {
        method: 'POST',
        body: form
    }));
    assert.equal(processed.status, 200);
    assert.equal(processed.body.source, 'vision');
    assert.equal(processed.body.amount, 128.5);
    assert.equal(processed.body.ticket_code, 'TCK-20260915-001');
    assert.match(processed.body.image_path, /Tickets\/2026\/2026-09-15_CDMX-GDL\/TCK-20260915-001\.png/);
    assert.equal(processed.body.dictamen.playbook_id, 'oxxo_v1');
    assert.ok(fs.existsSync(path.join(process.env.DATA_DIR, processed.body.image_path)));

    const categories = await json(await fetch(`${base}/api/categories`));
    const alimentacion = categories.body.find((c) => c.name === 'Alimentación');
    assert.ok(alimentacion);

    const saveForm = new FormData();
    saveForm.append('ruta_id', String(rutaId));
    saveForm.append('amount', '128.50');
    saveForm.append('expense_date', '2026-09-15');
    saveForm.append('merchant', 'OXXO Sucursal Reforma');
    saveForm.append('category_id', String(alimentacion.id));
    saveForm.append('ocr_text', OXXO_TEXT);
    saveForm.append('rfc', 'OXX970814HS9');
    saveForm.append('folio', 'A12345');
    saveForm.append('image', new Blob([PNG], { type: 'image/png' }), 'ticket.png');

    const expense = await json(await fetch(`${base}/api/expenses`, {
        method: 'POST',
        body: saveForm
    }));
    assert.equal(expense.status, 201);
    assert.equal(expense.body.ruta_id, rutaId);
    assert.equal(expense.body.ticket_code, 'TCK-20260915-002');
    assert.match(expense.body.image_path, /Tickets\/2026\/2026-09-15_CDMX-GDL\//);

    const visionOnly = await json(await fetch(`${base}/api/expenses/process-ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vision_text: OXXO_TEXT })
    }));
    assert.equal(visionOnly.status, 200);
    assert.equal(visionOnly.body.source, 'vision');
    assert.equal(visionOnly.body.ticket_code, null);

    const dictamen = await json(await fetch(`${base}/api/billing/dictamen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expense_id: expense.body.id })
    }));
    assert.equal(dictamen.status, 200);
    assert.equal(dictamen.body.dictamen.metodo, 'portal_web');
    assert.equal(dictamen.body.dictamen.portal_url, 'https://factura.oxxo.com');
    assert.equal(dictamen.body.job.estado, 'pendiente');
    assert.equal(dictamen.body.guided_fields.rfc, 'XEXX010101000');
    assert.match(dictamen.body.guided_fields.copy_text, /RFC:/);

    const guided = await json(await fetch(`${base}/api/billing/jobs/${dictamen.body.job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'guiado' })
    }));
    assert.equal(guided.status, 200);
    assert.equal(guided.body.estado, 'guiado');

    const invoiceForm = new FormData();
    invoiceForm.append('expense_id', String(expense.body.id));
    invoiceForm.append('xml', new Blob([CFDI_XML], { type: 'application/xml' }), 'cfdi.xml');
    invoiceForm.append('pdf', new Blob([Buffer.from('%PDF-1.4 fake')], { type: 'application/pdf' }), 'cfdi.pdf');

    const invoice = await json(await fetch(`${base}/api/billing/invoices`, {
        method: 'POST',
        body: invoiceForm
    }));
    assert.equal(invoice.status, 201, JSON.stringify(invoice.body));
    assert.equal(invoice.body.uuid, 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE');
    assert.equal(invoice.body.rfc_emisor, 'OXX970814HS9');
    assert.match(invoice.body.xml_path, /Facturas\/2026\/2026-09-15_CDMX-GDL\//);
    assert.match(invoice.body.pdf_path, /\.pdf$/);
    assert.ok(fs.existsSync(path.join(process.env.DATA_DIR, invoice.body.xml_path)));
    assert.ok(fs.existsSync(path.join(process.env.DATA_DIR, invoice.body.pdf_path)));

    const invoices = await json(await fetch(`${base}/api/billing/invoices?ruta_id=${rutaId}`));
    assert.equal(invoices.body.length, 1);

    const jobs = await json(await fetch(`${base}/api/billing/jobs`));
    assert.equal(jobs.body[0].estado, 'descargado');
    assert.equal(jobs.body[0].cfdi_uuid, invoice.body.uuid);

    const totals = await json(await fetch(`${base}/api/totals?ruta_id=${rutaId}`));
    assert.equal(totals.status, 200);
    assert.equal(totals.body.grand_total, 128.5);
    assert.equal(totals.body.by_ruta[0].slug, 'CDMX-GDL');
    const aliTotal = totals.body.by_category.find((c) => c.name === 'Alimentación');
    assert.equal(aliTotal.total, 128.5);

    const rutaTotals = await json(await fetch(`${base}/api/rutas/${rutaId}/totals`));
    assert.equal(rutaTotals.body.grand_total, 128.5);

    const detail = await json(await fetch(`${base}/api/rutas/${rutaId}`));
    assert.equal(detail.body.expenses.length, 1);
    assert.equal(detail.body.expenses[0].merchant, 'OXXO Sucursal Reforma');
});

test('process-ticket rechaza imagen ilegible sin tumbar el proceso', async (t) => {
    const { server, base } = await listen();
    t.after(() => new Promise((resolve) => server.close(resolve)));

    const form = new FormData();
    form.append('image', new Blob([PNG], { type: 'image/png' }), 'tiny.png');
    const processed = await json(await fetch(`${base}/api/expenses/process-ticket`, {
        method: 'POST',
        body: form
    }));
    assert.equal(processed.status, 400);
    assert.match(processed.body.error, /pequeña|ilegible/i);

    const health = await json(await fetch(`${base}/api/health`));
    assert.equal(health.status, 200);
});

test('API equipo: agent_id filtra salidas; team=1 ve todas', async (t) => {
    const { server, base } = await listen();
    t.after(() => new Promise((resolve) => server.close(resolve)));

    const a = await json(await fetch(`${base}/api/rutas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            origin: 'GDL',
            destination: 'LEON',
            start_date: '2026-09-21',
            cliente: 'Dist Bajio',
            agent_id: '12',
            agent_name: 'Ana'
        })
    }));
    assert.equal(a.status, 201);
    assert.equal(a.body.slug, 'GDL-LEON_DIST-BAJIO');
    assert.equal(a.body.agent_id, '12');
    assert.equal(a.body.cliente, 'Dist Bajio');

    const b = await json(await fetch(`${base}/api/rutas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Id': '99' },
        body: JSON.stringify({
            origin: 'GDL',
            destination: 'PUE',
            start_date: '2026-09-22',
            agent_name: 'Luis'
        })
    }));
    assert.equal(b.status, 201);
    assert.equal(b.body.agent_id, '99');

    const mine = await json(await fetch(`${base}/api/rutas?agent_id=12`));
    assert.equal(mine.body.length, 1);
    assert.equal(mine.body[0].id, a.body.id);

    const headerMine = await json(await fetch(`${base}/api/rutas`, {
        headers: { 'X-Agent-Id': '99' }
    }));
    assert.equal(headerMine.body.length, 1);
    assert.equal(headerMine.body[0].id, b.body.id);

    const team = await json(await fetch(`${base}/api/rutas?team=1`, {
        headers: { 'X-Agent-Id': '12' }
    }));
    assert.ok(team.body.length >= 2);

    const hidden = await json(await fetch(`${base}/api/rutas/${b.body.id}`, {
        headers: { 'X-Agent-Id': '12' }
    }));
    assert.equal(hidden.status, 404);

    const totals = await json(await fetch(`${base}/api/totals?agent_id=12`));
    assert.equal(totals.status, 200);
    assert.equal(totals.body.by_ruta.length, 1);
    assert.equal(totals.body.by_ruta[0].ruta_id, a.body.id);
});
