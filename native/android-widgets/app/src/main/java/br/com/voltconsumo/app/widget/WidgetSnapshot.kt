package br.com.voltconsumo.app.widget

import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

internal data class ServiceSnapshot(
    val kind: String,
    val value: Double,
    val unit: String,
    val goal: Double?,
    val projectedValue: Double?,
    val estimatedCostBRL: Double?,
    val dailyAverage: Double?,
    val cycleElapsedDays: Int?,
    val cycleTotalDays: Int?,
    val lastReadingAt: String?,
) {
    val goalPercent: Int?
        get() = goal?.takeIf { it > 0 }?.let { ((value / it) * 100.0).toInt().coerceAtLeast(0) }
}

internal data class WidgetSnapshot(
    val schemaVersion: Int = 1,
    val generatedAt: String? = null,
    val accountLabel: String? = null,
    val energy: ServiceSnapshot? = null,
    val water: ServiceSnapshot? = null,
    val tariffFlagLabel: String? = null,
    val totalEstimatedCostBRL: Double? = null,
    val accent: String = "emerald",
    val preferredTheme: String = "system",
) {
    fun isStale(nowMillis: Long = System.currentTimeMillis(), maxAgeHours: Long = 12): Boolean {
        val generatedMillis = generatedAt?.let(::parseIsoMillis) ?: return false
        return nowMillis - generatedMillis > maxAgeHours * 60L * 60L * 1000L
    }
}

internal object SnapshotJson {
    fun parse(raw: String?): WidgetSnapshot {
        if (raw.isNullOrBlank()) return WidgetSnapshot()
        return runCatching {
            val json = JSONObject(raw)
            WidgetSnapshot(
                schemaVersion = json.optInt("schemaVersion", 1),
                generatedAt = json.optNullableString("generatedAt"),
                accountLabel = json.optNullableString("accountLabel"),
                energy = json.optJSONObject("energy")?.toService("energy"),
                water = json.optJSONObject("water")?.toService("water"),
                tariffFlagLabel = json.optNullableString("tariffFlagLabel"),
                totalEstimatedCostBRL = json.optNullableDouble("totalEstimatedCostBRL"),
                accent = json.optNullableString("accent") ?: "emerald",
                preferredTheme = json.optNullableString("preferredTheme") ?: "system",
            )
        }.getOrDefault(WidgetSnapshot())
    }

    private fun JSONObject.toService(fallbackKind: String): ServiceSnapshot? {
        if (!has("value") || isNull("value")) return null
        val value = optDouble("value", Double.NaN)
        if (!value.isFinite() || value < 0) return null
        return ServiceSnapshot(
            kind = optNullableString("kind") ?: fallbackKind,
            value = value,
            unit = optNullableString("unit") ?: if (fallbackKind == "energy") "kWh" else "m³",
            goal = optNullableDouble("goal")?.takeIf { it > 0 },
            projectedValue = optNullableDouble("projectedValue"),
            estimatedCostBRL = optNullableDouble("estimatedCostBRL"),
            dailyAverage = optNullableDouble("dailyAverage"),
            cycleElapsedDays = optNullableInt("cycleElapsedDays"),
            cycleTotalDays = optNullableInt("cycleTotalDays"),
            lastReadingAt = optNullableString("lastReadingAt"),
        )
    }

    private fun JSONObject.optNullableString(key: String): String? =
        if (!has(key) || isNull(key)) null else optString(key).takeIf { it.isNotBlank() }

    private fun JSONObject.optNullableDouble(key: String): Double? {
        if (!has(key) || isNull(key)) return null
        val value = optDouble(key, Double.NaN)
        return value.takeIf { it.isFinite() }
    }

    private fun JSONObject.optNullableInt(key: String): Int? =
        if (!has(key) || isNull(key)) null else optInt(key)
}

private fun parseIsoMillis(value: String): Long? {
    val patterns = listOf(
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
    )
    return patterns.firstNotNullOfOrNull { pattern ->
        runCatching {
            SimpleDateFormat(pattern, Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
                isLenient = false
            }.parse(value)?.time
        }.getOrNull()
    }
}
