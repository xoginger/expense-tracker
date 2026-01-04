const Tesseract = require('tesseract.js');
const path = require('path');

/**
 * Servicio de OCR para extraer datos de tickets
 */
class OCRService {
    /**
     * Procesa una imagen y extrae texto usando Tesseract
     */
    async extractText(imagePath) {
        try {
            console.log(`📸 Procesando imagen: ${imagePath}`);

            const { data: { text } } = await Tesseract.recognize(
                imagePath,
                'spa', // Idioma español
                {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            console.log(`OCR progreso: ${Math.round(m.progress * 100)}%`);
                        }
                    }
                }
            );

            console.log('✅ Texto extraído');
            return text;
        } catch (error) {
            console.error('❌ Error en OCR:', error);
            throw new Error('No se pudo procesar la imagen');
        }
    }

    /**
     * Parsea el texto extraído para obtener datos estructurados
     */
    parseTicketData(text) {
        const data = {
            amount: null,
            date: null,
            merchant: null,
            rfc: null,
            billingData: {}
        };

        // Extraer monto total
        // Buscar patrones como: TOTAL $123.45, Total: 123.45, $123.45
        const amountPatterns = [
            /total[:\s]*\$?\s*(\d{1,6}(?:[,\.]\d{2})?)/i,
            /\$\s*(\d{1,6}(?:[,\.]\d{2}))/,
            /importe[:\s]*\$?\s*(\d{1,6}(?:[,\.]\d{2})?)/i
        ];

        for (const pattern of amountPatterns) {
            const match = text.match(pattern);
            if (match) {
                data.amount = parseFloat(match[1].replace(',', '.'));
                break;
            }
        }

        // Extraer fecha
        // Formatos: 01/12/2023, 01-12-2023, 2023-12-01
        const datePatterns = [
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
            /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/
        ];

        for (const pattern of datePatterns) {
            const match = text.match(pattern);
            if (match) {
                // Intentar crear fecha (esto es simplificado, podrías mejorarlo)
                try {
                    const [_, p1, p2, p3] = match;
                    if (p1.length === 4) {
                        // Formato YYYY-MM-DD
                        data.date = `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;
                    } else {
                        // Formato DD/MM/YYYY
                        const year = p3.length === 2 ? `20${p3}` : p3;
                        data.date = `${year}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
                    }
                } catch (e) {
                    console.log('No se pudo parsear fecha');
                }
                break;
            }
        }

        // Extraer RFC (formato: XXX000000XXX o XXXX000000XXX)
        const rfcPattern = /\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/;
        const rfcMatch = text.match(rfcPattern);
        if (rfcMatch) {
            data.rfc = rfcMatch[1];
        }

        // Extraer nombre del comercio (primeras líneas antes de dirección)
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        if (lines.length > 0) {
            // Tomar las primeras 1-2 líneas como nombre del comercio
            data.merchant = lines.slice(0, 2).join(' ').trim().substring(0, 100);
        }

        // Buscar palabras clave de datos de facturación
        if (text.toLowerCase().includes('factura') ||
            text.toLowerCase().includes('datos fiscales') ||
            text.toLowerCase().includes('solicite su factura')) {
            data.billingData.hasInfo = true;

            // Extraer email si existe
            const emailPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
            const emailMatch = text.match(emailPattern);
            if (emailMatch) {
                data.billingData.email = emailMatch[1];
            }

            // Extraer dirección (simplificado)
            const addressPattern = /(calle|av\.|avenida|blvd\.)[^\n]{10,100}/i;
            const addressMatch = text.match(addressPattern);
            if (addressMatch) {
                data.billingData.address = addressMatch[0].trim();
            }
        }

        // Sugerir categoría basada en palabras clave
        data.suggestedCategory = this.suggestCategory(text);

        return data;
    }

    /**
     * Sugiere una categoría basada en el contenido del ticket
     */
    suggestCategory(text) {
        const textLower = text.toLowerCase();

        const categories = {
            'Alimentación': ['oxxo', 'super', 'mercado', 'restaurante', 'comida', 'cafe', 'pizza', 'tacos', 'tortas'],
            'Transporte': ['gasolina', 'pemex', 'mobil', 'shell', 'uber', 'taxi', 'peaje', 'caseta', 'autobus'],
            'Hospedaje': ['hotel', 'motel', 'airbnb', 'hospedaje', 'hostal'],
            'Salud': ['farmacia', 'guadalajara', 'ahorro', 'medico', 'clinica', 'hospital'],
            'Servicios': ['reparacion', 'taller', 'servicio', 'mantenimiento'],
            'Compras': ['tienda', 'liverpool', 'palacio', 'walmart', 'soriana', 'coppel']
        };

        for (const [category, keywords] of Object.entries(categories)) {
            if (keywords.some(keyword => textLower.includes(keyword))) {
                return category;
            }
        }

        return 'Otros';
    }

    /**
     * Proceso completo: extraer texto y parsear datos
     */
    async processTicket(imagePath) {
        const text = await this.extractText(imagePath);
        const data = this.parseTicketData(text);

        return {
            ...data,
            rawText: text
        };
    }
}

module.exports = new OCRService();
