package com.njarrar.brain.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.DeleteForever
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material.icons.outlined.MarkEmailRead
import androidx.compose.material.icons.outlined.MarkEmailUnread
import androidx.compose.material.icons.outlined.RestoreFromTrash
import androidx.compose.material.icons.outlined.ViewAgenda
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.njarrar.brain.data.Api
import com.njarrar.brain.data.Change
import com.njarrar.brain.data.Dates
import com.njarrar.brain.data.Filter
import com.njarrar.brain.data.Item
import com.njarrar.brain.data.MenuStore
import com.njarrar.brain.data.SignedOutException
import com.njarrar.brain.data.Sources
import com.njarrar.brain.data.Store
import com.njarrar.brain.data.friendly
import com.njarrar.brain.ui.theme.Theme
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

enum class ListMode { Inbox, List, Trash, Search }

/** Room at the bottom of a scrolling screen for the floating tab bar. */
@Composable
fun barSpace(extra: Dp = 100.dp): Dp = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + extra

/** Loads a list of saves page by page and keeps it in step with changes made elsewhere. */
class ItemListModel(start: Filter, private val mode: ListMode) : ViewModel() {
    var filter by mutableStateOf(start)
    val items = mutableStateListOf<Item>()
    var total by mutableIntStateOf(0)
    var loading by mutableStateOf(false)
    var refreshing by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    private var cursor: String? = null
    private var done = false
    private var job: Job? = null
    /** What the list last loaded for, so coming back from an item doesn't reload it. */
    var loadedFor: Pair<Filter, Int>? = null

    init {
        viewModelScope.launch { MenuStore.edits.collect { replace(it) } }
        viewModelScope.launch { MenuStore.purges.collect { drop(it) } }
    }

    fun reload() {
        job?.cancel()
        cursor = null
        done = false
        items.clear()
        job = viewModelScope.launch { load() }
    }

    fun refresh() {
        refreshing = true
        viewModelScope.launch {
            job?.cancel()
            cursor = null
            done = false
            load(replaceAll = true)
            MenuStore.load()
            refreshing = false
        }
    }

    fun loadMore() {
        if (loading || done || cursor == null) return
        job = viewModelScope.launch { load() }
    }

    private suspend fun load(replaceAll: Boolean = false) {
        if (mode == ListMode.Search && filter.q.isNullOrEmpty()) {
            total = 0
            return
        }
        loading = true
        try {
            val page = Api.items(filter, cursor)
            error = null
            page.total?.let { total = it }
            if (replaceAll) items.clear()
            val known = items.map { it.id }.toSet()
            items.addAll(page.items.filter { it.id !in known })
            cursor = page.nextCursor
            done = cursor == null || page.items.isEmpty()
        } catch (e: CancellationException) {
            throw e
        } catch (e: SignedOutException) {
        } catch (e: Exception) {
            error = e.friendly()
        } finally {
            loading = false
        }
    }

    fun set(item: Item, change: Change) {
        viewModelScope.launch {
            try {
                val d = Api.change(item.id, change)
                replace(d.item)
                MenuStore.edited(d.item)
                MenuStore.load()
            } catch (e: Exception) {
                error = e.friendly()
            }
        }
    }

    fun purge(item: Item) {
        viewModelScope.launch {
            try {
                Api.purge(item.id)
                drop(item.id)
                MenuStore.load()
            } catch (e: Exception) {
                error = e.friendly()
            }
        }
    }

    fun emptyTrash() {
        viewModelScope.launch {
            try {
                Api.emptyTrash()
                items.clear()
                total = 0
                MenuStore.load()
            } catch (e: Exception) {
                error = e.friendly()
            }
        }
    }

    private fun drop(id: String) {
        val i = items.indexOfFirst { it.id == id }
        if (i < 0) return
        items.removeAt(i)
        total = maxOf(0, total - 1)
    }

    /** Keeps the list in step with a change, and drops items that no longer belong here. */
    private fun replace(changed: Item) {
        val i = items.indexOfFirst { it.id == changed.id }
        if (i < 0) return
        val f = filter
        val leaves = if (f.view == "trash") {
            !changed.inTrash
        } else {
            changed.inTrash ||
                (f.view == "inbox" && changed.status != "inbox") ||
                (f.view == "all" && changed.status == "archived") ||
                (f.view == "archived" && changed.status != "archived") ||
                (f.unread && !changed.isUnread) ||
                (f.category != null && changed.category != f.category) ||
                (f.tag != null && changed.tags != null && f.tag !in changed.tags)
        }
        if (leaves) {
            drop(changed.id)
        } else {
            val old = items[i]
            items[i] = changed.copy(
                sources = changed.sources ?: old.sources,
                images = changed.images ?: old.images,
                tags = changed.tags ?: old.tags,
                categoryColor = changed.categoryColor ?: old.categoryColor,
            )
        }
    }
}

