import SwiftUI
import WidgetKit
import VoltWidgetCore

struct VoltWidgetEntry: TimelineEntry {
    let date: Date; let snapshot: VoltWidgetSnapshot?; let freshness: VoltWidgetFreshness
    init(date: Date = Date(), snapshot: VoltWidgetSnapshot?) { self.date = date; self.snapshot = snapshot; freshness = snapshot.map { VoltWidgetFreshness.evaluate(snapshotDate: $0.generatedAt, now: date) } ?? .expired }
}
struct VoltWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> VoltWidgetEntry { .init(snapshot: VoltWidgetFixtures.demo) }
    func getSnapshot(in context: Context, completion: @escaping (VoltWidgetEntry) -> Void) { completion(.init(snapshot: context.isPreview ? VoltWidgetFixtures.demo : WidgetSnapshotStore.shared.load())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<VoltWidgetEntry>) -> Void) { let now = Date(); completion(Timeline(entries: [.init(date: now, snapshot: WidgetSnapshotStore.shared.load())], policy: .after(now.addingTimeInterval(1800)))) }
}

enum VoltWidgetPalette {
    static let accent = Color(red: 0, green: 0.66, blue: 0.47), accentSoft = Color(red: 0.93, green: 0.99, blue: 0.96)
    static let energy = Color(red: 1, green: 0.68, blue: 0), energySoft = Color(red: 1, green: 0.97, blue: 0.89)
    static let water = Color(red: 0, green: 0.63, blue: 0.89), waterSoft = Color(red: 0.92, green: 0.98, blue: 1)
    static let ink = Color(red: 0.07, green: 0.14, blue: 0.12), muted = Color(red: 0.38, green: 0.45, blue: 0.43), track = Color(red: 0.88, green: 0.91, blue: 0.90)
    static let danger = Color(red: 0.76, green: 0.23, blue: 0.20), warning = Color(red: 0.82, green: 0.50, blue: 0)
}
struct VoltWidgetBackground: View { var body: some View { ContainerRelativeShape().fill(.white).overlay { LinearGradient(colors: [VoltWidgetPalette.accentSoft, .white, VoltWidgetPalette.waterSoft.opacity(0.45)], startPoint: .topLeading, endPoint: .bottomTrailing).clipShape(ContainerRelativeShape()) } } }
struct VoltBrandLabel: View { var body: some View { Text("VOLT").font(.caption.bold()).foregroundStyle(VoltWidgetPalette.ink) } }
struct VoltServiceIcon: View {
    let kind: VoltServiceKind; let size: CGFloat
    var body: some View { ZStack { Circle().fill(kind == .energy ? VoltWidgetPalette.energySoft : VoltWidgetPalette.waterSoft); Image(systemName: kind == .energy ? "bolt.fill" : "drop.fill").font(.system(size: size * 0.44, weight: .bold)).foregroundStyle(kind == .energy ? VoltWidgetPalette.energy : VoltWidgetPalette.water) }.frame(width: size, height: size) }
}
struct VoltServiceGauge: View {
    let service: VoltServiceSnapshot; let compact: Bool
    var color: Color { service.kind == .energy ? VoltWidgetPalette.energy : VoltWidgetPalette.water }
    var progressColor: Color { switch service.goalTone { case .good, .unavailable: color; case .attention: VoltWidgetPalette.warning; case .danger: VoltWidgetPalette.danger } }
    var body: some View { VStack(alignment: .leading, spacing: compact ? 6 : 8) {
        HStack(spacing: 7) { VoltServiceIcon(kind: service.kind, size: compact ? 24 : 30); Text(service.kind == .energy ? "Energia" : "Água").font(.caption.weight(.semibold)).foregroundStyle(color); Spacer(minLength: 0) }
        HStack(alignment: .firstTextBaseline, spacing: 4) { Text(service.value, format: .number.precision(.fractionLength(service.kind == .energy ? 0 : 1))).font(compact ? .title2.bold() : .title.bold()).foregroundStyle(VoltWidgetPalette.ink); Text(service.unit).font(.caption.weight(.medium)).foregroundStyle(VoltWidgetPalette.muted) }
        if let progress = service.goalProgress { ProgressView(value: min(progress, 1.25), total: 1.25).tint(progressColor).background(VoltWidgetPalette.track, in: Capsule()); HStack { Text("Meta"); Spacer(); Text(progress, format: .percent.precision(.fractionLength(0))) }.font(.caption2).foregroundStyle(VoltWidgetPalette.muted) }
    } }
}
struct VoltFreshnessBadge: View { let freshness: VoltWidgetFreshness; var body: some View { if freshness != .fresh { Label(freshness == .stale ? "Atualização pendente" : "Abra o VOLT", systemImage: freshness == .stale ? "clock" : "arrow.clockwise").font(.caption2).foregroundStyle(VoltWidgetPalette.muted) } } }
struct VoltEmptyView: View { var body: some View { VStack(alignment: .leading, spacing: 8) { Image(systemName: "icloud.and.arrow.up").font(.title2).foregroundStyle(VoltWidgetPalette.accent); Text("Abra o VOLT").font(.headline).foregroundStyle(VoltWidgetPalette.ink); Text("Sincronize seus dados para ativar o widget.").font(.caption).foregroundStyle(VoltWidgetPalette.muted) } } }

