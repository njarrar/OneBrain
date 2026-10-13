package com.njarrar.brain.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Keeps the app's key encrypted on the phone. The share sheet reads it too. */
object KeyStore {
    private const val FILE = "brain-key"
    private const val KEY = "app-key"
    private lateinit var prefs: SharedPreferences

    fun init(context: Context) {
        prefs = try {
            open(context)
        } catch (e: Exception) {
            // A key the phone can no longer read (after a restore, say): start again signed out.
            context.deleteSharedPreferences(FILE)
            open(context)
        }
    }

    private fun open(context: Context): SharedPreferences {
        val master = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        return EncryptedSharedPreferences.create(
            context, FILE, master,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    val token: String? get() = prefs.getString(KEY, null)

    fun save(token: String) {
        prefs.edit().putString(KEY, token).apply()
    }

    fun clear() {
        prefs.edit().remove(KEY).apply()
    }
}
