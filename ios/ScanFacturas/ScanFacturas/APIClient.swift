import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case http(Int, String)
    case decoding(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "URL del API inválida"
        case .http(let code, let body): return "HTTP \(code): \(body)"
        case .decoding(let err): return "JSON: \(err.localizedDescription)"
        }
    }
}

struct APIClient {
    var baseURL: URL {
        let stored = UserDefaults.standard.string(forKey: "apiBaseURL")?.trimmingCharacters(in: .whitespacesAndNewlines)
        return URL(string: stored?.isEmpty == false ? stored! : "http://127.0.0.1:3000")!
    }

    func setBaseURL(_ value: String) {
        UserDefaults.standard.set(value, forKey: "apiBaseURL")
    }

    private func url(_ path: String, query: [String: String] = [:]) throws -> URL {
        let root = baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let suffix = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard var comps = URLComponents(string: "\(root)/\(suffix)") else {
            throw APIError.invalidURL
        }
        if !query.isEmpty {
            comps.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = comps.url else { throw APIError.invalidURL }
        return url
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    private func send(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: request)
        let http = response as? HTTPURLResponse
        let code = http?.statusCode ?? 0
        if (200..<300).contains(code) {
            return data
        }
        let body = String(data: data, encoding: .utf8) ?? ""
        throw APIError.http(code, body)
    }

    private func jsonRequest(_ method: String, path: String, query: [String: String] = [:], body: Any? = nil) async throws -> Data {
        var request = URLRequest(url: try url(path, query: query))
        request.httpMethod = method
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        return try await send(request)
    }

    func listRutas() async throws -> [Ruta] {
        try await decode(jsonRequest("GET", path: "api/rutas"))
    }

    func getRuta(_ id: Int) async throws -> Ruta {
        try await decode(jsonRequest("GET", path: "api/rutas/\(id)"))
    }

    func createRuta(origin: String, destination: String, start: String, end: String, notes: String) async throws -> Ruta {
        try await decode(jsonRequest("POST", path: "api/rutas", body: [
            "origin": origin,
            "destination": destination,
            "start_date": start,
            "end_date": end,
            "notes": notes
        ]))
    }

    func updateRuta(_ id: Int, status: String) async throws -> Ruta {
        try await decode(jsonRequest("PUT", path: "api/rutas/\(id)", body: ["status": status]))
    }

    func listCategories() async throws -> [Categoria] {
        try await decode(jsonRequest("GET", path: "api/categories"))
    }

    func totals(rutaId: Int? = nil) async throws -> TotalsResponse {
        var query: [String: String] = [:]
        if let rutaId { query["ruta_id"] = String(rutaId) }
        return try await decode(jsonRequest("GET", path: "api/totals", query: query))
    }

    func getProfile() async throws -> BillingProfile {
        try await decode(jsonRequest("GET", path: "api/billing/profile"))
    }

    func saveProfile(_ profile: BillingProfile) async throws -> BillingProfile {
        var body: [String: String] = [
            "rfc": profile.rfc,
            "business_name": profile.business_name,
            "postal_code": profile.postal_code
        ]
        if let tax = profile.tax_regime { body["tax_regime"] = tax }
        if let email = profile.email { body["email"] = email }
        if let address = profile.address { body["address"] = address }
        if let name = profile.name { body["name"] = name }
        return try await decode(jsonRequest("PUT", path: "api/billing/profile", body: body))
    }

    func guidedFields() async throws -> GuidedFields {
        try await decode(jsonRequest("GET", path: "api/billing/guided-fields"))
    }

    func listJobs(rutaId: Int? = nil) async throws -> [InvoiceJob] {
        var query: [String: String] = [:]
        if let rutaId { query["ruta_id"] = String(rutaId) }
        return try await decode(jsonRequest("GET", path: "api/billing/jobs", query: query))
    }

    func dictamen(expenseId: Int) async throws -> DictamenResponse {
        try await decode(jsonRequest("POST", path: "api/billing/dictamen", body: ["expense_id": expenseId]))
    }

    func patchJob(_ id: Int, estado: String) async throws -> InvoiceJob {
        try await decode(jsonRequest("PATCH", path: "api/billing/jobs/\(id)", body: ["estado": estado]))
    }

    func processTicket(image: Data, filename: String, visionText: String, rutaId: Int?) async throws -> TicketSuggestion {
        var fields = ["vision_text": visionText]
        if let rutaId { fields["ruta_id"] = String(rutaId) }
        let files = [(name: "image", filename: filename, mime: mime(for: filename), data: image)]
        let data = try await multipart(path: "api/expenses/process-ticket", fields: fields, files: files)
        return try decode(data)
    }

    func createExpense(
        rutaId: Int,
        amount: Double,
        date: String,
        merchant: String,
        categoryId: Int?,
        ocrText: String,
        rfc: String?,
        folio: String?,
        image: Data?,
        filename: String?,
        ticketCode: String?,
        imagePath: String?
    ) async throws -> Expense {
        var fields: [String: String] = [
            "ruta_id": String(rutaId),
            "amount": String(amount),
            "expense_date": date,
            "merchant": merchant,
            "ocr_text": ocrText
        ]
        if let categoryId { fields["category_id"] = String(categoryId) }
        if let rfc { fields["rfc"] = rfc }
        if let folio { fields["folio"] = folio }
        if let ticketCode { fields["ticket_code"] = ticketCode }
        if let imagePath { fields["image_path"] = imagePath }

        var files: [(name: String, filename: String, mime: String, data: Data)] = []
        if let image, let filename {
            files.append((name: "image", filename: filename, mime: mime(for: filename), data: image))
        }
        let data = try await multipart(path: "api/expenses", fields: fields, files: files)
        return try decode(data)
    }

    func uploadCFDI(expenseId: Int, xml: Data?, xmlName: String?, pdf: Data?, pdfName: String?) async throws -> CfdiDocument {
        var files: [(name: String, filename: String, mime: String, data: Data)] = []
        if let xml, let xmlName {
            files.append((name: "xml", filename: xmlName, mime: "application/xml", data: xml))
        }
        if let pdf, let pdfName {
            files.append((name: "pdf", filename: pdfName, mime: "application/pdf", data: pdf))
        }
        let data = try await multipart(
            path: "api/billing/invoices",
            fields: ["expense_id": String(expenseId)],
            files: files
        )
        return try decode(data)
    }

    private func mime(for filename: String) -> String {
        switch (filename as NSString).pathExtension.lowercased() {
        case "png": return "image/png"
        case "pdf": return "application/pdf"
        case "heic", "heif": return "image/heic"
        default: return "image/jpeg"
        }
    }

    private func multipart(
        path: String,
        fields: [String: String],
        files: [(name: String, filename: String, mime: String, data: Data)]
    ) async throws -> Data {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        for (key, value) in fields {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }
        for file in files {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(file.name)\"; filename=\"\(file.filename)\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: \(file.mime)\r\n\r\n".data(using: .utf8)!)
            body.append(file.data)
            body.append("\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        var request = URLRequest(url: try url(path))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        return try await send(request)
    }
}