struct VoltSummaryWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family; let entry: VoltWidgetEntry
    var body: some View { Group { if let s = entry.snapshot { switch family { case .systemSmall: small(s); case .systemLarge: large(s); default: medium(s) } } else { VoltEmptyView().padding() } }.containerBackground(for: .widget) { VoltWidgetBackground() }.widgetURL(VOLTWidgetConstants.homeURL) }
    func small(_ s: VoltWidgetSnapshot) -> some View { VStack(alignment: .leading, spacing: 8) { HStack { VoltBrandLabel(); Spacer(); if let flag = s.tariffFlagLabel { Text(flag).font(.caption2).foregroundStyle(VoltWidgetPalette.muted) } }; if let e = s.energy { VoltServiceGauge(service: e, compact: true) } else if let w = s.water { VoltServiceGauge(service: w, compact: true) } else { VoltEmptyView() }; VoltFreshnessBadge(freshness: entry.freshness) }.padding() }
    func medium(_ s: VoltWidgetSnapshot) -> some View { VStack(alignment: .leading, spacing: 10) { HStack { VoltBrandLabel(); Spacer(); if let total = s.totalEstimatedCostBRL { VStack(alignment: .trailing) { Text(total, format: .currency(code: "BRL")).font(.headline).foregroundStyle(VoltWidgetPalette.ink); Text("estimativa").font(.caption2).foregroundStyle(VoltWidgetPalette.muted) } } }; HStack(alignment: .top, spacing: 18) { if let e = s.energy { VoltServiceGauge(service: e, compact: true) }; if let w = s.water { VoltServiceGauge(service: w, compact: true) } }; VoltFreshnessBadge(freshness: entry.freshness) }.padding() }
    func large(_ s: VoltWidgetSnapshot) -> some View { VStack(alignment: .leading, spacing: 14) { HStack { VStack(alignment: .leading) { VoltBrandLabel(); Text(s.accountLabel ?? "Consumo atual").font(.caption).foregroundStyle(VoltWidgetPalette.muted) }; Spacer(); if let flag = s.tariffFlagLabel { Text("Bandeira \(flag)").font(.caption.weight(.semibold)).foregroundStyle(VoltWidgetPalette.muted) } }; HStack(alignment: .top, spacing: 20) { if let e = s.energy { VoltServiceGauge(service: e, compact: false).frame(maxWidth: .infinity) }; Divider(); if let w = s.water { VoltServiceGauge(service: w, compact: false).frame(maxWidth: .infinity) } }; HStack { metric("Estimativa total", s.totalEstimatedCostBRL.map { $0.formatted(.currency(code: "BRL")) } ?? "—"); Divider(); metric("Ritmo da energia", pace(s)); Divider(); latest(s) }.padding(12).background(VoltWidgetPalette.accentSoft, in: RoundedRectangle(cornerRadius: 16)); VoltFreshnessBadge(freshness: entry.freshness) }.padding() }
    func metric(_ title: String, _ value: String) -> some View { VStack(alignment: .leading) { Text(title).font(.caption2).foregroundStyle(VoltWidgetPalette.muted); Text(value).font(.subheadline.bold()).foregroundStyle(VoltWidgetPalette.ink) }.frame(maxWidth: .infinity, alignment: .leading) }
    func latest(_ s: VoltWidgetSnapshot) -> some View { let dates = [s.energy?.lastReadingAt, s.water?.lastReadingAt].compactMap { $0 }; return VStack(alignment: .leading) { Text("Última leitura").font(.caption2).foregroundStyle(VoltWidgetPalette.muted); if let date = dates.max() { Text(date, style: .time).font(.subheadline.bold()).foregroundStyle(VoltWidgetPalette.ink) } else { Text("—").font(.subheadline.bold()) } }.frame(maxWidth: .infinity, alignment: .leading) }
    func pace(_ s: VoltWidgetSnapshot) -> String { guard let e = s.energy, let goal = e.goal, goal > 0 else { return "Sem meta" }; let d = VoltWidgetProjection(service: e).value / goal - 1; if abs(d) < 0.03 { return "No ritmo" }; let p = abs(d).formatted(.percent.precision(.fractionLength(0))); return d > 0 ? "+\(p) acima" : "\(p) abaixo" }
}
struct VoltSummaryWidget: Widget { let kind = VOLTWidgetConstants.summaryWidgetKind; var body: some WidgetConfiguration { StaticConfiguration(kind: kind, provider: VoltWidgetProvider()) { VoltSummaryWidgetEntryView(entry: $0) }.configurationDisplayName("Resumo VOLT").description("Energia, água, meta e estimativa do ciclo.").supportedFamilies([.systemSmall, .systemMedium, .systemLarge]) } }

