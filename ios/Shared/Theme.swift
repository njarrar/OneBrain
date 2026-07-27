import SwiftUI
import UIKit

/// One design's colours and shape. Every colour has a light and a dark value and
/// follows the colour scheme the app runs in (see Look for how that is chosen).
struct Palette {
    let bg: Color
    /// The page behind grouped rows (Library, Settings).
    let grouped: Color
    let panel: Color
    let card: Color
    let raised: Color
    /// Search fields, chips, round buttons and source tiles.
    let fill: Color
    let line: Color
    /// Lines between rows.
    let divider: Color
    let lineStrong: Color
    let ink: Color
    /// Body text.
    let ink2: Color
    let soft: Color
    let faint: Color
    let chevron: Color
    /// The picked part of a segmented control.
    let selected: Color
    /// Links and accent text.
    let accent: Color
    /// Filled buttons, switches and the focus colour.
    let accentFill: Color
    /// Text on accentFill.
    let accentInk: Color
    let accentBG: Color
    let ok: Color
    let bad: Color
    /// Colour of the flat offset shadow under cards. Clear for none.
    let hard: Color
    let cardRadius: CGFloat
    let smallRadius: CGFloat
    let shadowOffset: CGFloat
    let fontDesign: Font.Design
    let sunroom: Bool

    /// Brain, the default: white and near-black neutrals with a Sky blue accent.
    /// Values come from design/iphone-final/SPEC.md (oklch turned into sRGB).
    static let brain = Palette(
        bg: Color(light: "#FFFFFF", dark: "#0E1013"),
        grouped: Color(light: "#F4F5F7", dark: "#0E1013"),
        panel: Color(light: "#F4F5F7", dark: "#0E1013"),
        card: Color(light: "#FFFFFF", dark: "#15181C"),
        raised: Color(light: "#F0F2F4", dark: "#15181C"),
        fill: Color(light: "#F1F3F5", dark: "#1D2127"),
        line: Color(light: "#E7E9EC", dark: "#23272E"),
        divider: Color(light: "#EEF0F2", dark: "#23272E"),
        lineStrong: Color(light: "#CFD4DA", dark: "#23272E"),
        ink: Color(light: "#16191D", dark: "#E9ECEF"),
        ink2: Color(light: "#2E343B", dark: "#E9ECEF"),
        soft: Color(light: "#5C6570", dark: "#9AA3AE"),
        faint: Color(light: "#6B7480", dark: "#7C8591"),
        chevron: Color(light: "#9AA0A8", dark: "#7C8591"),
        selected: Color(light: "#FFFFFF", dark: "#2A2F37"),
        accent: Color(light: "#0068AD", dark: "#64C4F0"),
        accentFill: Color(light: "#0077BD", dark: "#64C4F0"),
        accentInk: Color(light: "#FFFFFF", dark: "#07121A"),
        accentBG: Color(light: UIColor(hex: "#0077BD").withAlphaComponent(0.12), dark: UIColor(hex: "#64C4F0").withAlphaComponent(0.14)),
        ok: Color(light: "#047857", dark: "#34D399"),
        bad: Color(light: "#D73337", dark: "#F47A79"),
        hard: .clear,
        cardRadius: 16,
        smallRadius: 12,
        shadowOffset: 0,
        fontDesign: .default,
        sunroom: false
    )

    /// Amber, the design's spare accent for Brain. Not offered in Settings yet.
    static let brainAmber = (
        accent: Color(light: "#934F00", dark: "#F1AF57"),
        accentFill: Color(light: "#E7A13C", dark: "#F1AF57"),
        accentInk: Color(light: "#1A1203", dark: "#1A1203")
    )

    /// X-Vault: obsidian slate with amber in dark, clean off-white with deep amber in light. Same as the web.
    static let vault = Palette(
        bg: Color(light: "#F7F6F2", dark: "#0B0F17"),
        grouped: Color(light: "#F7F6F2", dark: "#0B0F17"),
        panel: Color(light: "#FFFFFF", dark: "#101622"),
        card: Color(light: "#FFFFFF", dark: "#151D2B"),
        raised: Color(light: "#EFECE5", dark: "#1E293B"),
        fill: Color(light: "#EFECE5", dark: "#1E293B"),
        line: Color(light: "#E3DFD6", dark: "#232F44"),
        divider: Color(light: "#E3DFD6", dark: "#232F44"),
        lineStrong: Color(light: "#CFC9BD", dark: "#334155"),
        ink: Color(light: "#15191F", dark: "#F1F5F9"),
        ink2: Color(light: "#15191F", dark: "#F1F5F9"),
        soft: Color(light: "#5A6270", dark: "#94A3B8"),
        faint: Color(light: "#8A919C", dark: "#64748B"),
        chevron: Color(light: "#8A919C", dark: "#64748B"),
        selected: Color(light: "#FFFFFF", dark: "#1E293B"),
        accent: Color(light: "#B45309", dark: "#F59E0B"),
        accentFill: Color(light: "#B45309", dark: "#F59E0B"),
        accentInk: Color(light: "#FFFFFF", dark: "#1A1203"),
        accentBG: Color(light: UIColor(hex: "#B45309").withAlphaComponent(0.10), dark: UIColor(hex: "#F59E0B").withAlphaComponent(0.14)),
        ok: Color(light: "#047857", dark: "#34D399"),
        bad: Color(light: "#BE123C", dark: "#FB7185"),
        hard: .clear,
        cardRadius: 12,
        smallRadius: 8,
        shadowOffset: 0,
        fontDesign: .default,
        sunroom: false
    )

