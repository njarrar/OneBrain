import SwiftUI

struct RootView: View {
    @Environment(\.scenePhase) private var phase
    @State private var filter = Filter()
    @State private var menu: MenuData?
    @State private var column = NavigationSplitViewColumn.detail
    @State private var showSettings = false
    @State private var screenshots = ScreenshotSync.shared

    var body: some View {
        NavigationSplitView(preferredCompactColumn: $column) {
            MenuView(menu: menu, filter: $filter) { column = .detail }
                .navigationTitle("Brain")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { showSettings = true } label: { Image(systemName: "gearshape") }
                    }
                }
        } detail: {
            NavigationStack {
                ItemListView(filter: $filter, onChange: loadMenu)
            }
        }
        .sheet(isPresented: $showSettings) { SettingsView(menu: menu, changed: loadMenu) }
        .task { await catchUp() }
        .onChange(of: phase) { _, now in
            if now == .active { Task { await catchUp() } }
        }
    }

    /// Each time Brain opens: new screenshots, X and YouTube every six hours, then Claude sorts what's new.
    private func catchUp() async {
        await loadMenu()
        await screenshots.syncIfOn()
        let defaults = UserDefaults.standard
        let due = { (key: String) -> Bool in
            let last = defaults.object(forKey: key) as? Date ?? .distantPast
            return Date.now.timeIntervalSince(last) > 6 * 3600
        }
        if XBookmarks.connected, due("xAuto") {
            defaults.set(Date.now, forKey: "xAuto")
            _ = try? await XBookmarks.sync()
        }
        if YouTube.connected, due("youtubeAuto") {
            defaults.set(Date.now, forKey: "youtubeAuto")
            _ = try? await YouTube.sync()
        }
        await loadMenu()
        await Sorter.shared.run()
        await loadMenu()
    }

    private func loadMenu() async {
        menu = try? await Store.shared.menu()
    }
}

/// The side menu: views, categories, tags and sources. Same as the web.
struct MenuView: View {
    let menu: MenuData?
    @Binding var filter: Filter
    var picked: () -> Void

    @State private var allTags = false

    var body: some View {
        List {
            Section {
                row("Inbox", menu?.views.inbox, "tray", Filter())
                row("All", menu?.views.all, "square.stack", Filter(view: .all))
                row("Archive", menu?.views.archived, "archivebox", Filter(view: .archived))
                row("With media", menu?.views.media, "photo.on.rectangle", .all { $0.media = .with })
                row("Sensitive", menu?.views.sensitive, "eye.slash", .all { $0.sensitive = true })
            }
            if let menu {
                Section("Categories") {
                    ForEach(menu.categories) { c in
                        row(c.name, c.count, nil, .all { $0.category = c.name }, dot: Color(hex: c.color, fallback: Theme.soft))
                    }
                }
                Section("Tags") {
                    ForEach(allTags ? menu.tags : Array(menu.tags.prefix(25))) { t in
                        row(t.name, t.count, "number", .all { $0.tag = t.name })
                    }
                    if menu.tags.count > 25 {
                        Button(allTags ? "Show fewer" : "Show all \(menu.tags.count) tags") { allTags.toggle() }
                    }
                }
                Section("Sources") {
                    ForEach(menu.sources.filter { $0.items > 0 }) { s in
                        row(s.name, s.items, nil, .all { $0.source = s.id })
                    }
                }
            } else {
                ProgressView()
            }
        }
        .listStyle(.sidebar)
        .scrollContentBackground(.hidden)
        .background(Theme.panel)
    }

    private func row(_ label: String, _ count: Int?, _ icon: String?, _ target: Filter, dot: Color? = nil) -> some View {
        Button {
            filter = target
            picked()
        } label: {
            HStack(spacing: 10) {
                if let dot {
                    Circle().fill(dot).frame(width: 8, height: 8)
                } else if let icon {
                    Image(systemName: icon).foregroundStyle(Theme.soft).frame(width: 20)
                }
                Text(label).foregroundStyle(filter == target ? Theme.accent : Theme.ink).lineLimit(1)
                Spacer()
                if let count { Text(count.formatted()).font(.caption.monospacedDigit()).foregroundStyle(Theme.soft) }
            }
        }
    }
}
