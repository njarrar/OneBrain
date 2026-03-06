import Foundation

/// Claude sorts items on the phone, the same way the web app does: a category, a sub-topic,
/// a one-line summary, a few tags, the language, and whether it is sensitive.
/// The item's text (and a screenshot's picture) goes to Anthropic with your own key.
@Observable
final class Sorter {
    static let shared = Sorter()

    private static let model = "claude-haiku-4-5"
    private static let batch = 20
    private static let maxText = 1500
    private static let maxPicture = 4 * 1024 * 1024

    var running = false
    var status: String?

    static var ready: Bool { Secrets[.anthropic] != nil }

    /// Sorts up to `batches` batches of unsorted items.
    @MainActor
    func run(batches: Int = 10) async {
        guard Self.ready, !running else { return }
        running = true
        defer { running = false }
        var sorted = 0
        do {
            for _ in 0..<batches {
                let n = try await sortNext()
                if n == 0 { break }
                sorted += n
                status = "Sorted \(sorted)…"
            }
            let left = try await Store.shared.unsortedCount()
            status = sorted == 0 && left == 0 ? "Everything is sorted." : "Sorted \(sorted). \(left) left."
        } catch {
            status = error.localizedDescription
        }
    }

    private func describe(_ p: Store.Pending) -> String {
        let text = [p.title, p.body].compactMap { $0 }.joined(separator: "\n").prefix(Self.maxText)
        return [
            "<item id=\"\(p.id)\">",
            p.author.map { "Author: \($0)" },
            p.url.map { "Link: \($0)" },
            p.mediaCount > 0 ? "Pictures: \(p.mediaCount)" : nil,
            text.isEmpty ? "(no text)" : String(text),
            "</item>",
        ].compactMap { $0 }.joined(separator: "\n")
    }

    private func sortNext() async throws -> Int {
        guard let key = Secrets[.anthropic] else { return 0 }
        let pending = try await Store.shared.unsorted(limit: Self.batch)
        if pending.isEmpty { return 0 }

        var content: [[String: Any]] = []
        for p in pending {
            content.append(["type": "text", "text": describe(p)])
            // Screenshots have no text, so Claude looks at the picture itself.
            if let file = p.picture, let data = try? Data(contentsOf: file), data.count <= Self.maxPicture {
                content.append(["type": "text", "text": "Picture for item \(p.id):"])
                content.append(["type": "image", "source": ["type": "base64", "media_type": "image/jpeg", "data": data.base64EncodedString()]])
            }
        }
        let names = Store.categories.map { $0.name }
        let system = """
        You sort saved bookmarks for one person, who reads English and Arabic.

        Categories:
        \(try await Store.shared.taxonomy())

        For every item give:
        - category: the best fit, written exactly as it appears in the list.
        - subtopic: reuse a sub-topic already in use for that category when one fits; otherwise write a short new one in the same style.
        - summary: one plain English line (under 20 words) saying what the item is about, even when the item is in Arabic.
        - tags: 2 to 4 short English tags in Title Case.
        - lang: "ar" if the text is mainly Arabic, "en" if mainly English, otherwise "other".
        - sensitive: true for adult, explicit or NSFW content.
        """
        let tool: [String: Any] = [
            "name": "save_sorting",
            "description": "Save the sorting for every item.",
            "input_schema": [
                "type": "object",
                "required": ["items"],
                "properties": ["items": [
                    "type": "array",
                    "items": [
                        "type": "object",
                        "required": ["id", "category", "subtopic", "summary", "tags", "lang", "sensitive"],
                        "properties": [
                            "id": ["type": "string"],
                            "category": ["type": "string", "enum": names],
                            "subtopic": ["type": "string"],
                            "summary": ["type": "string"],
                            "tags": ["type": "array", "items": ["type": "string"]],
                            "lang": ["type": "string", "enum": ["en", "ar", "other"]],
                            "sensitive": ["type": "boolean"],
                        ],
                    ],
                ]],
            ],
        ]
        let body: [String: Any] = [
            "model": Self.model,
            "max_tokens": 8000,
            "system": system,
            "messages": [["role": "user", "content": content]],
            "tools": [tool],
            "tool_choice": ["type": "tool", "name": "save_sorting"],
        ]

        var req = URLRequest(url: URL(string: "https://api.anthropic.com/v1/messages")!)
        req.httpMethod = "POST"
        req.timeoutInterval = 120
        req.setValue(key, forHTTPHeaderField: "x-api-key")
        req.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: req)
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            let why = (json["error"] as? [String: Any])?["message"] as? String ?? "error \((response as? HTTPURLResponse)?.statusCode ?? 0)"
            throw SourceError.api("Claude said: \(why)")
        }
        let input = (json["content"] as? [[String: Any]] ?? []).first { $0["type"] as? String == "tool_use" }?["input"] as? [String: Any]
        let results = (input?["items"] as? [[String: Any]] ?? []).compactMap { r -> Store.Sorted? in
            guard let id = r["id"] as? String, let category = r["category"] as? String else { return nil }
            return Store.Sorted(id: id, category: category,
                                subtopic: (r["subtopic"] as? String ?? "").trimmingCharacters(in: .whitespaces),
                                summary: (r["summary"] as? String ?? "").trimmingCharacters(in: .whitespaces),
                                tags: r["tags"] as? [String] ?? [], lang: r["lang"] as? String ?? "en",
                                sensitive: r["sensitive"] as? Bool ?? false)
        }
        let n = try await Store.shared.apply(results)
        // Nothing sorted means Claude skipped the batch; stop so the same items don't loop.
        return n
    }
}
