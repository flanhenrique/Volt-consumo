package br.com.voltconsumo.app.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import br.com.voltconsumo.app.MainActivity
import br.com.voltconsumo.app.R
import java.text.NumberFormat
import java.util.Locale

private enum class WidgetMode { ENERGY, WATER, SUMMARY, READING }

private val COMPACT = DpSize(110.dp, 110.dp)
private val MEDIUM = DpSize(240.dp, 110.dp)
private val LARGE = DpSize(300.dp, 220.dp)

private abstract class VoltBaseWidget(
    private val mode: WidgetMode,
) : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Responsive(setOf(COMPACT, MEDIUM, LARGE))

    override suspend fun provideGlance(context: Context, id: androidx.glance.GlanceId) {
        val snapshot = SnapshotStore.read(context)
        val home = routeIntent(context, "home")
        val energy = routeIntent(context, "consumption/energy")
        val water = routeIntent(context, "consumption/water")
        val reading = routeIntent(context, "reading")
        val readingEnergy = routeIntent(context, "reading/energy")
        val readingWater = routeIntent(context, "reading/water")

        provideContent {
            WidgetSurface {
                when (mode) {
                    WidgetMode.ENERGY -> ServiceWidgetContent(
                        label = "ENERGIA",
                        service = snapshot.energy,
                        accent = R.color.volt_energy,
                        stale = snapshot.isStale(),
                        openIntent = energy,
                    )
                    WidgetMode.WATER -> ServiceWidgetContent(
                        label = "ÁGUA",
                        service = snapshot.water,
                        accent = R.color.volt_water,
                        stale = snapshot.isStale(),
                        openIntent = water,
                    )
                    WidgetMode.SUMMARY -> SummaryWidgetContent(snapshot, home, energy, water)
                    WidgetMode.READING -> ReadingWidgetContent(reading, readingEnergy, readingWater)
                }
            }
        }
    }
}

private class EnergyWidget : VoltBaseWidget(WidgetMode.ENERGY)
private class WaterWidget : VoltBaseWidget(WidgetMode.WATER)
private class SummaryWidget : VoltBaseWidget(WidgetMode.SUMMARY)
private class ReadingWidget : VoltBaseWidget(WidgetMode.READING)

class EnergyWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = EnergyWidget()
}

class WaterWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = WaterWidget()
}

class SummaryWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = SummaryWidget()
}

class ReadingWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = ReadingWidget()
}

@Composable
private fun WidgetSurface(content: @Composable () -> Unit) {
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(R.color.volt_widget_surface)
            .padding(14.dp)
    ) {
        content()
    }
}

@Composable
private fun ServiceWidgetContent(
    label: String,
    service: ServiceSnapshot?,
    accent: Int,
    stale: Boolean,
    openIntent: Intent,
) {
    val size = LocalSize.current
    Text(
        text = label,
        style = TextStyle(
            color = ColorProvider(accent),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
        ),
    )
    Spacer(GlanceModifier.height(6.dp))

    if (service == null) {
        EmptyState(openIntent)
        return
    }

    Text(
        text = "${formatMeasure(service.value)} ${service.unit}",
        style = TextStyle(
            color = ColorProvider(R.color.volt_text_primary),
            fontSize = if (size.width >= 220.dp) 25.sp else 21.sp,
            fontWeight = FontWeight.Bold,
        ),
        modifier = GlanceModifier.clickable(actionStartActivity(openIntent)),
    )
    Spacer(GlanceModifier.height(4.dp))
    Text(
        text = service.goalPercent?.let { "Meta $it%" } ?: "Meta não definida",
        style = secondaryStyle(),
    )

    if (size.width >= 220.dp) {
        service.projectedValue?.let {
            Spacer(GlanceModifier.height(5.dp))
            Text("Projeção ${formatMeasure(it)} ${service.unit}", style = secondaryStyle())
        }
        service.estimatedCostBRL?.let {
            Spacer(GlanceModifier.height(3.dp))
            Text("Estimativa ${formatMoney(it)}", style = secondaryStyle())
        }
    }

    if (stale && size.height >= 105.dp) {
        Spacer(GlanceModifier.height(5.dp))
        Text("Atualização pendente", style = warningStyle())
    }
}

