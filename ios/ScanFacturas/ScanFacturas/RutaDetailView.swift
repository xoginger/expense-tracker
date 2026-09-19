import SwiftUI
import UIKit
import PhotosUI

struct RutaDetailView: View {
    @EnvironmentObject var app: AppState
    let rutaId: Int

    @State private var ruta: Ruta?
    @State private var scanning = false
    @State private var pickerItem: PhotosPickerItem?
    @State private var reviewQueue: [ScannedPage] = []
    @State private var error: String?

    var body: some View {
        Group {
            if let ruta {
                List {
                    Section("Viaje") {
                        LabeledContent("Slug", value: ruta.slug ?? ruta.name)
                        LabeledContent("Fechas", value: "\(ruta.start_date ?? "—") → \(ruta.end_date ?? "—")")
                        LabeledContent("Estado", value: ruta.status ?? "abierta")
                        LabeledContent("Total", value: String(format: "$%.2f", ruta.total_amount ?? sum(ruta)))
                    }
                    Section("Tickets") {
                        if (ruta.expenses ?? []).isEmpty {
                            Text("Aún no hay tickets en esta ruta")
                                .foregroundStyle(.secondary)
                        }
                        ForEach(ruta.expenses ?? []) { expense in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(expense.merchant ?? "Comercio")
                                    .font(.headline)
                                HStack {
                                    Text(expense.ticket_code ?? "")
                                    Spacer()
                                    Text(String(format: "$%.2f", expense.amount))
                                }
                                .font(.subheadline)
                                Text(expense.category_name ?? "")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .navigationTitle(ruta.displayName)
                .toolbar {
                    ToolbarItem(placement: .primaryAction) {
                        Menu {
                            Button {
                                scanning = true
                            } label: {
                                Label("Escanear", systemImage: "doc.viewfinder")
                            }
                            PhotosPicker(selection: $pickerItem, matching: .images) {
                                Label("Galería", systemImage: "photo")
                            }
                        } label: {
                            Label("Añadir", systemImage: "plus")
                        }
                    }
                }
                .onChange(of: pickerItem) { _, item in
                    guard let item else { return }
                    Task {
                        if let data = try? await item.loadTransferable(type: Data.self),
                           let image = UIImage(data: data) {
                            await enqueue([image], ruta: ruta)
                        }
                    }
                }
                .fullScreenCover(isPresented: $scanning) {
                    DocumentScanner(
                        onFinish: { images in
                            scanning = false
                            Task { await enqueue(images, ruta: ruta) }
                        },
                        onCancel: { scanning = false }
                    )
                    .ignoresSafeArea()
                }
                .navigationDestination(isPresented: Binding(
                    get: { !reviewQueue.isEmpty },
                    set: { if !$0 { reviewQueue.removeAll() } }
                )) {
                    if let first = reviewQueue.first {
                        TicketReviewView(
                            ruta: ruta,
                            page: first,
                            remaining: reviewQueue.count - 1,
                            onDone: { keepGoing in
                                if !reviewQueue.isEmpty { reviewQueue.removeFirst() }
                                if !keepGoing { reviewQueue.removeAll() }
                                Task { await load() }
                            }
                        )
                    }
                }
            } else {
                ProgressView()
            }
        }
        .task { await load() }
    }

    private func sum(_ ruta: Ruta) -> Double {
        (ruta.expenses ?? []).reduce(0) { $0 + $1.amount }
    }

    private func load() async {
        do {
            ruta = try await app.api.getRuta(rutaId)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func enqueue(_ images: [UIImage], ruta: Ruta) async {
        var pages: [ScannedPage] = []
        for image in images {
            let text = await VisionOCR.recognize(image: image)
            pages.append(ScannedPage(image: image, visionText: text))
        }
        reviewQueue = pages
    }
}

struct ScannedPage: Identifiable {
    let id = UUID()
    let image: UIImage
    let visionText: String
}
