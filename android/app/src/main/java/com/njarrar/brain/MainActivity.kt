package com.njarrar.brain

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.njarrar.brain.data.AppSession
import com.njarrar.brain.data.Config
import com.njarrar.brain.ui.MainScreen
import com.njarrar.brain.ui.SignInScreen
import com.njarrar.brain.ui.theme.BrainTheme
import com.njarrar.brain.ui.theme.SystemBars

class MainActivity : ComponentActivity() {
    /** Set when the sign in page comes back without a key. */
    private var signInError by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        handle(intent)
        setContent {
            BrainTheme {
                SystemBars()
                if (AppSession.signedIn) MainScreen() else SignInScreen(error = signInError)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    /** brain://paired?token=… from the connect page signs this phone in. */
    private fun handle(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme != Config.CALLBACK_SCHEME || uri.host != "paired") return
        val token = uri.getQueryParameter("token")
        if (token.isNullOrBlank()) {
            signInError = "Sign in didn't finish. Try again."
        } else {
            signInError = null
            AppSession.signIn(token)
        }
        setIntent(Intent(intent).setData(null))
    }
}
