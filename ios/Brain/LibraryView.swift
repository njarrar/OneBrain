import SwiftUI

/// Views, categories and sources in one place, each with its count. The gear opens Settings.
/// Inbox has its own tab, so it is not listed here.
struct LibraryView: View {
    @Environment(MenuStore.self) private var store

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                if let menu = store.menu {
                    memory(menu)
                    views(menu)
                    if !menu.categories.isEmpty {
                        GroupCaption("Categories")
                        VStack(spacing: 0) {
                            ForEach(Array(menu.categories.enumerated()), id: \.element.id) { i, c in
                                NavigationLink(value: Route.list(.all { $0.category = c.name })) {
                                    GroupRow(label: c.name, value: c.count.formatted(), divider: i < menu.categories.count - 1, minHeight: 44, lines: 2) {
                                        RoundedRectangle(cornerRadius: 2).fill(Theme.swatch(c.color))
                                            .frame(width: 10, height: 10).padding(.horizontal, 5)
                                    }
                                    .font(.ui(15))
                                }
                            }
                        }
                        .groupBox()
                    }
                    let sources = menu.sources.filter { $0.items > 0 }
                    if !sources.isEmpty {
                        GroupCaption("Sources")
                        VStack(spacing: 0) {
                            ForEach(Array(sources.enumerated()), id: \.element.id) { i, s in
                                NavigationLink(value: Route.list(.all { $0.source = s.id })) {
                                    GroupRow(label: Sources.label(s.id), value: s.items.formatted(), divider: i < sources.count - 1, minHeight: 44) {
                                        SourceMark(source: s.id, size: 18).foregroundStyle(Theme.ink2).frame(width: 20)
                                    }
                                }
                            }
                        }
                        .groupBox()
                    }
                } else {
                    ProgressView().padding(.top, 40)
                }
            }
            .buttonStyle(.plain)
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 80)
        }
        .background(Theme.grouped)
        .navigationTitle("Library")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: Route.settings) { Image(systemName: "gearshape") }
                    .accessibilityLabel("Settings")
            }
            ToolbarItem(placement: .topBarTrailing) { AddButton() }
        }
    }

    /// Resurface and the weekly digest, at the top so the daily cards are one tap away.
    private func memory(_ menu: MenuData) -> some View {
        let due = menu.views.resurface ?? 0
        return VStack(spacing: 0) {
            NavigationLink(value: Route.resurface) {
                GroupRow(label: "Resurface", value: due > 0 ? "\(due) today" : nil, divider: true) {
                    Image(systemName: "sparkles").font(.ui(18)).foregroundStyle(Theme.accent).frame(width: 20)
                }
            }
            NavigationLink(value: Route.digest) {
                GroupRow(label: "Weekly digest", divider: false) {
                    Image(systemName: "newspaper").font(.ui(18)).foregroundStyle(Theme.ink2).frame(width: 20)
                }
            }
        }
        .groupBox()
    }

    private func views(_ menu: MenuData) -> some View {
        let rows: [(String, String, Int?, Route)] = [
            ("Unread", "envelope.badge", menu.views.unread, .list(Filter(unread: true))),
            ("All saves", "square.stack", menu.views.all, .list(Filter(view: .all))),
            ("Archive", "archivebox", menu.views.archived, .list(Filter(view: .archived))),
            ("Trash", "trash", menu.views.trash, .trash),
            ("Tags", "number", menu.tags.count, .tags),
        ]
        return VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { i, r in
                NavigationLink(value: r.3) {
                    GroupRow(label: r.0, value: r.2?.formatted(), divider: i < rows.count - 1) {
                        Image(systemName: r.1).font(.ui(18)).foregroundStyle(Theme.ink2).frame(width: 20)
                    }
                }
            }
        }
        .groupBox()
    }
}

/// Every tag with its count.
struct TagsView: View {
    @Environment(MenuStore.self) private var store
    @State private var search = ""

    var body: some View {
        let tags = (store.menu?.tags ?? []).filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) }
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(Array(tags.enumerated()), id: \.element.id) { i, t in
                    NavigationLink(value: Route.list(.all { $0.tag = t.name })) {
                        GroupRow(label: "#\(t.name)", value: t.count.formatted(), divider: i < tags.count - 1, minHeight: 44) { EmptyView() }
                    }
                }
            }
            .groupBox()
            .buttonStyle(.plain)
            .padding(16)
            .padding(.bottom, 90)
        }
        .background(Theme.grouped)
        .navigationTitle("Tags")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Find a tag")
    }
}
