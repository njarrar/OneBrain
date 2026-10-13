package com.njarrar.brain.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import com.njarrar.brain.data.Mode
import com.njarrar.brain.data.Store
import kotlin.math.atan2
import kotlin.math.cbrt
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin

/** Brain's colours, each with a light and a dark value. Same as the iPhone's default Brain look. */
@Immutable
data class BrainColors(
    val bg: Color,
    /** The page behind grouped rows (Library, Settings). */
    val grouped: Color,
    val card: Color,
    val raised: Color,
    /** Search fields, chips, round buttons and source tiles. */
    val fill: Color,
    val line: Color,
    /** Lines between rows. */
    val divider: Color,
    val lineStrong: Color,
    val ink: Color,
    /** Body text. */
    val ink2: Color,
    val soft: Color,
    val faint: Color,
    val chevron: Color,
    /** The picked part of a segmented control. */
    val selected: Color,
    /** Links and accent text. */
    val accent: Color,
    /** Filled buttons, switches and the focus colour. */
    val accentFill: Color,
    /** Text on accentFill. */
    val accentInk: Color,
    val accentBG: Color,
    val ok: Color,
    val bad: Color,
    val dark: Boolean,
)

private fun hex(s: String): Color = Color(android.graphics.Color.parseColor(s))

val LightColors = BrainColors(
    bg = hex("#FFFFFF"), grouped = hex("#F4F5F7"), card = hex("#FFFFFF"), raised = hex("#F0F2F4"),
    fill = hex("#F1F3F5"), line = hex("#E7E9EC"), divider = hex("#EEF0F2"), lineStrong = hex("#CFD4DA"),
    ink = hex("#16191D"), ink2 = hex("#2E343B"), soft = hex("#5C6570"), faint = hex("#6B7480"),
    chevron = hex("#9AA0A8"), selected = hex("#FFFFFF"), accent = hex("#0068AD"), accentFill = hex("#0077BD"),
    accentInk = hex("#FFFFFF"), accentBG = hex("#0077BD").copy(alpha = 0.12f), ok = hex("#047857"), bad = hex("#D73337"),
    dark = false,
)

val DarkColors = BrainColors(
    bg = hex("#0E1013"), grouped = hex("#0E1013"), card = hex("#15181C"), raised = hex("#15181C"),
    fill = hex("#1D2127"), line = hex("#23272E"), divider = hex("#23272E"), lineStrong = hex("#23272E"),
    ink = hex("#E9ECEF"), ink2 = hex("#E9ECEF"), soft = hex("#9AA3AE"), faint = hex("#7C8591"),
    chevron = hex("#7C8591"), selected = hex("#2A2F37"), accent = hex("#64C4F0"), accentFill = hex("#64C4F0"),
    accentInk = hex("#07121A"), accentBG = hex("#64C4F0").copy(alpha = 0.14f), ok = hex("#34D399"), bad = hex("#F47A79"),
    dark = true,
)

val LocalColors = staticCompositionLocalOf { LightColors }

object Theme {
    val colors: BrainColors
        @Composable @ReadOnlyComposable get() = LocalColors.current

    /** A category's small square: its own hue at one lightness and strength, as in the design. */
    fun swatch(code: String?, fallback: Color): Color {
        if (code == null || !code.startsWith("#") || code.length != 7) return fallback
        val base = runCatching { hex(code) }.getOrNull() ?: return fallback
        val h = OKLab.hue(base) ?: return base
        return OKLab.color(0.62, 0.09, h)
    }
}

/** Whether the app is dark now: the picked mode, or the phone's when System. */
@Composable
fun isDark(): Boolean = when (Store.mode) {
    Mode.Light -> false
    Mode.Dark -> true
    Mode.System -> isSystemInDarkTheme()
}

@Composable
fun BrainTheme(content: @Composable () -> Unit) {
    val dark = isDark()
    val c = if (dark) DarkColors else LightColors
    val scheme = if (dark) {
        darkColorScheme(
            primary = c.accentFill, onPrimary = c.accentInk, secondary = c.accent, onSecondary = c.accentInk,
            background = c.bg, onBackground = c.ink, surface = c.bg, onSurface = c.ink,
            surfaceVariant = c.fill, onSurfaceVariant = c.soft, surfaceContainer = c.card,
            surfaceContainerHigh = c.card, surfaceContainerHighest = c.fill, surfaceContainerLow = c.bg,
            outline = c.lineStrong, outlineVariant = c.line, error = c.bad, secondaryContainer = c.accentBG,
            onSecondaryContainer = c.accent,
        )
    } else {
        lightColorScheme(
            primary = c.accentFill, onPrimary = c.accentInk, secondary = c.accent, onSecondary = c.accentInk,
            background = c.bg, onBackground = c.ink, surface = c.bg, onSurface = c.ink,
            surfaceVariant = c.fill, onSurfaceVariant = c.soft, surfaceContainer = c.card,
            surfaceContainerHigh = c.card, surfaceContainerHighest = c.fill, surfaceContainerLow = c.bg,
            outline = c.lineStrong, outlineVariant = c.line, error = c.bad, secondaryContainer = c.accentBG,
            onSecondaryContainer = c.accent,
        )
    }
    CompositionLocalProvider(LocalColors provides c) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}

/** Just enough OKLab to give every category the same lightness and strength. */
private object OKLab {
    private fun lin(c: Double) = if (c <= 0.04045) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
    private fun gam(c: Double) = if (c <= 0.0031308) 12.92 * c else 1.055 * c.pow(1 / 2.4) - 0.055

    fun hue(color: Color): Double? {
        val r = lin(color.red.toDouble())
        val g = lin(color.green.toDouble())
        val b = lin(color.blue.toDouble())
        val l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
        val m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
        val s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
        val a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
        val bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
        if (a * a + bb * bb < 1e-6) return null
        return atan2(bb, a)
    }

    fun color(lightness: Double, chroma: Double, hue: Double): Color {
        val a = chroma * cos(hue)
        val b = chroma * sin(hue)
        val l = (lightness + 0.3963377774 * a + 0.2158037573 * b).pow(3)
        val m = (lightness - 0.1055613458 * a - 0.0638541728 * b).pow(3)
        val s = (lightness - 0.0894841775 * a - 1.2914855480 * b).pow(3)
        val r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
        val g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
        val bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
        fun ch(x: Double) = gam(x).coerceIn(0.0, 1.0).toFloat()
        return Color(ch(r), ch(g), ch(bl))
    }
}

/** Dark or light status and navigation bar icons, to match the picked look rather than the phone's. */
@Composable
fun SystemBars() {
    val view = androidx.compose.ui.platform.LocalView.current
    val dark = isDark()
    if (!view.isInEditMode) {
        androidx.compose.runtime.SideEffect {
            val window = (view.context as? android.app.Activity)?.window ?: return@SideEffect
            val bars = androidx.core.view.WindowCompat.getInsetsController(window, view)
            bars.isAppearanceLightStatusBars = !dark
            bars.isAppearanceLightNavigationBars = !dark
        }
    }
}
