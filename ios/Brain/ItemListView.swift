import SwiftUI

struct ItemListView: View {
    @Binding var filter: Filter
    var onChange: () async -> Void

    @Environment(AppSession.self) private var session
    @AppStorage("blurSensitive") private var blur = true
    @State private var items: [Item] = []
    @State private var total = 0
    @State private var page = 1
    @State private var loading = false
    @State private var done = false
    @State private var error: String?
    @State private var search = ""

    var body: some View {
        List {
            if let error {
                Text(error).foregroundStyle(Theme.bad).listRowBackground(Color.clear)
            }
            if total > 0 {
                Text("\(total.formatted()) items").font(.caption.monospaced()).foregroundStyle(Theme.soft)
                    .listRowBackground(Color.clear).listRowSeparator(.hidden)
            }
            ForEach(items) { item in
                // The link sits behind the card, hidden, so the list draws no chevron beside it.
                ItemCard(item: item, blur: blur)
                    .background { NavigationLink(value: item) { EmptyView() }.opacity(0) }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
                .swipeActions(edge: .trailing) {
                    if item.status == "archived" {
                        Button { set(item, "inbox") } label: { Label("Inbox", systemImage: "tray") }.tint(.blue)
                    } else {
                        Button { set(item, "archived") } label: { Label("Archive", systemImage: "archivebox") }.tint(.orange)
                    }
                }
                .swipeActions(edge: .leading) {
                    if item.status == "inbox" {
                        Button { set(item, "read") } label: { Label("Read", systemImage: "checkmark") }.tint(Theme.ok)
                    }
                }
                .onAppear { if item.id == items.last?.id { Task { await loadMore() } } }
            }
            if loading {
                HStack { Spacer(); ProgressView(); Spacer() }.listRowBackground(Color.clear)
            } else if items.isEmpty && error == nil {
                Text(filter.view == .inbox ? "Your inbox is empty." : "Nothing here yet.")
                    .foregroundStyle(Theme.soft).listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.bg)
        .navigationTitle(filter.title)
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: Item.self) { item in
            ItemDetailView(id: item.id, preview: item) { changed in replace(changed) }
        }
        .searchable(text: $search, prompt: "Search in English or Arabic")
        .onSubmit(of: .search) { filter = .all { $0.q = search } }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { filterMenu }
        }
        .refreshable { await reload(); await onChange() }
        .task(id: filter) {
            search = filter.q ?? ""
            await reload()
        }
    }

    private var filterMenu: some View {
        Menu {
            Picker("Media", selection: Binding(get: { filter.media }, set: { filter.media = $0; widen() })) {
                Text("Any").tag(Filter.Media?.none)
                Text("With media").tag(Filter.Media?.some(.with))
                Text("Text only").tag(Filter.Media?.some(.without))
            }
            Picker("Language", selection: Binding(get: { filter.lang }, set: { filter.lang = $0; widen() })) {
                Text("All languages").tag(String?.none)
                Text("English").tag(String?.some("en"))
                Text("العربية").tag(String?.some("ar"))
            }
            Toggle("Blur sensitive", isOn: $blur)
            if filter.view != .inbox {
                Picker("Show", selection: Binding(get: { filter.view }, set: { filter.view = $0 })) {
                    Text("Active").tag(Filter.Scope.all)
                    Text("Archived").tag(Filter.Scope.archived)
                }
            }
        } label: {
            Image(systemName: filter.media != nil || filter.lang != nil ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
        }
    }

    // Filters look across everything, not only the inbox, same as the web.
    private func widen() {
        if filter.view == .inbox { filter.view = .all }
    }

    private func reload() async {
        page = 1
        done = false
        items = []
        await load()
    }

    private func loadMore() async {
        guard !loading, !done else { return }
        page += 1
        await load()
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let result = try await API.shared.items(filter, page: page)
            error = nil
            total = result.total
            let known = Set(items.map(\.id))
            items += result.items.filter { !known.contains($0.id) }
            done = items.count >= result.total || result.items.isEmpty
        } catch APIError.signedOut {
            session.signOut()
        } catch is CancellationError {
        } catch let e as URLError where e.code == .cancelled {
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func set(_ item: Item, _ status: String) {
        Task {
            do {
                let d = try await API.shared.change(item.id, .init(status: status))
                replace(d.item)
                await onChange()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    // Keeps the list in step with a change, and drops items that no longer belong here.
    private func replace(_ changed: Item) {
        guard let i = items.firstIndex(where: { $0.id == changed.id }) else { return }
        let leaves = (filter.view == .inbox && changed.status != "inbox")
            || (filter.view == .all && changed.status == "archived")
            || (filter.view == .archived && changed.status != "archived")
        if leaves {
            items.remove(at: i)
            total = max(0, total - 1)
        } else {
            var merged = changed
            merged.sources = changed.sources ?? items[i].sources
            merged.images = changed.images ?? items[i].images
            merged.tags = changed.tags ?? items[i].tags
            items[i] = merged
        }
    }
}
