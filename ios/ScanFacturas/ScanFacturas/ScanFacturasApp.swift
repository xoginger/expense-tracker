import SwiftUI

@main
struct ScanFacturasApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environmentObject(appState)
                .onOpenURL { url in
                    appState.handleIncomingFile(url)
                }
                .onAppear {
                    appState.importSharedInbox()
                }
        }
    }
}
