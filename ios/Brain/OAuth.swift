import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

/// Sign-in for Google and X, straight from the phone to them. PKCE, so the app needs no secret.
enum OAuth {
    struct Provider {
        let authorize: URL
        let token: URL
        let clientID: String
        let redirect: String
        let scopes: [String]
        var extra: [String: String] = [:]

        var scheme: String { String(redirect.prefix { $0 != ":" }) }
    }

    enum Failure: LocalizedError {
        case notSetUp(String)
        case cancelled
        case refused(String)
        var errorDescription: String? {
            switch self {
            case .notSetUp(let what): return "\(what) sign in isn't set up in this build yet."
            case .cancelled: return "Sign in was closed."
            case .refused(let m): return m
            }
        }
    }

    static let google = Provider(
        authorize: URL(string: "https://accounts.google.com/o/oauth2/v2/auth")!,
        token: URL(string: "https://oauth2.googleapis.com/token")!,
        clientID: Config.googleClientID,
        redirect: "\(Config.googleScheme):/oauth2redirect",
        scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/youtube.readonly"],
        extra: ["access_type": "offline", "prompt": "consent"]
    )

    static let x = Provider(
        authorize: URL(string: "https://x.com/i/oauth2/authorize")!,
        token: URL(string: "https://api.x.com/2/oauth2/token")!,
        clientID: Config.xClientID,
        redirect: "\(Config.callbackScheme)://x",
        scopes: ["tweet.read", "users.read", "bookmark.read", "offline.access"]
    )

    struct Tokens {
        let access: String
        let refresh: String?
        let idToken: String?
    }

    private static func random(_ n: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: n)
        _ = SecRandomCopyBytes(kSecRandomDefault, n, &bytes)
        return Data(bytes).base64URL
    }

    /// Opens the provider's sign-in page and returns its tokens.
    @MainActor
    static func signIn(_ p: Provider, name: String) async throws -> Tokens {
        guard !p.clientID.isEmpty else { throw Failure.notSetUp(name) }
        let verifier = random(48)
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URL
        let state = random(16)
        var parts = URLComponents(url: p.authorize, resolvingAgainstBaseURL: false)!
        parts.queryItems = [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: p.clientID),
            URLQueryItem(name: "redirect_uri", value: p.redirect),
            URLQueryItem(name: "scope", value: p.scopes.joined(separator: " ")),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
        ] + p.extra.map { URLQueryItem(name: $0.key, value: $0.value) }

        let callback = try await open(parts.url!, scheme: p.scheme)
        let back = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if let err = back.first(where: { $0.name == "error" })?.value { throw Failure.refused("\(name) said: \(err)") }
        guard back.first(where: { $0.name == "state" })?.value == state,
              let code = back.first(where: { $0.name == "code" })?.value else {
            throw Failure.refused("\(name) sign in didn't finish. Try again.")
        }
        return try await tokenRequest(p, name: name, [
            "grant_type": "authorization_code", "code": code, "redirect_uri": p.redirect, "code_verifier": verifier,
        ])
    }

    /// A fresh access token from a saved refresh token. X hands back a new refresh token each time.
    static func refresh(_ p: Provider, name: String, token: String) async throws -> Tokens {
        try await tokenRequest(p, name: name, ["grant_type": "refresh_token", "refresh_token": token])
    }

    private static func tokenRequest(_ p: Provider, name: String, _ form: [String: String]) async throws -> Tokens {
        var req = URLRequest(url: p.token)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var body = URLComponents()
        body.queryItems = (form.merging(["client_id": p.clientID]) { a, _ in a }).map { URLQueryItem(name: $0.key, value: $0.value) }
        req.httpBody = body.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B").data(using: .utf8)
        let (data, _) = try await URLSession.shared.data(for: req)
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard let access = json["access_token"] as? String else {
            let why = json["error_description"] as? String ?? json["error"] as? String ?? "no token"
            throw Failure.refused("\(name) said: \(why)")
        }
        return Tokens(access: access, refresh: json["refresh_token"] as? String, idToken: json["id_token"] as? String)
    }

    /// The email inside a Google ID token. Google sent it straight to us over HTTPS, so we only read it.
    static func email(fromIDToken token: String?) -> String? {
        guard let part = token?.split(separator: ".").dropFirst().first,
              let data = Data(base64URL: String(part)),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return json["email"] as? String
    }

    /// The running sign-in sheet. Held here so it stays open until it finishes.
    @MainActor private static var current: ASWebAuthenticationSession?

    @MainActor
    private static func open(_ url: URL, scheme: String) async throws -> URL {
        let anchor = Anchor()
        return try await withCheckedThrowingContinuation { cont in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { url, err in
                if let url { cont.resume(returning: url) }
                else if let e = err as? ASWebAuthenticationSessionError, e.code == .canceledLogin { cont.resume(throwing: Failure.cancelled) }
                else { cont.resume(throwing: err ?? Failure.cancelled) }
                _ = anchor // keeps the anchor alive until sign in ends
                Task { @MainActor in current = nil }
            }
            session.presentationContextProvider = anchor
            session.prefersEphemeralWebBrowserSession = false
            current = session
            session.start()
        }
    }

    private final class Anchor: NSObject, ASWebAuthenticationPresentationContextProviding {
        func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
            UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
        }
    }
}

extension Data {
    var base64URL: String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    init?(base64URL s: String) {
        var b = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        b += String(repeating: "=", count: (4 - b.count % 4) % 4)
        self.init(base64Encoded: b)
    }
}
