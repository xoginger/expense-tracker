import SwiftUI

struct FiscalProfileView: View {
    @EnvironmentObject var app: AppState
    @State private var rfc = ""
    @State private var business = ""
    @State private var regime = "612"
    @State private var zip = ""
    @State private var email = ""
    @State private var apiURL = UserDefaults.standard.string(forKey: "apiBaseURL") ?? "http://127.0.0.1:3000"
    @State private var message: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Servidor") {
                    TextField("URL del API", text: $apiURL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                    Button("Guardar URL") {
                        app.api.setBaseURL(apiURL)
                        Task { await app.refreshAll() }
                    }
                }
                Section("Receptor CFDI 4.0") {
                    TextField("RFC", text: $rfc)
                        .textInputAutocapitalization(.characters)
                    TextField("Razón social", text: $business)
                    TextField("Régimen", text: $regime)
                    TextField("Código postal", text: $zip)
                        .keyboardType(.numberPad)
                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                }
                if let message {
                    Text(message)
                }
                Button("Guardar perfil") {
                    Task { await save() }
                }
            }
            .navigationTitle("Perfil fiscal")
            .task { loadFromApp() }
        }
    }

    private func loadFromApp() {
        if let p = app.profile {
            rfc = p.rfc
            business = p.business_name
            regime = p.tax_regime ?? "612"
            zip = p.postal_code
            email = p.email ?? ""
        }
    }

    private func save() async {
        do {
            let saved = try await app.api.saveProfile(BillingProfile(
                rfc: rfc.uppercased(),
                business_name: business,
                tax_regime: regime,
                postal_code: zip,
                email: email
            ))
            app.profile = saved
            message = "Perfil guardado"
        } catch {
            message = error.localizedDescription
        }
    }
}
