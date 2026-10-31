package com.njarrar.brain.ui

import android.content.Intent
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Notes
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.DeleteForever
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.MarkEmailRead
import androidx.compose.material.icons.outlined.MarkEmailUnread
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.RecordVoiceOver
import androidx.compose.material.icons.outlined.RestoreFromTrash
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.automirrored.outlined.TextSnippet
import androidx.compose.material.icons.outlined.Weekend
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.njarrar.brain.data.Api
import com.njarrar.brain.data.Change
import com.njarrar.brain.data.Dates
import com.njarrar.brain.data.Facts
import com.njarrar.brain.data.Item
import com.njarrar.brain.data.KeptWhy
import com.njarrar.brain.data.ItemDetail
import com.njarrar.brain.data.MenuStore
import com.njarrar.brain.data.SignedOutException
import com.njarrar.brain.data.Sources
import com.njarrar.brain.data.Store
import com.njarrar.brain.data.friendly
import com.njarrar.brain.data.parseTags
import com.njarrar.brain.ui.theme.Theme
import kotlinx.coroutines.launch
import java.time.Instant

/** One save, loaded with its tags, files, sources and related saves. */
class ItemModel(private val id: String) : ViewModel() {
    var detail by mutableStateOf<ItemDetail?>(null)
    val related = mutableStateListOf<Item>()
    var error by mutableStateOf<String?>(null)
    var note by mutableStateOf("")
    private var loaded = false

    val preview: Item? get() = MenuStore.previews[id]
    val item: Item? get() = detail?.item ?: preview

    fun load() {
        if (loaded) return
        loaded = true
        viewModelScope.launch {
            try {
                val d = Api.item(id)
                detail = d
                note = d.item.note.orEmpty()
                // Opening a save reads it.
                if (d.item.isUnread) change(Change(read = true))
                if (!d.item.inTrash) {
                    related.clear()
                    related.addAll(runCatching { Api.related(id) }.getOrDefault(emptyList()))
                }
            } catch (_: SignedOutException) {
            } catch (e: Exception) {
                error = e.friendly()
            }
        }
    }

    suspend fun change(c: Change, keepNote: Boolean = false): Boolean = try {
        val d = Api.change(id, c)
        detail = d
        if (!keepNote) note = d.item.note.orEmpty()
        error = null
        MenuStore.edited(d.item)
        MenuStore.load()
        true
    } catch (e: Exception) {
        error = e.friendly()
        false
    }

    fun set(c: Change, after: () -> Unit = {}) {
        viewModelScope.launch { if (change(c)) after() }
    }

    fun setWhy(why: KeptWhy?) {
        viewModelScope.launch {
            try {
                Api.keptWhy(id, why)
                val d = Api.item(id)
                detail = d
                MenuStore.edited(d.item)
                error = null
            } catch (e: Exception) {
                error = e.friendly()
            }
        }
    }

    fun saveNote() {
        val d = detail ?: return
        if (note == d.item.note.orEmpty()) return
        viewModelScope.launch { change(Change(note = note), keepNote = true) }
    }

    fun reread() {
        viewModelScope.launch {
            try {
                val d = Api.reread(id)
                detail = d
                error = null
                MenuStore.edited(d.item)
            } catch (e: Exception) {
                error = e.friendly()
            }
        }
    }

    fun purge(after: () -> Unit) {
        viewModelScope.launch {
            try {
                Api.purge(id)
                MenuStore.purged(id)
                MenuStore.load()
                after()
            } catch (e: Exception) {
                error = e.friendly()
            }
        }
    }
}

