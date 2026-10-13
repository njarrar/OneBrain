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
    var deletedAt: String?
    var readAt: String?
    var author: String?
    var authorHandle: String?
    var postedAt: String?
    var createdAt: String
    var media: [String]
    var images: [String]?
    var sources: [String]?
    var tags: [String]?
    /// When it comes back in Resurface. Newer servers only.
    var remindAt: String?
    /// What was said in a voice memo or video, or the text in a picture (0.3 servers).
    var transcript: String?
    /// The people and dates Claude found in it (0.3 servers).
    var facts: Facts?

    var isSensitive: Bool { (sensitive ?? 0) != 0 }
    var isUnread: Bool { readAt == nil && deletedAt == nil }
    var inTrash: Bool { deletedAt != nil }
    var isArabic: Bool { lang == "ar" }

    /// Files added to Brain first, then pictures that came with the post.
    var pictures: [URL] {
        let files = (images ?? []).compactMap { URL(string: "/files/\($0)", relativeTo: Config.baseURL)?.absoluteURL }
        return files + media.compactMap(URL.init(string:))
    }

    var mainText: String {
        if let title, !title.isEmpty { return title }
        if let body, !body.isEmpty { return body }
        return url ?? "Untitled"
    }

    var date: Date? { Dates.parse(postedAt ?? createdAt) }

    /// Where it came from, for the row's tile: the first source, or the kind for things added by hand.
    var sourceKey: String {
        let s = sources?.first ?? "manual"
        if s != "manual" { return s }
        switch kind {
        case "image": return "image"
        case "note": return "note"
        case "video": return "video"
        case "audio": return "audio"
        case "email": return "email"
        case "pin": return "pin"
        case "file": return "file"
        default: return url == nil ? "note" : "link"
        }
    }
}

struct ItemPage: Codable {
    let items: [Item]
    /// Counted on the first page only.
    let total: Int?
    /// Pass back for the next page; nil on the last one. Older servers send none.
    var nextCursor: String?
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

        var isVideo: Bool {
            if mime.hasPrefix("video/") { return true }
            guard mime == "application/octet-stream" else { return false }
            return ItemDetail.videoTypes.contains((filename as NSString).pathExtension.lowercased())
        }
    }
    var item: Item
    let saves: [Save]
    var tags: [Tag]
    let files: [File]
    /// Why the server couldn't hear or read this save, when it tried and failed.
    var textError: String?

    /// Voice memos and videos, to play.
    private static let videoTypes: Set<String> = ["mp4", "mov", "m4v"]
    private static let soundTypes: Set<String> = ["m4a", "mp3", "wav", "aac", "ogg", "oga", "opus", "flac", "webm", "caf", "3gp", "amr", "mp4", "mov", "m4v"]

    var sounds: [File] {
        files.filter { f in
            if f.mime.hasPrefix("audio/") || f.mime.hasPrefix("video/") { return true }
            // Some uploads arrive as octet-stream; the file name still says what they are.
            guard f.mime == "application/octet-stream" else { return false }
            return Self.soundTypes.contains((f.filename as NSString).pathExtension.lowercased())
        }
    }
}

/// The people and dates Claude found in a save.
struct Facts: Codable, Hashable {
    struct Person: Codable, Hashable {
        let name: String
        let about: String
    }
    struct Day: Codable, Hashable {
        /// YYYY-MM-DD, or MM-DD when the year isn't known.
        let date: String
        let what: String
        let person: String?
        let yearly: Bool
    }
    let people: [Person]
    let dates: [Day]

    var isEmpty: Bool { people.isEmpty && dates.isEmpty }

    /// "14 March" or "14 March 1990".
    static func dayLabel(_ date: String) -> String {
        let parts = date.split(separator: "-").map(String.init)
        guard parts.count >= 2, let month = Int(parts[parts.count - 2]), let day = Int(parts[parts.count - 1]),
              (1...12).contains(month) else { return date }
        let name = Calendar(identifier: .gregorian).monthSymbols[month - 1]
        return parts.count == 3 ? "\(day) \(name) \(parts[0])" : "\(day) \(name)"
    }
}

struct MenuData: Codable {
    struct Views: Codable {
        let inbox: Int
        let all: Int
        let archived: Int
        let media: Int
        let sensitive: Int
        // Newer servers only.
        var trash: Int?
        var unread: Int?
        var unsorted: Int?
        /// Resurface cards waiting today.
        var resurface: Int?
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
    enum Scope: String { case inbox, all, archived, trash }
    enum Media: String { case with, without }

    var view: Scope = .inbox
    var category: String?
    var tag: String?
    var source: String?
    var q: String?
    var media: Media?
    var lang: String?
    var sensitive = false
    var unread = false
    var subtopic: String?

