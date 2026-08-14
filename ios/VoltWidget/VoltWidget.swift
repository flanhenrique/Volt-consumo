import SwiftUI
import WidgetKit

struct VoltWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

struct VoltWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> VoltWidgetEntry {
        VoltWidgetEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (VoltWidgetEntry) -> Void) {
        completion(VoltWidgetEntry(date: Date(), snapshot: WidgetStore.load() ?? .placeholder))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<VoltWidgetEntry>) -> Void) {
        let entry = VoltWidgetEntry(date: Date(), snapshot: WidgetStore.load() ?? .placeholder)
        completion(Timeline(entries: [entry], policy: .never))
    }
}

struct VoltConsumptionWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: VoltShared.widgetKind, provider: VoltWidgetProvider()) { entry in
            VoltWidgetView(entry: entry)
        }
        .configurationDisplayName("Consumo VOLT")
        .description("Consumo, meta e previsão da fatura do ciclo atual.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

struct VoltWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: VoltWidgetEntry

    private var snapshot: WidgetSnapshot { entry.snapshot }
    private var progress: Double { min(max(snapshot.energyProgress, 0), 1) }

    var body: some View {
        Group {
            switch family {
            case .systemMedium:
                mediumView
            case .accessoryCircular:
                circularView
            case .accessoryRectangular:
                rectangularView
            default:
                smallView
            }
        }
        .widgetURL(URL(string: "volt://home"))
        .containerBackground(for: .widget) {
            Color(uiColor: .systemBackground)
        }
        .environment(\.locale, Locale(identifier: "pt_BR"))
    }

    private var smallView: some View {
        VStack(alignment: .leading, spacing: 8) {
            header
            Spacer(minLength: 0)
            Text(snapshot.energyConsumption, format: .number.precision(.fractionLength(0)))
                .font(.system(size: 29, weight: .bold, design: .rounded))
                .contentTransition(.numericText())
            Text("kWh no ciclo")
                .font(.caption)
                .foregroundStyle(.secondary)
            ProgressView(value: progress)
                .tint(progressTint)
            HStack(spacing: 6) {
                Text("\(snapshot.energyProgressPercent)% da meta")
                    .font(.caption2.weight(.semibold))
                Spacer(minLength: 0)
                Image(systemName: statusSymbol)
                    .font(.caption2)
                    .foregroundStyle(progressTint)
            }
        }
    }

    private var mediumView: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 7) {
                header
                Text(snapshot.energyConsumption, format: .number.precision(.fractionLength(0)))
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                Text("kWh de \(snapshot.energyGoal, format: .number.precision(.fractionLength(0))) kWh")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ProgressView(value: progress)
                    .tint(progressTint)
                Text(snapshot.energyStatus.isEmpty ? "Acompanhando consumo" : snapshot.energyStatus)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(progressTint)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Divider()

            VStack(alignment: .leading, spacing: 9) {
                metric("Previsão da fatura", value: projectedBillValue)
                metric("Energia projetada", value: projectedEnergyValue)
                metric("Impacto projetado", value: projectedImpactValue)
                metric("Água atual", value: "\(snapshot.waterConsumption.formatted(.number.precision(.fractionLength(1)))) m³")
                Spacer(minLength: 0)
                Text(snapshot.confidence == "measured" ? "Baseado nas leituras do ciclo" : "Aguardando base de leitura")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var circularView: some View {
        Gauge(value: progress) {
            Image(systemName: "bolt.fill")
        } currentValueLabel: {
            Text("\(snapshot.energyProgressPercent)%")
                .font(.caption2.weight(.bold))
        }
        .gaugeStyle(.accessoryCircular)
    }

    private var rectangularView: some View {
        HStack(spacing: 8) {
            Image(systemName: "bolt.fill")
            VStack(alignment: .leading, spacing: 2) {
                Text("\(snapshot.energyConsumption.formatted(.number.precision(.fractionLength(0)))) kWh")
                    .font(.headline)
                Text("\(snapshot.energyProgressPercent)% da meta · \(snapshot.energyStatus)")
                    .font(.caption2)
                    .lineLimit(1)
            }
        }
    }

    private var header: some View {
        HStack(spacing: 6) {
            Image(systemName: "bolt.fill")
                .foregroundStyle(.green)
            Text("VOLT")
                .font(.caption.weight(.bold))
                .tracking(0.8)
            Spacer(minLength: 0)
        }
    }

    private func metric(_ title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
    }

    private var projectedBillValue: String {
        guard snapshot.confidence == "measured" else { return "—" }
        return snapshot.totalProjectedCost.formatted(.currency(code: "BRL"))
    }

    private var projectedEnergyValue: String {
        guard snapshot.confidence == "measured" else { return "—" }
        return "\(snapshot.energyProjectedConsumption.formatted(.number.precision(.fractionLength(0)))) kWh"
    }

    private var projectedImpactValue: String {
        guard snapshot.confidence == "measured" else { return "—" }
        return "\(snapshot.projectedCo2Kg.formatted(.number.precision(.fractionLength(1)))) kg CO₂e"
    }

    private var progressTint: Color {
        if snapshot.energyStatusTone == "danger" { return .red }
        if snapshot.energyStatusTone == "warning" { return .orange }
        return .green
    }

    private var statusSymbol: String {
        if snapshot.energyStatusTone == "danger" { return "exclamationmark.triangle.fill" }
        if snapshot.energyStatusTone == "warning" { return "exclamationmark.circle.fill" }
        return "checkmark.circle.fill"
    }
}

@main
struct VoltWidgetBundle: WidgetBundle {
    var body: some Widget {
        VoltConsumptionWidget()
    }
}
