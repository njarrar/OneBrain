import Foundation
import SQLite3

/// A small wrapper over SQLite. One connection, used from the Store actor only.
final class DB {
    enum Failure: LocalizedError {
        case sqlite(String)
        var errorDescription: String? {
            switch self { case .sqlite(let m): return "Database: \(m)" }
        }
    }

    typealias Row = [String: Any]

    private var handle: OpaquePointer?
    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    init(path: URL) throws {
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(path.path, &handle, flags, nil) == SQLITE_OK else {
            throw Failure.sqlite(String(cString: sqlite3_errmsg(handle)))
        }
        // The app and the share sheet both open this file, so wait for each other's writes.
        sqlite3_busy_timeout(handle, 5000)
        try exec("pragma foreign_keys = on")
    }

    deinit { sqlite3_close(handle) }

    private var message: String { String(cString: sqlite3_errmsg(handle)) }

    /// Runs one or more statements with no arguments.
    func exec(_ sql: String) throws {
        guard sqlite3_exec(handle, sql, nil, nil, nil) == SQLITE_OK else { throw Failure.sqlite(message) }
    }

    private func prepare(_ sql: String, _ args: [Any?]) throws -> OpaquePointer? {
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(handle, sql, -1, &stmt, nil) == SQLITE_OK else { throw Failure.sqlite(message) }
        for (i, arg) in args.enumerated() {
            let at = Int32(i + 1)
            switch arg {
            case nil: sqlite3_bind_null(stmt, at)
            case let v as String: sqlite3_bind_text(stmt, at, v, -1, Self.transient)
            case let v as Int: sqlite3_bind_int64(stmt, at, Int64(v))
            case let v as Bool: sqlite3_bind_int64(stmt, at, v ? 1 : 0)
            case let v as Double: sqlite3_bind_double(stmt, at, v)
            case let v as Data: _ = v.withUnsafeBytes { sqlite3_bind_blob(stmt, at, $0.baseAddress, Int32(v.count), Self.transient) }
            default: sqlite3_bind_text(stmt, at, String(describing: arg!), -1, Self.transient)
            }
        }
        return stmt
    }

    /// Runs a statement and returns how many rows it changed.
    @discardableResult
    func run(_ sql: String, _ args: Any?...) throws -> Int {
        try run(sql, args: args)
    }

    @discardableResult
    func run(_ sql: String, args: [Any?]) throws -> Int {
        let stmt = try prepare(sql, args)
        defer { sqlite3_finalize(stmt) }
        let code = sqlite3_step(stmt)
        guard code == SQLITE_DONE || code == SQLITE_ROW else { throw Failure.sqlite(message) }
        return Int(sqlite3_changes(handle))
    }

    func all(_ sql: String, _ args: Any?...) throws -> [Row] {
        try all(sql, args: args)
    }

    func all(_ sql: String, args: [Any?]) throws -> [Row] {
        let stmt = try prepare(sql, args)
        defer { sqlite3_finalize(stmt) }
        var rows: [Row] = []
        while true {
            let code = sqlite3_step(stmt)
            if code == SQLITE_DONE { break }
            guard code == SQLITE_ROW else { throw Failure.sqlite(message) }
            var row: Row = [:]
            for c in 0..<sqlite3_column_count(stmt) {
                let name = String(cString: sqlite3_column_name(stmt, c))
                switch sqlite3_column_type(stmt, c) {
                case SQLITE_INTEGER: row[name] = Int(sqlite3_column_int64(stmt, c))
                case SQLITE_FLOAT: row[name] = sqlite3_column_double(stmt, c)
                case SQLITE_TEXT: row[name] = String(cString: sqlite3_column_text(stmt, c))
                case SQLITE_BLOB:
                    let n = Int(sqlite3_column_bytes(stmt, c))
                    row[name] = n > 0 ? Data(bytes: sqlite3_column_blob(stmt, c), count: n) : Data()
                default: break
                }
            }
            rows.append(row)
        }
        return rows
    }

    func first(_ sql: String, _ args: Any?...) throws -> Row? {
        try all(sql, args: args).first
    }

    func count(_ sql: String, _ args: Any?...) throws -> Int {
        (try all(sql, args: args).first?.values.first as? Int) ?? 0
    }

    /// Runs the block in one transaction, so a failure leaves nothing half saved.
    func transaction<T>(_ body: () throws -> T) throws -> T {
        try exec("begin immediate")
        do {
            let out = try body()
            try exec("commit")
            return out
        } catch {
            try? exec("rollback")
            throw error
        }
    }
}
