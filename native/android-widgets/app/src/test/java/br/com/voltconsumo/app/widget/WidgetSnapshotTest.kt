package br.com.voltconsumo.app.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetSnapshotTest {
    @Test
    fun computesGoalPercent() {
        val energy = ServiceSnapshot(
            kind = "energy",
            value = 218.0,
            unit = "kWh",
            goal = 300.0,
            projectedValue = 286.0,
            estimatedCostBRL = 221.7,
            dailyAverage = null,
            cycleElapsedDays = null,
            cycleTotalDays = null,
            lastReadingAt = null,
        )
        assertEquals(72, energy.goalPercent)
    }

    @Test
    fun staleStateAcceptsIsoWithMilliseconds() {
        val snapshot = WidgetSnapshot(generatedAt = "2026-08-15T10:00:00.123Z")
        val now = 1_786_838_400_123L
        assertTrue(snapshot.isStale(nowMillis = now, maxAgeHours = 1))
        assertFalse(snapshot.isStale(nowMillis = now, maxAgeHours = 100_000))
    }
}
