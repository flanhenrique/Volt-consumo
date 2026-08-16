package br.com.voltconsumo.app.widget

import android.content.Context
import org.json.JSONObject

internal object SnapshotStore {
    private const val PREFS = "volt_widget_snapshot"
    private const val KEY_JSON = "snapshot_json"

    fun read(context: Context): WidgetSnapshot =
        SnapshotJson.parse(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_JSON, null))

    fun writeMessage(context: Context, message: String) {
        val json = runCatching { JSONObject(message) }.getOrNull() ?: return
        if (json.optString("command") == "clear") {
            clear(context)
            return
        }
        if (json.optInt("schemaVersion", 0) != 1) return

        val sanitized = SnapshotJson.serialize(SnapshotJson.parse(message))
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_JSON, sanitized)
            .apply()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_JSON)
            .apply()
    }
}
