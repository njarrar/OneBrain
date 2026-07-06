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

    func items(_ filter: Filter, page: Int) async throws -> ItemPage {
        if Demo.on { return try Demo.page() }
        let req = try request("api/app/items", query: filter.queryItems + [URLQueryItem(name: "page", value: String(page))])
        return try await send(req, as: ItemPage.self)
    }

    func item(_ id: String) async throws -> ItemDetail {
        try await send(request("api/app/items/\(id)"), as: ItemDetail.self)
    }

    struct Change: Encodable {
        var status: String?
        var category: String?
        var note: String?
        var addTags: [String]?
        var removeTags: [String]?
    }

    func change(_ id: String, _ change: Change) async throws -> ItemDetail {
        var req = try request("api/app/items/\(id)", method: "PATCH")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(change)
        return try await send(req, as: ItemDetail.self)
    }

    func menu() async throws -> MenuData {
        if Demo.on { return try Demo.menu() }
        return try await send(request("api/app/menu"), as: MenuData.self)
    }

    /// The design and mode, shared with the web.
    func prefs() async throws -> Prefs {
        if Demo.on { return Look.shared.prefs }
        return try await send(request("api/app/prefs"), as: Prefs.self)
    }

    func savePrefs(design: Design?, mode: Mode?) async throws -> Prefs {
        var req = try request("api/app/prefs", method: "PUT")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var payload: [String: String] = [:]
        if let design { payload["design"] = design.rawValue }
        if let mode { payload["mode"] = mode.rawValue }
        req.httpBody = try JSONEncoder().encode(payload)
        return try await send(req, as: Prefs.self)
    }

    struct Saved: Decodable {
        let id: String
        let existed: Bool?
    }

    /// A link or a note, from the share sheet. title is a web page's own title, when the app shares one.
    func save(url: String?, text: String?, title: String? = nil) async throws -> Saved {
        var req = try request("api/app/save", method: "POST")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var payload: [String: String] = [:]
        if let url { payload["url"] = url }
        if let text { payload["text"] = text }
        if let title { payload["title"] = title }
        req.httpBody = try JSONEncoder().encode(payload)
        return try await send(req, as: Saved.self)
    }

    /// A picture. externalId stops the same screenshot being saved twice.
    func save(image: Data, filename: String, mime: String, externalId: String?, takenAt: Date?, text: String? = nil) async throws -> Saved {
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
