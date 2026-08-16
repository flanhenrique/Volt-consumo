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
            if (json.optInt("schemaVersion", 0) != 1) return WidgetSnapshot()
            WidgetSnapshot(
                schemaVersion = 1,
                generatedAt = json.optNullableString("generatedAt", 64),
                accountLabel = json.optNullableString("accountLabel", 120),
                energy = json.optJSONObject("energy")?.toService("energy"),
                water = json.optJSONObject("water")?.toService("water"),
                tariffFlagLabel = json.optNullableString("tariffFlagLabel", 64),
                totalEstimatedCostBRL = json.optNullableDouble("totalEstimatedCostBRL")?.takeIf { it >= 0 },
                accent = json.optNullableString("accent", 24) ?: "emerald",
                preferredTheme = json.optNullableString("preferredTheme", 16) ?: "system",
            )
        }.getOrDefault(WidgetSnapshot())
    }

    fun serialize(snapshot: WidgetSnapshot): String = JSONObject().apply {
        put("schemaVersion", 1)
        putNullable("generatedAt", snapshot.generatedAt?.take(64))
        putNullable("accountLabel", snapshot.accountLabel?.take(120))
        put("energy", snapshot.energy?.toJson() ?: JSONObject.NULL)
        put("water", snapshot.water?.toJson() ?: JSONObject.NULL)
        putNullable("tariffFlagLabel", snapshot.tariffFlagLabel?.take(64))
        putNullable("totalEstimatedCostBRL", snapshot.totalEstimatedCostBRL?.takeIf { it.isFinite() && it >= 0 })
        put("accent", snapshot.accent.take(24))
        put("preferredTheme", snapshot.preferredTheme.take(16))
    }.toString()

    private fun JSONObject.toService(fallbackKind: String): ServiceSnapshot? {
        if (!has("value") || isNull("value")) return null
        val value = optDouble("value", Double.NaN)
        if (!value.isFinite() || value < 0) return null
        return ServiceSnapshot(
            kind = fallbackKind,
            value = value,
            unit = if (fallbackKind == "energy") "kWh" else "m³",
            goal = optNullableDouble("goal")?.takeIf { it > 0 },
            projectedValue = optNullableDouble("projectedValue")?.takeIf { it >= 0 },
            estimatedCostBRL = optNullableDouble("estimatedCostBRL")?.takeIf { it >= 0 },
            dailyAverage = optNullableDouble("dailyAverage")?.takeIf { it >= 0 },
            cycleElapsedDays = optNullableInt("cycleElapsedDays")?.takeIf { it >= 0 },
            cycleTotalDays = optNullableInt("cycleTotalDays")?.takeIf { it >= 0 },
            lastReadingAt = optNullableString("lastReadingAt", 64),
        )
    }

    private fun ServiceSnapshot.toJson(): JSONObject = JSONObject().apply {
        put("kind", kind)
        put("value", value)
        put("unit", unit)
        putNullable("goal", goal)
        putNullable("projectedValue", projectedValue)
        putNullable("estimatedCostBRL", estimatedCostBRL)
        putNullable("dailyAverage", dailyAverage)
        putNullable("cycleElapsedDays", cycleElapsedDays)
        putNullable("cycleTotalDays", cycleTotalDays)
        putNullable("lastReadingAt", lastReadingAt?.take(64))
    }

    private fun JSONObject.putNullable(key: String, value: Any?) {
        put(key, value ?: JSONObject.NULL)
    }

    private fun JSONObject.optNullableString(key: String, maxLength: Int): String? =
        if (!has(key) || isNull(key)) null else optString(key).trim().takeIf { it.isNotBlank() }?.take(maxLength)

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
