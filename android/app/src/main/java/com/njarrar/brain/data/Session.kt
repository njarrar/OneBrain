package com.njarrar.brain.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.flow.MutableSharedFlow

/** Whether this phone has a key for Brain. */
object AppSession {
    var signedIn by mutableStateOf(false)
        private set

    fun start() {
        signedIn = KeyStore.token != null
    }

    fun signIn(token: String) {
        KeyStore.save(token)
        signedIn = true
    }

    fun signOut() {
        KeyStore.clear()
        signedIn = false
    }
}

/**
 * The Library counts, shared by every screen. `changed` goes up after an add, so lists reload;
 * `edits` and `purges` tell lists about a change made on an item's own page.
 */
object MenuStore {
    var menu by mutableStateOf<MenuData?>(null)
    var changed by mutableIntStateOf(0)
    val edits = MutableSharedFlow<Item>(extraBufferCapacity = 32)
    val purges = MutableSharedFlow<String>(extraBufferCapacity = 32)

    /** Items opened from a list, so the item page can show them before it loads. */
    val previews = mutableMapOf<String, Item>()

    suspend fun load() {
        try {
            menu = Api.menu()
        } catch (_: Exception) {
        }
    }

    fun edited(item: Item) {
        previews[item.id] = item
        edits.tryEmit(item)
    }

    fun purged(id: String) {
        purges.tryEmit(id)
    }
}
