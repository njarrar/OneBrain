import SwiftUI

/// Where a tab can go.
enum Route: Hashable {
    case item(Item)
    case list(Filter)
    case trash
    case tags
    case settings
    case resurface
    case digest
    case ask(String)
    case pile
    case map
    case podcast
}

enum AppTab: Hashable { case inbox, library, search }

/// The Library counts, shared by every screen. `changed` goes up after an add, so lists reload;
/// `edited` and `purged` tell lists about a change made on an item's own screen.
@MainActor
@Observable
final class MenuStore {
    var menu: MenuData?
    var changed = 0
    var edited: Item?
    var purged: String?
    /// The Add sheet is open. The + in Inbox and Library sets it.
    var adding = false

    func load(session: AppSession) async {
        do {
            menu = try await API.shared.menu()
        } catch APIError.signedOut {
            session.signOut()
        } catch {}
    }
}

/// The app once signed in: three tabs (Inbox, Library, Search) in the system tab bar. The + at the
/// top right of Inbox and Library opens the Add sheet.
/// Search also asks Brain, so there is one place to find or ask.
struct MainView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.scenePhase) private var phase
    @State private var tab: AppTab = .inbox
    @State private var inboxPath: [Route] = []
    @State private var libraryPath: [Route] = []
    @State private var searchPath: [Route] = []
    @State private var store = MenuStore()
    @State private var screenshots = ScreenshotSync.shared

    var body: some View {
        TabView(selection: pick) {
            Tab("Inbox", systemImage: "tray", value: AppTab.inbox) {
                NavigationStack(path: $inboxPath) {
                    ItemList(filter: Filter(), mode: .inbox).routes()
                }
            }
            Tab("Library", systemImage: "books.vertical", value: AppTab.library) {
                NavigationStack(path: $libraryPath) {
                    LibraryView().routes()
                }
            }
            Tab(value: AppTab.search, role: .search) {
                NavigationStack(path: $searchPath) {
                    SearchView(path: $searchPath).routes()
                }
            }
        }
        .tint(Theme.accent)
        .minimizeTabBarOnScroll()
        .sheet(isPresented: $store.adding) {
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

    /// Tapping the open tab again goes back to its first screen.
    private var pick: Binding<AppTab> {
        Binding(get: { tab }, set: { new in
            if new == tab { popToRoot(new) }
            tab = new
        })
    }

    private func popToRoot(_ t: AppTab) {
        switch t {
        case .inbox: inboxPath = []
        case .library: libraryPath = []
        case .search: searchPath = []
        }
    }

    #if DEBUG
    /// `-demoScreen library|trash|settings|item|add|search|ask` opens a screen at launch, for screenshots.
    private func demoStart() {
        guard Demo.on, let screen = UserDefaults.standard.string(forKey: "demoScreen") else { return }
        switch screen {
        case "library": tab = .library
        case "trash": tab = .library; libraryPath = [.trash]
        case "settings": tab = .library; libraryPath = [.settings]
        case "search", "ask": tab = .search
        case "add": store.adding = true
        case "item": if let first = try? Demo.page().items.first { inboxPath = [.item(first)] }
        default: break
        }
    }
    #endif
}

/// The + that opens the Add sheet, at the top right of Inbox and Library.
struct AddButton: View {
    @Environment(MenuStore.self) private var store

    var body: some View {
        Button { store.adding = true } label: { Image(systemName: "plus") }
            .accessibilityLabel("Add")
    }
}

extension View {
    /// On iOS 26 the tab bar shrinks while you scroll down a list.
    @ViewBuilder func minimizeTabBarOnScroll() -> some View {
        if #available(iOS 26.0, *) {
            self.tabBarMinimizeBehavior(.onScrollDown)
        } else {
            self
        }
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
            case .resurface: ResurfaceView()
            case .digest: DigestView()
            case .ask(let question): AskView(question: question)
            case .pile: PileView()
            case .map: TopicMapView()
            case .podcast: PodcastView()
            }
        }
    }
}
