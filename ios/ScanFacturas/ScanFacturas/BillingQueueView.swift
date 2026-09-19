import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct BillingQueueView: View {
    @EnvironmentObject var app: AppState
    @State private var guided: GuidedFields?
    @State private var importing = false
    @State private var selectedJob: InvoiceJob?
    @State private var error: String?
    @State private var copied = false

    var body: some View {
        NavigationStack {
            List {
                if let guided {
                    Section("Datos listos para pegar") {
                        Text(guided.copy_text ?? "")
                            .font(.body.monospaced())
                        Button("Copiar RFC / CP / email") {
                            UIPasteboard.general.string = guided.copy_text
                            copied = true
                        }
                        if copied {
                            Text("Copiado").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }

                if !app.pendingCFDI.isEmpty {
                    Section("XML/PDF recibidos (Share / Abrir en)") {
                        ForEach(app.pendingCFDI, id: \.self) { url in
                            Text(url.lastPathComponent)
                        }
                        Text("Abre un job y usa “Adjuntar CFDI” para ligarlos a un ticket.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Cola") {
                    if app.jobs.isEmpty {
                        Text("No hay tickets en cola de facturación")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(app.jobs) { job in
                        Button {
                            selectedJob = job
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(job.merchant ?? job.ticket_code ?? "Ticket")
                                    .font(.headline)
                                Text("\(job.metodo ?? "—") · \(job.estado ?? "pendiente")")
                                    .font(.caption)
                                if let amount = job.amount {
                                    Text(String(format: "$%.2f", amount))
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Facturación")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Importar XML/PDF") { importing = true }
                }
            }
            .fileImporter(
                isPresented: $importing,
                allowedContentTypes: [.pdf, .xml, UTType(filenameExtension: "xml") ?? .data],
                allowsMultipleSelection: true
            ) { result in
                if case .success(let urls) = result {
                    urls.forEach { app.handleIncomingFile($0) }
                }
            }
            .sheet(item: $selectedJob) { job in
                JobDetailView(job: job)
            }
            .task {
                await app.refreshAll()
                guided = try? await app.api.guidedFields()
            }
            .refreshable {
                await app.refreshAll()
                guided = try? await app.api.guidedFields()
            }
        }
    }
}

struct JobDetailView: View {
    @EnvironmentObject var app: AppState
    let job: InvoiceJob
    @Environment(\.dismiss) private var dismiss
    @State private var picking = false
    @State private var error: String?

    var dictamen: Dictamen? { job.dictamen }

    var body: some View {
        NavigationStack {
            Form {
                Section("Dictamen") {
                    LabeledContent("Método", value: dictamen?.metodo ?? job.metodo ?? "—")
                    LabeledContent("Playbook", value: dictamen?.playbook_id ?? job.playbook_id ?? "—")
                    LabeledContent("Folio", value: dictamen?.folio ?? job.folio ?? "—")
                    LabeledContent("Estado", value: job.estado ?? "pendiente")
                    Text(dictamen?.motivo_si_no ?? "")
                        .font(.caption)
                }
                Section("Acción guiada") {
                    if let raw = dictamen?.portal_url ?? job.portal_url, let url = URL(string: raw) {
                        Link("Abrir portal", destination: url)
                    }
                    Button("Marcar como guiado") {
                        Task {
                            _ = try? await app.api.patchJob(job.id, estado: "guiado")
                            await app.refreshAll()
                            dismiss()
                        }
                    }
                    Button("Adjuntar XML+PDF") { picking = true }
                }
                if let error {
                    Text(error).foregroundStyle(.red)
                }
            }
            .navigationTitle(job.ticket_code ?? "Factura")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                }
            }
            .fileImporter(
                isPresented: $picking,
                allowedContentTypes: [.pdf, .xml, UTType(filenameExtension: "xml") ?? .data],
                allowsMultipleSelection: true
            ) { result in
                if case .success(let urls) = result {
                    Task { await attach(urls) }
                }
            }
        }
    }

    private func attach(_ urls: [URL]) async {
        guard let expenseId = job.expense_id else { return }
        var xml: (Data, String)?
        var pdf: (Data, String)?
        for url in urls {
            let accessed = url.startAccessingSecurityScopedResource()
            defer { if accessed { url.stopAccessingSecurityScopedResource() } }
            guard let data = try? Data(contentsOf: url) else { continue }
            if url.pathExtension.lowercased() == "xml" {
                xml = (data, url.lastPathComponent)
            } else if url.pathExtension.lowercased() == "pdf" {
                pdf = (data, url.lastPathComponent)
            }
        }
        do {
            let saved = try await app.api.uploadCFDI(
                expenseId: expenseId,
                xml: xml?.0,
                xmlName: xml?.1,
                pdf: pdf?.0,
                pdfName: pdf?.1
            )
            if let ruta = app.rutas.first(where: { $0.id == job.ruta_id }) {
                try? app.folders.saveCfdi(
                    ruta: ruta,
                    ticketCode: job.ticket_code ?? "TCK",
                    uuid: saved.uuid,
                    xml: xml?.0,
                    pdf: pdf?.0,
                    extra: ["expense_id": expenseId]
                )
            }
            await app.refreshAll()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
