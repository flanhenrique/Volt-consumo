import Foundation
import VoltWidgetCore

public enum VOLTWidgetConstants {
    public static let appGroup = "group.br.com.voltconsumo.shared"
    public static let snapshotDefaultsKey = "volt.widget.snapshot.v1"
    public static let summaryWidgetKind = "br.com.voltconsumo.widget.summary"
    public static let energyWidgetKind = "br.com.voltconsumo.widget.energy"
    public static let waterWidgetKind = "br.com.voltconsumo.widget.water"
    public static let readingWidgetKind = "br.com.voltconsumo.widget.reading"
    public static let lockWidgetKind = "br.com.voltconsumo.widget.lock"
    public static let webBaseURL = URL(string: "https://www.voltconsumo.com.br")!
    public static let homeURL = URL(string: "volt://home")!
    public static let energyURL = URL(string: "volt://consumption/energy")!
    public static let waterURL = URL(string: "volt://consumption/water")!
    public static let newReadingURL = URL(string: "volt://reading")!
    public static let newEnergyReadingURL = URL(string: "volt://reading/energy")!
    public static let newWaterReadingURL = URL(string: "volt://reading/water")!
}

public final class WidgetSnapshotStore: @unchecked Sendable {
    public static let shared = WidgetSnapshotStore()
    private let defaults: UserDefaults?
    public init(suiteName: String = VOLTWidgetConstants.appGroup) { defaults = UserDefaults(suiteName: suiteName) }
    public func save(_ snapshot: VoltWidgetSnapshot) throws { defaults?.set(try VoltWidgetSnapshotCodec.encode(snapshot), forKey: VOLTWidgetConstants.snapshotDefaultsKey) }
    public func load() -> VoltWidgetSnapshot? { guard let data = defaults?.data(forKey: VOLTWidgetConstants.snapshotDefaultsKey) else { return nil }; return try? VoltWidgetSnapshotCodec.decode(data) }
    public func clear() { defaults?.removeObject(forKey: VOLTWidgetConstants.snapshotDefaultsKey) }
}
