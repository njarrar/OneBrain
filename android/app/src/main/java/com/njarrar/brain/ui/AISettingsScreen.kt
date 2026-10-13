package com.njarrar.brain.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.njarrar.brain.data.AIState
import com.njarrar.brain.data.Api
import com.njarrar.brain.data.TestResult
import com.njarrar.brain.data.friendly
import com.njarrar.brain.ui.theme.Theme
import kotlinx.coroutines.launch

/**
 * Pick the AI that sorts saves, reads voice memos and pictures, answers Ask Brain and writes the
 * weekly digest: Claude, ChatGPT or Gemini. Same choice and keys as the web's Settings.
 */
@Composable
fun AISettingsScreen() {
    val c = Theme.colors
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<AIState?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val keys = remember { mutableStateMapOf<String, String>() }
    val models = remember { mutableStateMapOf<String, String>() }
    val tests = remember { mutableStateMapOf<String, TestResult>() }
    var busy by remember { mutableStateOf<String?>(null) }

    fun update(who: String? = null, work: suspend () -> AIState) {
        scope.launch {
            try {
                state = work()
                error = null
                if (who != null) tests.remove(who)
            } catch (e: Exception) {
                error = e.friendly()
            }
        }
    }

    fun test(id: String) {
        busy = id
        scope.launch {
            try {
                tests[id] = Api.testAI(id)
            } catch (e: Exception) {
                error = e.friendly()
            }
            busy = null
        }
    }

    LaunchedEffect(Unit) { update { Api.ai() } }

    Column(Modifier.fillMaxSize().background(c.grouped)) {
        TopBar(onBack = { nav.back() })
        Column(
            Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).navigationBarsPadding()
                .padding(start = 16.dp, end = 16.dp, bottom = 40.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            ScreenTitle("AI", Modifier.padding(bottom = 6.dp))
            Text(
                "Sorts your saves, picks out names and dates from voice memos and pictures, answers Ask Brain and writes the weekly digest. " +
                    "Keys are stored encrypted on the server and shown only by their last four characters.",
                fontSize = 13.sp, color = c.faint, modifier = Modifier.padding(horizontal = 4.dp),
            )
            val s = state
            if (s != null) {
                GroupCaption("In use")
                if (s.providers.isNotEmpty()) {
                    Segmented(
                        s.providers.map { it.id }, s.provider,
                        label = { id -> s.providers.firstOrNull { it.id == id }?.name ?: id },
                        onSelect = { p -> update { Api.setAI(provider = p) } },
                    )
                }
                s.current?.takeIf { !it.hasKey }?.let {
                    Text(
                        "${it.name} has no key yet. Add one below, or nothing gets sorted.",
                        fontSize = 13.sp, color = c.bad, modifier = Modifier.padding(horizontal = 4.dp),
                    )
                }
                s.providers.forEach { p ->
                    Provider(
                        p, active = p.id == s.provider,
                        key = keys[p.id].orEmpty(), onKey = { keys[p.id] = it },
                        model = models[p.id] ?: p.model, onModel = { models[p.id] = it },
                        test = tests[p.id], busy = busy,
                        onSaveKey = {
                            val value = keys[p.id].orEmpty().trim()
                            keys[p.id] = ""
                            update(p.id) { Api.setAI(keyOf = p.id, key = value) }
                        },
                        onSaveModel = {
                            val name = models[p.id]?.trim()
                            update(p.id) { Api.setAI(modelOf = p.id, model = name?.ifEmpty { null }) }
                        },
                        onTest = { test(p.id) },
                        onRemoveKey = { update(p.id) { Api.setAI(keyOf = p.id, key = null) } },
                    )
                }
            } else if (error == null) {
                Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) { Spinner() }
            }
            error?.let { Text(it, fontSize = 13.sp, color = c.bad, modifier = Modifier.padding(horizontal = 4.dp)) }
        }
    }
}

@Composable
private fun Provider(
    p: AIState.Provider,
    active: Boolean,
    key: String,
    onKey: (String) -> Unit,
    model: String,
    onModel: (String) -> Unit,
    test: TestResult?,
    busy: String?,
    onSaveKey: () -> Unit,
    onSaveModel: () -> Unit,
    onTest: () -> Unit,
    onRemoveKey: () -> Unit,
) {
    val c = Theme.colors
    val uri = LocalUriHandler.current
    val focus = LocalFocusManager.current
    Column {
        GroupCaption(if (active) "${p.name}, in use" else p.name)
        GroupBox {
            GroupRow("Key", p.last4?.let { "…$it" } ?: if (p.fromEnv) "On the server" else "None", chevron = false)
            Row(
                Modifier.fillMaxWidth().heightIn(min = 50.dp).padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BasicTextField(
                    value = key, onValueChange = onKey, singleLine = true,
                    textStyle = TextStyle(fontSize = 16.sp, color = c.ink), cursorBrush = SolidColor(c.accentFill),
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    modifier = Modifier.weight(1f),
                    decorationBox = { inner ->
                        Box {
                            if (key.isEmpty()) Text(p.keyHint, fontSize = 16.sp, color = c.faint)
                            inner()
                        }
                    },
                )
                TextButton(onClick = { focus.clearFocus(); onSaveKey() }, enabled = key.isNotBlank() && busy == null) {
                    Text(if (p.last4 == null) "Save" else "Replace")
                }
            }
            RowDivider()
            Row(
                Modifier.fillMaxWidth().heightIn(min = 50.dp).padding(start = 14.dp, end = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Model", fontSize = 16.sp, color = c.ink)
                Spacer(Modifier.width(12.dp))
                BasicTextField(
                    value = model, onValueChange = onModel, singleLine = true,
                    textStyle = TextStyle(fontSize = 15.sp, color = c.ink, fontFamily = FontFamily.Monospace, textAlign = TextAlign.End),
                    cursorBrush = SolidColor(c.accentFill),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { focus.clearFocus(); onSaveModel() }),
                    modifier = Modifier.weight(1f).padding(end = 8.dp),
                    decorationBox = { inner ->
                        Box(contentAlignment = Alignment.CenterEnd) {
                            if (model.isEmpty()) Text(p.defaultModel, fontSize = 15.sp, color = c.faint, fontFamily = FontFamily.Monospace)
                            inner()
                        }
                    },
                )
                if (model.trim() != p.model) {
                    TextButton(onClick = { focus.clearFocus(); onSaveModel() }, enabled = busy == null) {
                        Text("Save")
                    }
                }
            }
            RowDivider()
            Row(
                Modifier.fillMaxWidth().heightIn(min = 50.dp).padding(horizontal = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onTest, enabled = p.hasKey && busy == null) { Text(if (busy == p.id) "Testing…" else "Test") }
                if (p.last4 != null) {
                    TextButton(onClick = onRemoveKey, enabled = busy == null) { Text("Remove key", color = c.bad) }
                }
                Spacer(Modifier.weight(1f))
                if (p.keyUrl.isNotEmpty()) {
                    TextButton(onClick = { runCatching { uri.openUri(p.keyUrl) } }) { Text("Get a key", fontSize = 14.sp) }
                }
            }
        }
        test?.let {
            Text(
                it.message, fontSize = 13.sp, color = if (it.ok) c.faint else c.bad,
                modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 4.dp),
            )
        }
    }
}
