import AuthenticationServices
import SwiftUI
import UIKit

/// Signs in through the web page, so Google, Apple and passwords all work the same as on the web.
struct SignInView: View {
    @Environment(AppSession.self) private var session
    @State private var auth: ASWebAuthenticationSession?
    @State private var error: String?
    @State private var anchor = PresentationAnchor()

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Text("Brain").font(.system(size: 40, weight: .bold))
            Text("Everything you save, in one place.").foregroundStyle(Theme.soft)
            Spacer()
            Button(action: start) {
                Text("Sign in").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 14)
            }
            .buttonStyle(.borderedProminent)
            .foregroundStyle(.black)
            if let error { Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center) }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg)
    }

    private func start() {
        error = nil
        var parts = URLComponents(url: Config.baseURL.appendingPathComponent("connect-app"), resolvingAgainstBaseURL: false)!
        parts.queryItems = [URLQueryItem(name: "device", value: UIDevice.current.name)]
        let s = ASWebAuthenticationSession(url: parts.url!, callbackURLScheme: Config.callbackScheme) { url, err in
            if let url, let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "token" })?.value {
                session.signIn(token: token)
            } else if let err = err as? ASWebAuthenticationSessionError, err.code == .canceledLogin {
                // Closed by the user.
            } else {
                error = "Sign in didn't finish. Try again."
            }
        }
        s.presentationContextProvider = anchor
        s.prefersEphemeralWebBrowserSession = false
        auth = s
        s.start()
    }
}

private final class PresentationAnchor: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }
            .first ?? ASPresentationAnchor()
    }
}
