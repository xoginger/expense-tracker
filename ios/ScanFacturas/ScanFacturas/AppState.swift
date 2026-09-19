import Foundation
import SwiftUI
import Combine

@MainActor
final class AppState: ObservableObject {
    @Published var api = APIClient()
    @Published var rutas: [Ruta] = []
    @Published var categories: [Categoria] = []
    @Published var profile: BillingProfile?
    @Published var jobs: [InvoiceJob] = []
    @Published var totals: TotalsResponse?
    @Published var errorMessage: String?
    @Published var pendingCFDI: [URL] = []
    @Published var isLoading = false

    let folders = FolderStore()

    func refreshAll() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let r = api.listRutas()
            async let c = api.listCategories()
            async let t = api.totals()
            async let j = api.listJobs()
            rutas = try await r
            categories = try await c
            totals = try await t
            jobs = try await j
            profile = try? await api.getProfile()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func handleIncomingFile(_ url: URL) {
        let dest = folders.inboxDirectory()
        let target = dest.appendingPathComponent(url.lastPathComponent)
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        do {
            if FileManager.default.fileExists(atPath: target.path) {
                try FileManager.default.removeItem(at: target)
            }
            try FileManager.default.copyItem(at: url, to: target)
            pendingCFDI.append(target)
        } catch {
            errorMessage = "No se pudo importar \(url.lastPathComponent): \(error.localizedDescription)"
        }
    }

    func importSharedInbox() {
        pendingCFDI.append(contentsOf: folders.consumeAppGroupInbox())
    }
}