    /// Sunroom: warm cream paper with a gold accent in light, espresso browns in dark. Same as the web.
    static let sunroom = Palette(
        bg: Color(light: "#FBF8F1", dark: "#1A1712"),
        grouped: Color(light: "#FBF8F1", dark: "#1A1712"),
        panel: Color(light: "#FFFDF8", dark: "#1F1B15"),
        card: Color(light: "#FFFDF8", dark: "#231F19"),
        raised: Color(light: "#F0E9DC", dark: "#2F2921"),
        fill: Color(light: "#F0E9DC", dark: "#2F2921"),
        line: Color(light: "#E5DCC8", dark: "#3A3329"),
        divider: Color(light: "#E5DCC8", dark: "#3A3329"),
        lineStrong: Color(light: "#C9BFA9", dark: "#544A3C"),
        ink: Color(light: "#26221C", dark: "#F3EDE2"),
        ink2: Color(light: "#26221C", dark: "#F3EDE2"),
        soft: Color(light: "#5C5546", dark: "#B8AD98"),
        faint: Color(light: "#B3A78F", dark: "#7D7362"),
        chevron: Color(light: "#B3A78F", dark: "#7D7362"),
        selected: Color(light: "#FFFDF8", dark: "#2F2921"),
        accent: Color(light: "#A45E00", dark: "#F1AF57"),
        accentFill: Color(light: "#DC9242", dark: "#F2A548"),
        accentInk: Color(light: "#26221C", dark: "#1A1712"),
        accentBG: Color(light: "#FEE2C9", dark: "#482C0D"),
        ok: Color(light: "#0B7643", dark: "#72D699"),
        bad: Color(light: "#BD413F", dark: "#FB8083"),
        hard: Color(light: "#E8DFCB", dark: "#0E0C09"),
        cardRadius: 16,
        smallRadius: 12,
        shadowOffset: 3,
        fontDesign: .rounded,
        sunroom: true
    )
}

/// The colours of the design picked in Settings. Views that read these redraw when the design changes.
enum Theme {
    static var palette: Palette {
        switch Look.shared.design {
        case .brain: return .brain
        case .vault: return .vault
        case .sunroom: return .sunroom
        }
    }

    static var bg: Color { palette.bg }
    static var grouped: Color { palette.grouped }
    static var panel: Color { palette.panel }
    static var card: Color { palette.card }
    static var raised: Color { palette.raised }
    static var fill: Color { palette.fill }
    static var line: Color { palette.line }
    static var divider: Color { palette.divider }
    static var lineStrong: Color { palette.lineStrong }
    static var ink: Color { palette.ink }
    static var ink2: Color { palette.ink2 }
    static var soft: Color { palette.soft }
    static var faint: Color { palette.faint }
    static var chevron: Color { palette.chevron }
    static var selected: Color { palette.selected }
    static var accent: Color { palette.accent }
    static var accentFill: Color { palette.accentFill }
    static var accentInk: Color { palette.accentInk }
    static var accentBG: Color { palette.accentBG }
    static var ok: Color { palette.ok }
    static var bad: Color { palette.bad }
    static var hard: Color { palette.hard }
    static var cardRadius: CGFloat { palette.cardRadius }
    static var smallRadius: CGFloat { palette.smallRadius }
    static var shadowOffset: CGFloat { palette.shadowOffset }

    /// A category's own colour, for dots and the line on top of a card.
    static func category(_ hex: String?, fallback: Color) -> Color {
        Color(hex: hex, fallback: fallback)
    }

    /// A category's small square: its own hue at one lightness and strength, as in the design.
    /// Other designs use the category's colour as is.
    static func swatch(_ hex: String?) -> Color {
        guard let base = UIColor(hexOrNil: hex) else { return faint }
        if Look.shared.design == .brain, let h = OKLab.hue(of: base) {
            return Color(uiColor: OKLab.color(l: 0.62, c: 0.09, h: h))
        }
        return Color(uiColor: base)
    }

