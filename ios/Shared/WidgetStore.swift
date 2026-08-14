import Foundation

enum WidgetStore {
    static func save(_ snapshot: WidgetSnapshot) throws {
        guard let defaults = UserDefaults(suiteName: VoltShared.appGroup) else {
            throw StoreError.unavailableAppGroup
        }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        defaults.set(try encoder.encode(snapshot), forKey: VoltShared.snapshotKey)
    }

    static func load() -> WidgetSnapshot? {
        guard
            let defaults = UserDefaults(suiteName: VoltShared.appGroup),
            let data = defaults.data(forKey: VoltShared.snapshotKey)
        else { return nil }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(WidgetSnapshot.self, from: data)
    }

    enum StoreError: Error {
        case unavailableAppGroup
    }
}
