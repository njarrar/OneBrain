import Foundation
import Security

/// Keys and sign-in tokens, in the Keychain's app group so the share sheet can read them too.
/// They stay on this phone and go into encrypted backups only.
enum Secrets {
    enum Key: String {
        case account            // who signed in, e.g. "google:you@gmail.com" or "apple:<id>"
        case accountName        // a name or email to show
        case googleRefresh      // lets Brain read your YouTube likes and playlists
        case xRefresh           // lets Brain read your X bookmarks
        case xUser              // your X user id
        case anthropic          // your Anthropic key, for sorting with Claude
    }

    private static let service = "com.njarrar.brain"

    private static func query(_ key: Key) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
            kSecAttrAccessGroup as String: Config.appGroup,
        ]
    }

    static subscript(_ key: Key) -> String? {
        get {
            var q = query(key)
            q[kSecReturnData as String] = true
            q[kSecMatchLimit as String] = kSecMatchLimitOne
            var out: AnyObject?
            guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
            return String(data: data, encoding: .utf8)
        }
        set {
            SecItemDelete(query(key) as CFDictionary)
            guard let newValue, !newValue.isEmpty else { return }
            var q = query(key)
            q[kSecValueData as String] = Data(newValue.utf8)
            q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(q as CFDictionary, nil)
        }
    }
}
