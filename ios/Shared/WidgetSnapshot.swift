import Foundation

struct WidgetSnapshot: Codable, Equatable, Sendable {
    let version: Int
    let capturedAt: Date
    let cycleLabel: String
    let energyConsumption: Double
    let energyGoal: Double
    let energyProgress: Double
    let energyProjectedConsumption: Double
    let energyCurrentCost: Double
    let energyProjectedCost: Double
    let totalCurrentCost: Double
    let totalProjectedCost: Double
    let waterConsumption: Double
    let waterGoal: Double
    let waterProgress: Double
    let waterProjectedConsumption: Double
    let waterCurrentCost: Double
    let waterProjectedCost: Double
    let co2Kg: Double
    let projectedCo2Kg: Double
    let energyStatus: String
    let energyStatusTone: String
    let confidence: String

    var safeEnergyProgress: Double {
        min(max(energyProgress, 0), 2)
    }

    var energyProgressPercent: Int {
        Int((safeEnergyProgress * 100).rounded())
    }

    static let placeholder = WidgetSnapshot(
        version: 2,
        capturedAt: Date(),
        cycleLabel: "17 jul – 16 ago",
        energyConsumption: 127,
        energyGoal: 200,
        energyProgress: 0.635,
        energyProjectedConsumption: 184,
        energyCurrentCost: 118.40,
        energyProjectedCost: 171.10,
        totalCurrentCost: 184.70,
        totalProjectedCost: 246.30,
        waterConsumption: 8.4,
        waterGoal: 15,
        waterProgress: 0.56,
        waterProjectedConsumption: 10.8,
        waterCurrentCost: 66.30,
        waterProjectedCost: 75.20,
        co2Kg: 4.9,
        projectedCo2Kg: 7.1,
        energyStatus: "Dentro da meta",
        energyStatusTone: "success",
        confidence: "measured"
    )
}

enum VoltShared {
    static let appGroup = "group.br.com.voltconsumo.shared"
    static let widgetKind = "br.com.voltconsumo.widget.consumption"
    static let snapshotKey = "volt.widget.snapshot.v2"
}
