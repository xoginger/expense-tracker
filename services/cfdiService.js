/**
 * Lectura mínima de CFDI XML del emisor. No genera CFDIs ni usa PDFKit.
 */

function attr(xml, tagHint, attrName) {
    const re = new RegExp(`<[^>]*${tagHint}[^>]*\\b${attrName}="([^"]+)"`, 'i');
    const match = String(xml || '').match(re);
    return match ? match[1] : null;
}

function parseCfdiXml(xml) {
    const text = String(xml || '');
    const uuid =
        (text.match(/\bUUID="([^"]+)"/i) || [])[1] ||
        (text.match(/<tfd:TimbreFiscalDigital[^>]*UUID="([^"]+)"/i) || [])[1] ||
        null;

    return {
        uuid,
        rfc_emisor: attr(text, 'Emisor', 'Rfc') || attr(text, 'Emisor', 'rfc'),
        rfc_receptor: attr(text, 'Receptor', 'Rfc') || attr(text, 'Receptor', 'rfc'),
        total: (() => {
            const raw = attr(text, 'Comprobante', 'Total') || attr(text, 'Comprobante', 'total');
            return raw ? parseFloat(raw) : null;
        })(),
        fecha: attr(text, 'Comprobante', 'Fecha') || attr(text, 'Comprobante', 'fecha') || null,
        forma_pago: attr(text, 'Comprobante', 'FormaPago') || attr(text, 'Comprobante', 'formaPago') || null
    };
}

module.exports = { parseCfdiXml };
