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

/// Who is signed in on this phone. Signing out keeps your saves; they stay on the phone.
@Observable
final class AppSession {
    var signedIn = Secrets[.account] != nil
    var name = Secrets[.accountName]

    func signIn(account: String, name: String?) {
        Secrets[.account] = account
        if let name { Secrets[.accountName] = name }
        self.name = name ?? Secrets[.accountName]
        signedIn = true
    }

    func signOut() {
        Secrets[.account] = nil
        Secrets[.googleRefresh] = nil
        signedIn = false
    }
}
