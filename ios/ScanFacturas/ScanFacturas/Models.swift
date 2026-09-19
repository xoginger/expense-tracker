import Foundation

struct Ruta: Identifiable, Codable, Hashable {
    let id: Int
    var origin: String?
    var destination: String?
    var slug: String?
    var name: String
    var start_date: String?
    var end_date: String?
    var status: String?
    var notes: String?
    var expense_count: Int?
    var total_amount: Double?
    var expenses: [Expense]?

    var displayName: String {
        if let origin, let destination, !origin.isEmpty, !destination.isEmpty {
            return "\(origin) → \(destination)"
        }
        return slug ?? name
    }

    var folderSlug: String {
        (slug ?? name).uppercased()
    }
}

struct Expense: Identifiable, Codable, Hashable {
    let id: Int
    var event_id: Int?
    var ruta_id: Int?
    var category_id: Int?
    var amount: Double
    var description: String?
    var merchant: String?
    var expense_date: String
    var image_path: String?
    var ocr_text: String?
    var ticket_code: String?
    var metadata_path: String?
    var category_name: String?
    var invoice_job: InvoiceJob?
    var cfdi: CfdiDocument?
}

struct Categoria: Identifiable, Codable, Hashable {
    let id: Int
    var name: String
    var icon: String?
    var color: String?
    var keywords: String?
}

struct Dictamen: Codable, Hashable {
    var facturable: String?
    var metodo: String?
    var portal_url: String?
    var folio: String?
    var ticket_id: String?
    var rfc_emisor: String?
    var campos_requeridos: [String]?
    var playbook_id: String?
    var confianza: Double?
    var motivo_si_no: String?
}

struct TicketSuggestion: Codable {
    var amount: Double?
    var date: String?
    var merchant: String?
    var rfc: String?
    var folio: String?
    var ticket_id: String?
    var urls: [String]?
    var rawText: String?
    var source: String?
    var suggestedCategory: String?
    var image_path: String?
    var imagePath: String?
    var ticket_code: String?
    var metadata_path: String?
    var categoryId: Int?
    var category_id: Int?
    var dictamen: Dictamen?

    var resolvedImagePath: String? { image_path ?? imagePath }
    var resolvedCategoryId: Int? { category_id ?? categoryId }
}

struct BillingProfile: Identifiable, Codable, Hashable {
    var id: Int? = nil
    var name: String? = nil
    var rfc: String
    var business_name: String
    var tax_regime: String? = nil
    var postal_code: String
    var address: String? = nil
    var email: String? = nil
    var is_default: Int? = nil
}

struct GuidedFields: Codable {
    var rfc: String?
    var business_name: String?
    var tax_regime: String?
    var postal_code: String?
    var email: String?
    var copy_text: String?
}

struct InvoiceJob: Identifiable, Codable, Hashable {
    let id: Int
    var expense_id: Int?
    var playbook_id: String?
    var metodo: String?
    var portal_url: String?
    var folio: String?
    var estado: String?
    var cfdi_uuid: String?
    var merchant: String?
    var amount: Double?
    var expense_date: String?
    var ticket_code: String?
    var ruta_id: Int?
    var ruta_slug: String?
    var dictamen: Dictamen?
}

struct CfdiDocument: Identifiable, Codable, Hashable {
    let id: Int
    var expense_id: Int?
    var uuid: String?
    var rfc_emisor: String?
    var rfc_receptor: String?
    var total: Double?
    var fecha: String?
    var xml_path: String?
    var pdf_path: String?
    var ticket_code: String?
}

struct TotalsResponse: Codable {
    var grand_total: Double?
    var expense_count: Int?
    var by_ruta: [RutaTotal]?
    var by_category: [CategoryTotal]?
}

struct RutaTotal: Codable, Identifiable, Hashable {
    var ruta_id: Int?
    var slug: String?
    var name: String?
    var origin: String?
    var destination: String?
    var total: Double?
    var count: Int?
    var id: Int { ruta_id ?? slug.hashValue }
}

struct CategoryTotal: Codable, Identifiable, Hashable {
    var category_id: Int?
    var name: String?
    var icon: String?
    var total: Double?
    var count: Int?
    var id: Int { category_id ?? (name?.hashValue ?? 0) }
}

struct DictamenResponse: Codable {
    var dictamen: Dictamen
    var job: InvoiceJob?
    var guided_fields: GuidedFields?
}
