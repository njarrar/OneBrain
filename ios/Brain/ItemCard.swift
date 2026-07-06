import SwiftUI

/// One card in the list, in the X-Vault style: author, sub-topic, text, pictures, category.
struct ItemCard: View {
    let item: Item
    var blur: Bool

    private var catColor: Color { Theme.category(item.categoryColor, fallback: Theme.line) }
    private var hidden: Bool { blur && item.isSensitive }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Text(initial)
                    .font(.subheadline.weight(.semibold))
                    .frame(width: 32, height: 32)
                    .foregroundStyle(Theme.palette.sunroom ? Theme.categoryText(item.categoryColor) : Theme.ink)
                    .background(Theme.categoryFill(item.categoryColor, strength: 0.3), in: Circle())
                VStack(alignment: .leading, spacing: 1) {
                    Text(item.author ?? Sources.label(item.sources?.first ?? "manual"))
                        .font(.subheadline.weight(.semibold)).lineLimit(1)
                    Text([item.authorHandle, Dates.short(item.date)].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.caption.monospaced()).foregroundStyle(Theme.soft).lineLimit(1)
                }
                Spacer()
                ForEach(item.sources ?? [], id: \.self) { s in
                    Text(Sources.label(s)).font(.caption2.monospaced()).foregroundStyle(Theme.soft)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .overlay(RoundedRectangle(cornerRadius: Theme.palette.sunroom ? 999 : 5).stroke(Theme.line))
                }
            }

            if let sub = item.subtopic {
                Text(sub).font(.caption).foregroundStyle(Theme.soft)
                    .padding(.horizontal, 9).padding(.vertical, 3)
                    .overlay(Capsule().stroke(Theme.line))
            }

            Text(item.mainText)
                .font(item.isArabic ? .body : .callout)
                .lineSpacing(item.isArabic ? 5 : 2)
                .lineLimit(8)
                .multilineTextAlignment(item.isArabic ? .trailing : .leading)
                .frame(maxWidth: .infinity, alignment: item.isArabic ? .trailing : .leading)
                .blur(radius: hidden ? 6 : 0)

            if let summary = item.summary {
                Text(summary).font(.caption).foregroundStyle(Theme.soft)
                    .padding(8).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.bg, in: RoundedRectangle(cornerRadius: Theme.smallRadius))
            }

            if !item.pictures.isEmpty {
                PictureGrid(urls: item.pictures).blur(radius: hidden ? 18 : 0)
            }

            if let note = item.note {
                Text(note).font(.footnote).foregroundStyle(Theme.soft)
                    .padding(.leading, 8)
                    .overlay(alignment: .leading) { Rectangle().fill(Theme.accentFill).frame(width: 2) }
            }

            HStack(spacing: 6) {
                if let category = item.category {
                    HStack(spacing: 5) {
                        Circle().fill(catColor).frame(width: 7, height: 7)
                        Text(category).lineLimit(1)
                    }
                    .font(.caption.weight(.medium)).foregroundStyle(Theme.categoryText(item.categoryColor))
                    .padding(.horizontal, 9).padding(.vertical, 4)
                    .background(Theme.categoryFill(item.categoryColor), in: Capsule())
                }
                ForEach((item.tags ?? []).prefix(2), id: \.self) { t in
                    Text(t).font(.caption).foregroundStyle(Theme.soft)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Theme.bg, in: Capsule())
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .overlay(alignment: .top) {
            UnevenRoundedRectangle(topLeadingRadius: Theme.cardRadius, topTrailingRadius: Theme.cardRadius)
                .fill(catColor).frame(height: 2)
        }
        .themedCard()
    }

    private var initial: String {
        let name = (item.author ?? item.authorHandle ?? "?").trimmingCharacters(in: CharacterSet(charactersIn: "@ "))
        return String(name.prefix(1)).uppercased()
    }
}

/// Up to four pictures: one wide, two side by side, or a two-by-two grid with a +N.
struct PictureGrid: View {
    let urls: [URL]
    private var shown: [URL] { Array(urls.prefix(4)) }

    var body: some View {
        Group {
            if shown.count == 1 {
                RemoteImage(url: shown[0]).frame(maxWidth: .infinity).frame(height: 240)
            } else {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)], spacing: 6) {
                    ForEach(Array(shown.enumerated()), id: \.offset) { i, url in
                        RemoteImage(url: url)
                            .frame(height: shown.count == 2 ? 180 : 130)
                            .overlay {
                                if i == shown.count - 1 && urls.count > shown.count {
                                    // Photo overlays stay dark in every theme.
                                    Color.black.opacity(0.55)
                                    Text("+\(urls.count - shown.count)").font(.title3.bold()).foregroundStyle(.white)
                                }
                            }
                            .clipShape(RoundedRectangle(cornerRadius: Theme.smallRadius))
                    }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Theme.smallRadius + 2))
    }
}