struct VoltServiceWidgetEntryView: View {
    let entry: VoltWidgetEntry; let kind: VoltServiceKind
    var service: VoltServiceSnapshot? { kind == .energy ? entry.snapshot?.energy : entry.snapshot?.water }
    var body: some View { Group { if let s = service { VStack(alignment: .leading, spacing: 10) { VoltBrandLabel(); VoltServiceGauge(service: s, compact: false); if let p = s.projectedValue { HStack { Text("Projeção"); Spacer(); Text("\(p, specifier: kind == .energy ? "%.0f" : "%.1f") \(s.unit)") }.font(.caption2).foregroundStyle(VoltWidgetPalette.muted) }; VoltFreshnessBadge(freshness: entry.freshness) }.padding() } else { VoltEmptyView().padding() } }.containerBackground(for: .widget) { VoltWidgetBackground() }.widgetURL(kind == .energy ? VOLTWidgetConstants.energyURL : VOLTWidgetConstants.waterURL) }
}
struct VoltEnergyWidget: Widget { let kind = VOLTWidgetConstants.energyWidgetKind; var body: some WidgetConfiguration { StaticConfiguration(kind: kind, provider: VoltWidgetProvider()) { VoltServiceWidgetEntryView(entry: $0, kind: .energy) }.configurationDisplayName("Energia VOLT").description("Consumo, meta e projeção de energia.").supportedFamilies([.systemSmall]) } }
struct VoltWaterWidget: Widget { let kind = VOLTWidgetConstants.waterWidgetKind; var body: some WidgetConfiguration { StaticConfiguration(kind: kind, provider: VoltWidgetProvider()) { VoltServiceWidgetEntryView(entry: $0, kind: .water) }.configurationDisplayName("Água VOLT").description("Consumo, meta e projeção de água.").supportedFamilies([.systemSmall]) } }

