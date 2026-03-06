import Foundation

struct Item: Codable, Identifiable, Hashable {
    let id: String
    var title: String?
    var summary: String?
    var body: String?
    var note: String?
    var url: String?
    var kind: String
    var category: String?
    var categoryColor: String?
    var subtopic: String?
    var lang: String?
    var sensitive: Int?
    var status: String
    var author: String?
    var authorHandle: String?
    var postedAt: String?
    var createdAt: String
    var media: [String]
    var images: [String]?
    var sources: [String]?
    var tags: [String]?

    var isSensitive: Bool { (sensitive ?? 0) != 0 }
    var isArabic: Bool { lang == "ar" }

    /// Files added to Brain first, then pictures that came with the post.
    var pictures: [URL] {
        (images ?? []).map(Paths.file) + media.compactMap(URL.init(string:))
    }

    var mainText: String {
        if let title, !title.isEmpty { return title }
        if let body, !body.isEmpty { return body }
        return url ?? "Untitled"
    }

    var date: Date? { Dates.parse(postedAt ?? createdAt) }
}

struct ItemPage: Codable {
    let items: [Item]
    let total: Int
    let page: Int
    let pageSize: Int
}

struct ItemDetail: Codable {
    struct Save: Codable, Hashable {
        let sourceId: String
        let name: String
        let savedAt: String?
        let originalUrl: String?
        let createdAt: String
    }
    struct Tag: Codable, Hashable {
        let name: String
        let addedBy: String
    }
    struct File: Codable, Hashable {
        let id: String
        let filename: String
        let mime: String
    }
    var item: Item
    let saves: [Save]
    var tags: [Tag]
    let files: [File]
}

struct MenuData: Codable {
    struct Views: Codable {
        let inbox: Int
        let all: Int
        let archived: Int
        let media: Int
        let sensitive: Int
    }
    struct Category: Codable, Hashable, Identifiable {
        let name: String
        let color: String?
        let count: Int
        var id: String { name }
    }
    struct Tag: Codable, Hashable, Identifiable {
        let name: String
        let count: Int
        var id: String { name }
    }
    struct Source: Codable, Hashable, Identifiable {
        let id: String
        let name: String
        let status: String
        let lastSyncAt: String?
        let lastError: String?
        let items: Int
    }
    let views: Views
    let categories: [Category]
    let tags: [Tag]
    let sources: [Source]
}

/// What the item list shows. Matches the web app's filters.
struct Filter: Hashable {
    enum Scope: String { case inbox, all, archived }
    enum Media: String { case with, without }

    var view: Scope = .inbox
    var category: String?
    var tag: String?
    var source: String?
    var q: String?
    var media: Media?
    var lang: String?
    var sensitive = false

    var title: String {
        if let q, !q.isEmpty { return "“\(q)”" }
        if let category { return category }
        if let tag { return "#\(tag)" }
        if let source { return Sources.label(source) }
        if sensitive { return "Sensitive" }
        if media == .with, view != .inbox { return "With media" }
        switch view {
        case .inbox: return "Inbox"
        case .all: return "All"
        case .archived: return "Archive"
        }
    }

    static func all(_ change: (inout Filter) -> Void) -> Filter {
        var f = Filter(view: .all)
        change(&f)
        return f
    }
}

enum Sources {
    static func label(_ id: String) -> String {
        ["x": "X", "youtube": "YouTube", "instagram": "Instagram", "photos": "Screenshots", "feedly": "Feedly", "manual": "Added by hand"][id] ?? id
    }
}

enum Dates {
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain = ISO8601DateFormatter()

    static func parse(_ s: String?) -> Date? {
        guard let s else { return nil }
        return withFraction.date(from: s) ?? plain.date(from: s)
    }

    static func iso(_ d: Date) -> String { withFraction.string(from: d) }

    static func short(_ d: Date?) -> String {
        guard let d else { return "" }
        return d.formatted(.dateTime.day().month(.abbreviated).year())
    }
}
