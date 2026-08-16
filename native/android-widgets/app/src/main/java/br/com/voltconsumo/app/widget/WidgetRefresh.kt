package br.com.voltconsumo.app.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent

internal object WidgetRefresh {
    private val receivers = listOf(
        EnergyWidgetReceiver::class.java,
        WaterWidgetReceiver::class.java,
        SummaryWidgetReceiver::class.java,
        ReadingWidgetReceiver::class.java,
    )

    fun requestAll(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        receivers.forEach { receiver ->
            val component = ComponentName(context, receiver)
            val ids = manager.getAppWidgetIds(component)
            if (ids.isEmpty()) return@forEach
            context.sendBroadcast(
                Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
                    setComponent(component)
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                }
            )
        }
    }
}