@Composable
private fun SummaryWidgetContent(
    snapshot: WidgetSnapshot,
    homeIntent: Intent,
    energyIntent: Intent,
    waterIntent: Intent,
) {
    val size = LocalSize.current
    Text(
        "VOLT · RESUMO",
        style = TextStyle(
            color = ColorProvider(R.color.volt_accent),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
        ),
        modifier = GlanceModifier.clickable(actionStartActivity(homeIntent)),
    )
    Spacer(GlanceModifier.height(7.dp))

    if (snapshot.energy == null && snapshot.water == null) {
        EmptyState(homeIntent)
        return
    }

    if (size.width >= 220.dp) {
        Row(modifier = GlanceModifier.fillMaxWidth()) {
            SummaryService(
                title = "Luz",
                service = snapshot.energy,
                accent = R.color.volt_energy,
                intent = energyIntent,
                modifier = GlanceModifier.defaultWeight(),
            )
            Spacer(GlanceModifier.width(10.dp))
            SummaryService(
                title = "Água",
                service = snapshot.water,
                accent = R.color.volt_water,
                intent = waterIntent,
                modifier = GlanceModifier.defaultWeight(),
            )
        }
    } else {
        SummaryService("Luz", snapshot.energy, R.color.volt_energy, energyIntent)
        Spacer(GlanceModifier.height(4.dp))
        SummaryService("Água", snapshot.water, R.color.volt_water, waterIntent)
    }

    if (size.height >= 180.dp) {
        snapshot.totalEstimatedCostBRL?.let {
            Spacer(GlanceModifier.height(10.dp))
            Text("Estimativa total", style = secondaryStyle())
            Text(
                formatMoney(it),
                style = TextStyle(
                    color = ColorProvider(R.color.volt_text_primary),
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                ),
            )
        }
        snapshot.tariffFlagLabel?.let {
            Spacer(GlanceModifier.height(5.dp))
            Text("Bandeira $it", style = secondaryStyle())
        }
    }

    if (snapshot.isStale()) {
        Spacer(GlanceModifier.height(5.dp))
        Text("Atualização pendente", style = warningStyle())
    }
}

@Composable
private fun SummaryService(
    title: String,
    service: ServiceSnapshot?,
    accent: Int,
    intent: Intent,
    modifier: GlanceModifier = GlanceModifier,
) {
    Column(
        modifier = modifier
            .background(R.color.volt_widget_surface_alt)
            .padding(9.dp)
            .clickable(actionStartActivity(intent))
    ) {
        Text(
            title,
            style = TextStyle(color = ColorProvider(accent), fontSize = 11.sp, fontWeight = FontWeight.Bold),
        )
        Text(
            service?.let { "${formatMeasure(it.value)} ${it.unit}" } ?: "—",
            style = TextStyle(
                color = ColorProvider(R.color.volt_text_primary),
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
            ),
        )
        service?.goalPercent?.let { Text("Meta $it%", style = secondaryStyle()) }
    }
}

@Composable
private fun ReadingWidgetContent(
    chooserIntent: Intent,
    energyIntent: Intent,
    waterIntent: Intent,
) {
    val size = LocalSize.current
    Text(
        "+ LEITURA",
        style = TextStyle(
            color = ColorProvider(R.color.volt_accent),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
        ),
    )
    Spacer(GlanceModifier.height(8.dp))

    if (size.width < 200.dp) {
        ActionCard("+ Nova leitura", "Escolher luz ou água", chooserIntent, R.color.volt_accent)
        return
    }

    Row(modifier = GlanceModifier.fillMaxWidth()) {
        ActionCard("Leitura de luz", "Energia", energyIntent, R.color.volt_energy, GlanceModifier.defaultWeight())
        Spacer(GlanceModifier.width(10.dp))
        ActionCard("Leitura de água", "Água", waterIntent, R.color.volt_water, GlanceModifier.defaultWeight())
    }

    if (size.height >= 180.dp) {
        Spacer(GlanceModifier.height(10.dp))
        Text("Toque em uma opção para abrir diretamente o campo de leitura no VOLT.", style = secondaryStyle())
    }
}

@Composable
private fun ActionCard(
    title: String,
    subtitle: String,
    intent: Intent,
    accent: Int,
    modifier: GlanceModifier = GlanceModifier,
) {
    Column(
        modifier = modifier
            .background(R.color.volt_widget_surface_alt)
            .padding(10.dp)
            .clickable(actionStartActivity(intent))
    ) {
        Text(
            title,
            style = TextStyle(color = ColorProvider(accent), fontSize = 14.sp, fontWeight = FontWeight.Bold),
        )
        Spacer(GlanceModifier.height(3.dp))
        Text(subtitle, style = secondaryStyle())
    }
}

@Composable
private fun EmptyState(openIntent: Intent) {
    Text(
        "Abra o VOLT",
        style = TextStyle(
            color = ColorProvider(R.color.volt_text_primary),
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
        ),
        modifier = GlanceModifier.clickable(actionStartActivity(openIntent)),
    )
    Spacer(GlanceModifier.height(4.dp))
    Text("Sincronize seus dados para ativar o widget.", style = secondaryStyle())
}

private fun secondaryStyle() = TextStyle(
    color = ColorProvider(R.color.volt_text_secondary),
    fontSize = 11.sp,
)

private fun warningStyle() = TextStyle(
    color = ColorProvider(R.color.volt_energy),
    fontSize = 10.sp,
    fontWeight = FontWeight.Bold,
)

private fun routeIntent(context: Context, route: String): Intent =
    Intent(context, MainActivity::class.java).apply {
        action = Intent.ACTION_VIEW
        data = Uri.parse("volt://$route")
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }

private val decimalFormatter: NumberFormat = NumberFormat.getNumberInstance(Locale("pt", "BR")).apply {
    maximumFractionDigits = 1
    minimumFractionDigits = 0
}

private val moneyFormatter: NumberFormat = NumberFormat.getCurrencyInstance(Locale("pt", "BR"))

private fun formatMeasure(value: Double): String = synchronized(decimalFormatter) { decimalFormatter.format(value) }
private fun formatMoney(value: Double): String = synchronized(moneyFormatter) { moneyFormatter.format(value) }
