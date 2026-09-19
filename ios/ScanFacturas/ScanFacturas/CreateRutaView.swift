import SwiftUI

struct CreateRutaView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var origin = ""
    @State private var destination = ""
    @State private var start = Date()
    @State private var end = Date()
    @State private var notes = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Viaje") {
                    TextField("Origen (CDMX)", text: $origin)
                        .textInputAutocapitalization(.characters)
                    TextField("Destino (GDL)", text: $destination)
                        .textInputAutocapitalization(.characters)
                    DatePicker("Salida", selection: $start, displayedComponents: .date)
                    DatePicker("Regreso", selection: $end, displayedComponents: .date)
                    TextField("Notas", text: $notes, axis: .vertical)
                }
                if let error {
                    Text(error).foregroundStyle(.red)
                }
            }
            .navigationTitle("Nueva ruta")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Crear") { Task { await save() } }
                        .disabled(origin.isEmpty || destination.isEmpty || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            _ = try await app.api.createRuta(
                origin: origin.trimmingCharacters(in: .whitespacesAndNewlines),
                destination: destination.trimmingCharacters(in: .whitespacesAndNewlines),
                start: Self.iso(start),
                end: Self.iso(end),
                notes: notes
            )
            await app.refreshAll()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private static func iso(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}
