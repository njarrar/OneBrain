import ImageIO
import UIKit

/// Pictures made ready to upload: a JPEG no longer than 2048 pixels on its long side. Small enough to
/// upload fast and to keep ten pictures within the share sheet's memory, big enough for Claude to read a screenshot.
enum Pictures {
    static func jpeg(_ data: Data) -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return downsample(source)
    }

    static func jpeg(url: URL) -> Data? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
        return downsample(source)
    }

    static func downsample(_ source: CGImageSource) -> Data? {
        autoreleasepool { () -> Data? in
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceShouldCacheImmediately: true,
                kCGImageSourceThumbnailMaxPixelSize: 2048,
            ]
            guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
            return UIImage(cgImage: cg).jpegData(compressionQuality: 0.8)
        }
    }
}
