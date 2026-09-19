import UIKit
import UniformTypeIdentifiers

@objc(ShareViewController)
final class ShareViewController: UIViewController {
    static let appGroupId = "group.com.xoginger.scanFacturas"

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        Task { await importAttachments() }
    }

    private func inboxURL() -> URL {
        let group = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupId)
        let base = group ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("Inbox", isDirectory: true)
    }

    private func importAttachments() async {
        let inbox = inboxURL()
        try? FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)

        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        for item in items {
            for provider in item.attachments ?? [] {
                await save(provider: provider, inbox: inbox)
            }
        }
        extensionContext?.completeRequest(returningItems: nil)
    }

    private func save(provider: NSItemProvider, inbox: URL) async {
        let types: [UTType] = [.pdf, .xml, .image, .jpeg, .png, .data, .fileURL]
        for type in types where provider.hasItemConformingToTypeIdentifier(type.identifier) {
            let found = await withCheckedContinuation { (cont: CheckedContinuation<URL?, Never>) in
                provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, _ in
                    guard let url else {
                        cont.resume(returning: nil)
                        return
                    }
                    let dest = inbox.appendingPathComponent(url.lastPathComponent)
                    try? FileManager.default.removeItem(at: dest)
                    try? FileManager.default.copyItem(at: url, to: dest)
                    cont.resume(returning: dest)
                }
            }
            if found != nil { return }
        }
    }
}
