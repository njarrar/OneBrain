import SwiftUI
import UIKit

@main
struct BrainApp: App {
    @State private var session = AppSession()
    @State private var look = Look.shared
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            Group {
                if session.signedIn {
                    RootView()
                } else {
                    SignInView()
                }
            }
            .environment(session)
            // The last known look, from the app group, so launch shows the right one at once.
            .preferredColorScheme(look.mode.colorScheme)
            .fontDesign(Theme.palette.fontDesign)
            .tint(Theme.accent)
            .onAppear { applyStyle(look.mode) }
            .onChange(of: look.mode) { _, mode in applyStyle(mode) }
            .task(id: session.signedIn) { if session.signedIn { await look.refresh() } }
            .onChange(of: phase) { _, now in
                if now == .active, session.signedIn { Task { await look.refresh() } }
            }
        }
    }

    /// preferredColorScheme(nil) does not always hand control back to the phone once a scheme
    /// was forced, so the window's own style is set too.
    private func applyStyle(_ mode: Mode) {
        let style: UIUserInterfaceStyle = mode == .light ? .light : mode == .dark ? .dark : .unspecified
        for scene in UIApplication.shared.connectedScenes {
            (scene as? UIWindowScene)?.windows.forEach { $0.overrideUserInterfaceStyle = style }
        }
    }
}

/// Whether this phone has a key for Brain.
@Observable
final class AppSession {
    var signedIn = KeyStore.token != nil

    func signIn(token: String) {
        KeyStore.save(token)
        signedIn = true
    }

    func signOut() {
        KeyStore.clear()
        signedIn = false
    }
}
