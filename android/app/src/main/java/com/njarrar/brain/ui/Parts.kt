package com.njarrar.brain.ui

import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PlayCircle
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.RssFeed
import androidx.compose.material.icons.outlined.Tag
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.njarrar.brain.R
import com.njarrar.brain.ui.theme.Theme

/** A Material icon for each source. X, YouTube and Instagram use their own marks (see SourceMark). */
fun sourceIcon(id: String): ImageVector = when (id) {
    "photos" -> Icons.Outlined.PhoneAndroid
    "feedly" -> Icons.Outlined.RssFeed
    "image" -> Icons.Outlined.Image
    "note", "file" -> Icons.Outlined.Description
    "video", "youtube" -> Icons.Outlined.PlayCircle
    "instagram" -> Icons.Outlined.PhotoCamera
    "x" -> Icons.Outlined.Close
    "audio" -> Icons.Outlined.Mic
    "gmail", "outlook", "email" -> Icons.Outlined.Email
    "pinterest", "pin" -> Icons.Outlined.PushPin
    else -> Icons.Outlined.Link
}

/** A source's mark: the X, YouTube and Instagram logos, a Material icon for the rest. */
@Composable
fun SourceMark(source: String, size: Dp = 18.dp, tint: Color = Theme.colors.ink2) {
    val mark = when (source) {
        "x" -> R.drawable.mark_x to 0.82f
        "youtube" -> R.drawable.mark_youtube to 1f
        "instagram" -> R.drawable.mark_instagram to 0.95f
        else -> null
    }
    if (mark != null) {
        Icon(painterResource(mark.first), contentDescription = null, tint = tint, modifier = Modifier.size(size * mark.second))
    } else {
        Icon(sourceIcon(source), contentDescription = null, tint = tint, modifier = Modifier.size(size))
    }
}

/** The 36 dp rounded tile at the start of a row, with the unread dot on its corner. */
@Composable
fun SourceTile(source: String, unread: Boolean = false) {
    val c = Theme.colors
    Box {
        Box(
            Modifier.size(36.dp).background(c.fill, RoundedCornerShape(10.dp)),
            contentAlignment = Alignment.Center,
        ) { SourceMark(source) }
        if (unread) {
            Box(
                Modifier.align(Alignment.TopEnd).offset(x = 3.dp, y = (-3).dp).size(11.dp)
                    .background(c.bg, CircleShape).padding(2.dp).background(c.accentFill, CircleShape),
            )
        }
    }
}

/** A category's small square. */
@Composable
fun Swatch(color: String?, size: Dp = 8.dp) {
    Box(Modifier.size(size).background(Theme.swatch(color, Theme.colors.faint), RoundedCornerShape(2.dp)))
}

/** A category's square and name. */
@Composable
fun CategoryLabel(name: String, color: String?) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        Swatch(color, 7.dp)
        Text(name, fontSize = 12.5.sp, color = Theme.colors.soft, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** A pill chip, 32 dp tall. On: accent tint. */
@Composable
fun Chip(
    label: String,
    on: Boolean = false,
    icon: ImageVector? = null,
    source: String? = null,
    onClick: () -> Unit,
) {
    val c = Theme.colors
    val ink = if (on) c.accent else c.ink2
    Row(
        Modifier.height(32.dp).clip(CircleShape).background(if (on) c.accentBG else c.fill).clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (source != null) SourceMark(source, 15.dp, ink)
        else if (icon != null) Icon(icon, null, tint = ink, modifier = Modifier.size(16.dp))
        Text(label, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = ink, maxLines = 1)
    }
}

/** A 44 dp round button on the fill colour. */
@Composable
fun RoundIcon(icon: ImageVector, label: String, on: Boolean = false, enabled: Boolean = true, size: Dp = 44.dp, onClick: () -> Unit) {
    val c = Theme.colors
    Box(
        Modifier.size(size).clip(CircleShape).background(if (on) c.accentFill else c.fill)
            .clickable(enabled = enabled, onClick = onClick).alpha(if (enabled) 1f else 0.4f),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = label, tint = if (on) c.accentInk else c.ink2, modifier = Modifier.size(size * 0.45f))
    }
}

/** Grouped rows in one rounded box, as in Library and Settings. */
@Composable
fun GroupBox(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Theme.colors.card), content = content)
}

/** Rows in a box with a thin border, as on an item's page. */
@Composable
fun OutlineBox(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).border(1.dp, Theme.colors.line, RoundedCornerShape(12.dp)),
        content = content,
    )
}

/** Section caption above a group of rows. */
@Composable
fun GroupCaption(text: String) {
    Text(
        text, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Theme.colors.soft,
        modifier = Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 10.dp, bottom = 6.dp),
    )
}

@Composable
fun RowDivider(start: Dp = 0.dp) {
    Box(Modifier.fillMaxWidth().padding(start = start).height(1.dp).background(Theme.colors.divider))
}