/** One save: author, text, pictures, voice memo, what was said, summary, then note, category, tags and source. */
@Composable
fun ItemScreen(id: String) {
    val c = Theme.colors
    val nav = LocalNav.current
    val m: ItemModel = viewModel { ItemModel(id) }
    var reveal by remember { mutableStateOf(false) }
    var confirmPurge by remember { mutableStateOf(false) }
    var confirmTrash by remember { mutableStateOf(false) }
    val haptic = LocalHapticFeedback.current
    LaunchedEffect(id) { m.load() }

    val item = m.item
    if (item == null) {
        Column(Modifier.fillMaxSize().background(c.bg)) {
            TopBar(onBack = { nav.back() })
            Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                m.error?.let { Text(it, color = c.bad, fontSize = 13.sp) } ?: Spinner()
            }
        }
        return
    }
    val hidden = Store.blur && item.isSensitive && !reveal
    val detail = m.detail
    val heard = detail?.sounds?.isNotEmpty() == true || item.kind == "audio" || item.kind == "video"

    Box(Modifier.fillMaxSize().background(c.bg)) {
        Column(Modifier.fillMaxSize()) {
            TopBar(onBack = { nav.back() }) { TopActions(item, m) }
            Column(
                Modifier.weight(1f).imePadding().verticalScroll(rememberScrollState())
                    .padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 110.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                Author(item)
                Body(item)
                Pictures(item, hidden) { reveal = true }
                detail?.sounds?.forEach { VoicePlayer(it) }
                item.facts?.takeIf { !it.isEmpty }?.let { FactsCard(it) }
                if (!item.transcript.isNullOrEmpty() || detail?.textError != null || detail?.sounds?.isNotEmpty() == true) {
                    TranscriptCard(item, heard, detail?.textError) { m.reread() }
                }
                item.summary?.takeIf { it.isNotEmpty() }?.let { SummaryCard(it) }
                m.error?.let { Text(it, fontSize = 13.sp, color = c.bad) }
                Details(item, detail, m)
                if (m.related.isNotEmpty()) {
                    Column {
                        GroupCaption("Related in your Brain")
                        OutlineBox { m.related.forEach { MiniItemRow(it) } }
                    }
                }
            }
        }
        Toolbar(item, m, onTrash = { confirmTrash = true }, onPurge = { confirmPurge = true }, modifier = Modifier.align(Alignment.BottomCenter))
    }

    if (confirmPurge) {
        AlertDialog(
            onDismissRequest = { confirmPurge = false },
            title = { Text("Delete this for good?") },
            text = { Text("This can't be undone.") },
            confirmButton = {
                TextButton(onClick = { confirmPurge = false; haptic.confirm(); m.purge { nav.back() } }) { Text("Delete forever", color = c.bad) }
            },
            dismissButton = { TextButton(onClick = { confirmPurge = false }) { Text("Cancel") } },
        )
    }
    if (confirmTrash) {
        AlertDialog(
            onDismissRequest = { confirmTrash = false },
            title = { Text("Move this to Trash?") },
            confirmButton = {
                TextButton(onClick = {
                    confirmTrash = false
                    haptic.confirm()
                    m.set(Change(trash = true)) { nav.back() }
                }) { Text("Delete", color = c.bad) }
            },
            dismissButton = { TextButton(onClick = { confirmTrash = false }) { Text("Cancel") } },
        )
    }
}

/** Share and More, at the top right. Remind me lives in More. */
@Composable
private fun TopActions(item: Item, m: ItemModel) {
    val c = Theme.colors
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    var more by remember { mutableStateOf(false) }
    var remind by remember { mutableStateOf(false) }
    item.url?.let { link ->
        IconButton(onClick = {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, link)
            context.startActivity(Intent.createChooser(send, null))
        }) { Icon(Icons.Outlined.Share, "Share", tint = c.ink2) }
    }
    Box {
        IconButton(onClick = { more = true }) { Icon(Icons.Outlined.MoreVert, "More", tint = c.ink2) }
        DropdownMenu(expanded = more, onDismissRequest = { more = false }) {
            if (!item.inTrash) {
                val due = Dates.parse(item.remindAt)
                MenuItem(
                    if (due == null) "Remind me…" else "Reminder set…",
                    if (due == null) Icons.Outlined.Notifications else Icons.Filled.Notifications,
                    if (due == null) c.ink else c.accent,
                ) { more = false; remind = true }
            }
            item.url?.let { link ->
                MenuItem("Copy link", Icons.Outlined.Link) { more = false; clipboard.setText(AnnotatedString(link)) }
            }
            MenuItem("Copy text", Icons.Outlined.ContentCopy) {
                more = false
                clipboard.setText(AnnotatedString(item.body ?: item.mainText))
            }
            if (!item.inTrash) {
                MenuItem("Read again", Icons.Outlined.AutoAwesome) { more = false; m.reread() }
            }
            if (item.status != "inbox" && !item.inTrash) {
                MenuItem("Move to Inbox", Icons.Outlined.Inbox) { more = false; m.set(Change(status = "inbox")) }
            }
        }
        if (!item.inTrash) RemindMenu(item, m, open = remind, onClose = { remind = false })
    }
}