/**
 * A list of saves: rows grouped by day, swipe left to archive, right to delete, hold for more.
 * The Inbox tab, every list opened from Library, Trash and search results all use it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ItemList(start: Filter, mode: ListMode, key: String? = null) {
    val c = Theme.colors
    val nav = LocalNav.current
    val m: ItemListModel = viewModel(key = key ?: "$mode:$start") { ItemListModel(start, mode) }
    val state = rememberLazyListState()
    var confirmEmpty by remember { mutableStateOf(false) }

    // Search hands in a new query as you type; the same list follows it from the top.
    LaunchedEffect(start) {
        if (mode == ListMode.Search && m.filter != start) {
            m.filter = start
            state.scrollToItem(0)
        }
    }
    LaunchedEffect(m.filter, MenuStore.changed) {
        val wanted = m.filter to MenuStore.changed
        if (m.loadedFor != wanted) {
            m.loadedFor = wanted
            m.reload()
        }
    }
    // The next page, when the last row comes into view.
    val nearEnd by remember {
        derivedStateOf {
            val last = state.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= state.layoutInfo.totalItemsCount - 3
        }
    }
    LaunchedEffect(nearEnd, m.items.size) { if (nearEnd && m.items.isNotEmpty()) m.loadMore() }

    Column(Modifier.fillMaxSize().background(c.bg)) {
        if (mode == ListMode.List || mode == ListMode.Trash) {
            TopBar(onBack = { nav.back() }) {
                if (mode == ListMode.Trash) {
                    TextButton(onClick = { confirmEmpty = true }, enabled = m.total > 0) {
                        Text("Empty", color = if (m.total > 0) c.bad else c.faint, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
        PullToRefreshBox(isRefreshing = m.refreshing, onRefresh = { m.refresh() }, modifier = Modifier.weight(1f)) {
            LazyColumn(
                state = state,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = barSpace(if (mode == ListMode.Search) 90.dp else 100.dp)),
            ) {
                if (mode != ListMode.Search) item(key = "header") { Header(m, mode) }
                m.error?.let { e ->
                    item(key = "error") {
                        Text(e, fontSize = 13.sp, color = c.bad, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
                    }
                }
                if (mode == ListMode.Trash || mode == ListMode.Search) {
                    items(m.items, key = { it.id }) { row -> SwipeRow(row, m, mode) { nav.open(row) } }
                } else {
                    var last: String? = null
                    m.items.forEach { row ->
                        val group = Dates.group(row.date)
                        if (group != last) {
                            last = group
                            item(key = "g:$group:${row.id}") {
                                Text(
                                    group, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = c.soft,
                                    modifier = Modifier.fillMaxWidth().background(c.bg)
                                        .padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 4.dp),
                                )
                            }
                        }
                        item(key = row.id) { SwipeRow(row, m, mode) { nav.open(row) } }
                    }
                }
                item(key = "footer") { Footer(m, mode) }
            }
        }
    }

    if (confirmEmpty) {
        AlertDialog(
            onDismissRequest = { confirmEmpty = false },
            title = { Text("Delete everything in Trash for good?") },
            text = { Text("This can't be undone.") },
            confirmButton = {
                TextButton(onClick = { confirmEmpty = false; m.emptyTrash() }) { Text("Empty Trash", color = c.bad) }
            },
            dismissButton = { TextButton(onClick = { confirmEmpty = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun Header(m: ItemListModel, mode: ListMode) {
    val c = Theme.colors
    val f = m.filter
    Column(
        Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = if (mode == ListMode.Inbox) 8.dp else 0.dp, bottom = 6.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.Bottom) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ScreenTitle(f.title, Modifier.weight(1f, fill = false))
                Text(
                    "%,d".format(m.total), fontSize = 13.sp, fontFamily = FontFamily.Monospace, color = c.faint,
                    modifier = Modifier.padding(bottom = 7.dp),
                )
            }
            if (mode == ListMode.Inbox || mode == ListMode.List) FilterMenu(m)
        }
        if (mode == ListMode.Trash) {
            Text("Swipe left to restore an item, right to delete it forever.", fontSize = 14.sp, color = c.soft)
        }
        if (mode == ListMode.Inbox) {
            // All, Unread, then each source that has saves.
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip("All", on = f.source == null && !f.unread, icon = Icons.Outlined.ViewAgenda) {
                    m.filter = f.copy(source = null, unread = false)
                }
                Chip("Unread", on = f.unread, icon = Icons.Outlined.MarkEmailUnread) { m.filter = f.copy(unread = !f.unread) }
                MenuStore.menu?.sources.orEmpty().filter { it.items > 0 }.forEach { s ->
                    Chip(Sources.label(s.id), on = f.source == s.id, source = s.id) {
                        m.filter = f.copy(source = if (f.source == s.id) null else s.id)
                    }
                }
            }
        }
    }
}

/** Media, language and blur, behind the round filter button. */
@Composable
private fun FilterMenu(m: ItemListModel) {
    val c = Theme.colors
    val f = m.filter
    var open by remember { mutableStateOf(false) }
    val active = f.media != null || f.lang != null
    Box {
        Box(
            Modifier.size(40.dp).clip(CircleShape).background(if (active) c.accentFill else c.fill).clickable { open = true },
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Outlined.FilterList, "Filter", tint = if (active) c.accentInk else c.ink2, modifier = Modifier.size(20.dp))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            MenuCaption("Media")
            Pick("Any", f.media == null) { m.filter = f.copy(media = null) }
            Pick("With pictures", f.media == "with") { m.filter = f.copy(media = "with") }
            Pick("Text only", f.media == "without") { m.filter = f.copy(media = "without") }
            HorizontalDivider(color = c.divider)
            MenuCaption("Language")
            Pick("All languages", f.lang == null) { m.filter = f.copy(lang = null) }
            Pick("English", f.lang == "en") { m.filter = f.copy(lang = "en") }
            Pick("العربية", f.lang == "ar") { m.filter = f.copy(lang = "ar") }
            HorizontalDivider(color = c.divider)
            DropdownMenuItem(
                text = { Text("Blur sensitive pictures") },
                trailingIcon = { Checkbox(checked = Store.blur, onCheckedChange = null) },
                onClick = { Store.saveBlur(!Store.blur) },
            )
        }
    }
}

