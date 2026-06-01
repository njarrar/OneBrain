import Foundation

/// The phone-only version of Brain kept saves in a database on the phone. This sends anything
/// in it to the web app once (items, notes, tags, archive status and screenshots), then removes
/// the phone copy, so all data lives in the cloud.
@Observable
final class LocalUpload {
    static let shared = LocalUpload()

    var running = false
    var status: String?

    private static var folder: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Config.appGroup)?
            .appendingPathComponent("Brain", isDirectory: true)
    }
    private static var database: URL? { folder?.appendingPathComponent("brain.sqlite") }

    /// Whether there is a phone copy still to send.
    static var pending: Bool {
        guard let db = database else { return false }
        return FileManager.default.fileExists(atPath: db.path)
    }

    private static let batch = 200

    func runIfNeeded() async {
        guard Self.pending, !running, KeyStore.token != nil else { return }
        running = true
        defer { running = false }
        do {
            try await upload()
        } catch {
            status = "Sending your phone's saves stopped: \(error.localizedDescription). Brain tries again next time it opens."
        }
    }

    private func upload() async throws {
        guard let path = Self.database, let folder = Self.folder else { return }
        // Read everything first, so the database is closed before its folder goes.
        let rows = try DB(path: path).all("""
            select i.*,
              (select s.source_id from saves s where s.item_id = i.id order by s.created_at limit 1) as source,
              (select s.external_id from saves s where s.item_id = i.id order by s.created_at limit 1) as external_id,
              (select s.saved_at from saves s where s.item_id = i.id order by s.created_at limit 1) as saved_at,
              (select json_group_array(t.name) from item_tags t where t.item_id = i.id) as tag_list,
              (select f.id from files f where f.item_id = i.id and f.mime like 'image/%' order by f.created_at limit 1) as file
            from items i
            """)
        func str(_ r: DB.Row, _ k: String) -> String? { r[k] as? String }
        func list(_ r: DB.Row, _ k: String) -> [String] {
            guard let s = str(r, k), let d = s.data(using: .utf8) else { return [] }
            return (try? JSONSerialization.jsonObject(with: d) as? [String]) ?? []
        }

        var records: [API.Record] = []
        var sent = 0
        for r in rows {
            let id = str(r, "id") ?? ""
            // Screenshots carry a picture, so they go up one by one like new ones do.
            if let file = str(r, "file") {
                let url = folder.appendingPathComponent("files").appendingPathComponent(file)
                if let data = try? Data(contentsOf: url) {
                    _ = try await API.shared.save(image: data, filename: "\(file).jpg", mime: "image/jpeg",
                                                  externalId: str(r, "external_id"), takenAt: Dates.parse(str(r, "posted_at")),
                                                  text: str(r, "note") ?? str(r, "body"))
                }
                sent += 1
                continue
            }
            records.append(API.Record(
                id: id, source: str(r, "source") ?? "manual", externalId: str(r, "external_id"), url: str(r, "url"),
                title: str(r, "title"), body: str(r, "body"), note: str(r, "note"), author: str(r, "author"),
                authorHandle: str(r, "author_handle"), media: list(r, "media"), kind: str(r, "kind") ?? "link",
                postedAt: str(r, "posted_at"), savedAt: str(r, "saved_at"), createdAt: str(r, "created_at"),
                status: str(r, "status") ?? "inbox", category: str(r, "category"), subtopic: str(r, "subtopic"),
                summary: str(r, "summary"), lang: str(r, "lang"), sensitive: (r["sensitive"] as? Int ?? 0) != 0,
                tags: list(r, "tag_list")
            ))
            if records.count == Self.batch {
                _ = try await API.shared.importItems(records)
                sent += records.count
                records = []
                status = "Sending your phone's saves: \(sent) of \(rows.count)…"
            }
        }
        if !records.isEmpty {
            _ = try await API.shared.importItems(records)
            sent += records.count
        }
        // Everything is on the web now, so the phone copy goes.
        try? FileManager.default.removeItem(at: folder)
        status = rows.isEmpty ? nil : "Sent \(sent) saves from this phone to the cloud."
    }
}
