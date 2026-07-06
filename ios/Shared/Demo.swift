import Foundation

/// Debug builds only: `-demo` fills the app with made-up posts so screenshots of the list
/// can be taken on the simulator without signing in. Add `-lookDesign sunroom` and
/// `-lookMode light` (or `vault`, `dark`) to pick the look.
enum Demo {
    static var on: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-demo")
        #else
        false
        #endif
    }

    static func page() throws -> ItemPage { try decode(pageJSON) }
    static func menu() throws -> MenuData { try decode(menuJSON) }

    private static func decode<T: Decodable>(_ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private static let pageJSON = """
    {"total":4,"page":1,"pageSize":50,"items":[
     {"id":"d1","kind":"video","status":"inbox","title":"Lore Recap: All the Lore Before Warcraft 3",
      "summary":"A long recap of Warcraft 1 and 2, and how they set up the Third War.",
      "category":"Cinema, Gaming, History & Culture","categoryColor":"#f97316","subtopic":"Gaming, Native Engine Ports & Industry",
      "author":"Lawllin","createdAt":"2026-09-27T10:00:00Z","postedAt":"2026-09-27T10:00:00Z",
      "media":["https://picsum.photos/seed/brain-demo-lore/1280/720"],"sources":["youtube"],"tags":["Gaming","Lore"]},
     {"id":"d2","kind":"post","status":"inbox","body":"Why 90% of managers never learn to delegate, and the one habit that fixes it. A thread with a very long first line to check that text wraps inside the card and never runs off the edge of the screen.",
      "category":"Markets, Startups & Finance","categoryColor":"#10b981","author":"Evan Carmichael","authorHandle":"@EvanCarmichael",
      "createdAt":"2026-09-26T09:00:00Z","media":[],"sources":["x"],"tags":["leadership"]},
     {"id":"d3","kind":"post","status":"inbox","body":"ممر التجارة الجديد عبر الخليج وكيف يغيّر طرق الشحن في المنطقة كلها",
      "lang":"ar","category":"MENA Geopolitics & Society","categoryColor":"#eab308","author":"Middle East Eye","authorHandle":"@MiddleEastEye",
      "createdAt":"2026-09-25T09:00:00Z","media":["https://picsum.photos/seed/brain-demo-gulf-a/900/900","https://picsum.photos/seed/brain-demo-gulf-b/900/1200"],"sources":["x"]},
     {"id":"d4","kind":"post","status":"inbox","title":"The quiet return of the linen jacket",
      "summary":"Why linen is back for autumn, with three ways to wear it.","note":"Look for one in olive.",
      "category":"Menswear, Design & Travel","categoryColor":"#a855f7","author":"Monocle","authorHandle":"monocle.com",
      "createdAt":"2026-09-24T09:00:00Z","media":["https://picsum.photos/seed/brain-demo-linen-a/800/800","https://picsum.photos/seed/brain-demo-linen-b/800/800","https://picsum.photos/seed/brain-demo-linen-c/800/800","https://picsum.photos/seed/brain-demo-linen-d/800/800","https://picsum.photos/seed/brain-demo-linen-e/800/800"],
      "sources":["feedly"],"tags":["style"]}
    ]}
    """

    private static let menuJSON = """
    {"views":{"inbox":128,"all":3595,"archived":312,"media":900,"sensitive":12},
     "categories":[{"name":"Cinema, Gaming, History & Culture","color":"#f97316","count":140},
                   {"name":"Markets, Startups & Finance","color":"#10b981","count":185}],
     "tags":[{"name":"ai","count":88}],
     "sources":[{"id":"x","name":"X","status":"ok","items":3225}]}
    """
}
