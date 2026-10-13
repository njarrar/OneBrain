package com.njarrar.brain.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CollectionsBookmark
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CollectionsBookmark
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material.icons.outlined.Search
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import com.njarrar.brain.data.Filter
import com.njarrar.brain.data.Item
import com.njarrar.brain.data.MenuStore
import kotlinx.serialization.Serializable

// Where a tab can go. A list of saves uses Filter itself as its route.
@Serializable object InboxRoute
@Serializable object LibraryRoute
@Serializable object SearchRoute
@Serializable object AskRoute
@Serializable data class ItemRoute(val id: String)
@Serializable object TrashRoute
@Serializable object TagsRoute
@Serializable object SettingsRoute
@Serializable object AISettingsRoute
@Serializable object ResurfaceRoute
@Serializable object DigestRoute
@Serializable data class AnswerRoute(val question: String)

enum class Tab(val route: Any, val label: String, val icon: ImageVector, val picked: ImageVector) {
    Inbox(InboxRoute, "Inbox", Icons.Outlined.Inbox, Icons.Filled.Inbox),
    Library(LibraryRoute, "Library", Icons.Outlined.CollectionsBookmark, Icons.Filled.CollectionsBookmark),
    Search(SearchRoute, "Search", Icons.Outlined.Search, Icons.Filled.Search),
    Ask(AskRoute, "Ask", Icons.Outlined.AutoAwesome, Icons.Filled.AutoAwesome),
}

/** Moves between screens. Each tab keeps its own back stack, as on the iPhone. */
class Nav(val controller: NavHostController) {
    fun go(route: Any) {
        controller.navigate(route)
    }

    /** Opens an item, showing what the list already knows while the rest loads. */
    fun open(item: Item) {
        MenuStore.previews[item.id] = item
        controller.navigate(ItemRoute(item.id))
    }

    fun list(filter: Filter) = go(filter)

    fun back() {
        controller.popBackStack()
    }

    /** The tab whose screens are showing. Only Inbox and one other tab are ever on the stack. */
    fun currentTab(): Tab =
        listOf(Tab.Library, Tab.Search, Tab.Ask).firstOrNull { has(it.route) } ?: Tab.Inbox

    private fun has(route: Any) = runCatching { controller.getBackStackEntry(route) }.isSuccess

    /** Switches tab; tapping the open tab again goes back to its first screen. */
    fun tab(t: Tab) {
        if (t == currentTab()) {
            controller.popBackStack(t.route, inclusive = false)
            return
        }
        controller.navigate(t.route) {
            popUpTo(controller.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }
}

val LocalNav = staticCompositionLocalOf<Nav> { error("No Nav") }