/** Remind me, opened from More: when this save should come back in Resurface. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RemindMenu(item: Item, m: ItemModel, open: Boolean, onClose: () -> Unit) {
    val c = Theme.colors
    val haptic = LocalHapticFeedback.current
    val due = Dates.parse(item.remindAt)
    var picking by remember { mutableStateOf(false) }
    fun remind(at: Instant) {
        onClose()
        m.set(Change(remindAt = at)) { haptic.confirm() }
    }
    DropdownMenu(expanded = open, onDismissRequest = onClose) {
        if (due != null) {
            Text(
                "Comes back ${Dates.longDay(due)}", fontSize = 13.sp, color = c.soft,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            HorizontalDivider(color = c.divider)
        }
        MenuItem("Tomorrow", Icons.Outlined.WbSunny) { remind(Dates.inDays(1)) }
        MenuItem("This weekend", Icons.Outlined.Weekend) { remind(Dates.weekend()) }
        MenuItem("Next week", Icons.Outlined.Event) { remind(Dates.inDays(7)) }
        MenuItem("Next month", Icons.Outlined.CalendarMonth) { remind(Dates.inDays(30)) }
        MenuItem("Pick a day…", Icons.Outlined.CalendarMonth) { onClose(); picking = true }
        if (due != null) {
            MenuItem("Don't remind me", Icons.Outlined.NotificationsOff, c.bad) {
                onClose()
                m.set(Change(clearReminder = true))
            }
        }
    }
    if (picking) {
        val today = Dates.todayUtcMillis()
        val state = rememberDatePickerState(
            initialSelectedDateMillis = today + 7L * 86_400_000L,
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis >= today
            },
        )
        DatePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(onClick = {
                    picking = false
                    state.selectedDateMillis?.let { m.set(Change(remindAt = Dates.morning(Dates.pickedDay(it)))) { haptic.confirm() } }
                }) { Text("Set") }
            },
            dismissButton = { TextButton(onClick = { picking = false }) { Text("Cancel") } },
        ) {
            DatePicker(state = state, title = { Text("Remind me on", modifier = Modifier.padding(start = 24.dp, top = 16.dp)) })
        }
    }
}

@Composable
private fun Author(item: Item) {
    val c = Theme.colors
    val name = item.author ?: Sources.label(item.sourceKey)
    val initial = (item.author ?: item.authorHandle ?: Sources.label(item.sourceKey)).trim('@', ' ').take(1).uppercase()
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(40.dp).background(c.fill, CircleShape), contentAlignment = Alignment.Center) {
            Text(initial, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = c.ink)
        }
        Column(Modifier.weight(1f)) {
            Text(name, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(item.authorHandle, Dates.short(item.date)).filter { it.isNotEmpty() }.joinToString("  "),
                fontSize = 12.sp, fontFamily = FontFamily.Monospace, color = c.faint, maxLines = 1,
            )
        }
        SourceMark(item.sourceKey, 17.dp, c.faint)
    }
}

@Composable
private fun Body(item: Item) {
    val c = Theme.colors
    val align = if (item.isArabic) TextAlign.End else TextAlign.Start
    val title = item.title.orEmpty()
    val body = item.body.orEmpty()
    SelectionContainer {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (title.isNotEmpty()) {
                Text(
                    title, fontSize = 19.sp, fontWeight = if (body.isNotEmpty()) FontWeight.SemiBold else FontWeight.Normal,
                    lineHeight = if (item.isArabic) 33.sp else 28.sp, color = c.ink, textAlign = align, modifier = Modifier.fillMaxWidth(),
                )
            }
            if (body.isNotEmpty()) {
                Text(
                    body, fontSize = if (title.isNotEmpty()) 16.sp else 19.sp, lineHeight = if (item.isArabic) 30.sp else 25.sp,
                    color = if (title.isNotEmpty()) c.ink2 else c.ink, textAlign = align, modifier = Modifier.fillMaxWidth(),
                )
            }
            if (title.isEmpty() && body.isEmpty()) {
                item.url?.let { Text(it, fontSize = 17.sp, color = c.accent, maxLines = 3, overflow = TextOverflow.Ellipsis) }
            }
        }
    }
}

/** The first picture at 16:10; the rest keep their own shape. */
@Composable
private fun Pictures(item: Item, hidden: Boolean, onReveal: () -> Unit) {
    val c = Theme.colors
    item.pictures.forEachIndexed { i, url ->
        Box(contentAlignment = Alignment.Center) {
            AsyncImage(
                model = url, contentDescription = null,
                contentScale = if (i == 0) ContentScale.Crop else ContentScale.FillWidth,
                modifier = Modifier.fillMaxWidth()
                    .then(if (i == 0) Modifier.aspectRatio(16f / 10f) else Modifier.heightIn(min = 120.dp))
                    .clip(RoundedCornerShape(16.dp)).background(c.raised).hidden(hidden, 22.dp),
            )
            if (hidden && i == 0) {
                Text(
                    "Show picture", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Color.White,
                    modifier = Modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.5f)).clickable(onClick = onReveal)
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun Card(icon: ImageVector, title: String, action: (@Composable () -> Unit)? = null, content: @Composable () -> Unit) {
    val c = Theme.colors
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.fill).padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(icon, null, tint = c.accent, modifier = Modifier.size(16.dp))
            Text(title, fontSize = 12.5.sp, fontWeight = FontWeight.Medium, color = c.soft, modifier = Modifier.weight(1f))
            action?.invoke()
        }
        content()
    }
}

