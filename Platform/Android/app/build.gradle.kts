plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.zamorin.cafe.erp"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.zamorin.cafe.erp"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            val keystorePath = System.getenv("ZAMORIN_RELEASE_KEYSTORE_PATH")
            val keystoreFile = if (!keystorePath.isNullOrEmpty()) file(keystorePath) else file("release.keystore")
            val envStorePass = System.getenv("ZAMORIN_RELEASE_STORE_PASSWORD")
            val envKeyPass = System.getenv("ZAMORIN_RELEASE_KEY_PASSWORD")
            val envAlias = System.getenv("ZAMORIN_RELEASE_KEY_ALIAS") ?: "zamorin_release"

            if (keystoreFile.exists() && !envStorePass.isNullOrEmpty() && !envKeyPass.isNullOrEmpty()) {
                storeFile = keystoreFile
                storePassword = envStorePass
                keyAlias = envAlias
                keyPassword = envKeyPass
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            val keystoreFile = file("release.keystore")
            if (keystoreFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
      compose = false
      aidl = false
      buildConfig = true
      shaders = false
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }

    packaging {
      resources {
        excludes += "/META-INF/{AL2.0,LGPL2.1}"
      }
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
  // Core AndroidX & AppCompat dependencies
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation("androidx.activity:activity-ktx:1.9.3")
  implementation("androidx.appcompat:appcompat:1.7.0")
  implementation(libs.androidx.webkit)
  implementation(libs.androidx.documentfile)
  implementation(libs.androidx.print)

  // Local tests: jUnit, mockito, coroutines
  testImplementation(libs.junit)
  testImplementation(libs.mockito.core)
  testImplementation(libs.kotlinx.coroutines.test)
  testImplementation("org.json:json:20240303")

  // Instrumented tests: jUnit rules and runners
  androidTestImplementation(libs.androidx.test.core)
  androidTestImplementation(libs.androidx.test.ext.junit)
  androidTestImplementation(libs.androidx.test.runner)
  androidTestImplementation(libs.androidx.test.espresso.core)
}
