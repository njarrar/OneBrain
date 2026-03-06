import Foundation

/// A save coming in from a source (X, YouTube, Instagram, the web app or the share sheet).
struct Incoming {
    var source: String
    var externalId: String?
    var itemId: String
    var url: String?
    var title: String?
    var body: String?
    var author: String?
    var authorHandle: String?
    var media: [String] = []
    var kind = "link"
    var postedAt: String?
    var savedAt: String?
    var createdAt: String?
    // Filled in when the item comes from the web app, already sorted.
    var status: String?
    var note: String?
    var category: String?
    var subtopic: String?
    var summary: String?
    var lang: String?
    var sensitive = false
    var tags: [String] = []
}

/// Everything Brain keeps, in one SQLite file on the phone. Same tables and filters as the web app.
actor Store {
    static let shared = Store()

    private let db: DB

    init() {
        do {
            db = try DB(path: Paths.database)
            try Self.migrate(db)
        } catch {
            fatalError("Brain can't open its database: \(error.localizedDescription)")
        }
    }

    static let categories: [(name: String, color: String, about: String)] = [
        ("AI, Code & Dev Tools", "#0EA5E9", "LLMs, agents, prompts, coding tools, open source, Mac utilities"),
        ("Markets, Startups & Finance", "#10B981", "SaaS, venture capital, investing, macro and oil, MENA fintech"),
        ("MENA Geopolitics & Society", "#F59E0B", "Egypt, Jordan, the Gulf, Palestine, investigative threads"),
        ("Cinema, Gaming, History & Culture", "#F97316", "Film, games, books, history, art, calligraphy"),
        ("Health, Biotech & Longevity", "#14B8A6", "Health, fitness, sleep, nutrition, biotech"),
        ("Menswear, Design & Travel", "#EAB308", "Tailoring, style, architecture, design, places to go"),
        ("Viral Threads & Internet Culture", "#38BDF8", "Memes, viral stories, social commentary, humor"),
        ("Models, Pop Culture & NSFW", "#F43F5E", "Celebrities, models, pop culture, sensitive content"),
    ]

    static let sourceNames: [(String, String)] = [
        ("manual", "Added by hand"), ("x", "X"), ("youtube", "YouTube"), ("instagram", "Instagram"),
        ("photos", "Screenshots"), ("feedly", "Feedly"),
    ]

    private static func migrate(_ db: DB) throws {
        let version = try db.count("pragma user_version")
        if version < 1 {
            try db.transaction {
                try db.exec("""
                create table if not exists categories (
                  name text primary key, description text not null default '', color text);
                create table if not exists sources (
                  id text primary key, name text not null, last_sync_at text, last_error text);
                create table if not exists items (
                  id text primary key, title text, summary text, body text, note text, url text,
                  kind text not null default 'link', category text, subtopic text, lang text,
                  sensitive integer not null default 0,
                  status text not null default 'inbox' check (status in ('inbox', 'read', 'archived')),
                  author text, author_handle text, posted_at text, media text not null default '[]',
                  created_at text not null, updated_at text);
                create index if not exists items_status on items (status);
                create index if not exists items_url on items (url);
                create index if not exists items_category on items (category);
                create table if not exists saves (
                  item_id text not null references items (id) on delete cascade,
                  source_id text not null, external_id text, saved_at text, original_url text,
                  created_at text not null, unique (source_id, external_id));
                create index if not exists saves_item on saves (item_id);
                create table if not exists item_tags (
                  item_id text not null references items (id) on delete cascade,
                  name text not null collate nocase,
                  added_by text not null default 'user', added_at text,
                  primary key (item_id, name));
                create table if not exists files (
                  id text primary key, item_id text not null references items (id) on delete cascade,
                  filename text not null, mime text not null, created_at text not null);
                create index if not exists files_item on files (item_id);
                create virtual table if not exists items_fts using fts5 (
                  title, note, summary, author, author_handle, body,
                  content = 'items', content_rowid = 'rowid', tokenize = 'unicode61 remove_diacritics 2');
                create trigger if not exists items_fts_insert after insert on items begin
                  insert into items_fts (rowid, title, note, summary, author, author_handle, body)
                  values (new.rowid, new.title, new.note, new.summary, new.author, new.author_handle, new.body);
                end;
                create trigger if not exists items_fts_delete after delete on items begin
                  insert into items_fts (items_fts, rowid, title, note, summary, author, author_handle, body)
                  values ('delete', old.rowid, old.title, old.note, old.summary, old.author, old.author_handle, old.body);
                end;
                create trigger if not exists items_fts_update after update of title, note, summary, author, author_handle, body on items begin
                  insert into items_fts (items_fts, rowid, title, note, summary, author, author_handle, body)
                  values ('delete', old.rowid, old.title, old.note, old.summary, old.author, old.author_handle, old.body);
                  insert into items_fts (rowid, title, note, summary, author, author_handle, body)
                  values (new.rowid, new.title, new.note, new.summary, new.author, new.author_handle, new.body);
                end;
                pragma user_version = 1;
                """)
                for c in categories {
                    try db.run("insert or ignore into categories (name, description, color) values (?, ?, ?)", c.name, c.about, c.color)
                }
                for (id, name) in sourceNames {
                    try db.run("insert or ignore into sources (id, name) values (?, ?)", id, name)
                }
            }
        }
    }

    // MARK: Reading

    private static let hasMedia =
        "(i.media <> '[]' or exists (select 1 from files f where f.item_id = i.id and f.mime like 'image/%'))"

    private static let itemColumns = """
    i.*, (select color from categories c where c.name = i.category) as category_color,
      (select json_group_array(distinct s.source_id) from saves s where s.item_id = i.id) as sources,
      (select json_group_array(f.id) from files f where f.item_id = i.id and f.mime like 'image/%') as images,
      (select json_group_array(name) from (select t.name from item_tags t where t.item_id = i.id order by t.name)) as tags
    """

    static let pageSize = 50

    /// Words to an FTS5 query: each word is a prefix match, and all must be present.
    private static func ftsQuery(_ q: String) -> String? {
        let words = q.split(whereSeparator: { $0.isWhitespace })
            .map { $0.filter { $0.isLetter || $0.isNumber } }
            .filter { !$0.isEmpty }
        return words.isEmpty ? nil : words.map { "\"\($0)\"*" }.joined(separator: " ")
    }

    func items(_ f: Filter, page: Int) throws -> ItemPage {
        var conds: [String] = []
        var args: [Any?] = []
        switch f.view {
        case .inbox: conds.append("i.status = 'inbox'")
        case .archived: conds.append("i.status = 'archived'")
        case .all: conds.append("i.status <> 'archived'")
        }
        if let c = f.category { conds.append("i.category = ?"); args.append(c) }
        if let t = f.tag { conds.append("exists (select 1 from item_tags t where t.item_id = i.id and t.name = ?)"); args.append(t) }
        if let s = f.source { conds.append("exists (select 1 from saves s where s.item_id = i.id and s.source_id = ?)"); args.append(s) }
        if let l = f.lang { conds.append("i.lang = ?"); args.append(l) }
        if f.sensitive { conds.append("i.sensitive = 1") }
        if f.media == .with { conds.append(Self.hasMedia) }
        if f.media == .without { conds.append("not \(Self.hasMedia)") }
        let q = f.q?.trimmingCharacters(in: .whitespaces) ?? ""
        let match = q.isEmpty ? nil : Self.ftsQuery(q)
        if !q.isEmpty && match == nil { conds.append("0") }
        if let match { conds.append("items_fts match ?"); args.append(match) }

        let from = match != nil ? "from items i join items_fts on items_fts.rowid = i.rowid" : "from items i"
        let whereSQL = "where " + conds.joined(separator: " and ")
        let order = match != nil ? "order by bm25(items_fts), i.created_at desc" : "order by coalesce(i.posted_at, i.created_at) desc"
        let rows = try db.all("select \(Self.itemColumns) \(from) \(whereSQL) \(order) limit ? offset ?",
                              args: args + [Self.pageSize, (max(page, 1) - 1) * Self.pageSize])
        let total = (try db.all("select count(*) as n \(from) \(whereSQL)", args: args).first?["n"] as? Int) ?? 0
        return ItemPage(items: rows.map(Self.toItem), total: total, page: page, pageSize: Self.pageSize)
    }

    func item(_ id: String) throws -> ItemDetail {
        guard let row = try db.first("select \(Self.itemColumns) from items i where i.id = ?", id) else {
            throw Failure.missing
        }
        let saves = try db.all("""
            select s.source_id, coalesce(so.name, s.source_id) as name, s.saved_at, s.original_url, s.created_at
            from saves s left join sources so on so.id = s.source_id
            where s.item_id = ? order by coalesce(s.saved_at, s.created_at)
            """, id).map {
            ItemDetail.Save(sourceId: $0.s("source_id") ?? "", name: $0.s("name") ?? "", savedAt: $0.s("saved_at"),
                            originalUrl: $0.s("original_url"), createdAt: $0.s("created_at") ?? "")
        }
        let tags = try db.all("select name, added_by from item_tags where item_id = ? order by name", id).map {
            ItemDetail.Tag(name: $0.s("name") ?? "", addedBy: $0.s("added_by") ?? "user")
        }
        let files = try db.all("select id, filename, mime from files where item_id = ? order by created_at", id).map {
            ItemDetail.File(id: $0.s("id") ?? "", filename: $0.s("filename") ?? "", mime: $0.s("mime") ?? "")
        }
        return ItemDetail(item: Self.toItem(row), saves: saves, tags: tags, files: files)
    }

    func menu() throws -> MenuData {
        let views = MenuData.Views(
            inbox: try db.count("select count(*) from items where status = 'inbox'"),
            all: try db.count("select count(*) from items where status <> 'archived'"),
            archived: try db.count("select count(*) from items where status = 'archived'"),
            media: try db.count("select count(*) from items i where i.status <> 'archived' and \(Self.hasMedia)"),
            sensitive: try db.count("select count(*) from items where status <> 'archived' and sensitive = 1")
        )
        let categories = try db.all("""
            select c.name, c.color, (select count(*) from items i where i.category = c.name and i.status <> 'archived') as n
            from categories c order by c.name
            """).map { MenuData.Category(name: $0.s("name") ?? "", color: $0.s("color"), count: $0["n"] as? Int ?? 0) }
        let tags = try db.all("""
            select t.name, count(*) as n from item_tags t join items i on i.id = t.item_id
            where i.status <> 'archived' group by t.name order by n desc, t.name
            """).map { MenuData.Tag(name: $0.s("name") ?? "", count: $0["n"] as? Int ?? 0) }
        let sources = try db.all("""
            select so.id, so.name, so.last_sync_at, so.last_error,
              (select count(distinct s.item_id) from saves s where s.source_id = so.id) as n
            from sources so order by so.rowid
            """).map {
            MenuData.Source(id: $0.s("id") ?? "", name: $0.s("name") ?? "",
                            status: $0.s("last_error") != nil ? "error" : ($0.s("last_sync_at") != nil ? "connected" : "not_connected"),
                            lastSyncAt: $0.s("last_sync_at"), lastError: $0.s("last_error"), items: $0["n"] as? Int ?? 0)
        }
        return MenuData(views: views, categories: categories, tags: tags, sources: sources)
    }

    private static func toItem(_ r: DB.Row) -> Item {
        func list(_ key: String) -> [String] {
            guard let s = r.s(key), let d = s.data(using: .utf8),
                  let a = try? JSONSerialization.jsonObject(with: d) as? [Any] else { return [] }
            return a.compactMap { $0 as? String }
        }
        return Item(
            id: r.s("id") ?? "", title: r.s("title"), summary: r.s("summary"), body: r.s("body"), note: r.s("note"),
            url: r.s("url"), kind: r.s("kind") ?? "link", category: r.s("category"), categoryColor: r.s("category_color"),
            subtopic: r.s("subtopic"), lang: r.s("lang"), sensitive: r["sensitive"] as? Int, status: r.s("status") ?? "inbox",
            author: r.s("author"), authorHandle: r.s("author_handle"), postedAt: r.s("posted_at"),
            createdAt: r.s("created_at") ?? "", media: list("media"), images: list("images"), sources: list("sources"),
            tags: list("tags")
        )
    }

    enum Failure: LocalizedError {
        case missing
        var errorDescription: String? { "That item is gone." }
    }

    // MARK: Changing

    struct Change {
        var status: String?
        var category: String?
        var note: String?
        var addTags: [String]?
        var removeTags: [String]?
    }

    func change(_ id: String, _ c: Change) throws -> ItemDetail {
        let now = Dates.iso(.now)
        try db.transaction {
            if let s = c.status, ["inbox", "read", "archived"].contains(s) {
                try db.run("update items set status = ?, updated_at = ? where id = ?", s, now, id)
            }
            if let cat = c.category {
                try db.run("update items set category = ?, updated_at = ? where id = ?", cat.isEmpty ? nil : cat, now, id)
            }
            if let n = c.note {
                let t = n.trimmingCharacters(in: .whitespacesAndNewlines)
                try db.run("update items set note = ?, updated_at = ? where id = ?", t.isEmpty ? nil : t, now, id)
            }
            for t in c.addTags ?? [] where !t.trimmingCharacters(in: .whitespaces).isEmpty {
                try db.run("insert or ignore into item_tags (item_id, name, added_by, added_at) values (?, ?, 'user', ?)",
                           id, t.trimmingCharacters(in: .whitespaces), now)
            }
            for t in c.removeTags ?? [] {
                try db.run("delete from item_tags where item_id = ? and name = ?", id, t)
            }
        }
        return try item(id)
    }

    // MARK: Saving

    struct Saved {
        let id: String
        let existed: Bool
    }

    private static func isArabic(_ s: String?) -> Bool {
        s?.range(of: "[\u{0621}-\u{064A}]", options: .regularExpression) != nil
    }

    /// Adds an item, or a new save to the item it already is. Returns whether the save was new.
    @discardableResult
    func save(_ x: Incoming) throws -> Saved {
        try db.transaction { try saveOne(x) }
    }

    /// Many saves in one transaction. Returns how many were new.
    func save(all list: [Incoming]) throws -> Int {
        try db.transaction { try list.reduce(0) { $0 + (try saveOne($1).existed ? 0 : 1) } }
    }

    private func saveOne(_ x: Incoming) throws -> Saved {
        let now = Dates.iso(.now)
        // A link saved before under another id is the same item.
        var id = x.itemId
        if try db.first("select 1 from items where id = ?", id) == nil, let url = x.url,
           let other = try db.first("select id from items where url = ? limit 1", url)?.s("id") {
            id = other
        }
        let media = String(data: (try? JSONSerialization.data(withJSONObject: x.media)) ?? Data("[]".utf8), encoding: .utf8) ?? "[]"
        let lang = x.lang ?? (Self.isArabic((x.title ?? "") + (x.body ?? "")) ? "ar" : "en")
        try db.run("""
            insert or ignore into items (id, title, summary, body, note, url, kind, category, subtopic, lang, sensitive,
              status, author, author_handle, posted_at, media, created_at, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, args: [id, x.title, x.summary, x.body, x.note, x.url, x.kind, x.category, x.subtopic, lang, x.sensitive ? 1 : 0,
                        x.status ?? "inbox", x.author, x.authorHandle, x.postedAt, media, x.createdAt ?? now, now])
        for t in x.tags {
            try db.run("insert or ignore into item_tags (item_id, name, added_by, added_at) values (?, ?, 'import', ?)", id, t, now)
        }
        let added = try db.run("""
            insert or ignore into saves (item_id, source_id, external_id, saved_at, original_url, created_at)
            values (?, ?, ?, ?, ?, ?)
            """, id, x.source, x.externalId ?? UUID().uuidString, x.savedAt, x.url, now)
        return Saved(id: id, existed: added == 0)
    }

    /// Whether this source already has this save. Lets a sync stop once it reaches saves it has seen.
    func has(source: String, externalId: String) throws -> Bool {
        try db.first("select 1 from saves where source_id = ? and external_id = ?", source, externalId) != nil
    }

    /// A link or a note, from the share sheet or typed in.
    func save(url: String?, text: String?, title: String? = nil) throws -> Saved {
        let link = url.flatMap(URL.init(string:))
        let host = link?.host?.lowercased().replacingOccurrences(of: "www.", with: "") ?? ""
        var x = Incoming(source: "manual", itemId: "manual-\(UUID().uuidString.lowercased())", url: url, title: title, body: text,
                         kind: url == nil ? "note" : "link", savedAt: Dates.iso(.now))
        if ["x.com", "twitter.com", "mobile.twitter.com"].contains(host) {
            x.source = "x"; x.kind = "post"
            if let tweet = link?.pathComponents.drop(while: { $0 != "status" }).dropFirst().first {
                x.itemId = "x-\(tweet)"; x.externalId = tweet
            }
        } else if host.hasSuffix("youtube.com") || host == "youtu.be" {
            x.source = "youtube"; x.kind = "video"
            let video = host == "youtu.be" ? link?.pathComponents.dropFirst().first
                : URLComponents(string: url ?? "")?.queryItems?.first(where: { $0.name == "v" })?.value
            if let video { x.itemId = "youtube-\(video)"; x.externalId = "shared-\(video)" }
        } else if host.hasSuffix("instagram.com") {
            x.source = "instagram"; x.kind = "post"
            let parts = link?.pathComponents ?? []
            if let i = parts.firstIndex(where: { ["p", "reel", "tv"].contains($0) }), i + 1 < parts.count {
                x.itemId = "instagram-\(parts[i + 1])"; x.externalId = parts[i + 1]
            }
        } else if host.contains("feedly") {
            x.source = "feedly"; x.kind = "article"
        }
        return try save(x)
    }

    /// A picture: a screenshot or one shared from another app. externalId stops the same screenshot being saved twice.
    func save(image: Data, externalId: String?, takenAt: Date?, text: String? = nil) throws -> Saved {
        let source = externalId == nil ? "manual" : "photos"
        if let externalId, try has(source: source, externalId: externalId) {
            return Saved(id: "", existed: true)
        }
        let fileId = UUID().uuidString.lowercased()
        try image.write(to: Paths.file(fileId), options: .atomic)
        let itemId = "\(source)-\(fileId)"
        do {
            return try db.transaction {
                let s = try saveOne(Incoming(source: source, externalId: externalId, itemId: itemId, body: text, kind: "image",
                                             postedAt: takenAt.map(Dates.iso), savedAt: Dates.iso(.now)))
                try db.run("insert into files (id, item_id, filename, mime, created_at) values (?, ?, ?, 'image/jpeg', ?)",
                           fileId, itemId, "\(fileId).jpg", Dates.iso(.now))
                return s
            }
        } catch {
            try? FileManager.default.removeItem(at: Paths.file(fileId))
            throw error
        }
    }

    func markSynced(_ source: String, error: String? = nil) throws {
        if let error {
            try db.run("update sources set last_error = ? where id = ?", error, source)
        } else {
            try db.run("update sources set last_sync_at = ?, last_error = null where id = ?", Dates.iso(.now), source)
        }
    }

    // MARK: Sorting

    struct Pending {
        let id: String
        let title: String?
        let body: String?
        let url: String?
        let author: String?
        let mediaCount: Int
        let picture: URL?
    }

    func unsortedCount() throws -> Int {
        try db.count("select count(*) from items where category is null")
    }

    func unsorted(limit: Int) throws -> [Pending] {
        try db.all("""
            select i.id, i.title, i.body, i.url, trim(coalesce(i.author, '') || ' ' || coalesce(i.author_handle, '')) as who,
              json_array_length(i.media) as pics,
              (select f.id from files f where f.item_id = i.id and f.mime like 'image/%' order by f.created_at limit 1) as file
            from items i where i.category is null order by coalesce(i.posted_at, i.created_at) desc limit ?
            """, limit).map {
            Pending(id: $0.s("id") ?? "", title: $0.s("title"), body: $0.s("body"), url: $0.s("url"),
                    author: ($0.s("who") ?? "").isEmpty ? nil : $0.s("who"), mediaCount: $0["pics"] as? Int ?? 0,
                    picture: $0.s("file").map(Paths.file))
        }
    }

    /// Category descriptions and the sub-topics already in use, for Claude.
    func taxonomy() throws -> String {
        let subs = try db.all("""
            select category, subtopic from items where subtopic is not null and category is not null
            group by category, subtopic order by category, count(*) desc
            """)
        return try db.all("select name, description from categories order by name").map { c in
            let name = c.s("name") ?? ""
            let known = subs.filter { $0.s("category") == name }.compactMap { $0.s("subtopic") }
            return "- \(name): \(c.s("description") ?? "")" + (known.isEmpty ? "" : "\n  Sub-topics in use: \(known.joined(separator: "; "))")
        }.joined(separator: "\n")
    }

    struct Sorted {
        let id: String
        let category: String
        let subtopic: String
        let summary: String
        let tags: [String]
        let lang: String
        let sensitive: Bool
    }

    /// Saves Claude's sorting. Fills blanks only, so your own edits stay.
    func apply(_ results: [Sorted]) throws -> Int {
        let valid = Set(Self.categories.map { $0.name })
        let now = Dates.iso(.now)
        return try db.transaction {
            var n = 0
            for r in results where valid.contains(r.category) {
                let changed = try db.run("""
                    update items set category = coalesce(category, ?), subtopic = coalesce(subtopic, ?),
                      summary = coalesce(summary, ?), lang = ?, sensitive = max(sensitive, ?), updated_at = ? where id = ?
                    """, r.category, r.subtopic, r.summary, r.lang, r.sensitive ? 1 : 0, now, r.id)
                guard changed > 0 else { continue }
                n += 1
                for t in Set(r.tags.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }).prefix(4) {
                    try db.run("insert or ignore into item_tags (item_id, name, added_by, added_at) values (?, ?, 'claude', ?)", r.id, t, now)
                }
            }
            return n
        }
    }
}

extension Dictionary where Key == String, Value == Any {
    func s(_ key: String) -> String? { self[key] as? String }
}
