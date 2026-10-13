package com.njarrar.brain.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.njarrar.brain.data.Api
import com.njarrar.brain.data.Filter
import com.njarrar.brain.data.MenuStore
import com.njarrar.brain.data.Mode
import com.njarrar.brain.data.Store
import com.njarrar.brain.ui.theme.Theme
import kotlinx.coroutines.launch

/** The app once signed in: four tabs (Inbox, Library, Search, Ask Brain) in a floating bar, and the Add button beside it. */
@Composable
fun MainScreen() {
    val c = Theme.colors
    val controller = rememberNavController()
    val nav = remember(controller) { Nav(controller) }
    val entry by controller.currentBackStackEntryAsState()
    val tab = remember(entry) { nav.currentTab() }
    // The bar hides on an item, which has its own toolbar, and in Settings.
    val showBar = entry?.destination?.let {
        !it.hasRoute(ItemRoute::class) && !it.hasRoute(SettingsRoute::class) && !it.hasRoute(AISettingsRoute::class)
    } ?: true
    var adding by remember { mutableStateOf(false) }
    // The Inbox's mic opens Search and starts listening.
    var listen by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) { MenuStore.load() }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        scope.launch {
            MenuStore.load()
            // Picks up a look changed on the web.
            runCatching { Api.prefs() }.getOrNull()?.let { Store.saveMode(Mode.of(it.mode)) }
        }
    }

    CompositionLocalProvider(LocalNav provides nav) {
        Box(Modifier.fillMaxSize().background(c.bg)) {
            NavHost(
                navController = controller,
                startDestination = InboxRoute,
                modifier = Modifier.fillMaxSize().statusBarsPadding(),
                enterTransition = { fadeIn(tween(180)) },
                exitTransition = { fadeOut(tween(180)) },
            ) {
                composable<InboxRoute> {
                    ItemList(Filter(), ListMode.Inbox, openSearch = { voice ->
                        listen = voice
                        nav.tab(Tab.Search)
                    })
                }
                composable<LibraryRoute> { LibraryScreen() }
                composable<SearchRoute> { SearchScreen(listen = listen, onListen = { listen = false }) }
                composable<AskRoute> { AskHome() }
                composable<ItemRoute> { e -> ItemScreen(e.toRoute<ItemRoute>().id) }
                composable<Filter> { e -> ItemList(e.toRoute<Filter>(), ListMode.List) }
                composable<TrashRoute> { ItemList(Filter(view = "trash"), ListMode.Trash) }
                composable<TagsRoute> { TagsScreen() }
                composable<SettingsRoute> { SettingsScreen() }
                composable<AISettingsRoute> { AISettingsScreen() }
                composable<ResurfaceRoute> { ResurfaceScreen() }
                composable<DigestRoute> { DigestScreen() }
                composable<AnswerRoute> { e -> AnswerScreen(e.toRoute<AnswerRoute>().question) }
            }

            AnimatedVisibility(
                visible = showBar,
                modifier = Modifier.align(Alignment.BottomCenter),
                enter = slideInVertically { it } + fadeIn(),
                exit = slideOutVertically { it } + fadeOut(),
            ) {
                Box(Modifier.fillMaxWidth()) {
                    // Rows fade out under the bar instead of showing through it.
                    Box(
                        Modifier.matchParentSize().background(
                            Brush.verticalGradient(listOf(c.bg.copy(alpha = 0f), c.bg.copy(alpha = 0.9f), c.bg)),
                        ),
                    )
                    Row(
                        Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, top = 22.dp, bottom = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        TabBar(tab, onPick = { nav.tab(it) }, modifier = Modifier.weight(1f))
                        Box(
                            Modifier.size(62.dp).shadow(12.dp, CircleShape).clip(CircleShape).background(c.accentFill)
                                .clickable { adding = true },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Filled.Add, contentDescription = "Add", tint = c.accentInk, modifier = Modifier.size(30.dp))
                        }
                    }
                }
            }
        }

        if (adding) {
            AddSheet(onDismiss = { adding = false }, saved = {
                MenuStore.changed++
                MenuStore.load()
            })
        }
    }
}

/** The four-tab pill. Tapping the open tab again goes back to its first screen. */
@Composable
private fun TabBar(tab: Tab, onPick: (Tab) -> Unit, modifier: Modifier = Modifier) {
    val c = Theme.colors
    Row(
        modifier.height(62.dp).shadow(14.dp, CircleShape).clip(CircleShape).background(c.card).padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Tab.entries.forEach { t ->
            val on = t == tab
            Column(
                Modifier.weight(1f).fillMaxHeight().padding(vertical = 6.dp).clip(RoundedCornerShape(26.dp))
                    .background(if (on) c.ink.copy(alpha = 0.06f) else c.card)
                    .clickable { onPick(t) },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(if (on) t.picked else t.icon, contentDescription = null, tint = if (on) c.accent else c.ink2, modifier = Modifier.size(23.dp))
                Text(
                    t.label, fontSize = 11.sp, color = if (on) c.accent else c.ink2,
                    fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium,
                )
            }
        }
    }
}