@Composable
private fun MenuCaption(text: String) {
    Text(text, fontSize = 12.sp, color = Theme.colors.soft, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
}

@Composable
private fun Pick(label: String, on: Boolean, onClick: () -> Unit) {
    DropdownMenuItem(
        text = { Text(label) },
        leadingIcon = { RadioButton(selected = on, onClick = null) },
        onClick = onClick,
    )
}

@Composable
private fun Footer(m: ItemListModel, mode: ListMode) {
    val c = Theme.colors
    val f = m.filter
    if (m.loading && !m.refreshing) {
        Box(Modifier.fillMaxWidth().padding(vertical = 14.dp), contentAlignment = Alignment.Center) { Spinner() }
    } else if (m.items.isEmpty() && m.error == null && !m.loading) {
        val text = when (mode) {
            ListMode.Trash -> "Trash is empty."
            ListMode.Search -> "Nothing found."
            else -> if (f.view == "inbox" && f.source == null && !f.unread) "Your inbox is empty." else "Nothing here yet."
        }
        Text(text, fontSize = 15.sp, color = c.soft, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 40.dp))
    }
}

/** A row that swipes: left archives (or restores from Trash), right deletes. Hold for read, unread and the rest. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
private fun SwipeRow(item: Item, m: ItemListModel, mode: ListMode, onOpen: () -> Unit) {
    val c = Theme.colors
    val trash = mode == ListMode.Trash
    val haptic = LocalHapticFeedback.current
    var menu by remember { mutableStateOf(false) }
    var confirmPurge by remember { mutableStateOf(false) }
    val archived = item.status == "archived"
    val swipe = rememberSwipeToDismissBoxState(
        confirmValueChange = { v ->
            if (v == SwipeToDismissBoxValue.EndToStart) {
                if (trash) {
                    m.set(item, Change(trash = false))
                } else {
                    haptic.confirm()
                    m.set(item, Change(status = if (archived) "inbox" else "archived"))
                }
            } else if (v == SwipeToDismissBoxValue.StartToEnd) {
                if (trash) {
                    confirmPurge = true
                } else {
                    haptic.confirm()
                    m.set(item, Change(trash = true))
                }
            }
            // Snap back; the row leaves the list once the server agrees.
            false
        },
    )
    SwipeToDismissBox(
        state = swipe,
        backgroundContent = {
            val toStart = swipe.dismissDirection == SwipeToDismissBoxValue.EndToStart
            val (color, icon, label) = when {
                toStart && trash -> Triple(c.accentFill, Icons.Outlined.RestoreFromTrash, "Restore")
                toStart -> Triple(c.accentFill, if (archived) Icons.Outlined.Inbox else Icons.Outlined.Archive, if (archived) "Inbox" else "Archive")
                trash -> Triple(c.bad, Icons.Outlined.DeleteForever, "Delete forever")
                else -> Triple(c.bad, Icons.Outlined.Delete, "Delete")
            }
            SwipeBack(color, icon, label, if (toStart) Alignment.CenterEnd else Alignment.CenterStart)
        },
    ) {
        Box {
            ItemRow(
                item, blur = Store.blur, trash = trash,
                modifier = Modifier.combinedClickable(onClick = onOpen, onLongClick = { menu = true }),
            )
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                if (trash) {
                    MenuItem("Restore", Icons.Outlined.RestoreFromTrash) { menu = false; m.set(item, Change(trash = false)) }
                    MenuItem("Delete forever", Icons.Outlined.DeleteForever, c.bad) { menu = false; confirmPurge = true }
                } else {
                    MenuItem(if (item.isUnread) "Mark read" else "Mark unread", if (item.isUnread) Icons.Outlined.MarkEmailRead else Icons.Outlined.MarkEmailUnread) {
                        menu = false
                        m.set(item, Change(read = item.isUnread))
                    }
                    if (archived) {
                        MenuItem("Move to Inbox", Icons.Outlined.Inbox) { menu = false; m.set(item, Change(status = "inbox")) }
                    } else {
                        MenuItem("Archive", Icons.Outlined.Archive) { menu = false; haptic.confirm(); m.set(item, Change(status = "archived")) }
                    }
                    MenuItem("Delete", Icons.Outlined.Delete, c.bad) { menu = false; haptic.confirm(); m.set(item, Change(trash = true)) }
                }
            }
        }
    }
    if (confirmPurge) {
        AlertDialog(
            onDismissRequest = { confirmPurge = false },
            title = { Text("Delete this for good?") },
            text = { Text("This can't be undone.") },
            confirmButton = { TextButton(onClick = { confirmPurge = false; haptic.confirm(); m.purge(item) }) { Text("Delete forever", color = c.bad) } },
            dismissButton = { TextButton(onClick = { confirmPurge = false }) { Text("Cancel") } },
        )
    }
}

@Composable
fun MenuItem(label: String, icon: ImageVector, color: Color = Theme.colors.ink, onClick: () -> Unit) {
    DropdownMenuItem(
        text = { Text(label, color = color) },
        leadingIcon = { Icon(icon, null, tint = color) },
        onClick = onClick,
    )
}

@Composable
private fun SwipeBack(color: Color, icon: ImageVector, label: String, align: Alignment) {
    Box(Modifier.fillMaxSize().background(color).padding(horizontal = 22.dp), contentAlignment = align) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, null, tint = Color.White)
            Text(label, fontSize = 11.sp, color = Color.White, fontWeight = FontWeight.Medium)
        }
    }
}

/** One row: source tile, the unread dot and author, time, two lines of text, an optional picture, and the category. */
@Composable
fun ItemRow(item: Item, blur: Boolean, trash: Boolean = false, modifier: Modifier = Modifier) {
    val c = Theme.colors
    val hidden = blur && item.isSensitive
    Column(modifier.fillMaxWidth().background(c.bg)) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            SourceTile(item.sourceKey)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (item.isUnread && !trash) {
                        UnreadDot()
                        Spacer(Modifier.width(6.dp))
                    }
                    Text(
                        item.author ?: Sources.label(item.sourceKey), fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                        color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        Dates.row(if (trash) Dates.parse(item.deletedAt) else item.date),
                        fontSize = 12.sp, fontFamily = FontFamily.Monospace, color = c.faint,
                    )
                }
                Text(
                    item.mainText, fontSize = 15.sp, lineHeight = if (item.isArabic) 23.sp else 20.sp, color = c.ink2,
                    maxLines = 2, overflow = TextOverflow.Ellipsis,
                    textAlign = if (item.isArabic) TextAlign.End else TextAlign.Start,
                    modifier = Modifier.fillMaxWidth().hidden(hidden, 5.dp),
                )
                item.pictures.firstOrNull()?.let { picture ->
                    AsyncImage(
                        model = picture, contentDescription = null, contentScale = ContentScale.Crop,
                        modifier = Modifier.padding(top = 4.dp, bottom = 2.dp).fillMaxWidth().aspectRatio(3f / 2f)
                            .clip(RoundedCornerShape(12.dp)).background(c.raised).hidden(hidden, 18.dp),
                    )
                }
                if (trash) {
                    Text("Deleted from ${if (item.status == "archived") "Archive" else "Inbox"}", fontSize = 12.5.sp, color = c.soft)
                } else if (item.category != null) {
                    CategoryLabel(item.category, item.categoryColor)
                }
            }
        }
        RowDivider(start = 64.dp)
    }
}
