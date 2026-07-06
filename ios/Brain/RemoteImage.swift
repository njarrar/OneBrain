import SwiftUI
import UIKit

/// Keeps loaded pictures in memory while the app runs.
final class ImageCache {
    static let shared = ImageCache()
    private let cache = NSCache<NSURL, UIImage>()
    init() { cache.countLimit = 400 }
    func get(_ url: URL) -> UIImage? { cache.object(forKey: url as NSURL) }
    func set(_ url: URL, _ image: UIImage) { cache.setObject(image, forKey: url as NSURL) }
}

/// Like AsyncImage, but sends the app's key for Brain's own files.
struct RemoteImage: View {
    let url: URL
    var contentMode: ContentMode = .fill

    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        Group {
            if contentMode == .fill {
                // A filled picture must never set its own size: it would push the card wider
                // than the screen. The background takes the size it is given; the picture sits on top.
                Theme.raised.overlay { picture }
            } else {
                ZStack { Theme.raised; picture }
            }
        }
        .clipped()
        .task(id: url) {
            if let hit = ImageCache.shared.get(url) { image = hit; return }
            do {
                let data = try await API.shared.imageData(url)
                if let img = UIImage(data: data) {
                    ImageCache.shared.set(url, img)
                    image = img
                } else {
                    failed = true
                }
            } catch {
                failed = true
            }
        }
    }

    @ViewBuilder private var picture: some View {
        if let image {
            Image(uiImage: image).resizable().aspectRatio(contentMode: contentMode)
        } else if failed {
            Image(systemName: "photo").foregroundStyle(Theme.soft)
        } else {
            ProgressView().tint(Theme.soft)
        }
    }
}
