/**
 * Dictamen de cómo pedir el CFDI. Heurística + playbooks conocidos.
 * MVP nivel 1: no ejecuta Playwright.
 */

const PLAYBOOKS = [
    {
        id: 'oxxo_v1',
        keywords: ['oxxo'],
        metodo: 'portal_web',
        portal_url: 'https://factura.oxxo.com',
        campos_requeridos: ['folio', 'fecha', 'total']
    },
    {
        id: 'pemex_v1',
        keywords: ['pemex'],
        metodo: 'portal_web',
        portal_url: 'https://facturaelectronica.pemex.com',
        campos_requeridos: ['ticket_id', 'fecha', 'total']
    },
    {
        id: '7eleven_v1',
        keywords: ['7-eleven', '7 eleven', '7eleven'],
        metodo: 'portal_web',
        portal_url: 'https://factura.7-eleven.com.mx',
        campos_requeridos: ['folio', 'fecha', 'total']
    }
];

function findPlaybook(text, merchant) {
    const haystack = `${merchant || ''} ${text || ''}`.toLowerCase();
    return PLAYBOOKS.find((p) => p.keywords.some((k) => haystack.includes(k))) || null;
}

function looksUnbillable(text) {
    const lower = (text || '').toLowerCase();
    const noRfc = !/\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/.test(text || '');
    if (/(propina|efectivo).{0,20}(no factura|sin factura)/i.test(lower)) {
        return 'Marcado como no facturable (propina/efectivo)';
    }
    if (/(estacionamiento|parking|parquímetro)/i.test(lower) && noRfc) {
        return 'ticket de estacionamiento sin RFC';
    }
    return null;
}

function extractUrls(text) {
    return [...new Set((String(text || '').match(/https?:\/\/[^\s<>"']+/gi) || []))];
}

function analyze(input = {}) {
    const text = input.rawText || input.text || input.ocr_text || '';
    const merchant = input.merchant || '';
    const urls = input.urls && input.urls.length ? input.urls : extractUrls(text);
    const playbook = findPlaybook(text, merchant);
    const unbillable = looksUnbillable(text);

    let metodo = 'no_disponible';
    let facturable = 'dudoso';
    let playbook_id = 'generico_formulario';
    let portal_url = urls[0] || null;
    let motivo_si_no = null;
    let confianza = 0.45;
    let campos_requeridos = ['folio', 'fecha', 'total'];

    if (unbillable) {
        facturable = 'no';
        metodo = 'no_disponible';
        playbook_id = null;
        portal_url = null;
        motivo_si_no = unbillable;
        confianza = 0.8;
        campos_requeridos = [];
    } else if (playbook) {
        facturable = 'sí';
        metodo = playbook.metodo;
        playbook_id = playbook.id;
        portal_url = playbook.portal_url;
        campos_requeridos = playbook.campos_requeridos;
        confianza = 0.85;
        motivo_si_no = `Playbook ${playbook.id}`;
    } else if (urls.length) {
        facturable = 'sí';
        metodo = 'portal_web';
        playbook_id = 'generico_formulario';
        portal_url = urls[0];
        confianza = 0.7;
        motivo_si_no = 'URL de factura impresa en el ticket';
    } else if (/qr|codigo qr|código qr/i.test(text)) {
        facturable = 'sí';
        metodo = 'qr';
        playbook_id = 'generico_formulario';
        confianza = 0.65;
        motivo_si_no = 'El ticket menciona un QR de factura';
    } else if (/solicite su factura|factura\.|facturacion|facturación/i.test(text)) {
        facturable = 'sí';
        metodo = /@/.test(text) ? 'email' : 'portal_web';
        playbook_id = 'generico_formulario';
        confianza = 0.55;
        motivo_si_no = 'El ticket invita a solicitar factura';
    } else if (input.rfc) {
        facturable = 'dudoso';
        metodo = 'portal_web';
        playbook_id = 'generico_formulario';
        confianza = 0.5;
        motivo_si_no = 'Hay RFC emisor pero no un portal claro';
    } else {
        facturable = 'dudoso';
        metodo = 'no_disponible';
        playbook_id = 'generico_formulario';
        motivo_si_no = 'No se vio portal, QR ni RFC de factura';
        confianza = 0.35;
    }

    return {
        facturable,
        metodo,
        portal_url,
        folio: input.folio || null,
        ticket_id: input.ticket_id || input.folio || null,
        rfc_emisor: input.rfc || null,
        campos_requeridos,
        playbook_id,
        confianza,
        motivo_si_no
    };
}

module.exports = {
    PLAYBOOKS,
    analyze,
    extractUrls,
    findPlaybook
};
