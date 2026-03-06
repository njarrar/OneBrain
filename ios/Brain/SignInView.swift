import AuthenticationServices
import SwiftUI

/// Sign in with Apple or Google. Nothing goes to Brain's web app: this only tells the phone who you are.
/// Google also lets Brain read your YouTube likes and playlists.
struct SignInView: View {
    @Environment(AppSession.self) private var session
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Text("Brain").font(.system(size: 40, weight: .bold))
            Text("Everything you save, kept on this phone.").foregroundStyle(Theme.soft)
            Spacer()
            SignInWithAppleButton(.signIn) { req in
                req.requestedScopes = [.fullName, .email]
            } onCompletion: { result in
                switch result {
                case .success(let auth):
                    guard let cred = auth.credential as? ASAuthorizationAppleIDCredential else { return }
                    let name = [cred.fullName?.givenName, cred.fullName?.familyName].compactMap { $0 }.joined(separator: " ")
                    session.signIn(account: "apple:\(cred.user)", name: cred.email ?? (name.isEmpty ? nil : name))
                case .failure(let e):
                    if (e as? ASAuthorizationError)?.code != .canceled { error = e.localizedDescription }
                }
            }
            .signInWithAppleButtonStyle(.white)
            .frame(height: 50)

            Button(action: google) {
                HStack {
                    Image(systemName: "g.circle.fill")
                    Text("Sign in with Google").font(.headline)
                }
                .frame(maxWidth: .infinity).frame(height: 50)
            }
            .buttonStyle(.borderedProminent)
            .foregroundStyle(.black)
            .disabled(busy)

            if let error { Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center) }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg)
    }

    private func google() {
        error = nil
        busy = true
        Task {
            defer { busy = false }
            do {
                let t = try await OAuth.signIn(OAuth.google, name: "Google")
                if let r = t.refresh { Secrets[.googleRefresh] = r }
                let email = OAuth.email(fromIDToken: t.idToken)
                session.signIn(account: "google:\(email ?? "account")", name: email)
            } catch OAuth.Failure.cancelled {
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
