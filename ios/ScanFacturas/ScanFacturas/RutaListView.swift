import SwiftUI

struct RutaListView: View {
    @EnvironmentObject var app: AppState
    @State private var showingCreate = false

    var body: some View {
        NavigationStack {
            List {
                if let message = app.errorMessage {
                    Text(message).foregroundStyle(.red)
                }
                Section("Abiertas") {
                    ForEach(app.rutas.filter { ($0.status ?? "abierta") == "abierta" }) { ruta in
                        NavigationLink(value: ruta) { RutaRow(ruta: ruta) }
                    }
                }
                Section("Cerradas") {
                    ForEach(app.rutas.filter { $0.status == "cerrada" }) { ruta in
                        NavigationLink(value: ruta) { RutaRow(ruta: ruta) }
                    }
                }
            }
            .navigationTitle("Rutas")
            .navigationDestination(for: Ruta.self) { ruta in
                RutaDetailView(rutaId: ruta.id)
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showingCreate = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingCreate) {
                CreateRutaView()
            }
            .refreshable { await app.refreshAll() }
        }
    }
}

struct RutaRow: View {
    let ruta: Ruta

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(ruta.displayName).font(.headline)
            Text(ruta.slug ?? ruta.name)
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack {
                Text(ruta.start_date ?? "")
                Spacer()
                Text(String(format: "$%.2f", ruta.total_amount ?? 0))
            }
            .font(.subheadline)
        }
        .padding(.vertical, 4)
    }
}
