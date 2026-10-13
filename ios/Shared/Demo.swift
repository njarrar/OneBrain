import Foundation

/// Debug builds only: `-demo` fills the app with made-up posts so screenshots can be taken on the
/// simulator without signing in. Add `-lookDesign sunroom` and `-lookMode light` (or `brain`, `vault`,
/// `dark`) to pick the look, and `-demoScreen library` (or trash, settings, item, add, search) to open a screen.
/// The picture URLs are fixed picsum seeds; the post texts are written to match what each seed shows.
enum Demo {
    static var on: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-demo")
        #else
        false
        #endif
    }

    static func page(_ filter: Filter = Filter()) throws -> ItemPage {
        let all: ItemPage = try decode(pageJSON)
        guard filter.view == .trash else { return all }
        // Trash: two of the posts, deleted a little while ago.
        let trashed = all.items.suffix(2).map { item -> Item in
            var i = item
            i.deletedAt = ago(3)
            return i
        }
        return ItemPage(items: trashed, total: trashed.count, nextCursor: nil, page: 1, pageSize: 50)
    }
    static func menu() throws -> MenuData { try decode(menuJSON) }

    static func detail(_ item: Item) -> ItemDetail {
        let tags = (item.tags ?? []).enumerated().map { i, t in ItemDetail.Tag(name: t, addedBy: i == 0 ? "user" : "claude") }
        let saves = (item.sources ?? []).map {
            ItemDetail.Save(sourceId: $0, name: Sources.label($0), savedAt: item.createdAt, originalUrl: item.url, createdAt: item.createdAt)
        }
        return ItemDetail(item: item, saves: saves, tags: tags, files: [])
    }

    private static func decode<T: Decodable>(_ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    /// A time some hours ago, so the list shows Today, Yesterday and Earlier this week.
    private static func ago(_ hours: Double) -> String { Dates.iso(Date().addingTimeInterval(-hours * 3600)) }

    private static var pageJSON: String { """
    {"total":6,"page":1,"pageSize":50,"items":[
     {"id":"d1","kind":"post","status":"inbox","body":"We cut our agent's token bill by 60% in a week. Three changes: cache the long system prompt, batch 20 items per call, and stop sending the full history every turn.",
      "summary":"Three ways to cut an agent's token bill: caching, batching and trimming history.",
      "category":"AI, Code & Dev Tools","categoryColor":"#3b82f6","author":"Lina Haddad","authorHandle":"@linabuilds",
      "createdAt":"\(ago(1))","postedAt":"\(ago(1))","url":"https://x.com/linabuilds/status/1",
      "media":[],"sources":["x"],"tags":["agents","costs"]},
     {"id":"d2","kind":"post","status":"inbox","body":"A coyote at golden hour in Griffith Park, shot on a 400mm from the fire road. Settings and the trail map in the comments.",
      "category":"Menswear, Design & Travel","categoryColor":"#a855f7","author":"wild.frames","authorHandle":"@wild.frames",
      "createdAt":"\(ago(26))","postedAt":"\(ago(26))","url":"https://instagram.com/p/demo",
      "media":["https://picsum.photos/seed/navy-tailoring-jacket/700/467"],"sources":["instagram"],"tags":["photography","hikes"]},
     {"id":"d3","kind":"post","status":"inbox","readAt":"\(ago(40))","lang":"ar",
      "body":"سلسلة عن تاريخ وسط البلد في عمّان: كيف تغيّرت شوارع الرضا والسلط خلال مئة عام، مع صور قديمة من أرشيف العائلات.",
      "summary":"A thread on how downtown Amman's streets changed over a hundred years, with old family photos.",
      "note":"Visit Rainbow Street archive shop.",
      "category":"MENA Geopolitics & Society","categoryColor":"#eab308","author":"أرشيف عمّان","authorHandle":"@amman_archive",
      "createdAt":"\(ago(60))","postedAt":"\(ago(60))","url":"https://x.com/amman_archive/status/2",
      "media":["https://picsum.photos/seed/amman-downtown-old/900/560"],"sources":["x"],"tags":["amman","history","photos"]},
     {"id":"d4","kind":"video","status":"inbox","readAt":"\(ago(70))","title":"Lore Recap: All the Lore Before Warcraft 3",
      "summary":"A long recap of Warcraft 1 and 2, and how they set up the Third War.",
      "category":"Cinema, Gaming, History & Culture","categoryColor":"#f97316","author":"Lawllin",
      "createdAt":"\(ago(72))","postedAt":"\(ago(72))","url":"https://youtube.com/watch?v=demo",
      "media":[],"sources":["youtube"],"tags":["gaming"]},
     {"id":"d5","kind":"note","status":"inbox","body":"Idea for the sorter: group saves by the week they came in, then have Claude write a short Sunday digest.",
      "category":"AI, Code & Dev Tools","categoryColor":"#3b82f6","createdAt":"\(ago(90))","media":[],"sources":["manual"]},
     {"id":"d6","kind":"image","status":"inbox","readAt":"\(ago(100))","title":"Sleep tracker: 7h 12m average over 30 days, deep sleep up 18%.",
      "category":"Health, Biotech & Longevity","categoryColor":"#14b8a6","createdAt":"\(ago(110))",
      "media":["https://picsum.photos/seed/night-sleep-bedroom/700/467"],"sources":["photos"]}
    ]}
    """ }

    private static let menuJSON = """
    {"views":{"inbox":6,"all":3595,"archived":312,"media":900,"sensitive":12,"trash":2,"unread":5,"unsorted":0},
     "categories":[{"name":"AI, Code & Dev Tools","color":"#3b82f6","count":612},
                   {"name":"Cinema, Gaming, History & Culture","color":"#f97316","count":140},
                   {"name":"Health, Biotech & Longevity","color":"#14b8a6","count":96},
                   {"name":"Markets, Startups & Finance","color":"#10b981","count":185},
                   {"name":"MENA Geopolitics & Society","color":"#eab308","count":402},
                   {"name":"Menswear, Design & Travel","color":"#a855f7","count":77}],
     "tags":[{"name":"ai","count":88},{"name":"history","count":41},{"name":"agents","count":30}],
     "sources":[{"id":"x","name":"X","status":"connected","items":3225},
                {"id":"instagram","name":"Instagram","status":"connected","items":140},
                {"id":"youtube","name":"YouTube","status":"connected","items":96},
                {"id":"photos","name":"Screenshots","status":"connected","items":58},
                {"id":"feedly","name":"Feedly","status":"connected","items":44},
                {"id":"manual","name":"Added by hand","status":"connected","items":32}]}
    """
}
