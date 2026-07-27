import SwiftUI

/// Which design the phone uses. Brain is the new default; X-Vault and Sunroom stay as extra choices.
/// The design is the phone's own; only the mode syncs with the web.
enum Design: String, CaseIterable, Identifiable {
    case brain, vault, sunroom
    var id: String { rawValue }
    var label: String {
        switch self {
        case .brain: return "Brain"
        case .vault: return "X-Vault"
        case .sunroom: return "Sunroom"
        }
    }
}

/// Light, dark, or follow the phone.
enum Mode: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
    /// nil lets the phone decide.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

/// The look shared with the web, from /api/app/prefs:
/// {"design": "vault" | "sunroom", "mode": "system" | "light" | "dark"}.
/// The phone reads and writes only the mode.
struct Prefs: Decodable, Equatable {
    var mode: Mode

    private enum Keys: String, CodingKey { case mode }

    init(mode: Mode) { self.mode = mode }

    // Unknown values (from a newer web app) fall back to the default.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        mode = (try? c.decode(String.self, forKey: .mode)).flatMap(Mode.init(rawValue:)) ?? .system
    }
}

/// The design and mode in use. Kept in the app group, so the app and the share sheet
/// start with the last known look and never flash the wrong one. The mode is then checked with the web.
@Observable
final class Look {
    static let shared = Look()

    @ObservationIgnored private let defaults = UserDefaults(suiteName: Config.appGroup) ?? .standard

    private(set) var design: Design = .brain
    private(set) var mode: Mode = .system
    var error: String?

    init() {
        // "phoneDesign", not the old "lookDesign": that key held the web's design, and the new look starts as Brain.
        design = Design(rawValue: defaults.string(forKey: "phoneDesign") ?? "") ?? .brain
        mode = Mode(rawValue: defaults.string(forKey: "lookMode") ?? "") ?? .system
        #if DEBUG
        // Launch arguments such as `-lookDesign sunroom -lookMode light`, for screenshots.
        if let d = UserDefaults.standard.string(forKey: "lookDesign").flatMap(Design.init(rawValue:)) { design = d }
        if let m = UserDefaults.standard.string(forKey: "lookMode").flatMap(Mode.init(rawValue:)) { mode = m }
        #endif
    }

    private func apply(mode m: Mode) {
        mode = m
        defaults.set(m.rawValue, forKey: "lookMode")
    }

    /// Picks up a mode change made on the web.
    func refresh() async {
        if let p = try? await API.shared.prefs() { apply(mode: p.mode) }
    }

    /// Changes the design on this phone.
    func set(design d: Design) {
        design = d
        defaults.set(d.rawValue, forKey: "phoneDesign")
    }

    /// Changes the mode here at once, then saves it for the web too.
    func set(mode m: Mode) async {
        let before = mode
        apply(mode: m)
        error = nil
        do {
            apply(mode: try await API.shared.savePrefs(mode: m).mode)
        } catch {
            apply(mode: before)
            self.error = error.localizedDescription
        }
    }
}
