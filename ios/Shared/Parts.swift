import UniformTypeIdentifiers
import SwiftUI

/// A source's mark: the X, YouTube and Instagram logos from Marks.xcassets, an SF Symbol for the rest.
struct SourceMark: View {
    let source: String
    var size: CGFloat = 18

    var body: some View {
        switch source {
        case "x": mark("XMark", scale: 0.82)
        case "youtube": mark("YouTubeMark", scale: 1)
        case "instagram": mark("InstagramMark", scale: 0.95)
        default: Image(systemName: Sources.symbol(source)).font(.system(size: size * 0.92))
        }
    }

    private func mark(_ name: String, scale: CGFloat) -> some View {
        Image(name).renderingMode(.template).resizable().scaledToFit().frame(width: size * scale, height: size * scale)
    }
}

/// The 36 pt rounded tile at the start of a row, with the unread dot on its corner.
struct SourceTile: View {
    let source: String
    var unread = false

    var body: some View {
        SourceMark(source: source)
            .foregroundStyle(Theme.ink2)
            .frame(width: 36, height: 36)
            .background(Theme.fill, in: RoundedRectangle(cornerRadius: 10))
            .overlay(alignment: .topTrailing) {
                if unread {
                    Circle().fill(Theme.accentFill)
                        .frame(width: 11, height: 11)
                        .overlay(Circle().stroke(Theme.bg, lineWidth: 2))
                        .offset(x: 3, y: -3)
                        .accessibilityLabel("Unread")
                }
            }
    }
}

/// A category's 7 pt square and name.
struct CategoryLabel: View {
    let name: String
    let color: String?

    var body: some View {
        HStack(spacing: 7) {
            RoundedRectangle(cornerRadius: 2).fill(Theme.swatch(color)).frame(width: 7, height: 7)
            Text(name).lineLimit(1)
        }
        .font(.system(size: 12.5))
        .foregroundStyle(Theme.soft)
    }
}

/// A pill chip, 32 pt tall. On: accent tint.
struct Chip: View {
    let label: String
    var icon: AnyView?
    var on = false
    var height: CGFloat = 32

    init(_ label: String, symbol: String? = nil, source: String? = nil, on: Bool = false, height: CGFloat = 32) {
        self.label = label
        self.on = on
        self.height = height
        if let source { icon = AnyView(SourceMark(source: source, size: 15)) }
        else if let symbol { icon = AnyView(Image(systemName: symbol).font(.system(size: 14))) }
    }

    var body: some View {
        HStack(spacing: 6) {
            if let icon { icon }
            Text(label).lineLimit(1)
        }
        .font(.system(size: 14, weight: .medium))
        .foregroundStyle(on ? Theme.accent : Theme.ink2)
        .padding(.horizontal, 12)
        .frame(height: height)
        .background(on ? Theme.accentBG : Theme.fill, in: Capsule())
    }
}

/// A 44 pt round button on the fill colour.
struct RoundIcon: View {
    let symbol: String
    var size: CGFloat = 44
    var on = false

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.45))
            .foregroundStyle(on ? Theme.accentInk : Theme.ink2)
            .frame(width: size, height: size)
            .background(on ? Theme.accentFill : Theme.fill, in: Circle())
    }
}

extension View {
    /// The floating glass look of the tab bar and the item toolbar: Liquid Glass on iOS 26, a material before.
    @ViewBuilder func glassBar() -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular.interactive(), in: Capsule())
        } else {
            self.background(.regularMaterial, in: Capsule())
                .overlay(Capsule().stroke(.white.opacity(0.5), lineWidth: 1))
                .shadow(color: .black.opacity(0.16), radius: 15, y: 10)
        }
    }

    /// Grouped rows in one rounded box, as in Library and Settings.
    func groupBox() -> some View {
        self.background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
            .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

/// Section caption above a group of rows.
struct GroupCaption: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.soft)
            .padding(.horizontal, 4).padding(.top, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A row inside a group box: icon, label, trailing value, chevron.
struct GroupRow<Leading: View>: View {
    let label: String
    var value: String?
    var mono = true
    var chevron = true
    var divider = true
    var minHeight: CGFloat = 48
    @ViewBuilder var leading: () -> Leading

    var body: some View {
        HStack(spacing: 12) {
            leading()
            Text(label).foregroundStyle(Theme.ink).lineLimit(1)
            Spacer(minLength: 8)
            if let value {
                Text(value)
                    .font(mono ? .system(size: 13, design: .monospaced) : .system(size: 14))
                    .foregroundStyle(Theme.faint)
            }
            if chevron {
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.chevron)
            }
        }
        .font(.system(size: 16))
        .padding(.horizontal, 14)
        .frame(minHeight: minHeight)
        .contentShape(Rectangle())
        .overlay(alignment: .bottom) {
            if divider { Rectangle().fill(Theme.divider).frame(height: 1) }
        }
    }
}