    /// Text in a category chip. Darkened in light mode so pale colours stay readable.
    static func categoryText(_ hex: String?) -> Color {
        guard let base = UIColor(hexOrNil: hex) else { return soft }
        if palette.sunroom, let h = OKLab.hue(of: base) {
            return Color(light: OKLab.color(l: 0.42, c: 0.1, h: h), dark: OKLab.color(l: 0.86, c: 0.09, h: h))
        }
        return Color(light: base.mixed(with: UIColor(hex: "#15191F"), amount: 0.38), dark: base)
    }

    /// The fill behind a category chip or an avatar.
    static func categoryFill(_ hex: String?, strength: Double = 0.14) -> Color {
        guard let base = UIColor(hexOrNil: hex) else { return raised }
        if palette.sunroom, let h = OKLab.hue(of: base) {
            return Color(light: OKLab.color(l: 0.93, c: 0.045, h: h), dark: OKLab.color(l: 0.32, c: 0.05, h: h))
        }
        return Color(uiColor: base).opacity(strength)
    }
}

extension View {
    /// A card: fill, border, and in Sunroom a flat offset shadow.
    func themedCard(radius: CGFloat? = nil) -> some View {
        let r = radius ?? Theme.cardRadius
        return self
            .background(Theme.card, in: RoundedRectangle(cornerRadius: r))
            .overlay(RoundedRectangle(cornerRadius: r).stroke(Theme.line))
            .background(
                RoundedRectangle(cornerRadius: r).fill(Theme.hard)
                    .offset(x: Theme.shadowOffset, y: Theme.shadowOffset)
            )
    }
}

extension Color {
    init(hex: String) {
        self.init(uiColor: UIColor(hex: hex))
    }

    init(hex: String?, fallback: Color) {
        if let c = UIColor(hexOrNil: hex) { self.init(uiColor: c) } else { self = fallback }
    }

    /// A colour with one value for light mode and one for dark mode.
    init(light: UIColor, dark: UIColor) {
        self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? dark : light })
    }

    init(light: String, dark: String) {
        self.init(light: UIColor(hex: light), dark: UIColor(hex: dark))
    }
}

extension UIColor {
    convenience init(hex: String) {
        let s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        self.init(
            red: CGFloat((v >> 16) & 0xFF) / 255,
            green: CGFloat((v >> 8) & 0xFF) / 255,
            blue: CGFloat(v & 0xFF) / 255,
            alpha: 1
        )
    }

    convenience init?(hexOrNil hex: String?) {
        guard let hex, hex.hasPrefix("#"), hex.count == 7 else { return nil }
        self.init(hex: hex)
    }

    /// This colour moved `amount` of the way towards `other`.
    func mixed(with other: UIColor, amount: CGFloat) -> UIColor {
        var (r1, g1, b1, a1): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
        var (r2, g2, b2, a2): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
        getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
        other.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        return UIColor(
            red: r1 + (r2 - r1) * amount,
            green: g1 + (g2 - g1) * amount,
            blue: b1 + (b2 - b1) * amount,
            alpha: a1 + (a2 - a1) * amount
        )
    }
}

/// Just enough OKLab to tint Sunroom's category chips by a category's hue, like the web does.
enum OKLab {
    static func hue(of color: UIColor) -> Double? {
        var (r, g, b, a): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
        guard color.getRed(&r, green: &g, blue: &b, alpha: &a) else { return nil }
        func lin(_ channel: CGFloat) -> Double {
            let v = Double(channel)
            return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4)
        }
        let (lr, lg, lb) = (lin(r), lin(g), lin(b))
        let l = cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
        let m = cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
        let s = cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
        let aa = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
        let bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
        let h = atan2(bb, aa) * 180 / .pi
        return h < 0 ? h + 360 : h
    }

    static func color(l: Double, c: Double, h: Double) -> UIColor {
        let a = c * cos(h * .pi / 180)
        let b = c * sin(h * .pi / 180)
        let l_ = l + 0.3963377774 * a + 0.2158037573 * b
        let m_ = l - 0.1055613458 * a - 0.0638541728 * b
        let s_ = l - 0.0894841775 * a - 1.2914855480 * b
        let (L, M, S) = (l_ * l_ * l_, m_ * m_ * m_, s_ * s_ * s_)
        let r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S
        let g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S
        let bl = -0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S
        func enc(_ channel: Double) -> CGFloat {
            let v = min(max(channel, 0), 1)
            return CGFloat(v <= 0.0031308 ? 12.92 * v : 1.055 * pow(v, 1 / 2.4) - 0.055)
        }
        return UIColor(red: enc(r), green: enc(g), blue: enc(bl), alpha: 1)
    }
}
