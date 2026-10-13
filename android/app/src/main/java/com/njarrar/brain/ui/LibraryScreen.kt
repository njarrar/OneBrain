package com.njarrar.brain.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.MarkEmailUnread
import androidx.compose.material.icons.outlined.Newspaper
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Tag
import androidx.compose.material.icons.outlined.ViewAgenda
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.njarrar.brain.data.Filter
import com.njarrar.brain.data.MenuData
import com.njarrar.brain.data.MenuStore
import com.njarrar.brain.data.Sources
import com.njarrar.brain.ui.theme.Theme

private fun count(n: Int?) = n?.let { "%,d".format(it) }

/** Resurface and the digest, the views, categories and sources, each with its count. The gear opens Settings. */
@Composable
fun LibraryScreen() {
    val c = Theme.colors
    val nav = LocalNav.current
    val menu = MenuStore.menu
    Column(
        Modifier.fillMaxSize().background(c.grouped).verticalScroll(rememberScrollState())
            .padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = barSpace(110.dp)),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 6.dp)) {
            ScreenTitle("Library", Modifier.weight(1f))
            Box(
                Modifier.size(40.dp).clip(CircleShape).background(c.card).clickable { nav.go(SettingsRoute) },
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Outlined.Settings, "Settings", tint = c.ink2, modifier = Modifier.size(21.dp)) }
        }
        if (menu == null) {
            Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) { Spinner() }
            return@Column
        }
        Memory(menu)
        Views(menu)
        if (menu.categories.isNotEmpty()) {
            GroupCaption("Categories")
            GroupBox {
                menu.categories.forEachIndexed { i, cat ->
                    GroupRow(
                        cat.name, count(cat.count), divider = i < menu.categories.size - 1, minHeight = 44.dp, labelLines = 2,
                        onClick = { nav.list(Filter(view = "all", category = cat.name)) },
                    ) { Box(Modifier.padding(horizontal = 5.dp)) { Swatch(cat.color, 10.dp) } }
                }
            }
        }
        val sources = menu.sources.filter { it.items > 0 }
        if (sources.isNotEmpty()) {
            GroupCaption("Sources")
            GroupBox {
                sources.forEachIndexed { i, s ->
                    GroupRow(
                        Sources.label(s.id), count(s.items), divider = i < sources.size - 1, minHeight = 44.dp,
                        onClick = { nav.list(Filter(view = "all", source = s.id)) },
                    ) { Box(Modifier.size(20.dp), contentAlignment = Alignment.Center) { SourceMark(s.id, 18.dp) } }
                }
            }
        }
    }
}

@Composable
private fun RowIcon(icon: ImageVector, accent: Boolean = false) {
    Icon(icon, null, tint = if (accent) Theme.colors.accent else Theme.colors.ink2, modifier = Modifier.size(20.dp))
}

/** Resurface and the weekly digest, at the top so the daily cards are one tap away. */
@Composable
private fun Memory(menu: MenuData) {
    val nav = LocalNav.current
    val due = menu.views.resurface ?: 0
    GroupBox {
        GroupRow("Resurface", if (due > 0) "$due today" else null, onClick = { nav.go(ResurfaceRoute) }) {
            RowIcon(Icons.Outlined.AutoAwesome, accent = true)
        }
        GroupRow("Weekly digest", divider = false, onClick = { nav.go(DigestRoute) }) { RowIcon(Icons.Outlined.Newspaper) }
    }
}

@Composable
private fun Views(menu: MenuData) {
    val nav = LocalNav.current
    val v = menu.views
    val rows: List<Triple<String, ImageVector, Pair<Int?, Any>>> = listOf(
        Triple("Unread", Icons.Outlined.MarkEmailUnread, v.unread to Filter(unread = true)),
        Triple("All saves", Icons.Outlined.ViewAgenda, v.all to Filter(view = "all")),
        Triple("Archive", Icons.Outlined.Archive, v.archived to Filter(view = "archived")),
        Triple("Trash", Icons.Outlined.Delete, v.trash to TrashRoute),
        Triple("Tags", Icons.Outlined.Tag, menu.tags.size to TagsRoute),
    )
    GroupBox {
        rows.forEachIndexed { i, (label, icon, target) ->
            GroupRow(label, count(target.first), divider = i < rows.size - 1, onClick = { nav.go(target.second) }) { RowIcon(icon) }
        }
    }
}

/** Every tag with its count. */
@Composable
fun TagsScreen() {
    val c = Theme.colors
    val nav = LocalNav.current
    var search by remember { mutableStateOf("") }
    val tags = MenuStore.menu?.tags.orEmpty().filter { search.isEmpty() || it.name.contains(search, ignoreCase = true) }
    Column(Modifier.fillMaxSize().background(c.grouped)) {
        TopBar("Tags", onBack = { nav.back() })
        Row(
            Modifier.padding(horizontal = 16.dp).fillMaxWidth().heightIn(min = 40.dp).clip(RoundedCornerShape(12.dp)).background(c.fill)
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(Icons.Outlined.Search, null, tint = c.faint, modifier = Modifier.size(20.dp))
            BasicTextField(
                value = search, onValueChange = { search = it }, singleLine = true,
                textStyle = TextStyle(fontSize = 16.sp, color = c.ink), cursorBrush = SolidColor(c.accentFill),
                modifier = Modifier.weight(1f),
                decorationBox = { inner ->
                    Box {
                        if (search.isEmpty()) Text("Find a tag", fontSize = 16.sp, color = c.faint)
                        inner()
                    }
                },
            )
        }
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = barSpace(90.dp))) {
            itemsIndexed(tags, key = { _, t -> t.name }) { i, t ->
                val shape = RoundedCornerShape(
                    topStart = if (i == 0) 16.dp else 0.dp, topEnd = if (i == 0) 16.dp else 0.dp,
                    bottomStart = if (i == tags.size - 1) 16.dp else 0.dp, bottomEnd = if (i == tags.size - 1) 16.dp else 0.dp,
                )
                Box(Modifier.clip(shape).background(c.card)) {
                    GroupRow(
                        "#${t.name}", count(t.count), divider = i < tags.size - 1, minHeight = 44.dp,
                        onClick = { nav.list(Filter(view = "all", tag = t.name)) },
                    )
                }
            }
        }
    }
}
