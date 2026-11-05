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

        // Diagnóstico: guarda o stack de qualquer exceção não-tratada (de qualquer
        // thread) antes de o Android matar o processo. O WebSocketClient envia-o
        // ao relé na próxima ligação, para sabermos a causa de um crash sem logcat.
        val anterior = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try {
                val sw = java.io.StringWriter()
                e.printStackTrace(java.io.PrintWriter(sw))
                prefs.lastCrash = ("thread=" + t.name + ": " + sw.toString()).take(3500)
            } catch (_: Throwable) {}
            anterior?.uncaughtException(t, e)
        }
    }
}
