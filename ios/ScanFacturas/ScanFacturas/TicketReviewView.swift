import SwiftUI
import UIKit

struct TicketReviewView: View {
    @EnvironmentObject var app: AppState
    let ruta: Ruta
    let page: ScannedPage
    let remaining: Int
    var onDone: (Bool) -> Void

    @State private var merchant = ""
    @State private var amount = ""
    @State private var date = ""
    @State private var categoryId: Int?
    @State private var suggestion: TicketSuggestion?
    @State private var saving = false
    @State private var error: String?
    @State private var loading = true

    var body: some View {
        Form {
            Section("Ticket") {
                Image(uiImage: page.image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 220)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                if loading {
                    ProgressView("Estructurando con el backend…")
                }
            }
            Section("Revisar") {
                TextField("Comercio", text: $merchant)
                TextField("Monto", text: $amount)
                    .keyboardType(.decimalPad)
                TextField("Fecha YYYY-MM-DD", text: $date)
                Picker("Categoría", selection: $categoryId) {
                    Text("Sin categoría").tag(Optional<Int>.none)
                    ForEach(app.categories) { cat in
                        Text("\(cat.icon ?? "") \(cat.name)").tag(Optional(cat.id))
                    }
                }
            }
            if let dictamen = suggestion?.dictamen {
                Section("Dictamen de factura") {
                    LabeledContent("Método", value: dictamen.metodo ?? "—")
                    LabeledContent("Facturable", value: dictamen.facturable ?? "—")
                    if let url = dictamen.portal_url {
                        Text(url).font(.caption)
                    }
                    if let folio = dictamen.folio {
                        LabeledContent("Folio", value: folio)
                    }
                    Text(dictamen.motivo_si_no ?? "")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            if let error {
                Text(error).foregroundStyle(.red)
            }
            if remaining > 0 {
                Text("Quedan \(remaining) ticket(s) en esta sesión")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Revisar ticket")
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Saltar") { onDone(true) }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Guardar") { Task { await save() } }
                    .disabled(saving || amount.isEmpty || date.isEmpty)
            }
        }
        .task { await analyze() }
    }

    private func analyze() async {
        loading = true
        defer { loading = false }
        do {
            let jpeg = page.image.jpegData(compressionQuality: 0.85) ?? Data()
            let result = try await app.api.processTicket(
                image: jpeg,
                filename: "ticket.jpg",
                visionText: page.visionText,
                rutaId: ruta.id
            )
            suggestion = result
            merchant = result.merchant ?? merchant
            if let value = result.amount { amount = String(format: "%.2f", value) }
            date = result.date ?? ruta.start_date ?? FolderStore.isoToday()
            categoryId = result.resolvedCategoryId
        } catch {
            date = ruta.start_date ?? FolderStore.isoToday()
            self.error = "Sin backend: puedes guardar el archivo local. \(error.localizedDescription)"
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        guard let value = Double(amount.replacingOccurrences(of: ",", with: ".")) else {
            error = "Monto inválido"
            return
        }
        do {
            let local = try app.folders.saveTicket(
                ruta: ruta,
                image: page.image,
                metadata: [
                    "merchant": merchant,
                    "amount": value,
                    "expense_date": date,
                    "ocr_text": page.visionText
                ],
                code: suggestion?.ticket_code
            )
            let jpeg = page.image.jpegData(compressionQuality: 0.85)
            let expense = try await app.api.createExpense(
                rutaId: ruta.id,
                amount: value,
                date: date,
                merchant: merchant,
                categoryId: categoryId,
                ocrText: page.visionText,
                rfc: suggestion?.rfc,
                folio: suggestion?.folio,
                image: jpeg,
                filename: "ticket.jpg",
                ticketCode: local.code,
                imagePath: suggestion?.resolvedImagePath
            )
            if expense.id != 0 {
                _ = try? await app.api.dictamen(expenseId: expense.id)
            }
            await app.refreshAll()
            onDone(true)
        } catch {
            self.error = error.localizedDescription
        }
    }
}
