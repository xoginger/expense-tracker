const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const storage = require('./storageService');

/**
 * Servicio de generación de PDFs
 */
class PDFService {
    /**
     * Genera un reporte PDF de gastos por ruta/viaje.
     * No es un CFDI: el XML+PDF fiscal vive en Facturas/, no aquí.
     */
    async generateEventReport(event, expenses, categories) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
                const slug = storage.slugFromRuta(event);
                const fileName = `reporte_${slug}_${Date.now()}.pdf`;
                const outDir = path.join(storage.dataRoot(), 'Reportes');
                fs.mkdirSync(outDir, { recursive: true });
                const filePath = path.join(outDir, fileName);
                const stream = fs.createWriteStream(filePath);

                doc.pipe(stream);

                // Header
                this.addHeader(doc, event);

                // Información del evento
                this.addEventInfo(doc, event);

                // Tabla de gastos
                this.addExpensesTable(doc, expenses, categories);

                // Totales
                this.addTotals(doc, expenses, categories);

                // Footer
                this.addFooter(doc);

                doc.end();

                stream.on('finish', () => {
                    resolve({ fileName, relativePath: `Reportes/${fileName}` });
                });

                stream.on('error', reject);
            } catch (error) {
                reject(error);
            }
        });
    }

    addHeader(doc, event) {
        doc
            .fontSize(20)
            .fillColor('#2C3E50')
            .text('REPORTE DE GASTOS', { align: 'center' })
            .moveDown(0.5);

        doc
            .fontSize(16)
            .fillColor('#34495E')
            .text(event.name, { align: 'center' })
            .moveDown(1);

        // Línea separadora
        doc
            .strokeColor('#3498DB')
            .lineWidth(2)
            .moveTo(50, doc.y)
            .lineTo(550, doc.y)
            .stroke()
            .moveDown(1);
    }

    addEventInfo(doc, event) {
        const startY = doc.y;

        doc
            .fontSize(10)
            .fillColor('#7F8C8D')
            .text(`Fecha de inicio: ${event.start_date || 'N/A'}`, 50, startY)
            .text(`Fecha de fin: ${event.end_date || 'N/A'}`, 300, startY)
            .moveDown(0.5);

        if (event.description) {
            doc
                .fontSize(9)
                .fillColor('#95A5A6')
                .text(`Descripción: ${event.description}`, 50, doc.y, { width: 500 })
                .moveDown(1);
        } else {
            doc.moveDown(1);
        }
    }

    addExpensesTable(doc, expenses, categories) {
        // Headers de la tabla
        const tableTop = doc.y;
        const headers = ['Fecha', 'Categoría', 'Descripción', 'Monto'];
        const colWidths = [80, 100, 230, 80];
        let x = 50;

        // Dibujar headers
        doc.fontSize(10).fillColor('#FFFFFF');
        doc.rect(50, tableTop, 500, 25).fill('#3498DB');

        headers.forEach((header, i) => {
            doc.text(header, x + 5, tableTop + 7, {
                width: colWidths[i],
                align: i === 3 ? 'right' : 'left'
            });
            x += colWidths[i];
        });

        // Datos de la tabla
        let y = tableTop + 30;
        doc.fillColor('#2C3E50');

        expenses.forEach((expense, index) => {
            // Verificar si necesitamos nueva página
            if (y > 700) {
                doc.addPage();
                y = 50;
            }

            const category = categories.find(c => c.id === expense.category_id);
            const bgColor = index % 2 === 0 ? '#ECF0F1' : '#FFFFFF';

            // Fondo de fila
            doc.rect(50, y - 5, 500, 25).fill(bgColor);

            doc.fillColor('#2C3E50').fontSize(9);

            // Fecha
            doc.text(expense.expense_date, 55, y, { width: 75 });

            // Categoría
            doc.text(category ? category.name : 'N/A', 135, y, { width: 95 });

            // Descripción
            const desc = expense.description || expense.merchant || 'Sin descripción';
            doc.text(desc.substring(0, 40), 240, y, { width: 225 });

            // Monto
            doc.text(`$${expense.amount.toFixed(2)}`, 475, y, { width: 70, align: 'right' });

            y += 25;
        });

        doc.y = y + 10;
    }

    addTotals(doc, expenses, categories) {
        doc.moveDown(1);

        // Calcular totales por categoría
        const categoryTotals = {};
        let grandTotal = 0;

        expenses.forEach(expense => {
            const category = categories.find(c => c.id === expense.category_id);
            const categoryName = category ? category.name : 'Sin categoría';

            if (!categoryTotals[categoryName]) {
                categoryTotals[categoryName] = 0;
            }
            categoryTotals[categoryName] += expense.amount;
            grandTotal += expense.amount;
        });

        // Mostrar totales por categoría
        doc
            .fontSize(11)
            .fillColor('#2C3E50')
            .text('Totales por Categoría:', 50, doc.y);

        doc.fontSize(9);
        let y = doc.y + 5;

        Object.entries(categoryTotals).forEach(([category, total]) => {
            doc
                .fillColor('#7F8C8D')
                .text(`${category}:`, 70, y)
                .text(`$${total.toFixed(2)}`, 400, y, { align: 'right' });
            y += 20;
        });

        // Total general
        doc.y = y + 10;
        doc
            .fontSize(14)
            .fillColor('#FFFFFF');

        doc
            .rect(50, doc.y - 5, 500, 30)
            .fill('#27AE60');

        doc
            .text('TOTAL GENERAL:', 60, doc.y + 3)
            .fontSize(16)
            .text(`$${grandTotal.toFixed(2)}`, 400, doc.y - 13, { align: 'right' });
    }

    addFooter(doc) {
        const bottomY = 750;

        doc
            .fontSize(8)
            .fillColor('#95A5A6')
            .text(
                `Generado el ${new Date().toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                })}`,
                50,
                bottomY,
                { align: 'center', width: 500 }
            );
    }
}

module.exports = new PDFService();