struct VoltReadingActionCard: View {
    let kind: VoltServiceKind; let compact: Bool
    var destination: URL { kind == .energy ? VOLTWidgetConstants.newEnergyReadingURL : VOLTWidgetConstants.newWaterReadingURL }
    var body: some View { Link(destination: destination) { HStack(spacing: 10) { VoltServiceIcon(kind: kind, size: compact ? 32 : 42); VStack(alignment: .leading) { Text(kind == .energy ? "Leitura de luz" : "Leitura de água").font(compact ? .caption.bold() : .subheadline.bold()).foregroundStyle(kind == .energy ? VoltWidgetPalette.energy : VoltWidgetPalette.water); if !compact { Text(kind == .energy ? "Registrar energia" : "Registrar água").font(.caption2).foregroundStyle(VoltWidgetPalette.muted) } }; Spacer(); Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(VoltWidgetPalette.muted) }.padding(compact ? 9 : 12).background(kind == .energy ? VoltWidgetPalette.energySoft : VoltWidgetPalette.waterSoft, in: RoundedRectangle(cornerRadius: 15)) } }
}
struct VoltReadingWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family; let entry: VoltWidgetEntry
    var body: some View { Group { switch family { case .systemSmall: small; case .systemLarge: large; default: medium } }.containerBackground(for: .widget) { VoltWidgetBackground() } }
    var small: some View { Link(destination: VOLTWidgetConstants.newReadingURL) { VStack(alignment: .leading, spacing: 10) { VoltBrandLabel(); Spacer(); ZStack { Circle().fill(VoltWidgetPalette.accent); Image(systemName: "plus").font(.title.bold()).foregroundStyle(.white) }.frame(width: 48, height: 48); Text("+ Leitura").font(.headline).foregroundStyle(VoltWidgetPalette.accent); Text("Escolha luz ou água.").font(.caption2).foregroundStyle(VoltWidgetPalette.muted); Spacer() }.padding() } }
    var medium: some View { VStack(alignment: .leading, spacing: 10) { HStack { VoltBrandLabel(); Spacer(); Link(destination: VOLTWidgetConstants.newReadingURL) { Label("Leitura", systemImage: "plus").font(.caption.bold()).foregroundStyle(VoltWidgetPalette.accent) } }; HStack(spacing: 10) { VoltReadingActionCard(kind: .energy, compact: true); VoltReadingActionCard(kind: .water, compact: true) } }.padding() }
    var large: some View { VStack(alignment: .leading, spacing: 14) { HStack { VStack(alignment: .leading) { VoltBrandLabel(); Text("Nova leitura").font(.title3.bold()).foregroundStyle(VoltWidgetPalette.ink) }; Spacer(); Link(destination: VOLTWidgetConstants.newReadingURL) { Label("Escolher", systemImage: "plus.circle.fill").foregroundStyle(VoltWidgetPalette.accent) } }; Text("Selecione o medidor para ir direto ao campo de leitura.").font(.caption).foregroundStyle(VoltWidgetPalette.muted); VoltReadingActionCard(kind: .energy, compact: false); VoltReadingActionCard(kind: .water, compact: false); if let last = [entry.snapshot?.energy?.lastReadingAt, entry.snapshot?.water?.lastReadingAt].compactMap({ $0 }).max() { Label { Text(last, style: .time) } icon: { Image(systemName: "clock") }.font(.caption2).foregroundStyle(VoltWidgetPalette.muted) } }.padding() }
}
struct VoltReadingWidget: Widget { let kind = VOLTWidgetConstants.readingWidgetKind; var body: some WidgetConfiguration { StaticConfiguration(kind: kind, provider: VoltWidgetProvider()) { VoltReadingWidgetEntryView(entry: $0) }.configurationDisplayName("Nova leitura VOLT").description("Abra a leitura de luz ou água diretamente pela Tela Inicial.").supportedFamilies([.systemSmall, .systemMedium, .systemLarge]) } }

struct VoltLockScreenEntryView: View {
    @Environment(\.widgetFamily) private var family; let entry: VoltWidgetEntry; var energy: VoltServiceSnapshot? { entry.snapshot?.energy }
    var body: some View { switch family { case .accessoryCircular: Gauge(value: min(energy?.goalProgress ?? 0, 1), in: 0...1) { Image(systemName: "bolt.fill") } currentValueLabel: { Text(energy?.goalProgress ?? 0, format: .percent.precision(.fractionLength(0))) }.gaugeStyle(.accessoryCircularCapacity).widgetURL(VOLTWidgetConstants.energyURL); case .accessoryInline: if let e = energy { Label("\(e.value, specifier: "%.0f") \(e.unit) · VOLT", systemImage: "bolt.fill").widgetURL(VOLTWidgetConstants.energyURL) } else { Label("Abra o VOLT", systemImage: "bolt.fill") }; default: if let e = energy { HStack { Gauge(value: min(e.goalProgress ?? 0, 1), in: 0...1) { Image(systemName: "bolt.fill") }.gaugeStyle(.accessoryCircularCapacity); VStack(alignment: .leading) { Text("Energia").font(.caption.bold()); Text("\(e.value, specifier: "%.0f") \(e.unit)"); if let p = e.projectedValue { Text("Proj. \(p, specifier: "%.0f") \(e.unit)").font(.caption2) } } }.widgetURL(VOLTWidgetConstants.energyURL) } else { Label("Abra o VOLT para sincronizar", systemImage: "bolt.fill") } } }
}
struct VoltLockScreenWidget: Widget { let kind = VOLTWidgetConstants.lockWidgetKind; var body: some WidgetConfiguration { StaticConfiguration(kind: kind, provider: VoltWidgetProvider()) { VoltLockScreenEntryView(entry: $0) }.configurationDisplayName("VOLT na Tela Bloqueada").description("Consumo de energia e progresso da meta.").supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline]) } }

@main struct VOLTWidgetsBundle: WidgetBundle { var body: some Widget { VoltSummaryWidget(); VoltEnergyWidget(); VoltWaterWidget(); VoltReadingWidget(); VoltLockScreenWidget() } }
