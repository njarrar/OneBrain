import AuthenticationServices
import Foundation
import UIKit

// MARK: Instagram

/// Reads saved_posts.json or saved_collections.json from Instagram's "Download your information".
/// Instagram only gives the link, the account and the time, not the picture.
enum InstagramImport {
    private static let postLink = try! NSRegularExpression(pattern: #"^https?://(www\.)?instagram\.com/(p|reel|reels|tv)/([\w-]+)"#, options: .caseInsensitive)

    private struct Found {
        let href: String
        let code: String
        let author: String?
        let at: Double?
    }

    private static func walk(_ node: Any, author: String?, collection: Bool, into out: inout [String: Found]) {
        if let list = node as? [Any] {
            for n in list { walk(n, author: author, collection: collection, into: &out) }
            return
        }
        guard let o = node as? [String: Any] else { return }
        // Saves look like { title: "username", string_map_data: { "Saved on": { href, timestamp } } }.
        let title = o["title"] as? String
        if let href = o["href"] as? String,
           let m = postLink.firstMatch(in: href, range: NSRange(href.startIndex..., in: href)),
           let r = Range(m.range(at: 3), in: href), out[String(href[r])] == nil {
            out[String(href[r])] = Found(href: href, code: String(href[r]), author: author, at: o["timestamp"] as? Double)
        }
        let isCollection = (o["string_map_data"] as? [String: Any])?["Creation Time"] != nil
        for (k, v) in o where k != "title" {
            walk(v, author: title != nil && !isCollection ? title : author, collection: isCollection, into: &out)
        }
    }

    /// Returns how many posts it found and how many were new.
    static func run(_ file: URL) async throws -> (found: Int, added: Int) {
        let open = file.startAccessingSecurityScopedResource()
        defer { if open { file.stopAccessingSecurityScopedResource() } }
        if file.pathExtension.lowercased() == "zip" {
            throw SourceError.api("Open the zip in Files first, then pick saved_posts.json inside it.")
        }
        let doc = try JSONSerialization.jsonObject(with: Data(contentsOf: file))
        var found: [String: Found] = [:]
        walk(doc, author: nil, collection: false, into: &found)
        guard !found.isEmpty else { throw SourceError.api("No saved Instagram posts in that file.") }
        let incoming = found.values.map { f in
            let reel = f.href.range(of: #"/(reels?|tv)/"#, options: .regularExpression) != nil
            return Incoming(source: "instagram", externalId: f.code, itemId: "instagram-\(f.code)",
                            url: "https://www.instagram.com/\(reel ? "reel" : "p")/\(f.code)/",
                            title: f.author.map { "Post by @\($0)" } ?? "Instagram post",
                            author: f.author, authorHandle: f.author.map { "@\($0)" }, kind: "post",
                            savedAt: f.at.map { Dates.iso(Date(timeIntervalSince1970: $0)) })
        }
        let added = try await Store.shared.save(all: incoming)
        try await Store.shared.markSynced("instagram")
        return (found.count, added)
    }
}

// MARK: The web app, once

/// Copies everything from the web app to the phone, with its categories, tags, notes and status.
/// Signs in to the web app once for this, then forgets the key.
enum WebImport {
    static var done: Bool {
        get { UserDefaults.standard.bool(forKey: "webImportDone") }
        set { UserDefaults.standard.set(newValue, forKey: "webImportDone") }
    }

    @MainActor
    private static func key() async throws -> String {
        var parts = URLComponents(url: Config.webURL.appendingPathComponent("connect-app"), resolvingAgainstBaseURL: false)!
        parts.queryItems = [URLQueryItem(name: "device", value: "\(UIDevice.current.name) (one-time copy)")]
        let anchor = Anchor()
        return try await withCheckedThrowingContinuation { cont in
            let s = ASWebAuthenticationSession(url: parts.url!, callbackURLScheme: Config.callbackScheme) { url, err in
                _ = anchor
                if let url, let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                    .queryItems?.first(where: { $0.name == "token" })?.value {
                    cont.resume(returning: token)
                } else {
                    cont.resume(throwing: err ?? OAuth.Failure.cancelled)
                }
                Task { @MainActor in current = nil }
            }
            s.presentationContextProvider = anchor
            current = s
            s.start()
        }
    }

    @MainActor private static var current: ASWebAuthenticationSession?

    private final class Anchor: NSObject, ASWebAuthenticationPresentationContextProviding {
        func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
            UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
        }
    }

    /// Pages through the web app's list. `progress` gets the count so far.
    static func run(progress: @escaping @MainActor (Int, Int) -> Void) async throws -> Int {
        let token = try await key()
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        var added = 0
        var seen = 0
        for view in ["all", "archived"] {
            var page = 1
            while true {
                var parts = URLComponents(url: Config.webURL.appendingPathComponent("api/app/items"), resolvingAgainstBaseURL: false)!
                parts.queryItems = [URLQueryItem(name: "view", value: view), URLQueryItem(name: "page", value: String(page))]
                var req = URLRequest(url: parts.url!)
                req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                let (data, response) = try await URLSession.shared.data(for: req)
                guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                    throw SourceError.api("The web app said no (\((response as? HTTPURLResponse)?.statusCode ?? 0)).")
                }
                let result = try decoder.decode(ItemPage.self, from: data)
                let incoming = result.items.map { i in
                    // X saves keep the tweet id, so the next X sync knows them.
                    Incoming(source: i.sources?.first ?? "manual",
                             externalId: i.id.hasPrefix("x-") ? String(i.id.dropFirst(2)) : "web-\(i.id)", itemId: i.id, url: i.url,
                             title: i.title, body: i.body, author: i.author, authorHandle: i.authorHandle, media: i.media,
                             kind: i.kind, postedAt: i.postedAt, createdAt: i.createdAt, status: i.status, note: i.note,
                             category: i.category, subtopic: i.subtopic, summary: i.summary, lang: i.lang,
                             sensitive: i.isSensitive, tags: i.tags ?? [])
                }
                added += try await Store.shared.save(all: incoming)
                seen += result.items.count
                await progress(seen, result.total)
                if result.items.count < result.pageSize { break }
                page += 1
            }
        }
        done = true
        return added
    }
}
