import SwiftUI

struct TotalsView: View {
    @EnvironmentObject var app: AppState
    @State private var selectedRuta: Int = 0

    var body: some View {
        NavigationStack {
            List {
                Picker("Ruta", selection: $selectedRuta) {
                    Text("Todas").tag(0)
                    ForEach(app.rutas) { ruta in
                        Text(ruta.displayName).tag(ruta.id)
                    }
                }
                .onChange(of: selectedRuta) { _, _ in
                    Task { await reload() }
                }

                Section("General") {
                    LabeledContent("Total", value: String(format: "$%.2f", app.totals?.grand_total ?? 0))
                    LabeledContent("Tickets", value: "\(app.totals?.expense_count ?? 0)")
                }
                Section("Por ruta") {
                    ForEach(app.totals?.by_ruta ?? []) { row in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(row.slug ?? row.name ?? "Ruta")
                                Text("\(row.count ?? 0) tickets")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(String(format: "$%.2f", row.total ?? 0))
                        }
                    }
                }
                Section("Por categoría") {
                    ForEach(app.totals?.by_category ?? []) { row in
                        HStack {
                            Text("\(row.icon ?? "") \(row.name ?? "")")
                            Spacer()
                            Text(String(format: "$%.2f", row.total ?? 0))
                        }
                    }
                }
            }
            .navigationTitle("Totales")
            .refreshable { await reload() }
            .task { await reload() }
        }
    }

    private func reload() async {
        do {
            app.totals = try await app.api.totals(rutaId: selectedRuta == 0 ? nil : selectedRuta)
        } catch {
            app.errorMessage = error.localizedDescription
        }
    }
}
