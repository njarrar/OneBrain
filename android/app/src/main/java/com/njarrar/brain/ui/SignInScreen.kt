package com.njarrar.brain.ui

import android.content.Context
import android.net.Uri
import android.os.Build
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.njarrar.brain.data.Config
import com.njarrar.brain.data.Detected
import com.njarrar.brain.data.Store
import com.njarrar.brain.ui.theme.Theme

/**
 * Signs in through the web page, so Google and passwords work the same as on the web.
 * The page hands the key back through brain://paired, which MainActivity picks up.
 */
@Composable
fun SignInScreen(error: String?) {
    val c = Theme.colors
    val context = LocalContext.current
    var editingServer by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf<String?>(null) }

    Column(
        Modifier.fillMaxSize().background(c.bg).safeDrawingPadding().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.weight(1f))
        Text("Brain", fontSize = 40.sp, fontWeight = FontWeight.Bold, color = c.ink)
        Spacer(Modifier.height(12.dp))
        Text("Everything you save, in one place.", fontSize = 16.sp, color = c.soft)
        Spacer(Modifier.weight(1f))
        Button(
            onClick = { failed = openSignIn(context) },
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = CircleShape,
            colors = ButtonDefaults.buttonColors(containerColor = c.accentFill, contentColor = c.accentInk),
        ) { Text("Sign in", fontSize = 17.sp, fontWeight = FontWeight.SemiBold) }
        (failed ?: error)?.let {
            Text(it, fontSize = 13.sp, color = c.bad, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 12.dp))
        }
        TextButton(onClick = { editingServer = true }, modifier = Modifier.padding(top = 8.dp)) {
            Text("Server: " + Detected.hostOf(Config.baseUrl).ifEmpty { Config.baseUrl }, fontSize = 13.sp, color = c.faint)
        }
    }

    if (editingServer) ServerDialog(onDone = { editingServer = false })
}

/** Opens the connect page in a browser tab. Returns an error when no browser can open it. */
fun openSignIn(context: Context): String? {
    val device = listOfNotNull(Build.MANUFACTURER?.replaceFirstChar { it.uppercaseChar() }, Build.MODEL)
        .joinToString(" ").ifBlank { "Android phone" }.take(60)
    val uri = Uri.parse("${Config.baseUrl}/connect-app").buildUpon().appendQueryParameter("device", device).build()
    return try {
        CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, uri)
        null
    } catch (e: Exception) {
        "No browser to sign in with."
    }
}

/** Points the app at another Brain server. Changing it signs this phone out of the old one. */
@Composable
fun ServerDialog(onDone: () -> Unit, onChanged: () -> Unit = {}) {
    val c = Theme.colors
    var text by remember { mutableStateOf(Store.server) }
    AlertDialog(
        onDismissRequest = onDone,
        title = { Text("Server") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("The web app this phone talks to.", fontSize = 14.sp, color = c.soft)
                OutlinedTextField(value = text, onValueChange = { text = it }, singleLine = true, modifier = Modifier.fillMaxWidth())
                TextButton(onClick = { text = Config.DEFAULT_SERVER }) { Text("Use the default") }
            }
        },
        confirmButton = {
            TextButton(
                enabled = text.trim().startsWith("http"),
                onClick = {
                    val changed = text.trim().trimEnd('/') != Store.server
                    Store.saveServer(text)
                    if (changed) onChanged()
                    onDone()
                },
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDone) { Text("Cancel") } },
    )
}
