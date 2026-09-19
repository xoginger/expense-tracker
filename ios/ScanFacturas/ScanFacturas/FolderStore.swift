import Foundation
import UIKit

final class FolderStore {
    static let appGroupId = "group.com.xoginger.scanFacturas"

    var documentsRoot: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("scanFacturas", isDirectory: true)
    }

    func ensure(_ url: URL) {
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    }

    func tripFolder(kind: String, ruta: Ruta) -> URL {
        let date = String((ruta.start_date ?? Self.isoToday()).prefix(10))
        let year = String(date.prefix(4))
        let slug = ruta.folderSlug
        let url = documentsRoot
            .appendingPathComponent(kind, isDirectory: true)
            .appendingPathComponent(year, isDirectory: true)
            .appendingPathComponent("\(date)_\(slug)", isDirectory: true)
        ensure(url)
        return url
    }

    func nextTicketCode(ruta: Ruta) -> String {
        let date = String((ruta.start_date ?? Self.isoToday()).prefix(10)).replacingOccurrences(of: "-", with: "")
        let dir = tripFolder(kind: "Tickets", ruta: ruta)
        let names = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
        let prefix = "TCK-\(date)-"
        var maxN = 0
        for name in names {
            if name.hasPrefix(prefix),
               let n = Int(name.dropFirst(prefix.count).prefix(3)) {
                maxN = max(maxN, n)
            }
        }
        return String(format: "TCK-%@-%03d", date, maxN + 1)
    }

    @discardableResult
    func saveTicket(ruta: Ruta, image: UIImage, metadata: [String: Any], code: String?) throws -> (code: String, imageURL: URL, jsonURL: URL) {
        let ticketCode = code ?? nextTicketCode(ruta: ruta)
        let dir = tripFolder(kind: "Tickets", ruta: ruta)
        let imageURL = dir.appendingPathComponent("\(ticketCode).jpg")
        let jsonURL = dir.appendingPathComponent("\(ticketCode).json")
        guard let data = image.jpegData(compressionQuality: 0.85) else {
            throw NSError(domain: "FolderStore", code: 1, userInfo: [NSLocalizedDescriptionKey: "No se pudo escribir JPEG"])
        }
        try data.write(to: imageURL)
        var payload = metadata
        payload["ticket_code"] = ticketCode
        let json = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted])
        try json.write(to: jsonURL)
        return (ticketCode, imageURL, jsonURL)
    }

    func saveCfdi(ruta: Ruta, ticketCode: String, uuid: String?, xml: Data?, pdf: Data?, extra: [String: Any] = [:]) throws {
        let dir = tripFolder(kind: "Facturas", ruta: ruta)
        let stem = "\(ticketCode)_\(uuid ?? "SIN-UUID")"
        if let xml {
            try xml.write(to: dir.appendingPathComponent("\(stem).xml"))
        }
        if let pdf {
            try pdf.write(to: dir.appendingPathComponent("\(stem).pdf"))
        }
        var meta = extra
        meta["ticket_code"] = ticketCode
        meta["uuid"] = uuid as Any
        let json = try JSONSerialization.data(withJSONObject: meta, options: [.prettyPrinted])
        try json.write(to: dir.appendingPathComponent("\(stem).json"))
    }

    func inboxDirectory() -> URL {
        let url = documentsRoot.appendingPathComponent("Inbox", isDirectory: true)
        ensure(url)
        return url
    }

    func appGroupInbox() -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupId)?
            .appendingPathComponent("Inbox", isDirectory: true)
    }

    func consumeAppGroupInbox() -> [URL] {
        guard let group = appGroupInbox() else { return [] }
        let fm = FileManager.default
        try? fm.createDirectory(at: group, withIntermediateDirectories: true)
        let dest = inboxDirectory()
        let items = (try? fm.contentsOfDirectory(at: group, includingPropertiesForKeys: nil)) ?? []
        var copied: [URL] = []
        for item in items {
            let target = dest.appendingPathComponent(item.lastPathComponent)
            try? fm.removeItem(at: target)
            do {
                try fm.moveItem(at: item, to: target)
                copied.append(target)
            } catch {
                continue
            }
        }
        return copied
    }

    static func isoToday() -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }
}
