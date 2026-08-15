import Foundation

public enum VoltServiceKind: String, Codable, Sendable, CaseIterable { case energy, water }
public enum VoltGoalTone: String, Codable, Sendable, Equatable { case good, attention, danger, unavailable }

public struct VoltServiceSnapshot: Codable, Sendable, Equatable {
    public let kind: VoltServiceKind
    public let value: Double
    public let unit: String
    public let goal: Double?
    public let projectedValue: Double?
    public let estimatedCostBRL: Double?
    public let dailyAverage: Double?
    public let cycleElapsedDays: Int?
    public let cycleTotalDays: Int?
    public let lastReadingAt: Date?

    public init(kind: VoltServiceKind, value: Double, unit: String, goal: Double? = nil, projectedValue: Double? = nil, estimatedCostBRL: Double? = nil, dailyAverage: Double? = nil, cycleElapsedDays: Int? = nil, cycleTotalDays: Int? = nil, lastReadingAt: Date? = nil) {
        self.kind = kind; self.value = value; self.unit = unit; self.goal = goal; self.projectedValue = projectedValue; self.estimatedCostBRL = estimatedCostBRL; self.dailyAverage = dailyAverage; self.cycleElapsedDays = cycleElapsedDays; self.cycleTotalDays = cycleTotalDays; self.lastReadingAt = lastReadingAt
    }

    public var goalProgress: Double? { guard let goal, goal > 0 else { return nil }; return max(0, value / goal) }
    public var cycleProgress: Double? { guard let elapsed = cycleElapsedDays, let total = cycleTotalDays, total > 0 else { return nil }; return min(1, max(0, Double(elapsed) / Double(total))) }
    public var goalTone: VoltGoalTone { guard let progress = goalProgress else { return .unavailable }; if progress < 0.85 { return .good }; if progress <= 1.0 { return .attention }; return .danger }
}

public struct VoltWidgetSnapshot: Codable, Sendable, Equatable {
    public static let currentSchemaVersion = 1
    public let schemaVersion: Int
    public let generatedAt: Date
    public let accountLabel: String?
    public let energy: VoltServiceSnapshot?
    public let water: VoltServiceSnapshot?
    public let tariffFlagLabel: String?
    public let totalEstimatedCostBRL: Double?
    public let accent: String?
    public let preferredTheme: String?

    public init(schemaVersion: Int = VoltWidgetSnapshot.currentSchemaVersion, generatedAt: Date = Date(), accountLabel: String? = nil, energy: VoltServiceSnapshot? = nil, water: VoltServiceSnapshot? = nil, tariffFlagLabel: String? = nil, totalEstimatedCostBRL: Double? = nil, accent: String? = "emerald", preferredTheme: String? = "system") {
        self.schemaVersion = schemaVersion; self.generatedAt = generatedAt; self.accountLabel = accountLabel; self.energy = energy; self.water = water; self.tariffFlagLabel = tariffFlagLabel; self.totalEstimatedCostBRL = totalEstimatedCostBRL; self.accent = accent; self.preferredTheme = preferredTheme
    }
    public var isSupported: Bool { schemaVersion == Self.currentSchemaVersion }
}

public enum VoltWidgetSnapshotError: Error, Equatable { case unsupportedSchema(Int), invalidJSON }
public enum VoltWidgetSnapshotCodec {
    public static func decoder() -> JSONDecoder { let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601; return decoder }
    public static func encoder() -> JSONEncoder { let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]; encoder.dateEncodingStrategy = .iso8601; return encoder }
    public static func decode(_ data: Data) throws -> VoltWidgetSnapshot { let snapshot: VoltWidgetSnapshot; do { snapshot = try decoder().decode(VoltWidgetSnapshot.self, from: data) } catch { throw VoltWidgetSnapshotError.invalidJSON }; guard snapshot.isSupported else { throw VoltWidgetSnapshotError.unsupportedSchema(snapshot.schemaVersion) }; return snapshot }
    public static func encode(_ snapshot: VoltWidgetSnapshot) throws -> Data { try encoder().encode(snapshot) }
}

public enum VoltWidgetFreshness: Equatable, Sendable {
    case fresh, stale, expired
    public static func evaluate(snapshotDate: Date, now: Date = Date()) -> Self { let age = max(0, now.timeIntervalSince(snapshotDate)); if age <= 3600 { return .fresh }; if age <= 86400 { return .stale }; return .expired }
}

public struct VoltWidgetProjection: Equatable, Sendable {
    public let value: Double
    public let isEstimated: Bool
    public init(service: VoltServiceSnapshot) { if let projected = service.projectedValue, projected >= 0 { value = projected; isEstimated = true; return }; if let average = service.dailyAverage, let total = service.cycleTotalDays, total > 0 { value = max(service.value, average * Double(total)); isEstimated = true; return }; value = service.value; isEstimated = false }
}

public enum VoltWidgetFixtures {
    public static let demo = VoltWidgetSnapshot(generatedAt: Date(timeIntervalSince1970: 1_776_000_000), accountLabel: "Casa", energy: VoltServiceSnapshot(kind: .energy, value: 218, unit: "kWh", goal: 300, projectedValue: 286, estimatedCostBRL: 189.42, dailyAverage: 9.1, cycleElapsedDays: 24, cycleTotalDays: 31, lastReadingAt: Date(timeIntervalSince1970: 1_775_910_000)), water: VoltServiceSnapshot(kind: .water, value: 8.4, unit: "m³", goal: 12, projectedValue: 10.7, estimatedCostBRL: 76.80, dailyAverage: 0.35, cycleElapsedDays: 24, cycleTotalDays: 31, lastReadingAt: Date(timeIntervalSince1970: 1_775_910_000)), tariffFlagLabel: "Amarela", totalEstimatedCostBRL: 266.22)
}
