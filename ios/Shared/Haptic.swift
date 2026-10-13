import UIKit

/// One small buzz per action: a save, archive or delete, a tag added, a reminder set.
enum Haptic {
    /// Saved, archived, a reminder set.
    static func done() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    /// Moved to Trash or deleted.
    static func warn() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
    /// A light tap: a tag added, read or unread.
    static func tap() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
}
