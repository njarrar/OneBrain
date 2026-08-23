import Foundation

enum APIError: LocalizedError {
    case signedOut
    case server(String)

    var errorDescription: String? {
        switch self {
        case .signedOut: return "Sign in again."
        case .server(let message): return message
        }
    }
}

/// Talks to the web app's /api/app routes with the app's key.
struct API {
    static let shared = API()

    private let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 60
        return URLSession(configuration: c)
    }()

    private var decoder: JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }

    private func request(_ path: String, query: [URLQueryItem] = [], method: String = "GET") throws -> URLRequest {
        guard let token = KeyStore.token else { throw APIError.signedOut }
        var parts = URLComponents(url: Config.baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { parts.queryItems = query }
        var req = URLRequest(url: parts.url!)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return req
    }

    private func send<T: Decodable>(_ req: URLRequest, as: T.Type) async throws -> T {
        let (data, response) = try await session.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        if code == 401 { throw APIError.signedOut }
        guard (200..<300).contains(code) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError.server(message ?? "Something went wrong (\(code)).")
        }
        return try decoder.decode(T.self, from: data)
    }

    /// The first page, or the one after `cursor` (nextCursor from the page before).
    func items(_ filter: Filter, cursor: String? = nil) async throws -> ItemPage {
        if Demo.on { return try Demo.page(filter) }
        let more = cursor.map { [URLQueryItem(name: "cursor", value: $0)] } ?? []
        return try await send(request("api/app/items", query: filter.queryItems + more), as: ItemPage.self)
    }

    func item(_ id: String) async throws -> ItemDetail {
        try await send(request("api/app/items/\(id)"), as: ItemDetail.self)
    }

    struct Change: Encodable {
        var status: String?
        /// true marks read, false unread.
        var read: Bool?
        /// true moves to Trash, false brings back.
        var trash: Bool?
        var category: String?
        var note: String?
        var addTags: [String]?
        var removeTags: [String]?
        /// When the item comes back in Resurface.
        var remindAt: Date?
        /// true sends remindAt: null, which clears the reminder.
        var clearReminder = false

        private enum Keys: String, CodingKey { case status, read, trash, category, note, addTags, removeTags, remindAt }

        // Only the fields that change go out; the server refuses unknown ones.
        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: Keys.self)
            try c.encodeIfPresent(status, forKey: .status)
            try c.encodeIfPresent(read, forKey: .read)
            try c.encodeIfPresent(trash, forKey: .trash)
            try c.encodeIfPresent(category, forKey: .category)
            try c.encodeIfPresent(note, forKey: .note)
            try c.encodeIfPresent(addTags, forKey: .addTags)
            try c.encodeIfPresent(removeTags, forKey: .removeTags)
            if clearReminder {
                try c.encodeNil(forKey: .remindAt)
            } else if let remindAt {
                try c.encode(Dates.iso(remindAt), forKey: .remindAt)
            }
        }
    }

    func change(_ id: String, _ change: Change) async throws -> ItemDetail {
        var req = try request("api/app/items/\(id)", method: "PATCH")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(change)
        return try await send(req, as: ItemDetail.self)
    }

    /// Deletes an item for good. It must be in Trash.
    func purge(_ id: String) async throws {
        struct Out: Decodable { let deleted: Int }
        _ = try await send(request("api/app/items/\(id)", method: "DELETE"), as: Out.self)
    }

    /// Deletes everything in Trash for good.
    func emptyTrash() async throws {
        struct Out: Decodable { let deleted: Int }
        _ = try await send(request("api/app/items", query: [URLQueryItem(name: "view", value: "trash")], method: "DELETE"), as: Out.self)
    }

    // MARK: Memory

    private func post<Body: Encodable, T: Decodable>(_ path: String, _ body: Body, as: T.Type) async throws -> T {
        var req = try request(path, method: "POST")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(body)
        return try await send(req, as: T.self)
    }

    /// Today's Resurface cards.
    func resurface() async throws -> [ResurfaceCard] {
        struct Out: Decodable { let cards: [ResurfaceCard] }
        if Demo.on { return [] }
        return try await send(request("api/app/resurface"), as: Out.self).cards
    }

    /// Answers a card: keep (comes back later, then less often), later (tomorrow) or done.
    func review(_ id: String, how: String) async throws {
        struct Out: Decodable { let nextAt: String? }
        _ = try await post("api/app/resurface", ["id": id, "how": how], as: Out.self)
    }

    /// Asks a question of your own saves.
    func ask(_ question: String) async throws -> Answer {
        try await post("api/app/ask", ["q": question], as: Answer.self)
    }

    /// Saves about the same thing as this one. Empty until the server has read it.
    func related(_ id: String) async throws -> [Item] {
        struct Out: Decodable { let items: [Item] }
        if Demo.on { return [] }
        return try await send(request("api/app/items/\(id)/related"), as: Out.self).items
    }

    struct Digests: Decodable {
        var made: Bool?
        var reason: String?
        let digests: [Digest]
    }

    /// The latest weekly digests. Reading never makes a new one.
    func digests() async throws -> [Digest] {
        if Demo.on { return [] }
        return try await send(request("api/app/digest"), as: Digests.self).digests
    }

    /// Asks Claude for this week's digest now.
    func makeDigest() async throws -> Digests {
        var req = try request("api/app/digest", method: "POST")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await send(req, as: Digests.self)
    }

    struct LinkPreview: Decodable, Equatable {
        let title: String?
        let description: String?
        let image: String?
    }

    /// A link's title and picture, for the Add sheet.
    func unfurl(_ url: String) async throws -> LinkPreview {
        try await send(request("api/app/unfurl", query: [URLQueryItem(name: "url", value: url)]), as: LinkPreview.self)
    }

    func menu() async throws -> MenuData {
        if Demo.on { return try Demo.menu() }
        return try await send(request("api/app/menu"), as: MenuData.self)
    }

    /// Light, dark or system, shared with the web.
    func prefs() async throws -> Prefs {
        if Demo.on { return Prefs(mode: Look.shared.mode) }
        return try await send(request("api/app/prefs"), as: Prefs.self)
    }

    func savePrefs(mode: Mode) async throws -> Prefs {
        var req = try request("api/app/prefs", method: "PUT")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["mode": mode.rawValue])
        return try await send(req, as: Prefs.self)
    }

    struct Saved: Decodable {
        let id: String
        let existed: Bool?
    }

    /// How a save is handled: sort false skips Claude's sorting; tags are added at once.
    struct SaveOptions {
        var sort = true
        var tags: [String] = []
    }

    /// A link or a note, from the share sheet or the Add sheet. title is a web page's own title, when the app shares one.
    func save(url: String?, text: String?, title: String? = nil, options: SaveOptions = .init()) async throws -> Saved {
        struct Payload: Encodable {
            var url: String?
            var text: String?
            var title: String?
            var sort: Bool
            var tags: [String]
        }
        var req = try request("api/app/save", method: "POST")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(Payload(url: url, text: text, title: title, sort: options.sort, tags: options.tags))
        return try await send(req, as: Saved.self)
    }

    /// A picture. externalId stops the same screenshot being saved twice.
    func save(image: Data, filename: String, mime: String, externalId: String?, takenAt: Date?, text: String? = nil,
              options: SaveOptions = .init()) async throws -> Saved {
        var req = try request("api/app/save", method: "POST")
        let boundary = "brain-\(UUID().uuidString)"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        var body = Data()
        func field(_ name: String, _ value: String?) {
            guard let value else { return }
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".data(using: .utf8)!)
        }
        field("externalId", externalId)
        field("takenAt", takenAt.map(Dates.iso))
        field("text", text)
        if !options.sort { field("sort", "0") }
        if !options.tags.isEmpty { field("tags", options.tags.joined(separator: ",")) }
        body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\nContent-Type: \(mime)\r\n\r\n".data(using: .utf8)!)
        body.append(image)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        req.httpBody = body
        return try await send(req, as: Saved.self)
    }

    struct SourceStatus: Decodable, Identifiable {
        let id: String
        let name: String
        let status: String
        let lastSyncAt: String?
        let lastError: String?
        let items: Int
    }

    /// Sources as the web app sees them. They connect once, on the web, and both devices share them.
    func sources() async throws -> [SourceStatus] {
        struct Out: Decodable { let sources: [SourceStatus] }
        return try await send(request("api/app/sources"), as: Out.self).sources
    }

    struct Record: Encodable {
        var id: String
        var source: String
        var externalId: String?
        var url: String?
        var title: String?
        var body: String?
        var note: String?
        var author: String?
        var authorHandle: String?
        var media: [String]
        var kind: String
        var postedAt: String?
        var savedAt: String?
        var createdAt: String?
        var status: String
        var category: String?
        var subtopic: String?
        var summary: String?
        var lang: String?
        var sensitive: Bool
        var tags: [String]
    }

    struct Imported: Decodable {
        let added: Int
        let updated: Int
    }

    /// Sends saves the web app may not have yet. Existing items only fill their blanks.
    func importItems(_ items: [Record]) async throws -> Imported {
        var req = try request("api/app/import", method: "POST")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["items": items])
        return try await send(req, as: Imported.self)
    }

    /// Loads a picture. Only Brain's own files get the key; pictures from X and others don't.
    func imageData(_ url: URL) async throws -> Data {
        var req = URLRequest(url: url)
        if url.host == Config.baseURL.host, let token = KeyStore.token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await session.data(for: req)
        guard ((response as? HTTPURLResponse)?.statusCode ?? 0) < 400 else { throw APIError.server("Picture not found") }
        return data
    }
}
