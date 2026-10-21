package com.screenporter.companion

import android.app.Application
import com.screenporter.companion.util.PreferencesManager

class ScreenPorterApp : Application() {

    // Instance property — accessed via (application as ScreenPorterApp).prefs
    lateinit var prefs: PreferencesManager
        private set

    override fun onCreate() {
        super.onCreate()
        prefs = PreferencesManager(this)
    }
}
