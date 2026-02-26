import SwiftUI

@main
struct BrainApp: App {
    @State private var session = AppSession()

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
            .preferredColorScheme(.dark)
            .tint(Theme.accent)
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
