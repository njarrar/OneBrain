import SwiftUI

/// Where a tab can go.
enum Route: Hashable {
    case item(Item)
    case list(Filter)
    case trash
    case tags
    case settings
}

enum Tab: Hashable { case inbox, library, search }

/// The Library counts, shared by every screen. `changed` goes up after an add, so lists reload;
/// `edited` and `purged` tell lists about a change made on an item's own screen.
@MainActor
@Observable
final class MenuStore {
    var menu: MenuData?
    var changed = 0
    var edited: Item?
    var purged: String?

    func load(session: AppSession) async {
        do {
            menu = try await API.shared.menu()
        } catch APIError.signedOut {
            session.signOut()
        } catch {}
    }
}

/// The app once signed in: three tabs under a floating glass bar, and the Add button beside it.
struct MainView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.scenePhase) private var phase
    @State private var tab: Tab = .inbox
    @State private var inboxPath: [Route] = []
    @State private var libraryPath: [Route] = []
    @State private var searchPath: [Route] = []
    @State private var adding = false
    @State private var listening = false
    @State private var store = MenuStore()
    @State private var screenshots = ScreenshotSync.shared

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack(path: $inboxPath) {
                ItemList(filter: Filter(), mode: .inbox, openSearch: { listen in
                    listening = listen
                    tab = .search
                })
                .routes()
            }
            .tag(Tab.inbox)
            .toolbar(.hidden, for: .tabBar)

            NavigationStack(path: $libraryPath) {
                LibraryView().routes()
            }
            .tag(Tab.library)
            .toolbar(.hidden, for: .tabBar)

            NavigationStack(path: $searchPath) {
                SearchView(listening: $listening).routes()
            }
            .tag(Tab.search)
            .toolbar(.hidden, for: .tabBar)
        }
        .overlay(alignment: .bottom) {
            if showBar {
                HStack(alignment: .bottom, spacing: 14) {
                    TabBar(tab: $tab, reselect: popToRoot)
                    Button { adding = true } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 26, weight: .medium))
                            .foregroundStyle(Theme.accentInk)
                            .frame(width: 62, height: 62)
                            .background(Theme.accentFill, in: Circle())
                            .shadow(color: .black.opacity(0.22), radius: 14, y: 10)
                    }
                    .accessibilityLabel("Add")
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 4)
                .background(alignment: .bottom) {
                    // Rows fade out under the bar instead of showing through it.
                    LinearGradient(colors: [Theme.bg.opacity(0), Theme.bg.opacity(0.9), Theme.bg],
                                   startPoint: .top, endPoint: .bottom)
                        .frame(height: 120)
                        .offset(y: 40)
                        .allowsHitTesting(false)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy(duration: 0.25), value: showBar)
        .sheet(isPresented: $adding) {
            AddSheet { store.changed += 1; await store.load(session: session) }
        }
        .environment(store)
        .task {
            await LocalUpload.shared.runIfNeeded()
            await store.load(session: session)
            #if DEBUG
            demoStart()
            #endif
        }
        .onChange(of: phase) { _, now in
            if now == .active { Task { await screenshots.syncIfOn(); await store.load(session: session) } }
        }
    }

    private var path: [Route] {
        switch tab {
        case .inbox: return inboxPath
        case .library: return libraryPath
        case .search: return searchPath
        }
    }

    /// The bar hides on an item, which has its own toolbar, and in Settings.
    private var showBar: Bool {
        switch path.last {
        case .item, .settings: return false
        default: return true
        }
    }

    private func popToRoot(_ t: Tab) {
        switch t {
        case .inbox: inboxPath = []
        case .library: libraryPath = []
        case .search: searchPath = []
        }
    }

    #if DEBUG
    /// `-demoScreen library|trash|settings|item|add|search` opens a screen at launch, for screenshots.
    private func demoStart() {
        guard Demo.on, let screen = UserDefaults.standard.string(forKey: "demoScreen") else { return }
        switch screen {
        case "library": tab = .library
        case "trash": tab = .library; libraryPath = [.trash]
        case "settings": tab = .library; libraryPath = [.settings]
        case "search": tab = .search
        case "add": adding = true
        case "item": if let first = try? Demo.page().items.first { inboxPath = [.item(first)] }
        default: break
        }
    }
    #endif
}

/// The three-tab glass pill. Tapping the open tab again goes back to its first screen.
private struct TabBar: View {
    @Binding var tab: Tab
    var reselect: (Tab) -> Void

    var body: some View {
        HStack(spacing: 0) {
            item(.inbox, "Inbox", "tray", "tray.fill")
            item(.library, "Library", "books.vertical", "books.vertical.fill")
            item(.search, "Search", "magnifyingglass", "magnifyingglass")
        }
        .padding(.horizontal, 6)
        .frame(height: 62)
        .frame(maxWidth: .infinity)
        .glassBar()
    }

    private func item(_ t: Tab, _ label: String, _ icon: String, _ picked: String) -> some View {
        let on = tab == t
        return Button {
            if on { reselect(t) } else { tab = t }
        } label: {
            VStack(spacing: 2) {
                Image(systemName: on ? picked : icon).font(.system(size: 21))
                    .frame(height: 25)
                Text(label).font(.system(size: 11, weight: on ? .semibold : .medium))
            }
            .foregroundStyle(on ? Theme.accent : Theme.ink2)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity)
            .background(on ? Theme.ink.opacity(0.06) : .clear, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

extension View {
    /// Every screen a tab can push.
    func routes() -> some View {
        navigationDestination(for: Route.self) { route in
            switch route {
            case .item(let item): ItemView(preview: item)
            case .list(let filter): ItemList(filter: filter, mode: .list)
            case .trash: ItemList(filter: Filter(view: .trash), mode: .trash)
            case .tags: TagsView()
            case .settings: SettingsView()
            }
        }
    }
}
