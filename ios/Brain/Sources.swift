import Foundation

/// Pulls saves straight from X and YouTube to the phone.
enum SourceError: LocalizedError {
    case notConnected(String)
    case api(String)
    var errorDescription: String? {
        switch self {
        case .notConnected(let s): return "Connect \(s) first."
        case .api(let m): return m
        }
    }
}

private func getJSON(_ url: URL, token: String, name: String) async throws -> [String: Any] {
    var req = URLRequest(url: url)
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    let (data, response) = try await URLSession.shared.data(for: req)
    let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    let code = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200..<300).contains(code) else {
        let why = (json["error"] as? [String: Any])?["message"] as? String   // YouTube
            ?? json["detail"] as? String                                       // X
            ?? json["title"] as? String
            ?? "error \(code)"
        throw SourceError.api("\(name) said: \(why)")
    }
    return json
}

private func url(_ base: String, _ query: [String: String]) -> URL {
    var parts = URLComponents(string: base)!
    parts.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
    return parts.url!
}

// MARK: YouTube

enum YouTube {
    private static let api = "https://www.googleapis.com/youtube/v3"
    static let liked = "liked"

    struct Playlist: Identifiable, Hashable {
        let id: String
        let title: String
        let count: Int
    }

    static var connected: Bool { Secrets[.googleRefresh] != nil }

    /// The playlists you picked to bring in. "liked" means your liked videos.
    static var picked: Set<String> {
        get { Set(UserDefaults.standard.stringArray(forKey: "youtubePlaylists") ?? [liked]) }
        set { UserDefaults.standard.set(Array(newValue), forKey: "youtubePlaylists") }
    }

    private static func token() async throws -> String {
        guard let refresh = Secrets[.googleRefresh] else { throw SourceError.notConnected("YouTube") }
        return try await OAuth.refresh(OAuth.google, name: "Google", token: refresh).access
    }

    private static func pages(_ token: String, _ path: String, _ query: [String: String], max: Int = 20) async throws -> [[String: Any]] {
        var out: [[String: Any]] = []
        var next: String?
        for _ in 0..<max {
            var q = query
            q["maxResults"] = "50"
            if let next { q["pageToken"] = next }
            let json = try await getJSON(url("\(api)/\(path)", q), token: token, name: "YouTube")
            out += json["items"] as? [[String: Any]] ?? []
            next = json["nextPageToken"] as? String
            if next == nil { break }
        }
        return out
    }

    static func playlists() async throws -> [Playlist] {
        let t = try await token()
        return try await pages(t, "playlists", ["part": "snippet,contentDetails", "mine": "true"]).compactMap {
            guard let id = $0["id"] as? String, let s = $0["snippet"] as? [String: Any] else { return nil }
            return Playlist(id: id, title: s["title"] as? String ?? "Untitled",
                            count: ($0["contentDetails"] as? [String: Any])?["itemCount"] as? Int ?? 0)
        }
    }

    private static func thumb(_ s: [String: Any]) -> String? {
        let t = s["thumbnails"] as? [String: [String: Any]] ?? [:]
        return ["maxres", "standard", "high", "medium", "default"].lazy.compactMap { t[$0]?["url"] as? String }.first
    }

    private static func video(_ id: String, _ s: [String: Any], from: String, savedAt: String?) -> Incoming {
        Incoming(source: "youtube", externalId: "\(from)-\(id)", itemId: "youtube-\(id)",
                 url: "https://www.youtube.com/watch?v=\(id)", title: s["title"] as? String,
                 body: (s["description"] as? String).map { String($0.prefix(3000)) },
                 author: s["videoOwnerChannelTitle"] as? String ?? s["channelTitle"] as? String,
                 media: thumb(s).map { [$0] } ?? [], kind: "video", postedAt: s["publishedAt"] as? String, savedAt: savedAt)
    }

