import SwiftUI

/// The X-Vault colors, same as the web app.
enum Theme {
    static let bg = Color(hex: "#0B0F17")
    static let panel = Color(hex: "#101622")
    static let card = Color(hex: "#151D2B")
    static let raised = Color(hex: "#1E293B")
    static let line = Color(hex: "#232F44")
    static let ink = Color(hex: "#F1F5F9")
    static let soft = Color(hex: "#94A3B8")
    static let accent = Color(hex: "#F59E0B")
}

extension Color {
    init(hex: String) {
        let s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        self.init(
            red: Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8) & 0xFF) / 255,
            blue: Double(v & 0xFF) / 255
        )
    }

    init(hex: String?, fallback: Color) {
        if let hex, hex.hasPrefix("#"), hex.count == 7 { self.init(hex: hex) } else { self = fallback }
    }
}
