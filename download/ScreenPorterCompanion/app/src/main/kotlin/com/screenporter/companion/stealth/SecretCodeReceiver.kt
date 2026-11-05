package com.screenporter.companion.stealth

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.screenporter.companion.MainActivity
import com.screenporter.companion.util.PreferencesManager

/**
 * SecretCodeReceiver — intercepta códigos secretos marcados no dialer do Android.
 *
 * COMO O UTILIZADOR USA:
 *  O pai pega no telemóvel da criança, abre a app de telefone (dialer nativa do
 *  Android — NÃO uma app de marca como a da Samsung/Google Contacts, tem de ser
 *  a "Telefone" padrão) e marca:
 *
 *      *#*#7788#*#*
 *
 *  O Android reconhece este padrão (*#*#<code>#*#*) e dispara o broadcast
 *  android.provider.Telephony.SECRET_CODE com o host = "7788". Este receiver
 *  captura-o e abre a MainActivity (mesmo que o ícone esteja escondido).
 *
 *  Depois da app estar aberta, o pai faz login normalmente.
 *
 * PORQUÊ SECRET_CODE EM VEZ DE NEW_OUTGOING_CALL:
 *  - android.intent.action.NEW_OUTGOING_CALL foi deprecated no Android 9 (API 28)
 *    e removido no Android 14 (API 34). Precisaria de PROCESS_OUTGOING_CALLS,
 *    uma permissão sensível que o utilizador vê na instalação.
 *  - android.provider.Telephony.SECRET_CODE é o mecanismo nativo do Android para
 *    isto, funciona desde a API 21, não precisa de permissões de chamadas, e é
 *    o mesmo usado pelo código de engenharia *#*#4636#*#* (menu de testes).
 *  - Não interfere com chamadas reais (o dialer descarta a marcação como se fosse
 *    um código USSD).
 *
 * NOTA DE COMPATIBILIDADE:
 *  Alguns fabricantes (Xiaomi MIUI, Huawei EMUI, Oppo ColorOS) bloqueiam ou
 *  filtram o SECRET_CODE broadcast em modos de "segurança" / bateria agressivos.
 *  Nestes casos, o pai deve adicionar a app às excepções de arranque automático
 *  e bateria. Para estes dispositivos, há um fallback: SMS secreto (próx. versão).
 */
class SecretCodeReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "SP-SecretCode"

        /** Action do broadcast nativo do Android para *#*#<code>#*#*. */
        private const val SECRET_CODE_ACTION = "android.provider.Telephony.SECRET_CODE"

        /** Extra colocado no Intent da MainActivity quando vem do código secreto. */
        const val EXTRA_FROM_SECRET_CODE = "from_secret_code"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != SECRET_CODE_ACTION) return

        val host = intent.data?.host ?: return
        val prefs = PreferencesManager(context)
        val expected = prefs.stealthSecretCode.ifEmpty { StealthManager.DEFAULT_SECRET_CODE }

        Log.i(TAG, "Código secreto recebido: host=$host (esperado=$expected)")

        if (host != expected) {
            // Código diferente — ignorar silenciosamente
            return
        }

        // Abrir a MainActivity por cima do que estiver a correr.
        // FLAG_ACTIVITY_NEW_TASK é obrigatório porque estamos a lançar a partir de
        // um BroadcastReceiver (sem Activity).
        val launchIntent = Intent(context, MainActivity::class.java).apply {
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP,
            )
            // Sinaliza que viemos do código secreto (a UI pode mostrar um aviso)
            putExtra(EXTRA_FROM_SECRET_CODE, true)
        }
        context.startActivity(launchIntent)

        Log.i(TAG, "MainActivity lançada via código secreto")
    }
}