    /// Brings in the picked playlists. Returns how many saves were new.
    static func sync() async throws -> Int {
        do {
            let t = try await token()
            var incoming: [Incoming] = []
            for list in picked {
                if list == liked {
                    for v in try await pages(t, "videos", ["part": "snippet", "myRating": "like"]) {
                        if let id = v["id"] as? String, let s = v["snippet"] as? [String: Any] {
                            incoming.append(video(id, s, from: "liked", savedAt: nil))
                        }
                    }
                } else {
                    for it in try await pages(t, "playlistItems", ["part": "snippet", "playlistId": list]) {
                        guard let s = it["snippet"] as? [String: Any],
                              let id = (s["resourceId"] as? [String: Any])?["videoId"] as? String,
                              !((s["thumbnails"] as? [String: Any]) ?? [:]).isEmpty   // deleted and private videos
                        else { continue }
                        incoming.append(video(id, s, from: list, savedAt: s["publishedAt"] as? String))
                    }
                }
            }
            let added = try await Store.shared.save(all: incoming)
            try await Store.shared.markSynced("youtube")
            return added
        } catch {
            try? await Store.shared.markSynced("youtube", error: error.localizedDescription)
            throw error
        }
    }
}

// MARK: X

enum XBookmarks {
    private static let api = "https://api.x.com/2"
    /// X gives back at most 800 bookmarks, 100 a page.
    private static let maxPages = 8

    static var connected: Bool { Secrets[.xRefresh] != nil }

    static func connect() async throws {
        let t = try await OAuth.signIn(OAuth.x, name: "X")
        guard let refresh = t.refresh else { throw SourceError.api("X didn't give lasting access. Try again.") }
        Secrets[.xRefresh] = refresh
        let me = try await getJSON(URL(string: "\(api)/users/me")!, token: t.access, name: "X")
        Secrets[.xUser] = (me["data"] as? [String: Any])?["id"] as? String
    }

    static func disconnect() {
        Secrets[.xRefresh] = nil
        Secrets[.xUser] = nil
    }

    /// Newest bookmarks first. Stops at the first page with nothing new, since each read costs money.
    static func sync() async throws -> Int {
        do {
            guard let refresh = Secrets[.xRefresh], let user = Secrets[.xUser] else { throw SourceError.notConnected("X") }
            let t = try await OAuth.refresh(OAuth.x, name: "X", token: refresh)
            if let r = t.refresh { Secrets[.xRefresh] = r }   // X swaps the refresh token on every use
            var added = 0
            var next: String?
            for _ in 0..<maxPages {
                var q = [
                    "max_results": "100",
                    "tweet.fields": "created_at,attachments,lang,note_tweet,author_id",
                    "expansions": "author_id,attachments.media_keys",
                    "user.fields": "name,username",
                    "media.fields": "url,preview_image_url,type",
                ]
                if let next { q["pagination_token"] = next }
                let json = try await getJSON(url("\(api)/users/\(user)/bookmarks", q), token: t.access, name: "X")
                let page = parse(json)
                let new = try await Store.shared.save(all: page)
                added += new
                next = (json["meta"] as? [String: Any])?["next_token"] as? String
                if new == 0 || next == nil { break }
            }
            try await Store.shared.markSynced("x")
            return added
        } catch {
            try? await Store.shared.markSynced("x", error: error.localizedDescription)
            throw error
        }
    }

    private static func parse(_ json: [String: Any]) -> [Incoming] {
        let includes = json["includes"] as? [String: Any] ?? [:]
        var users: [String: (name: String?, username: String?)] = [:]
        for u in includes["users"] as? [[String: Any]] ?? [] {
            if let id = u["id"] as? String { users[id] = (u["name"] as? String, u["username"] as? String) }
        }
        var media: [String: String] = [:]
        for m in includes["media"] as? [[String: Any]] ?? [] {
            if let key = m["media_key"] as? String, let u = m["url"] as? String ?? m["preview_image_url"] as? String { media[key] = u }
        }
        return (json["data"] as? [[String: Any]] ?? []).compactMap { t in
            guard let id = t["id"] as? String else { return nil }
            let who = users[t["author_id"] as? String ?? ""]
            let keys = (t["attachments"] as? [String: Any])?["media_keys"] as? [String] ?? []
            let text = (t["note_tweet"] as? [String: Any])?["text"] as? String ?? t["text"] as? String
            return Incoming(source: "x", externalId: id, itemId: "x-\(id)",
                            url: "https://x.com/\(who?.username ?? "i")/status/\(id)", body: text,
                            author: who?.name, authorHandle: who?.username.map { "@\($0)" },
                            media: keys.compactMap { media[$0] }, kind: "post",
                            postedAt: t["created_at"] as? String, savedAt: Dates.iso(.now))
        }
    }
}
