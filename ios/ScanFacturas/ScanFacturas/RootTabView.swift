import SwiftUI

struct RootTabView: View {
    @EnvironmentObject var app: AppState

    var body: some View {
        TabView {
            RutaListView()
                .tabItem { Label("Rutas", systemImage: "map") }

            BillingQueueView()
                .tabItem { Label("Facturas", systemImage: "doc.text") }

            TotalsView()
                .tabItem { Label("Totales", systemImage: "chart.bar") }

            FiscalProfileView()
                .tabItem { Label("Perfil", systemImage: "person.crop.circle") }
        }
        .task { await app.refreshAll() }
    }
}
