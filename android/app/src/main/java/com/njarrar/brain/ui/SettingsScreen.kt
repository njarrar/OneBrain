package com.njarrar.brain.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.njarrar.brain.BuildConfig
import com.njarrar.brain.data.Api
import com.njarrar.brain.data.AppSession
import com.njarrar.brain.data.Config
import com.njarrar.brain.data.Dates
import com.njarrar.brain.data.Detected
import com.njarrar.brain.data.MenuStore
import com.njarrar.brain.data.Mode
import com.njarrar.brain.data.ServerBuild
import com.njarrar.brain.data.SourceInfo
import com.njarrar.brain.data.Sources
import com.njarrar.brain.data.Store
import com.njarrar.brain.data.friendly
import com.njarrar.brain.ui.theme.Theme
import kotlinx.coroutines.launch

/** Appearance, capture, sources, storage and account, as grouped rows. */
@Composable
fun SettingsScreen() {
    val c = Theme.colors
    val nav = LocalNav.current
    val uri = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    var server by remember { mutableStateOf<ServerBuild?>(null) }
    var aiName by remember { mutableStateOf<String?>(null) }
    var sources by remember { mutableStateOf<List<SourceInfo>?>(null) }
    var modeError by remember { mutableStateOf<String?>(null) }
    var editingServer by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        launch { server = runCatching { Api.serverBuild() }.getOrNull() }
        launch { aiName = runCatching { Api.ai() }.getOrNull()?.current?.name }
        launch { sources = runCatching { Api.sources() }.getOrNull() }
    }

    /** Changes the mode here at once, then saves it for the web too. */
    fun saveMode(m: Mode) {
        val before = Store.mode
        Store.saveMode(m)
        modeError = null
        scope.launch {
            try {
                Store.saveMode(Mode.of(Api.savePrefs(m).mode))
            } catch (e: Exception) {
                Store.saveMode(before)
                modeError = e.friendly()
            }
        }
    }

    Column(Modifier.fillMaxSize().background(c.grouped)) {
        TopBar(onBack = { nav.back() })
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding()
                .padding(start = 16.dp, end = 16.dp, bottom = 40.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            ScreenTitle("Settings", Modifier.padding(bottom = 6.dp))

            GroupCaption("Appearance")
            Segmented(
                Mode.entries, Store.mode, label = { it.label },
                icon = { m ->
                    when (m) {
                        Mode.Light -> Icons.Outlined.LightMode
                        Mode.Dark -> Icons.Outlined.DarkMode
                        Mode.System -> Icons.Outlined.PhoneAndroid
                    }
                },
                onSelect = { saveMode(it) },
            )
            Note("Syncs with the web app.")
            modeError?.let { Note(it, c.bad) }

            GroupCaption("Capture")
            GroupBox {
                GroupRow("AI", aiName ?: "Set up", mono = false, onClick = { nav.go(AISettingsRoute) })
                GroupRow("Sorting", sortingStatus(), mono = false, chevron = false)
                ToggleRow("Blur sensitive pictures", Store.blur, divider = false) { Store.saveBlur(it) }
            }
            Note("To save from any app, tap Share, then Save to Brain.")

            GroupCaption("Sources")
            GroupBox {
                val list = sources
                when {
                    list == null -> GroupRow("Loading…", chevron = false)
                    list.isEmpty() -> GroupRow("No sources yet", chevron = false)
                    else -> list.forEach { s -> SourceRow(s) }
                }
                GroupRow(
                    "Set up on the web", Detected.hostOf(Config.baseUrl), mono = false, divider = false,
                    labelColor = c.accent, onClick = { runCatching { uri.openUri("${Config.baseUrl}/sources") } },
                )
            }
            Note("Sources connect once, on the web, and every device shares them.")

            GroupCaption("Storage")
            GroupBox {
                GroupRow("Trash", "%,d".format(MenuStore.menu?.views?.trash ?: 0), onClick = { nav.go(TrashRoute) })
                GroupRow(
                    "Server", Detected.hostOf(Config.baseUrl), mono = false, divider = false,
                    onClick = { editingServer = true },
                )
            }

            GroupCaption("Account")
            GroupBox {
                GroupRow("Signed in on this phone", chevron = false)
                GroupRow("Sign out", labelColor = c.bad, chevron = false, divider = false, minHeight = 50.dp, onClick = { AppSession.signOut() })
            }

            About(server)
        }
    }

    if (editingServer) ServerDialog(onDone = { editingServer = false }, onChanged = { AppSession.signOut() })
}

@Composable
private fun Note(text: String, color: androidx.compose.ui.graphics.Color = Theme.colors.faint) {
    Text(text, fontSize = 13.sp, color = color, modifier = Modifier.padding(horizontal = 4.dp))
}

private fun sortingStatus(): String {
    val waiting = MenuStore.menu?.views?.unsorted ?: return "On"
    return if (waiting == 0) "Up to date" else "%,d to sort".format(waiting)
}

@Composable
private fun ToggleRow(label: String, on: Boolean, divider: Boolean = true, onChange: (Boolean) -> Unit) {
    val c = Theme.colors
    Column {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 50.dp).clickable { onChange(!on) }.padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(label, fontSize = 16.sp, color = c.ink, modifier = Modifier.weight(1f))
            Switch(
                checked = on, onCheckedChange = onChange,
                colors = SwitchDefaults.colors(checkedTrackColor = c.accentFill, checkedThumbColor = c.accentInk),
            )
        }
        if (divider) RowDivider()
    }
}

/** One source: its mark, name, how many saves, and when it last synced or what went wrong. */
@Composable
private fun SourceRow(s: SourceInfo) {
    val c = Theme.colors
    Column {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SourceMark(s.id, 18.dp)
            Column(Modifier.weight(1f)) {
                Text(s.name.ifEmpty { Sources.label(s.id) }, fontSize = 16.sp, color = c.ink)
                val line = s.lastError?.let { "Problem: $it" }
                    ?: Dates.stamp(s.lastSyncAt)?.let { "Synced $it" }
                    ?: s.status.ifEmpty { null }
                line?.let { Text(it, fontSize = 12.sp, color = if (s.lastError != null) c.bad else c.faint, maxLines = 2) }
            }
            Text("%,d".format(s.items), fontSize = 13.sp, fontFamily = FontFamily.Monospace, color = c.faint)
        }
        RowDivider()
    }
}

/** This app's version and the live web app's, to say which builds were in use when something went wrong. */
@Composable
private fun About(server: ServerBuild?) {
    val c = Theme.colors
    val app = "Android app ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"
    val web = server?.let { s ->
        listOfNotNull("Web app ${s.version}", s.commit.ifEmpty { null }, Dates.stamp(s.builtAt)?.let { "deployed $it" })
            .joinToString(" · ")
    } ?: "Web app: checking…"
    SelectionContainer {
        Column(Modifier.padding(start = 4.dp, end = 4.dp, top = 18.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(app, fontSize = 12.sp, fontFamily = FontFamily.Monospace, color = c.faint)
            Text(web, fontSize = 12.sp, fontFamily = FontFamily.Monospace, color = c.faint)
        }
    }
}

