package br.com.voltconsumo.app.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], manifest = Config.NONE)
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

    @Test
    fun serializationDropsUnknownSecretsAndNormalizesServiceIdentity() {
        val raw = """{
          "schemaVersion":1,
          "generatedAt":"2026-08-15T23:00:00.123Z",
          "accountLabel":"Casa",
          "accessToken":"must-not-survive",
          "energy":{
            "kind":"forged",
            "unit":"secret",
            "value":218.0,
            "goal":300.0,
            "refreshToken":"must-not-survive"
          }
        }""".trimIndent()
        val sanitized = SnapshotJson.serialize(SnapshotJson.parse(raw))
        assertFalse(sanitized.contains("accessToken"))
        assertFalse(sanitized.contains("refreshToken"))
        assertFalse(sanitized.contains("forged"))
        assertFalse(sanitized.contains("secret"))
        assertTrue(sanitized.contains("\"kind\":\"energy\""))
        assertTrue(sanitized.contains("\"unit\":\"kWh\""))
    }
}
