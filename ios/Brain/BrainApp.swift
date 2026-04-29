import SwiftUI

@main
struct BrainApp: App {
    @State private var session = AppSession()

    init() {
        #if DEBUG
        Demo.seed()
        #endif
    }

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
    var signedIn = Secrets[.account] != nil || AppSession.demo
    var name = Secrets[.accountName]

    #if DEBUG
    static let demo = Demo.on
    #else
    static let demo = false
    #endif

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