extension GroupRow where Leading == EmptyView {
    init(label: String, value: String? = nil, mono: Bool = true, chevron: Bool = true, divider: Bool = true) {
        self.init(label: label, value: value, mono: mono, chevron: chevron, divider: divider, leading: { EmptyView() })
    }
}

/// A simple wrapping layout, for tags.
struct Flow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0, widest: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0 && x + s.width > width { x = 0; y += row + spacing; row = 0 }
            x += s.width + spacing
            row = max(row, s.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: min(widest, width), height: y + row)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX && x + s.width > bounds.maxX { x = bounds.minX; y += row + spacing; row = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            row = max(row, s.height)
        }
    }
}

/// What a typed or shared text holds, for the badge in the Add sheet.
enum Detected: Equatable {
    case link(source: String), note, pictures(Int), voice, empty

    static func of(text: String, url: String?, pictures: Int, voice: Bool = false) -> Detected {
        if pictures > 0 { return .pictures(pictures) }
        if voice { return .voice }
        if let url { return .link(source: sourceOf(url)) }
        return text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .empty : .note
    }

    /// Same rules as the server's save route.
    static func sourceOf(_ url: String) -> String {
        let host = (URL(string: url)?.host ?? "").lowercased().replacingOccurrences(of: "www.", with: "")
        if host.hasSuffix("instagram.com") { return "instagram" }
        if host.hasSuffix("youtube.com") || host == "youtu.be" { return "youtube" }
        if host == "x.com" || host == "twitter.com" || host.hasSuffix(".x.com") || host.hasSuffix(".twitter.com") { return "x" }
        return "link"
    }

    var label: String {
        switch self {
        case .link(let s): return s == "link" ? "Link" : Sources.label(s)
        case .note: return "Note"
        case .pictures(let n): return n == 1 ? "Photo" : "\(n) photos"
        case .voice: return "Voice memo"
        case .empty: return ""
        }
    }

    var source: String {
        switch self {
        case .link(let s): return s
        case .note: return "note"
        case .pictures: return "image"
        case .voice: return "audio"
        case .empty: return "note"
        }
    }

    /// The first web link in some text.
    static func firstURL(in text: String) -> String? {
        guard let r = text.range(of: #"https?://[^\s<>"']+"#, options: .regularExpression) else { return nil }
        return String(text[r])
    }
}

/// "Let Claude sort" and "Add tags", shared by the Add sheet and Save to Brain.
struct CaptureChips: View {
    @Binding var sort: Bool
    @Binding var tagging: Bool

    var body: some View {
        HStack(spacing: 8) {
            Button { sort.toggle() } label: {
                HStack(spacing: 6) {
                    Image(systemName: "sparkle").foregroundStyle(sort ? Theme.accent : Theme.faint)
                    Text("Let AI sort").strikethrough(!sort, color: Theme.faint)
                }
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(sort ? Theme.ink : Theme.soft)
                .padding(.horizontal, 12).frame(height: 34)
                .background(Theme.fill, in: Capsule())
            }
            .accessibilityValue(sort ? "On" : "Off")
            Button { tagging.toggle() } label: {
                HStack(spacing: 6) {
                    Image(systemName: "number")
                    Text("Add tags")
                }
                .font(.system(size: 14, weight: tagging ? .medium : .regular))
                .foregroundStyle(tagging ? Theme.accent : Theme.soft)
                .padding(.horizontal, 12).frame(height: 34)
                .background(tagging ? Theme.accentBG : Theme.fill, in: Capsule())
            }
        }
        .buttonStyle(.plain)
    }

    /// Tags typed as "a, b, #c" into a clean list.
    static func tags(_ text: String) -> [String] {
        text.split(whereSeparator: { $0 == "," || $0 == "\n" })
            .map { $0.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "#")) }
            .filter { !$0.isEmpty }
    }
}

/// A voice memo or video to save: from Files or speaking in the Add sheet, or from the share sheet.
struct PickedAudio {
    let data: Data
    let filename: String
    let mime: String

    /// Up to the server's 20 MB limit.
    static let maxBytes = 20 * 1024 * 1024

    init(data: Data, filename: String, mime: String) {
        self.data = data
        self.filename = filename
        self.mime = mime
    }

    /// Reads a sound or video file, or returns nil for anything else (or a file that's too big).
    init?(url: URL) {
        guard let type = UTType(filenameExtension: url.pathExtension),
              type.conforms(to: .audio) || type.conforms(to: .movie),
              let data = try? Data(contentsOf: url), data.count <= Self.maxBytes else { return nil }
        self.init(data: data, filename: url.lastPathComponent, mime: type.preferredMIMEType ?? "audio/mp4")
    }
}