    var title: String {
        if let q, !q.isEmpty { return "“\(q)”" }
        if let subtopic { return subtopic }
        if let category { return category }
        if let tag { return "#\(tag)" }
        if let source { return Sources.label(source) }
        if sensitive { return "Sensitive" }
        if media == .with, view != .inbox { return "With media" }
        if unread, view == .inbox { return "Unread" }
        switch view {
        case .inbox: return "Inbox"
        case .all: return "All"
        case .archived: return "Archive"
        case .trash: return "Trash"
        }
    }

    var queryItems: [URLQueryItem] {
        var q: [URLQueryItem] = [URLQueryItem(name: "view", value: view.rawValue)]
        func add(_ name: String, _ value: String?) {
            if let value, !value.isEmpty { q.append(URLQueryItem(name: name, value: value)) }
        }
        add("category", category)
        add("subtopic", subtopic)
        add("tag", tag)
        add("source", source)
        add("q", self.q)
        add("media", media?.rawValue)
        add("lang", lang)
        if sensitive { add("sensitive", "1") }
        if unread { add("unread", "1") }
        return q
    }

    static func all(_ change: (inout Filter) -> Void) -> Filter {
        var f = Filter(view: .all)
        change(&f)
        return f
    }
}

enum Sources {
    static func label(_ id: String) -> String {
        ["x": "X", "youtube": "YouTube", "instagram": "Instagram", "photos": "Screenshots", "feedly": "RSS",
         "gmail": "Gmail", "outlook": "Outlook", "pinterest": "Pinterest", "email": "Email", "pin": "Pins",
         "manual": "Added by hand", "image": "Pictures", "note": "Notes", "link": "Links", "video": "Videos",
         "audio": "Voice memos", "file": "Files"][id] ?? id
    }

    /// An SF Symbol for each source. X, YouTube and Instagram have no symbol, so they use a letter mark (see SourceMark).
    static func symbol(_ id: String) -> String {
        switch id {
        case "photos": return "iphone"
        case "feedly": return "dot.radiowaves.up.forward"
        case "image": return "photo"
        case "note", "file": return "note.text"
        case "video", "youtube": return "play.rectangle"
        case "instagram": return "camera"
        case "x": return "xmark"
        case "audio": return "mic"
        case "gmail", "outlook", "email": return "envelope"
        case "pinterest", "pin": return "pin"
        default: return "link"
        }
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

    /// Time today, the weekday this week, else the date: "9:14", "Wed", "Sep 18".
    static func row(_ d: Date?) -> String {
        guard let d else { return "" }
        let cal = Calendar.current
        if cal.isDateInToday(d) { return d.formatted(.dateTime.hour().minute()) }
        if let days = cal.dateComponents([.day], from: cal.startOfDay(for: d), to: cal.startOfDay(for: .now)).day, days < 7 {
            return d.formatted(.dateTime.weekday(.abbreviated))
        }
        let sameYear = cal.component(.year, from: d) == cal.component(.year, from: .now)
        return sameYear ? d.formatted(.dateTime.month(.abbreviated).day()) : d.formatted(.dateTime.month(.abbreviated).day().year())
    }

    /// The day group a row sits in: Today, Yesterday, Earlier this week, then month and year.
    static func group(_ d: Date?) -> String {
        guard let d else { return "Earlier" }
        let cal = Calendar.current
        if cal.isDateInToday(d) { return "Today" }
        if cal.isDateInYesterday(d) { return "Yesterday" }
        if let days = cal.dateComponents([.day], from: cal.startOfDay(for: d), to: cal.startOfDay(for: .now)).day, days < 7 {
            return "Earlier this week"
        }
        return d.formatted(.dateTime.month(.wide).year())
    }
}

/// A Resurface card: a save coming back today, and why.
struct ResurfaceCard: Codable, Identifiable, Hashable {
    let item: Item
    /// "reminder" or "on_this_day".
    let reason: String
    var id: String { item.id }

    init(from decoder: Decoder) throws {
        item = try Item(from: decoder)
        reason = try decoder.container(keyedBy: Keys.self).decode(String.self, forKey: .reason)
    }

    func encode(to encoder: Encoder) throws {
        try item.encode(to: encoder)
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(reason, forKey: .reason)
    }

    private enum Keys: String, CodingKey { case reason }

    var why: String {
        reason == "reminder" ? "You asked to see this again" : "From this day, \(Dates.short(item.date))"
    }
}

/// An answer from your own saves, citing them as [1], [2] …
struct Answer: Codable {
    /// nil without an AI key; the sources are still worth showing then.
    let answer: String?
    let sources: [Item]
    /// What Brain looked for to link saves up. Older servers send none.
    var searched: [String]?
}

/// One week's write-up of what was saved, with [n] pointing at items[n-1].
struct Digest: Codable, Identifiable, Hashable {
    let weekStart: String
    let body: String
    let saved: Int
    let createdAt: String
    let items: [Item]
    var id: String { weekStart }

    var title: String {
        guard let d = Dates.parse(weekStart + "T00:00:00Z") else { return "Week of \(weekStart)" }
        return "Week of " + d.formatted(.dateTime.month(.wide).day())
    }
}