/** The people and dates the AI found, so a birthday in a voice memo is plain to see. */
@Composable
private fun FactsCard(facts: Facts) {
    val c = Theme.colors
    Card(Icons.Outlined.Person, "What Brain found") {
        facts.dates.forEach { d ->
            Row(verticalAlignment = Alignment.Top) {
                Text(
                    listOfNotNull(d.person, d.what).joinToString(": "), fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                    color = c.ink, modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                Text(Facts.dayLabel(d.date) + if (d.yearly) ", yearly" else "", fontSize = 14.sp, color = c.ink2)
            }
        }
        facts.people.forEach { p ->
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = c.ink)) { append(p.name) }
                    if (p.about.isNotEmpty()) withStyle(SpanStyle(color = c.ink2)) { append("  " + p.about) }
                },
                fontSize = 15.sp,
            )
        }
    }
}

/** What was said in a voice memo or video, or the text in a picture, with Read again. */
@Composable
private fun TranscriptCard(item: Item, heard: Boolean, textError: String?, onReread: () -> Unit) {
    val c = Theme.colors
    Card(
        if (heard) Icons.Outlined.RecordVoiceOver else Icons.AutoMirrored.Outlined.TextSnippet,
        if (heard) "What was said" else "Text in the picture",
        action = {
            Text(
                "Read again", fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, color = c.accent,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).clickable(onClick = onReread).padding(4.dp),
            )
        },
    ) {
        val t = item.transcript.orEmpty()
        when {
            t.isNotEmpty() -> SelectionContainer {
                Text(
                    t, fontSize = 15.sp, lineHeight = 21.sp, color = c.ink2,
                    textAlign = if (item.isArabic) TextAlign.End else TextAlign.Start, modifier = Modifier.fillMaxWidth(),
                )
            }
            textError != null -> Text("Brain couldn't read this: $textError", fontSize = 13.sp, color = c.bad)
            else -> Text("Brain is still listening to this one.", fontSize = 13.sp, color = c.faint)
        }
    }
}

@Composable
private fun SummaryCard(summary: String) {
    Card(Icons.Outlined.AutoAwesome, "Summary") {
        Text(summary, fontSize = 15.sp, lineHeight = 21.sp, color = Theme.colors.ink2)
    }
}

/** Note, category, tags and where it was saved from, in one outlined group. */
@Composable
private fun Details(item: Item, detail: ItemDetail?, m: ItemModel) {
    OutlineBox {
        NoteRow(m)
        RowDivider()
        WhyRow(item, m)
        RowDivider()
        CategoryRow(item, m)
        RowDivider()
        TagsRow(detail, m)
        detail?.saves?.forEach { s ->
            RowDivider()
            SavedRow(s)
        }
    }
}

