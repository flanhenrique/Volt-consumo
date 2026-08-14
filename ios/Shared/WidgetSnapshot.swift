import Foundation

struct WidgetSnapshot: Codable, Equatable, Sendable {
    let version: Int
    let capturedAt: Date
    let energyConsumption: Double
    let energyGoal: Double
    let energyProgress: Double
    let energyCurrentCost: Double
    let totalCurrentCost: Double
    let waterConsumption: Double
    let waterGoal: Double
    let waterCurrentCost: Double
    let co2Kg: Double
    let energyStatus: String

    var safeEnergyProgress: Double {
        min(max(energyProgress, 0), 2)
    }

    var energyProgressPercent: Int {
        Int((safeEnergyProgress * 100).rounded())
    }

    static let placeholder = WidgetSnapshot(
        version: 1,
        capturedAt: Date(),
        energyConsumption: 127,
        energyGoal: 200,
        energyProgress: 0.635,
        energyCurrentCost: 118.40,
        totalCurrentCost: 184.70,
        waterConsumption: 8.4,
        waterGoal: 15,
        waterCurrentCost: 66.30,
        co2Kg: 4.9,
        energyStatus: "Dentro da meta"
    )
}

enum VoltShared {
    static let appGroup = "group.br.com.voltconsumo.shared"
    static let widgetKind = "br.com.voltconsumo.widget.consumption"
    static let snapshotKey = "volt.widget.snapshot.v1"
}
