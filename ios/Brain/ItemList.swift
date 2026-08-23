import SwiftUI

/// A list of saves in the new style: rows grouped by day, swipe left to archive or delete.
/// The Inbox tab, every list opened from Library, Trash and search results all use it.
struct ItemList: View {
    enum Mode { case inbox, list, trash, search }

    @State var filter: Filter
    let mode: Mode
    /// Inbox only: the search field opens the Search tab. true starts listening.
    var openSearch: ((Bool) -> Void)?

    @Environment(AppSession.self) private var session
    @Environment(MenuStore.self) private var store
    @AppStorage("blurSensitive") private var blur = true
    @State private var items: [Item] = []
    @State private var total = 0
    @State private var cursor: String?
    @State private var loading = false
    @State private var done = false
    @State private var error: String?
    @State private var confirmEmpty = false

    init(filter: Filter, mode: Mode, openSearch: ((Bool) -> Void)? = nil) {
        _filter = State(initialValue: filter)
        self.mode = mode
        self.openSearch = openSearch
    }

    var body: some View {
        List {
            if mode != .search {
                header
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Theme.bg)
            }
            if let error {
                Text(error).font(.footnote).foregroundStyle(Theme.bad)
                    .listRowSeparator(.hidden).listRowBackground(Theme.bg)
            }
            if grouped {
                ForEach(groups, id: \.title) { g in
                    Section {
                        rows(g.items)
                    } header: {
                        Text(g.title)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.soft)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16)
                            .padding(.top, 14)
                            .padding(.bottom, 4)
                            .background(Theme.bg)
                            .listRowInsets(EdgeInsets())
                    }
                    .listSectionSeparator(.hidden)
                }
            } else {
                rows(items)
            }
            footer
                .listRowSeparator(.hidden)
                .listRowBackground(Theme.bg)
        }
        .listStyle(.plain)
        .listSectionSpacing(0)
        .scrollContentBackground(.hidden)
        .background(Theme.bg)
        .environment(\.defaultMinListHeaderHeight, 0)
        // Room for the floating tab bar.
        .safeAreaInset(edge: .bottom) { Color.clear.frame(height: mode == .search ? 76 : 84) }
        .modifier(Bars(mode: mode, filter: filter, total: total, emptyTrash: { confirmEmpty = true }))
        .confirmationDialog("Delete everything in Trash for good?", isPresented: $confirmEmpty, titleVisibility: .visible) {
            Button("Empty Trash", role: .destructive) { Task { await emptyTrash() } }
        } message: {
            Text("This can't be undone.")
        }
        .refreshable { await reload(); await store.load(session: session) }
        .task(id: LoadKey(filter: filter, changed: store.changed)) { await reload() }
        .onChange(of: store.edited) { _, item in if let item { replace(item) } }
        .onChange(of: store.purged) { _, id in if let id { drop(id) } }
    }

    // MARK: Header

    @ViewBuilder private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .bottom) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(filter.title).font(.system(size: 32, weight: .bold)).tracking(-0.3).lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Text(total.formatted()).font(.system(size: 13, design: .monospaced)).foregroundStyle(Theme.faint)
                }
                Spacer()
                if mode == .inbox || mode == .list { filterMenu }
            }
            if mode == .trash {
                Text("Swipe to restore an item or delete it forever.")
                    .font(.system(size: 14)).foregroundStyle(Theme.soft)
            }
            if mode == .inbox {
                searchField
                chips
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, mode == .inbox ? 8 : 0)
        .padding(.bottom, 6)
        .foregroundStyle(Theme.ink)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Button { openSearch?(false) } label: {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").font(.system(size: 16))
                    Text("Search").font(.system(size: 16))
                    Spacer()
                }
                .contentShape(Rectangle())
            }
            Button { openSearch?(true) } label: { Image(systemName: "mic").font(.system(size: 16)) }
                .accessibilityLabel("Search by voice")
        }
        .buttonStyle(.plain)
        .foregroundStyle(Theme.faint)
        .padding(.horizontal, 12)
        .frame(height: 40)
        .background(Theme.fill, in: RoundedRectangle(cornerRadius: 12))
    }

    /// All, Unread, then each source that has saves.
    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Button { filter.source = nil; filter.unread = false } label: {
                    Chip("All", symbol: "square.stack", on: filter.source == nil && !filter.unread)
                }
                Button { filter.unread.toggle() } label: {
                    Chip("Unread", symbol: "envelope.badge", on: filter.unread)
                }
                ForEach((store.menu?.sources ?? []).filter { $0.items > 0 }) { s in
                    Button { filter.source = filter.source == s.id ? nil : s.id } label: {
                        Chip(Sources.label(s.id), source: s.id, on: filter.source == s.id)
                    }
                }
            }
            .buttonStyle(.plain)
            .padding(.trailing, 16)
        }
        .padding(.trailing, -16)
    }

    private var filterMenu: some View {
        Menu {
            Picker("Media", selection: $filter.media) {
                Text("Any").tag(Filter.Media?.none)
                Text("With pictures").tag(Filter.Media?.some(.with))
                Text("Text only").tag(Filter.Media?.some(.without))
            }
            Picker("Language", selection: $filter.lang) {
                Text("All languages").tag(String?.none)
                Text("English").tag(String?.some("en"))
                Text("العربية").tag(String?.some("ar"))
            }
            Toggle("Blur sensitive pictures", isOn: $blur)
        } label: {
            Image(systemName: "line.3.horizontal.decrease")
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(filter.media != nil || filter.lang != nil ? Theme.accentInk : Theme.ink2)
                .frame(width: 40, height: 40)
                .background(filter.media != nil || filter.lang != nil ? Theme.accentFill : Theme.fill, in: Circle())
        }
        .accessibilityLabel("Filter")
    }

    @ViewBuilder private var footer: some View {
        if loading {
            HStack { Spacer(); ProgressView(); Spacer() }.padding(.vertical, 12)
        } else if items.isEmpty && error == nil {
            Text(emptyText).font(.system(size: 15)).foregroundStyle(Theme.soft)
                .frame(maxWidth: .infinity).padding(.vertical, 40)
        }
    }

    private var emptyText: String {
        switch mode {
        case .trash: return "Trash is empty."
        case .search: return "Nothing found."
        default: return filter.view == .inbox && filter.source == nil && !filter.unread ? "Your inbox is empty." : "Nothing here yet."
        }
    }

    // MARK: Rows

    private var grouped: Bool { mode != .trash && mode != .search }

    private struct DayGroup {
        let title: String
        var items: [Item]
    }

    private var groups: [DayGroup] {
        var out: [DayGroup] = []
        for item in items {
            let title = Dates.group(item.date)
            if out.last?.title == title { out[out.count - 1].items.append(item) } else { out.append(DayGroup(title: title, items: [item])) }
        }
        return out
    }

    private func rows(_ list: [Item]) -> some View {
        ForEach(list) { item in
            ZStack {
                NavigationLink(value: Route.item(item)) { EmptyView() }.opacity(0)
                ItemRow(item: item, blur: blur, trash: mode == .trash)
            }
            .listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
            .listRowBackground(Theme.bg)
            .swipeActions(edge: .trailing, allowsFullSwipe: false) { trailing(item) }
            .swipeActions(edge: .leading) {
                if mode != .trash {
                    Button { set(item, .init(read: item.isUnread)) } label: {
                        Label(item.isUnread ? "Read" : "Unread", systemImage: item.isUnread ? "envelope.open" : "envelope.badge")
                    }
                    .tint(Theme.ink2)
                }
            }
            .onAppear { if item.id == items.last?.id { Task { await loadMore() } } }
        }
    }

    /// The first button sits at the far right: Delete, then Archive.
    @ViewBuilder private func trailing(_ item: Item) -> some View {
        if mode == .trash {
            Button(role: .destructive) { Task { await purge(item) } } label: { Label("Delete forever", systemImage: "trash") }
                .tint(Theme.bad)
            Button { set(item, .init(trash: false)) } label: { Label("Restore", systemImage: "arrow.uturn.backward") }
                .tint(Theme.accentFill)
        } else {
            Button(role: .destructive) { set(item, .init(trash: true)) } label: { Label("Delete", systemImage: "trash") }
                .tint(Theme.bad)
            if item.status == "archived" {
                Button { set(item, .init(status: "inbox")) } label: { Label("Inbox", systemImage: "tray") }
                    .tint(Theme.accentFill)
            } else {
                Button { set(item, .init(status: "archived")) } label: { Label("Archive", systemImage: "archivebox") }
                    .tint(Theme.accentFill)
            }
        }
    }

    // MARK: Loading

    private struct LoadKey: Equatable {
        let filter: Filter
        let changed: Int
    }

    private func reload() async {
        cursor = nil
        done = false
        items = []
        await load()
    }

    private func loadMore() async {
        guard !loading, !done, cursor != nil else { return }
        await load()
    }

    private func load() async {
        if mode == .search && (filter.q ?? "").isEmpty { total = 0; return }
        loading = true
        defer { loading = false }
        do {
            let result = try await API.shared.items(filter, cursor: cursor)
            error = nil
            if let t = result.total { total = t }
            let known = Set(items.map(\.id))
            items += result.items.filter { !known.contains($0.id) }
            cursor = result.nextCursor
            done = cursor == nil || result.items.isEmpty
        } catch APIError.signedOut {
            session.signOut()
        } catch is CancellationError {
        } catch let e as URLError where e.code == .cancelled {
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func set(_ item: Item, _ change: API.Change) {
        Task {
            do {
                let d = try await API.shared.change(item.id, change)
                replace(d.item)
                await store.load(session: session)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func purge(_ item: Item) async {
        do {
            try await API.shared.purge(item.id)
            drop(item.id)
            await store.load(session: session)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func emptyTrash() async {
        do {
            try await API.shared.emptyTrash()
            items = []
            total = 0
            await store.load(session: session)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func drop(_ id: String) {
        guard let i = items.firstIndex(where: { $0.id == id }) else { return }
        items.remove(at: i)
        total = max(0, total - 1)
    }

    /// Keeps the list in step with a change, and drops items that no longer belong here.
    private func replace(_ changed: Item) {
        guard let i = items.firstIndex(where: { $0.id == changed.id }) else { return }
        let leaves: Bool
        if filter.view == .trash {
            leaves = !changed.inTrash
        } else {
            leaves = changed.inTrash
                || (filter.view == .inbox && changed.status != "inbox")
                || (filter.view == .all && changed.status == "archived")
                || (filter.view == .archived && changed.status != "archived")
                || (filter.unread && !changed.isUnread)
        }
        if leaves {
            withAnimation { drop(changed.id) }
        } else {
            var merged = changed
            merged.sources = changed.sources ?? items[i].sources
            merged.images = changed.images ?? items[i].images
            merged.tags = changed.tags ?? items[i].tags
            merged.categoryColor = changed.categoryColor ?? items[i].categoryColor
            items[i] = merged
        }
    }
}

/// Inbox has no bar at the top; lists opened from Library show the back button, and Trash adds Empty.
private struct Bars: ViewModifier {
    let mode: ItemList.Mode
    let filter: Filter
    let total: Int
    var emptyTrash: () -> Void

    @ViewBuilder func body(content: Content) -> some View {
        switch mode {
        case .inbox:
            content.toolbar(.hidden, for: .navigationBar)
        case .search:
            content
        case .list:
            content.navigationBarTitleDisplayMode(.inline)
        case .trash:
            content
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Empty", role: .destructive, action: emptyTrash)
                            .fontWeight(.semibold)
                            .foregroundStyle(Theme.bad)
                            .disabled(total == 0)
                    }
                }
        }
    }
}

/// One row: source tile with the unread dot, author and time, two lines of text,
/// an optional picture, and the category.
struct ItemRow: View {
    let item: Item
    var blur: Bool
    var trash = false

    private var hidden: Bool { blur && item.isSensitive }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            SourceTile(source: item.sourceKey, unread: item.isUnread && !trash)
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline) {
                    Text(item.author ?? Sources.label(item.sourceKey))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    Text(Dates.row(trash ? Dates.parse(item.deletedAt) : item.date))
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(Theme.faint)
                }
                VStack(alignment: .leading, spacing: 5) {
                    Text(item.mainText)
                        .font(.system(size: 15))
                        .lineSpacing(item.isArabic ? 6 : 3)
                        .foregroundStyle(Theme.ink2)
                        .lineLimit(2)
                        .multilineTextAlignment(item.isArabic ? .trailing : .leading)
                        .frame(maxWidth: .infinity, alignment: item.isArabic ? .trailing : .leading)
                        .blur(radius: hidden ? 5 : 0)
                    if let picture = item.pictures.first {
                        // A filled picture sizes from its frame, never from the photo, so it can't widen the row.
                        Color.clear
                            .aspectRatio(3 / 2, contentMode: .fit)
                            .frame(maxWidth: .infinity)
                            .overlay { RemoteImage(url: picture) }
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .blur(radius: hidden ? 18 : 0)
                            .padding(.top, 4)
                            .padding(.bottom, 2)
                    }
                    if trash {
                        Text("Deleted from \(item.status == "archived" ? "Archive" : "Inbox")")
                            .font(.system(size: 12.5)).foregroundStyle(Theme.soft)
                    } else if let category = item.category {
                        CategoryLabel(name: category, color: item.categoryColor)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.bg)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.divider).frame(height: 1).padding(.leading, 64)
        }
        .contentShape(Rectangle())
    }
}