@Composable
private fun NoteRow(m: ItemModel) {
    val c = Theme.colors
    val focus = LocalFocusManager.current
    var focused by remember { mutableStateOf(false) }
    val saved = m.detail?.item?.note.orEmpty()
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icons.AutoMirrored.Outlined.Notes, null, tint = c.accent, modifier = Modifier.size(18.dp))
        BasicTextField(
            value = m.note,
            onValueChange = { m.note = it },
            textStyle = TextStyle(fontSize = 15.sp, color = c.ink),
            cursorBrush = SolidColor(c.accentFill),
            maxLines = 8,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { focus.clearFocus() }),
            modifier = Modifier.weight(1f).onFocusChanged {
                // Leaving the field saves the note.
                if (focused && !it.isFocused) m.saveNote()
                focused = it.isFocused
            },
            decorationBox = { inner ->
                Box {
                    if (m.note.isEmpty()) Text("Add a note", fontSize = 15.sp, color = c.soft)
                    inner()
                }
            },
        )
        if (focused || m.note != saved) {
            Text(
                "Save", fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                color = if (m.note != saved) c.accent else c.faint,
                modifier = Modifier.clickable(enabled = m.note != saved) { m.saveNote(); focus.clearFocus() },
            )
        } else if (saved.isNotEmpty()) {
            Text("Saved", fontSize = 12.sp, color = c.faint)
        }
    }
}

/** Why it was kept. Ask Brain, the digest and the podcast read it. */
@Composable
private fun WhyRow(item: Item, m: ItemModel) {
    val c = Theme.colors
    var open by remember { mutableStateOf(false) }
    val now = KeptWhy.of(item.keptWhy)
    Box {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { open = true }.padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("Kept", fontSize = 15.sp, color = c.soft, modifier = Modifier.width(78.dp))
            Text(now?.label ?: "Why did you keep it?", fontSize = 15.sp, color = if (now != null) c.ink else c.faint, maxLines = 1, modifier = Modifier.weight(1f))
            Chevron()
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            if (now != null) {
                DropdownMenuItem(text = { Text("Not said", color = c.soft) }, onClick = { open = false; m.setWhy(null) })
            }
            KeptWhy.entries.forEach { w ->
                DropdownMenuItem(
                    text = { Text(w.label) },
                    trailingIcon = { if (w == now) Icon(Icons.Outlined.Check, null, tint = c.accent) },
                    onClick = { open = false; m.setWhy(w) },
                )
            }
        }
    }
}

@Composable
private fun CategoryRow(item: Item, m: ItemModel) {
    val c = Theme.colors
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { open = true }.padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("Category", fontSize = 15.sp, color = c.soft, modifier = Modifier.width(78.dp))
            if (item.category != null) {
                Swatch(item.categoryColor)
                Text(item.category, fontSize = 15.sp, color = c.ink, maxLines = 1, modifier = Modifier.weight(1f))
            } else {
                Text("Pick one", fontSize = 15.sp, color = c.faint, modifier = Modifier.weight(1f))
            }
            Chevron()
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            if (item.category != null) {
                DropdownMenuItem(
                    text = { Text("No category", color = c.soft) },
                    onClick = { open = false; m.set(Change(clearCategory = true)) },
                )
            }
            MenuStore.menu?.categories.orEmpty().forEach { cat ->
                DropdownMenuItem(
                    text = { Text(cat.name) },
                    leadingIcon = { Swatch(cat.color, 10.dp) },
                    trailingIcon = { if (cat.name == item.category) Icon(Icons.Outlined.Check, null, tint = c.accent) },
                    onClick = { open = false; m.set(Change(category = cat.name)) },
                )
            }
        }
    }
}

