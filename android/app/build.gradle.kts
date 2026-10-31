plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.njarrar.brain"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.njarrar.brain"
        minSdk = 26
        targetSdk = 35
        versionCode = 4
        versionName = "0.8.0"
    }

    signingConfigs {
        // Kept in the repo so every build, here or on GitHub, has the same signature and installs over the last.
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        // A real release key, when the workflow has one (see README).
        System.getenv("BRAIN_KEYSTORE")?.takeIf { it.isNotBlank() }?.let { path ->
            create("release") {
                storeFile = file(path)
                storePassword = System.getenv("BRAIN_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("BRAIN_KEY_ALIAS")
                keyPassword = System.getenv("BRAIN_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    lint {
        // Run `./gradlew lint` to see lint results; they never block the APK.
        checkReleaseBuilds = false
        abortOnError = false
    }

    // brain-0.6.0.apk for release, brain-0.6.0-debug.apk for debug.
    applicationVariants.all {
        val variant = this
        outputs.all {
            val suffix = if (variant.buildType.name == "release") "" else "-${variant.buildType.name}"
            (this as com.android.build.gradle.internal.api.BaseVariantOutputImpl).outputFileName =
                "brain-${variant.versionName}$suffix.apk"
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.security.crypto)
    implementation(libs.androidx.browser)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.okhttp)
    implementation(libs.coil.compose)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
