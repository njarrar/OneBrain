package com.njarrar.brain

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import com.njarrar.brain.data.Api
import com.njarrar.brain.data.AppSession
import com.njarrar.brain.data.Config
import com.njarrar.brain.data.KeyStore
import com.njarrar.brain.data.Store

class BrainApp : Application(), ImageLoaderFactory {
    override fun onCreate() {
        super.onCreate()
        Store.init(this)
        KeyStore.init(this)
        AppSession.start()
    }

    /** Pictures load through the API's client. Only Brain's own files get the key; pictures from X and others don't. */
    override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
        .okHttpClient {
            Api.client.newBuilder().addInterceptor { chain ->
                val req = chain.request()
                val token = KeyStore.token
                if (token != null && req.url.host == Config.host) {
                    chain.proceed(req.newBuilder().header("Authorization", "Bearer $token").build())
                } else {
                    chain.proceed(req)
                }
            }.build()
        }
        .crossfade(true)
        .build()
}