/** Solid tags are yours; dashed ones are the AI's suggestions. Tap a dashed tag to keep it; hold any tag to remove it. */
@OptIn(ExperimentalLayoutApi::class, ExperimentalFoundationApi::class)
@Composable
private fun TagsRow(detail: ItemDetail?, m: ItemModel) {
    val c = Theme.colors
    val haptic = LocalHapticFeedback.current
    var adding by remember { mutableStateOf(false) }
    var text by remember { mutableStateOf("") }
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 14.dp, vertical = 10.dp)) {
        Text("Tags", fontSize = 15.sp, color = c.soft, modifier = Modifier.width(78.dp).padding(top = 4.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            detail?.tags.orEmpty().forEach { t ->
                val suggested = t.addedBy != "user"
                var menu by remember(t.name) { mutableStateOf(false) }
                Box {
                    Text(
                        "#${t.name}", fontSize = 14.sp, color = if (suggested) c.soft else c.ink,
                        modifier = Modifier.heightIn(min = 28.dp).clip(RoundedCornerShape(6.dp))
                            .then(if (suggested) Modifier.dashedBorder(c.lineStrong, 6.dp) else Modifier.background(c.raised))
                            .combinedClickable(
                                onClick = { if (suggested) m.set(Change(addTags = listOf(t.name))) { haptic.confirm() } },
                                onLongClick = { menu = true },
                            )
                            .padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        if (suggested) MenuItem("Keep tag", Icons.Outlined.Check) { menu = false; m.set(Change(addTags = listOf(t.name))) { haptic.confirm() } }
                        MenuItem("Remove tag", Icons.Outlined.Close, c.bad) { menu = false; m.set(Change(removeTags = listOf(t.name))) }
                    }
                }
            }
            Box(
                Modifier.size(28.dp).clip(RoundedCornerShape(6.dp)).background(c.fill).clickable { adding = true },
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Outlined.Add, "Add a tag", tint = c.soft, modifier = Modifier.size(16.dp)) }
        }
    }
    if (adding) {
        AlertDialog(
            onDismissRequest = { adding = false; text = "" },
            title = { Text("Add a tag") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Split more than one with commas.", fontSize = 14.sp, color = c.soft)
                    OutlinedTextField(value = text, onValueChange = { text = it }, singleLine = true, placeholder = { Text("Tag") })
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val tags = parseTags(text)
                    adding = false
                    text = ""
                    if (tags.isNotEmpty()) m.set(Change(addTags = tags)) { haptic.confirm() }
                }) { Text("Add") }
            },
            dismissButton = { TextButton(onClick = { adding = false; text = "" }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun SavedRow(s: ItemDetail.Save) {
    val c = Theme.colors
    val uri = LocalUriHandler.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("Saved from", fontSize = 15.sp, color = c.soft, modifier = Modifier.width(78.dp))
        SourceMark(s.sourceId, 15.dp, c.ink2)
        Text(
            "${s.name}, ${Dates.row(Dates.parse(s.savedAt ?: s.createdAt))}", fontSize = 15.sp, color = c.ink,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
        )
        s.originalUrl?.let { link ->
            IconButton(onClick = { runCatching { uri.openUri(link) } }, modifier = Modifier.size(32.dp)) {
                Icon(Icons.AutoMirrored.Outlined.OpenInNew, "See it there", tint = c.chevron, modifier = Modifier.size(16.dp))
            }
        }
    }
}

/** The floating toolbar: Open, Read, Archive, Delete (after asking); Restore and Delete forever in Trash. */
@Composable
private fun Toolbar(item: Item, m: ItemModel, onTrash: () -> Unit, onPurge: () -> Unit, modifier: Modifier = Modifier) {
    val c = Theme.colors
    val nav = LocalNav.current
    val uri = LocalUriHandler.current
    val haptic = LocalHapticFeedback.current
    Row(
        modifier.navigationBarsPadding().padding(start = 16.dp, end = 16.dp, bottom = 8.dp).fillMaxWidth()
            .heightIn(min = 62.dp).height(IntrinsicSize.Min)
            .clip(CircleShape).background(c.card).border(1.dp, c.line, CircleShape),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (item.inTrash) {
            Tool("Restore", Icons.Outlined.RestoreFromTrash, c.accent) { m.set(Change(trash = false)) }
            Tool("Delete forever", Icons.Outlined.DeleteForever, c.bad, onClick = onPurge)
        } else {
            item.url?.let { link -> Tool("Open", Icons.AutoMirrored.Outlined.OpenInNew) { runCatching { uri.openUri(link) } } }
            Tool(
                if (item.isUnread) "Read" else "Unread",
                if (item.isUnread) Icons.Outlined.MarkEmailRead else Icons.Outlined.MarkEmailUnread,
            ) { m.set(Change(read = item.isUnread)) }
            if (item.status == "archived") {
                Tool("Inbox", Icons.Outlined.Inbox, c.accent) { m.set(Change(status = "inbox")) }
            } else {
                Tool("Archive", Icons.Outlined.Archive, c.accent) { haptic.confirm(); m.set(Change(status = "archived")) { nav.back() } }
            }
            Tool("Delete", Icons.Outlined.Delete, c.bad, onClick = onTrash)
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.Tool(
    label: String,
    icon: ImageVector,
    color: Color = Theme.colors.ink2,
    onClick: () -> Unit,
) {
    Column(
        Modifier.weight(1f).fillMaxHeight().clickable(onClick = onClick).padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(icon, null, tint = color, modifier = Modifier.size(22.dp))
        Text(label, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = color, maxLines = 1)
    }
}
