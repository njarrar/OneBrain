import SwiftUI

/// Which design the app uses. Same names as the web.
enum Design: String, CaseIterable, Identifiable {
    case vault, sunroom
    var id: String { rawValue }
    var label: String { self == .vault ? "X-Vault" : "Sunroom" }
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

/// The look chosen on the web or the phone, from /api/app/prefs:
/// {"design": "vault" | "sunroom", "mode": "system" | "light" | "dark"}.
struct Prefs: Codable, Equatable {
    var design: Design
    var mode: Mode

    init(design: Design, mode: Mode) {
        self.design = design
        self.mode = mode
    }

    private enum Keys: String, CodingKey { case design, mode }

    // Unknown values (from a newer web app) fall back to the defaults.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        design = (try? c.decode(String.self, forKey: .design)).flatMap(Design.init(rawValue:)) ?? .vault
        mode = (try? c.decode(String.self, forKey: .mode)).flatMap(Mode.init(rawValue:)) ?? .system
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(design.rawValue, forKey: .design)
        try c.encode(mode.rawValue, forKey: .mode)
    }
}

/// The design and mode in use. Kept in the app group, so the app and the share sheet
/// start with the last known look and never flash the wrong one, then checked with the web.
@Observable
final class Look {
    static let shared = Look()

    @ObservationIgnored private let defaults = UserDefaults(suiteName: Config.appGroup) ?? .standard

    private(set) var design: Design = .vault
    private(set) var mode: Mode = .system
    var error: String?

    init() {
        design = Design(rawValue: defaults.string(forKey: "lookDesign") ?? "") ?? .vault
        mode = Mode(rawValue: defaults.string(forKey: "lookMode") ?? "") ?? .system
    }

    var prefs: Prefs { Prefs(design: design, mode: mode) }

    private func apply(_ p: Prefs) {
        design = p.design
        mode = p.mode
        defaults.set(p.design.rawValue, forKey: "lookDesign")
        defaults.set(p.mode.rawValue, forKey: "lookMode")
    }

    /// Picks up a change made on the web.
    func refresh() async {
        if let p = try? await API.shared.prefs() { apply(p) }
    }

    /// Changes the look here at once, then saves it for the web too.
    func set(design: Design? = nil, mode: Mode? = nil) async {
        let before = prefs
        apply(Prefs(design: design ?? before.design, mode: mode ?? before.mode))
        error = nil
        do {
            let saved = try await API.shared.savePrefs(design: design, mode: mode)
            apply(saved)
        } catch {
            apply(before)
            self.error = error.localizedDescription
        }
    }
}
