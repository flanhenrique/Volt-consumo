import Foundation
import Testing
@testable import VoltWidgetCore

@Test func roundTripPreservesSnapshot() throws { let original = VoltWidgetFixtures.demo; let data = try VoltWidgetSnapshotCodec.encode(original); #expect(try VoltWidgetSnapshotCodec.decode(data) == original) }
@Test func rejectsUnknownSchema() throws { let data = try VoltWidgetSnapshotCodec.encoder().encode(VoltWidgetSnapshot(schemaVersion: 99)); #expect(throws: VoltWidgetSnapshotError.unsupportedSchema(99)) { try VoltWidgetSnapshotCodec.decode(data) } }
@Test func goalToneBoundariesAreStable() { #expect(VoltServiceSnapshot(kind: .energy, value: 84, unit: "kWh", goal: 100).goalTone == .good); #expect(VoltServiceSnapshot(kind: .energy, value: 95, unit: "kWh", goal: 100).goalTone == .attention); #expect(VoltServiceSnapshot(kind: .energy, value: 101, unit: "kWh", goal: 100).goalTone == .danger) }
@Test func projectionUsesExplicitProjectedValueFirst() { let result = VoltWidgetProjection(service: VoltServiceSnapshot(kind: .water, value: 8, unit: "m³", projectedValue: 11, dailyAverage: 0.2, cycleTotalDays: 30)); #expect(result.value == 11); #expect(result.isEstimated) }
@Test func freshnessThresholds() { let now = Date(timeIntervalSince1970: 10_000); #expect(VoltWidgetFreshness.evaluate(snapshotDate: now.addingTimeInterval(-3_000), now: now) == .fresh); #expect(VoltWidgetFreshness.evaluate(snapshotDate: now.addingTimeInterval(-7_200), now: now) == .stale); #expect(VoltWidgetFreshness.evaluate(snapshotDate: now.addingTimeInterval(-90_000), now: now) == .expired) }
@Test func decodesJavaScriptISODateWithMilliseconds() throws { let json = #"{"schemaVersion":1,"generatedAt":"2026-08-15T17:00:00.000Z","accountLabel":null,"energy":null,"water":null,"tariffFlagLabel":null,"totalEstimatedCostBRL":null,"accent":"emerald","preferredTheme":"system"}"#; #expect(try VoltWidgetSnapshotCodec.decode(Data(json.utf8)).schemaVersion == 1) }