/** A row inside a group box: icon, label, trailing value, chevron. */
@Composable
fun GroupRow(
    label: String,
    value: String? = null,
    mono: Boolean = true,
    chevron: Boolean = true,
    divider: Boolean = true,
    minHeight: Dp = 48.dp,
    labelColor: Color = Theme.colors.ink,
    onClick: (() -> Unit)? = null,
    leading: (@Composable () -> Unit)? = null,
) {
    val c = Theme.colors
    Column {
        Row(
            Modifier.fillMaxWidth().heightIn(min = minHeight)
                .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            leading?.invoke()
            Text(label, fontSize = 16.sp, color = labelColor, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            if (value != null) {
                Text(
                    value, color = c.faint, maxLines = 1,
                    fontSize = if (mono) 13.sp else 14.sp,
                    fontFamily = if (mono) FontFamily.Monospace else FontFamily.Default,
                )
            }
            if (chevron) Chevron()
        }
        if (divider) RowDivider()
    }
}

@Composable
fun Chevron() {
    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Theme.colors.chevron, modifier = Modifier.size(20.dp))
}

/** The big title at the top of a tab. */
@Composable
fun ScreenTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text, fontSize = 32.sp, fontWeight = FontWeight.Bold, color = Theme.colors.ink, letterSpacing = (-0.3).sp,
        maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = modifier,
    )
}

/** The bar on a pushed screen: back, a small title, and actions on the right. */
@Composable
fun TopBar(title: String = "", onBack: () -> Unit, actions: @Composable RowScope.() -> Unit = {}) {
    val c = Theme.colors
    Row(Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = c.accent) }
        Text(
            title, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = c.ink, maxLines = 1,
            overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(horizontal = 4.dp),
        )
        actions()
    }
}

/** "Let AI sort" and "Add tags", shared by the Add sheet and Save to Brain. */
@Composable
fun CaptureChips(sort: Boolean, onSort: (Boolean) -> Unit, tagging: Boolean, onTagging: (Boolean) -> Unit) {
    val c = Theme.colors
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.height(34.dp).clip(CircleShape).background(c.fill).clickable { onSort(!sort) }.padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(Icons.Outlined.AutoAwesome, null, tint = if (sort) c.accent else c.faint, modifier = Modifier.size(16.dp))
            Text(
                "Let AI sort", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = if (sort) c.ink else c.soft,
                textDecoration = if (sort) null else TextDecoration.LineThrough,
            )
        }
        Row(
            Modifier.height(34.dp).clip(CircleShape).background(if (tagging) c.accentBG else c.fill).clickable { onTagging(!tagging) }
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(Icons.Outlined.Tag, null, tint = if (tagging) c.accent else c.soft, modifier = Modifier.size(16.dp))
            Text(
                "Add tags", fontSize = 14.sp, fontWeight = if (tagging) FontWeight.Medium else FontWeight.Normal,
                color = if (tagging) c.accent else c.soft,
            )
        }
    }
}

/** A row of choices with the picked one raised, like the iPhone's segmented control. */
@Composable
fun <T> Segmented(options: List<T>, selected: T, label: (T) -> String, icon: ((T) -> ImageVector)? = null, onSelect: (T) -> Unit) {
    val c = Theme.colors
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.card)
            .border(1.dp, c.line, RoundedCornerShape(12.dp)).padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        options.forEach { o ->
            val on = o == selected
            Row(
                Modifier.weight(1f).heightIn(min = 36.dp).clip(RoundedCornerShape(9.dp))
                    .background(if (on) c.selected else Color.Transparent)
                    .then(if (on && !c.dark) Modifier.border(1.dp, c.line, RoundedCornerShape(9.dp)) else Modifier)
                    .clickable { onSelect(o) },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                if (icon != null) {
                    Icon(icon(o), null, tint = if (on) c.ink else c.soft, modifier = Modifier.size(17.dp))
                    Spacer(Modifier.width(7.dp))
                }
                Text(
                    label(o), fontSize = 15.sp, color = if (on) c.ink else c.soft,
                    fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium, maxLines = 1,
                )
            }
        }
    }
}

/** A small spinner in the soft colour. */
@Composable
fun Spinner(size: Dp = 22.dp, color: Color = Theme.colors.soft) {
    CircularProgressIndicator(Modifier.size(size), color = color, strokeWidth = 2.dp)
}

/** Hides sensitive text or pictures: a blur on Android 12 and later, faded out before. */
fun Modifier.hidden(on: Boolean, radius: Dp): Modifier = when {
    !on -> this
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> this.blur(radius)
    else -> this.alpha(0.06f)
}

/** A dashed rounded border, for the AI's suggested tags. */
fun Modifier.dashedBorder(color: Color, radius: Dp): Modifier = drawBehind {
    val r = radius.toPx()
    drawRoundRect(
        color = color,
        cornerRadius = CornerRadius(r, r),
        style = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 2.dp.toPx()))),
    )
}
