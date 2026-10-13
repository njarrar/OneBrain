package com.njarrar.brain.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.njarrar.brain.data.Filter
import com.njarrar.brain.data.MenuData
import com.njarrar.brain.data.MenuStore
import com.njarrar.brain.data.Sources
import com.njarrar.brain.data.Store
import com.njarrar.brain.ui.theme.Theme
import kotlinx.coroutines.delay

/** Questions to try before the menu has loaded. */
private val fallbackExamples = listOf(
    "Whose birthday is coming up this month?",
    "What did I save about places to visit?",
    "What did I save this week?",
)

/** Questions to try, made from your own saves: your biggest category, tag and source, and this week. */
private fun examplesFrom(menu: MenuData?): List<String> {
    if (menu == null) return fallbackExamples
    val out = mutableListOf<String>()
    menu.categories.filter { it.count > 0 }.maxByOrNull { it.count }?.let { out += "What have I saved about ${it.name}?" }
    menu.tags.filter { it.count > 0 }.maxByOrNull { it.count }?.let { out += "What did I save tagged #${it.name}?" }
    menu.sources.filter { it.items > 0 && it.id != "manual" }.maxByOrNull { it.items }
        ?.let { out += "What did I save from ${Sources.label(it.id)}?" }
    out += "What did I save this week?"
    return out
}

/**
 * Search and Ask Brain in one field, in English or Arabic. As you type, matching saves show below,
 * and "Ask Brain" at the top answers from them by meaning. The mic fills the field by voice.
 * With the field empty: recent questions, questions to try, then categories and top tags.
 */
@Composable
fun SearchScreen() {
    val c = Theme.colors
    val nav = LocalNav.current
    val focus = LocalFocusManager.current
    var text by rememberSaveable { mutableStateOf("") }
    var query by rememberSaveable { mutableStateOf("") }
    fun ask(question: String) {
        val q = question.trim()
        if (q.isEmpty()) return
        focus.clearFocus()
        Store.remember(q)
        nav.go(AnswerRoute(q.take(500)))
    }
    val dictation = rememberDictation { spoken ->
        text = spoken
        query = spoken.trim()
    }
    LaunchedEffect(dictation.text) { if (dictation.text.isNotEmpty()) text = dictation.text }
    // Matching saves as you type, a moment after the last key.
    LaunchedEffect(text) {
        val typed = text.trim()
        if (typed.isEmpty()) {
            query = ""
        } else if (typed != query) {
            delay(350)
            query = typed
        }
    }

    Column(Modifier.fillMaxSize().background(c.bg)) {
        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ScreenTitle("Search")
            Row(
                Modifier.fillMaxWidth().heightIn(min = 40.dp).clip(RoundedCornerShape(12.dp)).background(c.fill).padding(start = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Outlined.Search, null, tint = c.faint, modifier = Modifier.size(20.dp))
                BasicTextField(
                    value = text, onValueChange = { text = it }, singleLine = true,
                    textStyle = TextStyle(fontSize = 16.sp, color = c.ink), cursorBrush = SolidColor(c.accentFill),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { query = text.trim(); focus.clearFocus() }),
                    modifier = Modifier.weight(1f).padding(vertical = 8.dp),
                    decorationBox = { inner ->
                        Box {
                            if (text.isEmpty()) {
                                Text(
                                    "Search or ask, in English or Arabic", fontSize = 16.sp, color = c.faint,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                                )
                            }
                            inner()
                        }
                    },
                )
                if (text.isNotEmpty()) {
                    Box(Modifier.size(36.dp).clickable { text = ""; query = "" }, contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.Cancel, "Clear", tint = c.faint, modifier = Modifier.size(18.dp))
                    }
                }
                Box(Modifier.size(40.dp).clickable { dictation.toggle() }, contentAlignment = Alignment.Center) {
                    Icon(
                        if (dictation.listening) Icons.Filled.Mic else Icons.Outlined.Mic,
                        if (dictation.listening) "Stop listening" else "Search by voice",
                        tint = if (dictation.listening) c.accent else c.faint, modifier = Modifier.size(20.dp),
                    )
                }
            }
            dictation.error?.let { Text(it, fontSize = 13.sp, color = c.bad) }
        }

        val typed = text.trim()
        if (typed.isEmpty()) {
            Suggestions { ask(it) }
        } else {
            Row(
                Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp).fillMaxWidth().heightIn(min = 44.dp)
                    .clip(RoundedCornerShape(12.dp)).background(c.accentBG)
                    .clickable { ask(typed) }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Icon(Icons.Outlined.AutoAwesome, null, tint = c.accent, modifier = Modifier.size(18.dp))
                Text(
                    "Ask Brain: “$typed”", fontSize = 15.sp, fontWeight = FontWeight.Medium, color = c.accent,
                    maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                )
                Chevron()
            }
            Box(Modifier.weight(1f)) {
                if (query.isNotEmpty()) ItemList(Filter(view = "all", q = query), ListMode.Search, key = "search")
            }
        }
    }
}

/** With the field empty: recent questions, questions to try, then a category or tag to see its saves. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Suggestions(onAsk: (String) -> Unit) {
    val c = Theme.colors
    val nav = LocalNav.current
    val menu = MenuStore.menu
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = barSpace(110.dp)),
    ) {
        if (Store.recent.isNotEmpty()) {
            GroupCaption("Recent questions")
            Questions(Store.recent, onAsk)
        }
        GroupCaption("Try")
        Questions(examplesFrom(menu), onAsk)
        if (menu == null) return@Column
        if (menu.categories.isNotEmpty()) {
            GroupCaption("Categories")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                menu.categories.forEach { cat ->
                    Row(
                        Modifier.heightIn(min = 32.dp).clip(CircleShape).background(c.fill)
                            .clickable { nav.list(Filter(view = "all", category = cat.name)) }
                            .padding(horizontal = 12.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
                    ) {
                        Swatch(cat.color)
                        Text(cat.name, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = c.ink2, maxLines = 1)
                    }
                }
            }
        }
        if (menu.tags.isNotEmpty()) {
            GroupCaption("Top tags")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                menu.tags.take(20).forEach { t ->
                    Chip("#${t.name}") { nav.list(Filter(view = "all", tag = t.name)) }
                }
            }
        }
    }
}

/** Questions in an outlined box; a tap asks Brain. */
@Composable
private fun Questions(list: List<String>, onAsk: (String) -> Unit) {
    val c = Theme.colors
    OutlineBox {
        list.forEachIndexed { n, q ->
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { onAsk(q) }.padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Icon(Icons.Outlined.AutoAwesome, null, tint = c.accent, modifier = Modifier.size(15.dp))
                Text(q, fontSize = 15.sp, color = c.ink, modifier = Modifier.weight(1f))
                Chevron()
            }
            if (n < list.size - 1) RowDivider(start = 14.dp)
        }
    }
}
