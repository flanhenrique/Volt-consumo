package br.com.voltconsumo.app.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
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
import androidx.glance.material3.ColorProviders
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import br.com.voltconsumo.app.MainActivity
import java.text.NumberFormat
import java.util.Locale

private enum class WidgetMode { ENERGY, WATER, SUMMARY, READING }

private val COMPACT = DpSize(110.dp, 110.dp)
private val MEDIUM = DpSize(240.dp, 110.dp)
private val LARGE = DpSize(300.dp, 220.dp)

private object VoltWidgetTheme {
    val colors = ColorProviders(
        light = lightColorScheme(
            primary = Color(0xFF00A878),
            onPrimary = Color(0xFFFFFFFF),
            primaryContainer = Color(0xFFD9F5EB),
            onPrimaryContainer = Color(0xFF063D2E),
            secondary = Color(0xFF168BBE),
            onSecondary = Color(0xFFFFFFFF),
            secondaryContainer = Color(0xFFD9F1FB),
            onSecondaryContainer = Color(0xFF07394E),
            tertiary = Color(0xFFD99A16),
            onTertiary = Color(0xFF241800),
            tertiaryContainer = Color(0xFFFFE8B5),
            onTertiaryContainer = Color(0xFF4A3200),
            background = Color(0xFFF5FAF8),
            onBackground = Color(0xFF10221C),
            surface = Color(0xFFF5FAF8),
            onSurface = Color(0xFF10221C),
            surfaceVariant = Color(0xFFEAF4F0),
            onSurfaceVariant = Color(0xFF5C7068),
        ),
        dark = darkColorScheme(
            primary = Color(0xFF39DFA9),
            onPrimary = Color(0xFF06130F),
            primaryContainer = Color(0xFF123E31),
            onPrimaryContainer = Color(0xFFB7F5DF),
            secondary = Color(0xFF64C9F4),
            onSecondary = Color(0xFF04151D),
            secondaryContainer = Color(0xFF153B4B),
            onSecondaryContainer = Color(0xFFC8EEFF),
            tertiary = Color(0xFFFFC95D),
            onTertiary = Color(0xFF241800),
            tertiaryContainer = Color(0xFF4B390D),
            onTertiaryContainer = Color(0xFFFFE8B5),
            background = Color(0xFF06130F),
            onBackground = Color(0xFFF4FFF9),
            surface = Color(0xFF06130F),
            onSurface = Color(0xFFF4FFF9),
            surfaceVariant = Color(0xFF0B1D17),
            onSurfaceVariant = Color(0xFFAFC7BD),
        ),
    )
}

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
            GlanceTheme(colors = VoltWidgetTheme.colors) {
                WidgetSurface {
                    when (mode) {
                        WidgetMode.ENERGY -> ServiceWidgetContent(
                            label = "ENERGIA",
                            service = snapshot.energy,
                            accent = GlanceTheme.colors.tertiary,
                            stale = snapshot.isStale(),
                            openIntent = energy,
                        )
                        WidgetMode.WATER -> ServiceWidgetContent(
                            label = "ÁGUA",
                            service = snapshot.water,
                            accent = GlanceTheme.colors.secondary,
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
            .background(GlanceTheme.colors.surface)
            .padding(14.dp)
    ) {
        content()
    }
}

@Composable
private fun ServiceWidgetContent(
    label: String,
    service: ServiceSnapshot?,
    accent: ColorProvider,
    stale: Boolean,
    openIntent: Intent,
) {
    val size = LocalSize.current
    Text(
        text = label,
        style = TextStyle(
            color = accent,
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
            color = GlanceTheme.colors.onSurface,
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
            color = GlanceTheme.colors.primary,
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
                accent = GlanceTheme.colors.tertiary,
                intent = energyIntent,
                modifier = GlanceModifier.defaultWeight(),
            )
            Spacer(GlanceModifier.width(10.dp))
            SummaryService(
                title = "Água",
                service = snapshot.water,
                accent = GlanceTheme.colors.secondary,
                intent = waterIntent,
                modifier = GlanceModifier.defaultWeight(),
            )
        }
    } else {
        SummaryService("Luz", snapshot.energy, GlanceTheme.colors.tertiary, energyIntent)
        Spacer(GlanceModifier.height(4.dp))
        SummaryService("Água", snapshot.water, GlanceTheme.colors.secondary, waterIntent)
    }

    if (size.height >= 180.dp) {
        snapshot.totalEstimatedCostBRL?.let {
            Spacer(GlanceModifier.height(10.dp))
            Text("Estimativa total", style = secondaryStyle())
            Text(
                formatMoney(it),
                style = TextStyle(
                    color = GlanceTheme.colors.onSurface,
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
    accent: ColorProvider,
    intent: Intent,
    modifier: GlanceModifier = GlanceModifier,
) {
    Column(
        modifier = modifier
            .background(GlanceTheme.colors.surfaceVariant)
            .padding(9.dp)
            .clickable(actionStartActivity(intent))
    ) {
        Text(
            title,
            style = TextStyle(color = accent, fontSize = 11.sp, fontWeight = FontWeight.Bold),
        )
        Text(
            service?.let { "${formatMeasure(it.value)} ${it.unit}" } ?: "—",
            style = TextStyle(
                color = GlanceTheme.colors.onSurface,
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
            color = GlanceTheme.colors.primary,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
        ),
    )
    Spacer(GlanceModifier.height(8.dp))

    if (size.width < 200.dp) {
        ActionCard("+ Nova leitura", "Escolher luz ou água", chooserIntent, GlanceTheme.colors.primary)
        return
    }

    Row(modifier = GlanceModifier.fillMaxWidth()) {
        ActionCard("Leitura de luz", "Energia", energyIntent, GlanceTheme.colors.tertiary, GlanceModifier.defaultWeight())
        Spacer(GlanceModifier.width(10.dp))
        ActionCard("Leitura de água", "Água", waterIntent, GlanceTheme.colors.secondary, GlanceModifier.defaultWeight())
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
    accent: ColorProvider,
    modifier: GlanceModifier = GlanceModifier,
) {
    Column(
        modifier = modifier
            .background(GlanceTheme.colors.surfaceVariant)
            .padding(10.dp)
            .clickable(actionStartActivity(intent))
    ) {
        Text(
            title,
            style = TextStyle(color = accent, fontSize = 14.sp, fontWeight = FontWeight.Bold),
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
            color = GlanceTheme.colors.onSurface,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
        ),
        modifier = GlanceModifier.clickable(actionStartActivity(openIntent)),
    )
    Spacer(GlanceModifier.height(4.dp))
    Text("Sincronize seus dados para ativar o widget.", style = secondaryStyle())
}

@Composable
private fun secondaryStyle() = TextStyle(
    color = GlanceTheme.colors.onSurfaceVariant,
    fontSize = 11.sp,
)

@Composable
private fun warningStyle() = TextStyle(
    color = GlanceTheme.colors.tertiary,
    fontSize = 10.sp,
    fontWeight = FontWeight.Bold,
)

private fun routeIntent(context: Context, route: String): Intent =
    Intent(context, MainActivity::class.java).apply {
        action = Intent.ACTION_VIEW
        data = Uri.parse("volt://$route")
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }

private val ptBr = Locale.forLanguageTag("pt-BR")
private val decimalFormatter: NumberFormat = NumberFormat.getNumberInstance(ptBr).apply {
    maximumFractionDigits = 1
    minimumFractionDigits = 0
}

private val moneyFormatter: NumberFormat = NumberFormat.getCurrencyInstance(ptBr)

private fun formatMeasure(value: Double): String = synchronized(decimalFormatter) { decimalFormatter.format(value) }
private fun formatMoney(value: Double): String = synchronized(moneyFormatter) { moneyFormatter.format(value) }
